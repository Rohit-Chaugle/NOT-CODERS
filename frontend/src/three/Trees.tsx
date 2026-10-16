import { Instance, Instances } from "@react-three/drei";
import * as THREE from "three";
import type { Tree } from "./layout";

const TRUNK_NIGHT = "#2b2117";
const TRUNK_DAY = "#4a3a26";
const FOLIAGE_DARK_NIGHT = "#1f5b3f";
const FOLIAGE_LIGHT_NIGHT = "#2f8a5d";
const FOLIAGE_DARK_DAY = "#2f7d52";
const FOLIAGE_LIGHT_DAY = "#63bd82";

/**
 * Instanced low-poly trees. All trunks share one InstancedMesh and all
 * foliage another — two draw calls regardless of tree count.
 */
export default function Trees({ trees, night }: { trees: Tree[]; night: boolean }) {
  const dark = new THREE.Color(night ? FOLIAGE_DARK_NIGHT : FOLIAGE_DARK_DAY);
  const light = new THREE.Color(night ? FOLIAGE_LIGHT_NIGHT : FOLIAGE_LIGHT_DAY);
  const tmp = new THREE.Color();
  const trunk = night ? TRUNK_NIGHT : TRUNK_DAY;

  return (
    <group>
      <Instances limit={trees.length} frustumCulled={false}>
        <cylinderGeometry args={[0.14, 0.22, 1.4, 5]} />
        <meshStandardMaterial color={trunk} roughness={1} flatShading />
        {trees.map((t, i) => (
          <Instance
            key={i}
            position={[t.x, 0.7 * t.scale, t.z]}
            scale={t.scale}
            rotation={[0, t.rot, 0]}
          />
        ))}
      </Instances>

      <Instances limit={trees.length} frustumCulled={false}>
        <coneGeometry args={[1.1, 2.6, 6]} />
        <meshStandardMaterial roughness={1} flatShading />
        {trees.map((t, i) => (
          <Instance
            key={i}
            position={[t.x, 2.7 * t.scale, t.z]}
            scale={t.scale}
            rotation={[0, t.rot, 0]}
            color={tmp.copy(dark).lerp(light, t.hue).getStyle()}
          />
        ))}
      </Instances>
    </group>
  );
}
