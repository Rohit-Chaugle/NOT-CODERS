import { useMemo } from "react";
import type { PathSegment } from "./layout";

const PATH_NIGHT = "#4a4f3d";
const PATH_DAY = "#8a8360";

/** Flat path strips laid between linked buildings. */
export default function Paths({ segments, night }: { segments: PathSegment[]; night: boolean }) {
  const color = night ? PATH_NIGHT : PATH_DAY;

  const strips = useMemo(
    () =>
      segments.map((s) => {
        const mx = (s.a.x + s.b.x) / 2;
        const mz = (s.a.z + s.b.z) / 2;
        const dx = s.b.x - s.a.x;
        const dz = s.b.z - s.a.z;
        const len = Math.hypot(dx, dz);
        const angle = Math.atan2(dz, dx);
        return { mx, mz, len, angle };
      }),
    [segments],
  );

  return (
    <group>
      {strips.map((s, i) => (
        <mesh
          key={i}
          position={[s.mx, 0.05, s.mz]}
          rotation={[-Math.PI / 2, 0, -s.angle]}
        >
          <planeGeometry args={[s.len, 1.7]} />
          <meshStandardMaterial
            color={color}
            roughness={1}
            metalness={0}
            transparent
            opacity={0.9}
            polygonOffset
            polygonOffsetFactor={-1}
          />
        </mesh>
      ))}
    </group>
  );
}
