import { useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, Instance, Instances } from "@react-three/drei";
import * as THREE from "three";
import type { CampusBuilding } from "../api/twin";
import {
  STATUS_HEX,
  STATUS_LABEL,
  footprintFor,
  worldToIsland,
  type AnomalyKind,
  type BuildingStatus,
} from "./layout";
import { AlertIcon } from "../components/ui/Icons";

const BODY_NIGHT: Record<string, string> = {
  academic: "#223b30",
  residential: "#26303f",
  amenities: "#3a2f24",
  admin: "#2b2b33",
};
const BODY_DAY: Record<string, string> = {
  academic: "#5d8a72",
  residential: "#6f7f96",
  amenities: "#9a8058",
  admin: "#8b8b98",
};

const WIN_COLS = 3;

type WindowSpec = { position: [number, number, number]; rotation: [number, number, number] };

function buildWindows(w: number, d: number, h: number, floors: number, seed: number): WindowSpec[] {
  // Cheap deterministic per-window on/off so facades aren't uniform.
  let s = seed * 2654435761;
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };

  const out: WindowSpec[] = [];
  const rows = Math.max(1, floors);
  const rowH = h / (rows + 0.6);
  const faces: { axis: "x" | "z"; sign: 1 | -1; span: number }[] = [
    { axis: "z", sign: 1, span: w },
    { axis: "z", sign: -1, span: w },
    { axis: "x", sign: 1, span: d },
    { axis: "x", sign: -1, span: d },
  ];

  for (const face of faces) {
    const cols = Math.max(WIN_COLS, Math.round(face.span / 2.2));
    for (let r = 0; r < rows; r++) {
      const y = rowH * (r + 0.9);
      for (let c = 0; c < cols; c++) {
        if (rnd() < 0.18) continue; // dark window
        const t = (c + 0.5) / cols - 0.5;
        const along = t * (face.span - 1.1);
        if (face.axis === "z") {
          out.push({
            position: [along, y, face.sign * (d / 2 + 0.04)],
            rotation: [0, face.sign > 0 ? 0 : Math.PI, 0],
          });
        } else {
          out.push({
            position: [face.sign * (w / 2 + 0.04), y, along],
            rotation: [0, (face.sign > 0 ? 1 : -1) * (Math.PI / 2), 0],
          });
        }
      }
    }
  }
  return out;
}

type Props = {
  building: CampusBuilding;
  status: BuildingStatus;
  selected: boolean;
  anomalyKinds: AnomalyKind[];
  night: boolean;
  onSelect: (id: number) => void;
};

export default function BuildingBlock({
  building,
  status,
  selected,
  anomalyKinds,
  night,
  onSelect,
}: Props) {
  const [hovered, setHovered] = useState(false);

  const [cx, , cz] = worldToIsland(building.position.x, building.position.z, 0);
  const { w, d, h } = useMemo(
    () => footprintFor(building.area_m2, building.floors),
    [building.area_m2, building.floors],
  );
  const rotY = Math.atan2(cx, cz);

  const windows = useMemo(
    () => buildWindows(w, d, h, building.floors, building.id),
    [w, d, h, building.floors, building.id],
  );

  const winMat = useRef<THREE.MeshBasicMaterial>(null);
  const ringMat = useRef<THREE.LineBasicMaterial>(null);
  const discMat = useRef<THREE.MeshBasicMaterial>(null);

  const hex = STATUS_HEX[status];
  const body = (night ? BODY_NIGHT : BODY_DAY)[building.category] ?? "#2b3a33";
  const hasSpike = anomalyKinds.includes("spike");
  const isCritical = status === "critical";

  const edgeGeom = useMemo(
    () => new THREE.EdgesGeometry(new THREE.BoxGeometry(w * 1.06, h * 1.03, d * 1.06)),
    [w, d, h],
  );

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const base = night ? 0.95 : 0.35;
    const pulse = isCritical ? 0.55 + 0.45 * Math.abs(Math.sin(t * 3)) : 1;
    const flicker = hasSpike
      ? 0.55 + 0.45 * (Math.sin(t * 27) > 0.3 ? 1 : 0.35) * Math.abs(Math.sin(t * 11))
      : 1;

    if (winMat.current) winMat.current.opacity = base * pulse * flicker;
    if (ringMat.current) {
      ringMat.current.opacity = isCritical
        ? 0.35 + 0.45 * Math.abs(Math.sin(t * 3))
        : selected || hovered
          ? 0.85
          : 0.22;
    }
    if (discMat.current) {
      discMat.current.opacity = isCritical
        ? 0.28 + 0.22 * Math.abs(Math.sin(t * 2.4))
        : hovered || selected
          ? 0.3
          : 0.12;
    }
  });

  const showLabel = isCritical || hovered || selected;

  return (
    <group position={[cx, 0, cz]} rotation={[0, rotY, 0]}>
      {/* Clickable volume */}
      <mesh
        position={[0, h / 2, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(building.id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "auto";
        }}
      >
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={body} flatShading roughness={0.85} metalness={0.05} />
      </mesh>

      {/* Roof slab */}
      <mesh position={[0, h + 0.25, 0]}>
        <boxGeometry args={[w * 1.06, 0.5, d * 1.06]} />
        <meshStandardMaterial color={night ? "#101a15" : "#3c4a41"} flatShading roughness={1} />
      </mesh>

      {/* Emissive windows */}
      <Instances limit={windows.length} frustumCulled={false}>
        <planeGeometry args={[0.62, 0.42]} />
        <meshBasicMaterial
          ref={winMat}
          color={hex}
          toneMapped={false}
          transparent
          opacity={night ? 0.9 : 0.35}
        />
        {windows.map((win, i) => (
          <Instance key={i} position={win.position} rotation={win.rotation} />
        ))}
      </Instances>

      {/* Status outline */}
      <lineSegments geometry={edgeGeom}>
        <lineBasicMaterial ref={ringMat} color={hex} transparent opacity={0.22} />
      </lineSegments>

      {/* Ground glow disc */}
      <mesh position={[0, 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[Math.max(w, d) * 0.85, 24]} />
        <meshBasicMaterial
          ref={discMat}
          color={hex}
          transparent
          opacity={0.12}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      <Html
        position={[0, h + 2.4, 0]}
        center
        zIndexRange={[5, 0]}
        style={{
          opacity: showLabel ? 1 : 0,
          pointerEvents: "none",
          transition: "opacity 0.2s ease",
          visibility: showLabel ? "visible" : "hidden",
        }}
      >
        <div
          className="glass flex items-center gap-2 whitespace-nowrap px-2.5 py-1.5 shadow-lg"
          style={{ ["--accent" as string]: hex }}
        >
          {isCritical ? (
            <AlertIcon size={13} style={{ color: hex }} />
          ) : (
            <span className="h-2 w-2 rounded-full" style={{ background: hex }} />
          )}
          <span className="font-display text-[11px] font-semibold text-ink">
            {building.code}
          </span>
          <span className="label-mono" style={{ color: hex }}>
            {STATUS_LABEL[status]}
          </span>
        </div>
      </Html>
    </group>
  );
}
