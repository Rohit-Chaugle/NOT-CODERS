import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { ISLAND } from "./layout";

const COUNT = 120;

/** Drifting bioluminescent spores — only rendered at night. */
export default function Fireflies() {
  const ref = useRef<THREE.Points>(null);

  const seeds = useMemo(() => {
    const pos = new Float32Array(COUNT * 3);
    const phase = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3] = (Math.random() * 2 - 1) * (ISLAND.rx - 4);
      pos[i * 3 + 1] = 1 + Math.random() * 12;
      pos[i * 3 + 2] = (Math.random() * 2 - 1) * (ISLAND.rz - 4);
      phase[i] = Math.random() * Math.PI * 2;
    }
    return { pos, phase };
  }, []);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    const attr = ref.current.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < COUNT; i++) {
      const p = seeds.phase[i];
      attr.setY(i, seeds.pos[i * 3 + 1] + Math.sin(t * 0.4 + p) * 0.9);
      attr.setX(i, seeds.pos[i * 3] + Math.cos(t * 0.2 + p) * 0.8);
    }
    attr.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[seeds.pos, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#5CFFB1"
        size={0.16}
        transparent
        opacity={0.75}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
    </points>
  );
}
