import { useMemo, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import type { CampusBuilding } from "../api/twin";
import {
  buildPaths,
  buildTrees,
  footprintFor,
  worldToIsland,
  type BuildingStatus,
  type IslandPoint,
  type Rect,
} from "./layout";
import type { AnomalyMarker } from "../hooks/useTwinData";
import Island from "./Island";
import Paths from "./Paths";
import Trees from "./Trees";
import BuildingBlock from "./BuildingBlock";
import AnomalyFx from "./Anomalies";
import Fireflies from "./Fireflies";
import CameraRig, { type Focus } from "./CameraRig";

const CAM_NIGHT = "#050d0b";
const CAM_DAY = "#a8c8d6";
const OVERVIEW: Focus = { pos: [72, 64, 104], target: [0, 2, 0] };

type ControlsLike = {
  target: import("three").Vector3;
  autoRotate: boolean;
  autoRotateSpeed: number;
  enabled: boolean;
};

type Props = {
  buildings: CampusBuilding[];
  statuses: Record<number, BuildingStatus>;
  anomalies: AnomalyMarker[];
  night: boolean;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onBackgroundClick: () => void;
};

function Lights({ night }: { night: boolean }) {
  return (
    <>
      <ambientLight intensity={night ? 0.35 : 0.85} />
      <hemisphereLight
        intensity={night ? 0.25 : 0.5}
        color={night ? "#16324a" : "#bfe0ff"}
        groundColor={night ? "#0a1a14" : "#4d6b52"}
      />
      <directionalLight
        position={night ? [-45, 60, -30] : [55, 85, 25]}
        intensity={night ? 0.55 : 1.35}
        color={night ? "#9fc4ff" : "#fff2d6"}
      />
    </>
  );
}

function Rig({ focus }: { focus: Focus }) {
  const controls = useThree((s) => s.controls) as ControlsLike | null;
  const interacting = useRef(false);
  const lastInput = useRef(performance.now() / 1000);

  return (
    <>
      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={18}
        maxDistance={210}
        maxPolarAngle={Math.PI / 2.12}
        minPolarAngle={Math.PI / 6}
        onStart={() => {
          interacting.current = true;
          lastInput.current = performance.now() / 1000;
        }}
        onEnd={() => {
          interacting.current = false;
          lastInput.current = performance.now() / 1000;
        }}
      />
      <CameraRig focus={focus} interacting={interacting} lastInput={lastInput} controls={controls} />
    </>
  );
}

export default function TwinScene({
  buildings,
  statuses,
  anomalies,
  night,
  selectedId,
  onSelect,
  onBackgroundClick,
}: Props) {
  const { segments, trees } = useMemo(() => {
    const centers: Record<string, IslandPoint> = {};
    const rects: Rect[] = [];
    for (const b of buildings) {
      const [cx, , cz] = worldToIsland(b.position.x, b.position.z, 0);
      centers[b.code] = { x: cx, z: cz };
      const { w, d } = footprintFor(b.area_m2, b.floors);
      rects.push({ cx, cz, w, d });
    }
    const segments = buildPaths(centers);
    return { segments, trees: buildTrees(rects, segments) };
  }, [buildings]);

  const focus = useMemo<Focus>(() => {
    const b = buildings.find((bb) => bb.id === selectedId);
    if (!b) return OVERVIEW;
    const [cx, , cz] = worldToIsland(b.position.x, b.position.z, 0);
    const { w, d, h } = footprintFor(b.area_m2, b.floors);
    const dist = Math.max(w, d) * 2.1 + 15;
    const len = Math.hypot(cx, cz) || 1;
    const dirx = cx / len;
    const dirz = cz / len;
    return {
      target: [cx, h * 0.55, cz],
      pos: [cx + dirx * dist, h + dist * 0.55, cz + dirz * dist],
    };
  }, [buildings, selectedId]);

  const anomalyByBuilding = useMemo(() => {
    const map = new Map<number, AnomalyMarker["kind"][]>();
    for (const a of anomalies) {
      const list = map.get(a.buildingId) ?? [];
      list.push(a.kind);
      map.set(a.buildingId, list);
    }
    return map;
  }, [anomalies]);

  const bg = night ? CAM_NIGHT : CAM_DAY;

  return (
    <Canvas
      camera={{ position: OVERVIEW.pos, fov: 40, near: 0.5, far: 600 }}
      dpr={[1, 1.6]}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      onPointerMissed={onBackgroundClick}
    >
      <color attach="background" args={[bg]} />
      <fogExp2 attach="fog" args={[bg, night ? 0.0075 : 0.006]} />

      <Lights night={night} />
      <Island night={night} />
      <Paths segments={segments} night={night} />
      <Trees trees={trees} night={night} />

      {buildings.map((b) => (
        <BuildingBlock
          key={b.id}
          building={b}
          status={statuses[b.id] ?? "healthy"}
          selected={selectedId === b.id}
          anomalyKinds={anomalyByBuilding.get(b.id) ?? []}
          night={night}
          onSelect={onSelect}
        />
      ))}

      {anomalies.map((a) => (
        <AnomalyFx key={`${a.zoneId}:${a.kind}`} kind={a.kind} position={a.position} />
      ))}

      {night && <Fireflies />}

      <Rig focus={focus} />

      <EffectComposer multisampling={0}>
        <Bloom
          intensity={night ? 1.15 : 0.5}
          luminanceThreshold={0.2}
          luminanceSmoothing={0.3}
          mipmapBlur
          radius={0.7}
        />
      </EffectComposer>
    </Canvas>
  );
}
