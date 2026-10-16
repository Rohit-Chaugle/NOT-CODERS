import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { ANOMALY_HEX, type AnomalyKind } from "./layout";

const DROPLET_COUNT = 14;
const WASTE_COUNT = 40;
const ARC_POINTS = 14;

/* ------------------------------- water leak ------------------------------- */

function WaterLeak({ position }: { position: [number, number, number] }) {
  const points = useRef<THREE.Points>(null);
  const ripples = useRef<THREE.Group>(null);

  const seeds = useMemo(() => {
    const pos = new Float32Array(DROPLET_COUNT * 3);
    const phase = new Float32Array(DROPLET_COUNT);
    for (let i = 0; i < DROPLET_COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 1.1;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 1.1;
      pos[i * 3 + 1] = Math.random() * 3.6;
      phase[i] = Math.random();
    }
    return { pos, phase };
  }, []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (points.current) {
      const attr = points.current.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < DROPLET_COUNT; i++) {
        const f = (t * 0.85 + seeds.phase[i]) % 1;
        attr.setY(i, 3.6 - f * 3.6);
      }
      attr.needsUpdate = true;
    }
    if (ripples.current) {
      ripples.current.children.forEach((child, i) => {
        const f = (t * 0.7 + i / ripples.current!.children.length) % 1;
        const s = 0.3 + f * 2.4;
        child.scale.set(s, s, s);
        const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.opacity = (1 - f) * 0.55;
      });
    }
  });

  const blue = ANOMALY_HEX.leak;

  return (
    <group position={position}>
      <points ref={points}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[seeds.pos, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color={blue}
          size={0.17}
          transparent
          opacity={0.95}
          sizeAttenuation
          toneMapped={false}
          depthWrite={false}
        />
      </points>

      <group ref={ripples} position={[0, 0.16, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        {[0, 1, 2].map((i) => (
          <mesh key={i}>
            <ringGeometry args={[0.6, 0.78, 28]} />
            <meshBasicMaterial
              color={blue}
              transparent
              opacity={0.5}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/* ------------------------------ energy spike ------------------------------ */

function EnergySpike({ position }: { position: [number, number, number] }) {
  const arcA = useRef<THREE.Line>(null);
  const arcB = useRef<THREE.Line>(null);
  const light = useRef<THREE.PointLight>(null);
  const core = useRef<THREE.Mesh>(null);
  const lastGen = useRef(0);

  const buildArc = (seed: number) => {
    const geom = new THREE.BufferGeometry();
    const arr = new Float32Array(ARC_POINTS * 3);
    geom.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    const mat = new THREE.LineBasicMaterial({
      color: ANOMALY_HEX.spike,
      transparent: true,
      opacity: 0.9,
      toneMapped: false,
    });
    const line = new THREE.Line(geom, mat);
    line.userData.seed = seed;
    return line;
  };

  const lines = useMemo(() => [buildArc(1.7), buildArc(4.3)], []);

  const jitter = (line: THREE.Line) => {
    const attr = line.geometry.attributes.position as THREE.BufferAttribute;
    const seed = line.userData.seed as number;
    for (let i = 0; i < ARC_POINTS; i++) {
      const f = i / (ARC_POINTS - 1);
      attr.setXYZ(
        i,
        Math.sin(seed + i * 2.3) * (1 - f) * 0.5 + (Math.random() - 0.5) * 0.35,
        f * 3.2,
        Math.cos(seed + i * 1.7) * (1 - f) * 0.5 + (Math.random() - 0.5) * 0.35,
      );
    }
    attr.needsUpdate = true;
  };

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (t - lastGen.current > 0.08) {
      lastGen.current = t;
      jitter(lines[0]);
      jitter(lines[1]);
    }
    const flick = Math.random() > 0.25 ? 1 : 0.2;
    lines.forEach((l) => {
      (l.material as THREE.LineBasicMaterial).opacity = 0.85 * flick;
    });
    if (light.current) light.current.intensity = 9 * flick;
    if (core.current) {
      const s = 0.8 + Math.sin(t * 20) * 0.12;
      core.current.scale.setScalar(s);
    }
  });

  return (
    <group position={position}>
      <primitive object={lines[0]} ref={arcA} position={[0.2, 1.4, 0]} />
      <primitive object={lines[1]} ref={arcB} position={[-0.4, 1.8, 0.3]} />
      <mesh ref={core} position={[0, 3.2, 0]}>
        <sphereGeometry args={[0.26, 12, 12]} />
        <meshBasicMaterial color={ANOMALY_HEX.spike} toneMapped={false} />
      </mesh>
      <pointLight ref={light} position={[0, 3.2, 0]} color={ANOMALY_HEX.spike} intensity={8} distance={9} />
    </group>
  );
}

/* ----------------------------- waste overflow ----------------------------- */

function WasteOverflow({ position }: { position: [number, number, number] }) {
  const points = useRef<THREE.Points>(null);
  const base = useRef<THREE.Mesh>(null);

  const seeds = useMemo(() => {
    const pos = new Float32Array(WASTE_COUNT * 3);
    const phase = new Float32Array(WASTE_COUNT);
    for (let i = 0; i < WASTE_COUNT; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.55;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 2] = Math.sin(a) * r;
      pos[i * 3 + 1] = Math.random() * 4;
      phase[i] = Math.random();
    }
    return { pos, phase };
  }, []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (points.current) {
      const attr = points.current.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < WASTE_COUNT; i++) {
        const f = (t * 0.45 + seeds.phase[i]) % 1;
        attr.setY(i, f * 4.2);
        attr.setX(i, Math.sin(t * 0.9 + seeds.phase[i] * 6) * 0.35);
      }
      attr.needsUpdate = true;
    }
    if (base.current) {
      (base.current.material as THREE.MeshBasicMaterial).opacity = 0.25 + 0.15 * Math.sin(t * 2.5);
    }
  });

  const orange = ANOMALY_HEX.waste;

  return (
    <group position={position}>
      <points ref={points}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[seeds.pos, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color={orange}
          size={0.24}
          transparent
          opacity={0.8}
          sizeAttenuation
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </points>
      <mesh ref={base} position={[0, 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.9, 20]} />
        <meshBasicMaterial
          color={orange}
          transparent
          opacity={0.3}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

/* ------------------------------- dispatcher ------------------------------- */

export default function AnomalyFx({
  kind,
  position,
}: {
  kind: AnomalyKind;
  position: [number, number, number];
}) {
  if (kind === "leak") return <WaterLeak position={position} />;
  if (kind === "spike") return <EnergySpike position={position} />;
  return <WasteOverflow position={position} />;
}
