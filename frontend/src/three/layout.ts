/**
 * Diorama layout math: maps the campus world coordinates from /twin/campus
 * onto a small floating island, plus deterministic tree placement and the
 * shared status/anomaly vocabulary used by the 3D scene.
 */

export type IslandPoint = { x: number; z: number };
export type Rect = { cx: number; cz: number; w: number; d: number };

/** World → island transform. The campus data is centred and scaled down. */
export const ISLAND = {
  scale: 0.42,
  cx: 25,
  cz: 40,
  rx: 60,
  rz: 38,
  /** Thin slab sits so that island top surface is at y = 0. */
  surfaceY: 0,
} as const;

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

/** Convert a campus world coordinate (pos_x, pos_z, pos_y) to island space. */
export function worldToIsland(x: number, z: number, y = 0): [number, number, number] {
  return [(x - ISLAND.cx) * ISLAND.scale, y * 0.35 + 0.02, (z - ISLAND.cz) * ISLAND.scale];
}

/** Derive a stylised footprint + height from the building's area and floors. */
export function footprintFor(area: number, floors: number): { w: number; d: number; h: number } {
  const perFloor = area / Math.max(1, floors);
  const side = Math.sqrt(perFloor) * ISLAND.scale * 0.85;
  const w = clamp(side, 7, 16);
  const d = clamp(side * 0.72, 6, 12);
  const h = Math.max(1, floors) * 2.4 + 2.4;
  return { w, d, h };
}

/** Path spokes/links between buildings (hub-and-spoke + a few diagonals). */
const LINKS: [string, string][] = [
  ["LIB", "ADM"],
  ["LIB", "HOS"],
  ["LIB", "CAN"],
  ["LIB", "LAB"],
  ["CAN", "SPT"],
  ["ADM", "SPT"],
  ["HOS", "LAB"],
  ["CAN", "LAB"],
];

export type PathSegment = { a: IslandPoint; b: IslandPoint };

export function buildPaths(centers: Record<string, IslandPoint>): PathSegment[] {
  const segs: PathSegment[] = [];
  for (const [from, to] of LINKS) {
    const a = centers[from];
    const b = centers[to];
    if (a && b) segs.push({ a, b });
  }
  return segs;
}

/** Small deterministic PRNG so tree layout is stable across renders. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Tree = { x: number; z: number; scale: number; rot: number; hue: number };

function distToSegment(p: IslandPoint, a: IslandPoint, b: IslandPoint): number {
  const vx = b.x - a.x;
  const vz = b.z - a.z;
  const wx = p.x - a.x;
  const wz = p.z - a.z;
  const len2 = vx * vx + vz * vz || 1;
  const t = clamp((wx * vx + wz * vz) / len2, 0, 1);
  const dx = p.x - (a.x + t * vx);
  const dz = p.z - (a.z + t * vz);
  return Math.hypot(dx, dz);
}

/**
 * Scatter trees across the island, avoiding building footprints and paths.
 * Returns a fixed list used by a single InstancedMesh.
 */
export function buildTrees(rects: Rect[], segments: PathSegment[], count = 54): Tree[] {
  const rand = mulberry32(20261015);
  const trees: Tree[] = [];
  const innerRx = ISLAND.rx - 6;
  const innerRz = ISLAND.rz - 6;
  let attempts = 0;

  while (trees.length < count && attempts < count * 30) {
    attempts++;
    const x = (rand() * 2 - 1) * innerRx;
    const z = (rand() * 2 - 1) * innerRz;
    if ((x / innerRx) ** 2 + (z / innerRz) ** 2 > 0.94) continue;

    const inBuilding = rects.some(
      (r) => Math.abs(x - r.cx) < r.w / 2 + 1.8 && Math.abs(z - r.cz) < r.d / 2 + 1.8,
    );
    if (inBuilding) continue;

    const onPath = segments.some((s) => distToSegment({ x, z }, s.a, s.b) < 2.4);
    if (onPath) continue;

    const tooClose = trees.some((t) => Math.hypot(t.x - x, t.z - z) < 2.1);
    if (tooClose) continue;

    trees.push({
      x,
      z,
      scale: 0.75 + rand() * 0.75,
      rot: rand() * Math.PI * 2,
      hue: rand(),
    });
  }
  return trees;
}

/* -------------------------------------------------------------------------- */
/* Status + anomaly vocabulary                                                */
/* -------------------------------------------------------------------------- */

export type BuildingStatus = "healthy" | "warning" | "critical";

export const STATUS_HEX: Record<BuildingStatus, string> = {
  healthy: "#5CFFB1",
  warning: "#FFB84D",
  critical: "#FF5C6C",
};

export const STATUS_LABEL: Record<BuildingStatus, string> = {
  healthy: "Healthy",
  warning: "Warning",
  critical: "Critical",
};

/** Detection thresholds — mirrored from backend app/config.py defaults. */
export const THRESHOLDS = {
  waterLeakLpm: 8,
  wasteFillPct: 90,
  energyWasteWatts: 1400,
} as const;

export type AnomalyKind = "leak" | "spike" | "waste";

export type ZoneAnomaly = {
  kind: AnomalyKind;
  zoneId: number;
  zoneName: string;
  buildingId: number;
  buildingCode: string;
};

export const ANOMALY_HEX: Record<AnomalyKind, string> = {
  leak: "#4DB8FF",
  spike: "#FFE24D",
  waste: "#FF9A3C",
};
