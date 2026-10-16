import { useMemo } from "react";
import { ISLAND } from "./layout";

const GRASS_NIGHT = "#2c6046";
const GRASS_DAY = "#4f9e6a";
const ROCK_NIGHT = "#16241d";
const ROCK_DAY = "#243430";

/**
 * Floating island diorama: an elliptical grass slab over a faceted rock base
 * with a few dangling stones underneath. No shadows, flat shading only.
 */
export default function Island({ night }: { night: boolean }) {
  const grass = night ? GRASS_NIGHT : GRASS_DAY;
  const rock = night ? ROCK_NIGHT : ROCK_DAY;
  const squish = ISLAND.rz / ISLAND.rx;

  const rocks = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2 + 0.4;
        const r = 14 + (i % 3) * 9;
        return {
          pos: [Math.cos(a) * r, -16 - (i % 4) * 6, Math.sin(a) * r * squish] as [
            number,
            number,
            number,
          ],
          scale: 3 + (i % 3) * 1.8,
        };
      }),
    [squish],
  );

  return (
    <group>
      {/* Grass cap — top surface sits at y = 0 */}
      <mesh position={[0, -1, 0]} scale={[1, 1, squish]}>
        <cylinderGeometry args={[ISLAND.rx, ISLAND.rx - 1, 2, 20, 1]} />
        <meshStandardMaterial color={grass} flatShading roughness={1} metalness={0} />
      </mesh>

      {/* Rock base */}
      <mesh position={[0, -7.5, 0]} scale={[1, 1, squish]}>
        <cylinderGeometry args={[ISLAND.rx - 1, ISLAND.rx * 0.55, 11, 12, 1]} />
        <meshStandardMaterial color={rock} flatShading roughness={1} metalness={0} />
      </mesh>

      {/* Dangling stones */}
      {rocks.map((r, i) => (
        <mesh key={i} position={r.pos} scale={r.scale} rotation={[i, i * 1.7, i * 0.7]}>
          <icosahedronGeometry args={[0.5, 0]} />
          <meshStandardMaterial color={rock} flatShading roughness={1} />
        </mesh>
      ))}
    </group>
  );
}
