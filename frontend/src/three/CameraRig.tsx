import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export type Focus = { target: [number, number, number]; pos: [number, number, number] };

/** Minimal structural type for the OrbitControls instance we drive. */
type ControlsLike = {
  target: THREE.Vector3;
  autoRotate: boolean;
  autoRotateSpeed: number;
  enabled: boolean;
};

type Props = {
  focus: Focus;
  interacting: React.RefObject<boolean>;
  lastInput: React.RefObject<number>;
  controls: ControlsLike | null;
};

const ARRIVE = 0.25;

/**
 * Smoothly eases the camera + orbit target toward `focus` whenever it changes
 * (e.g. after clicking a building) and toggles idle auto-rotation.
 */
export default function CameraRig({ focus, interacting, lastInput, controls }: Props) {
  const desiredPos = useRef(new THREE.Vector3(...focus.pos));
  const desiredTarget = useRef(new THREE.Vector3(...focus.target));
  const flying = useRef(true);
  const key = useRef("");

  // React to focus changes.
  useEffect(() => {
    const k = `${focus.pos.join(",")}|${focus.target.join(",")}`;
    if (k === key.current) return;
    key.current = k;
    desiredPos.current.set(...focus.pos);
    desiredTarget.current.set(...focus.target);
    flying.current = true;
  }, [focus]);

  useFrame(({ camera, clock }, delta) => {
    const now = performance.now() / 1000;

    if (flying.current) {
      const k = 1 - Math.exp(-4.2 * Math.min(delta, 0.1));
      camera.position.lerp(desiredPos.current, k);
      if (controls) {
        controls.target.lerp(desiredTarget.current, k);
        controls.autoRotate = false;
      } else {
        camera.lookAt(desiredTarget.current);
      }
      if (camera.position.distanceTo(desiredPos.current) < ARRIVE) {
        camera.position.copy(desiredPos.current);
        if (controls) controls.target.copy(desiredTarget.current);
        flying.current = false;
        lastInput.current = now;
      }
      return;
    }

    if (controls) {
      const idle = now - lastInput.current > 4;
      controls.autoRotate = idle && !interacting.current;
      controls.autoRotateSpeed = 0.45;
    }

    // Very slow drift on the vertical axis keeps the scene alive.
    void clock;
  });

  return null;
}
