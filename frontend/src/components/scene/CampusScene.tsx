import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { MOCK_BUILDINGS } from "../../data/mock";
import { ACCENT_HEX } from "../../theme/palette";

/** Pulsing issue beacons (one per mock issue zone). */
const BEACONS: { x: number; z: number; color: string }[] = [
  { x: 18, z: -2, color: ACCENT_HEX.coral }, // Admin
  { x: 4, z: -12, color: ACCENT_HEX.mint }, // Labs
  { x: 2, z: 14, color: ACCENT_HEX.amber }, // Canteen
];

function GroundGrid() {
  return (
    <group>
      <gridHelper args={[80, 40, "#1d7d55", "#0d2b20"]} position={[0, 0, 0]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[80, 80]} />
        <meshBasicMaterial color="#04120d" transparent opacity={0.85} />
      </mesh>
    </group>
  );
}

function Buildings() {
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!group.current) return;
    const t = clock.elapsedTime;
    let i = 0;
    group.current.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && mesh.material) {
        const mat = mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.1 + Math.sin(t * 0.6 + i) * 0.03 + 0.03;
        i++;
      }
    });
  });

  const meshes = useMemo(
    () =>
      MOCK_BUILDINGS.map((b) => ({
        ...b,
        position: [b.x, b.h / 2, b.z] as [number, number, number],
        size: [b.w, b.h, b.d] as [number, number, number],
        edges: new THREE.EdgesGeometry(new THREE.BoxGeometry(b.w, b.h, b.d)),
      })),
    [],
  );

  return (
    <group ref={group}>
      {meshes.map((b) => (
        <group key={b.id}>
          <mesh position={b.position}>
            <boxGeometry args={b.size} />
            <meshBasicMaterial
              color={ACCENT_HEX.mint}
              transparent
              opacity={0.12}
            />
          </mesh>
          {/* Wireframe edges */}
          <lineSegments position={b.position} geometry={b.edges}>
            <lineBasicMaterial color={ACCENT_HEX.mint} transparent opacity={0.4} />
          </lineSegments>
        </group>
      ))}
    </group>
  );
}

function Beacons() {
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!group.current) return;
    const t = clock.elapsedTime;
    group.current.children.forEach((child, i) => {
      const s = 1 + Math.sin(t * 2.2 + i * 1.7) * 0.35;
      child.scale.set(s, s, s);
    });
  });

  return (
    <group ref={group}>
      {BEACONS.map((b, i) => (
        <group key={i} position={[b.x, 6, b.z]}>
          <mesh>
            <sphereGeometry args={[0.35, 12, 12]} />
            <meshBasicMaterial color={b.color} />
          </mesh>
          <mesh>
            <sphereGeometry args={[0.8, 12, 12]} />
            <meshBasicMaterial color={b.color} transparent opacity={0.18} />
          </mesh>
          <pointLight color={b.color} intensity={6} distance={10} />
        </group>
      ))}
    </group>
  );
}

/** Drifting bioluminescent spores. */
function Fireflies({ count = 140 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null);
  const seeds = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 60;
      positions[i * 3 + 1] = Math.random() * 14 + 0.5;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 60;
      phases[i] = Math.random() * Math.PI * 2;
    }
    return { positions, phases };
  }, [count]);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    const pos = ref.current.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < count; i++) {
      const phase = seeds.phases[i];
      pos.setY(i, seeds.positions[i * 3 + 1] + Math.sin(t * 0.5 + phase) * 0.8);
      pos.setX(i, seeds.positions[i * 3] + Math.cos(t * 0.25 + phase) * 0.6);
    }
    pos.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[seeds.positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        color={ACCENT_HEX.mint}
        size={0.14}
        transparent
        opacity={0.7}
        sizeAttenuation
      />
    </points>
  );
}

/**
 * Ambient 3D campus twin rendered as a non-interactive-looking backdrop
 * (subtle orbit controls allowed, but pointer-events are off by default so
 * the HUD stays clickable; enable via the Twin page later).
 */
export default function CampusScene({ interactive = false }: { interactive?: boolean }) {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-0"
      style={{ pointerEvents: interactive ? "auto" : "none" }}
    >
      <Canvas
        camera={{ position: [26, 22, 26], fov: 42 }}
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
        style={{ background: "transparent" }}
      >
        <ambientLight intensity={0.6} />
        <GroundGrid />
        <Buildings />
        <Beacons />
        <Fireflies />
        {interactive && (
          <OrbitControls
            enablePan={false}
            enableZoom={false}
            autoRotate
            autoRotateSpeed={0.4}
            maxPolarAngle={Math.PI / 2.2}
            minPolarAngle={Math.PI / 5}
          />
        )}
      </Canvas>
    </div>
  );
}
