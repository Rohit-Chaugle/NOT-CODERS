/**
 * In-browser mock vision detector — a TypeScript port of the mock branch of
 * `backend/app/services/vision.py`.
 *
 * The backend prefers YOLO when the optional extras are installed; in the
 * browser there is no model, so the deterministic "mock" findings are used.
 * It is seeded on the frame bytes + zone + a 15s bucket, so the same frame
 * scanned twice in a row agrees with itself while later scans differ.
 */

import { hash32, SeededRandom } from "./random";
import type { IssueType, Severity } from "../api/twin";

export type VisionKind = "waste" | "lights" | "water";

export type MockFinding = {
  kind: VisionKind;
  issue_type: IssueType;
  severity: Severity;
  label: string;
  detail: string;
  confidence: number;
  bbox: [number, number, number, number];
};

export type VisionZoneContext = {
  id?: number;
  name?: string;
  zone_type?: string;
  occupancy?: number | null;
};

export const KIND_TO_ISSUE: Record<VisionKind, IssueType> = {
  waste: "waste_accumulation",
  lights: "energy_wastage",
  water: "water_leakage",
};

const MOCK_KINDS: VisionKind[] = ["waste", "lights", "water"];
const MOCK_SECOND_CHANCE = 0.18;

const MOCK_CONF: Record<VisionKind, [number, number]> = {
  waste: [0.78, 0.96],
  lights: [0.64, 0.89],
  water: [0.71, 0.94],
};

const MOCK_BBOX: Record<VisionKind, [number, number, number, number]> = {
  waste: [0.3, 0.54, 0.3, 0.3],
  lights: [0.12, 0.07, 0.34, 0.22],
  water: [0.16, 0.64, 0.44, 0.24],
};

const MOCK_LABELS: Record<VisionKind, string> = {
  waste: "Overflowing waste",
  lights: "Lights on in empty room",
  water: "Water pooling on floor",
};

function eligibleKinds(zoneCtx: VisionZoneContext): VisionKind[] {
  const server = zoneCtx.zone_type === "server";
  const hasOccupancy = zoneCtx.occupancy !== undefined && zoneCtx.occupancy !== null;
  const pool = MOCK_KINDS.filter((kind) => !(kind === "lights" && (server || !hasOccupancy)));
  return pool.length ? pool : ["waste"];
}

function baseSeverity(kind: VisionKind, confidence: number): Severity {
  if (confidence >= 0.9) return kind === "waste" || kind === "water" ? "critical" : "high";
  if (confidence >= 0.8) return "high";
  return "medium";
}

function detail(kind: VisionKind, zoneCtx: VisionZoneContext, confidence: number): string {
  const zoneName = zoneCtx.name ?? "the zone";
  const occupancy = zoneCtx.occupancy;

  if (kind === "waste") {
    const bags = Math.max(1, Math.round(confidence * 6));
    return (
      `Frame analysis found waste heaped ${bags} bags above the bin rim in ${zoneName} ` +
      `(${Math.round(confidence * 100)}% confidence).`
    );
  }
  if (kind === "lights") {
    const who = !occupancy ? "no occupants" : `occupancy ${occupancy}`;
    return (
      `Brightness in ${zoneName} with ${who} — lighting is on outside of use ` +
      `(${Math.round(confidence * 100)}% confidence).`
    );
  }
  const depth = 1 + Math.round(confidence * 7);
  const area = 0.4 + Math.round(confidence * 40) / 10;
  return (
    `Standing water ~${depth} cm deep covering ~${area} m² of the ${zoneName} floor ` +
    `(${Math.round(confidence * 100)}% confidence).`
  );
}

function buildFinding(
  kind: VisionKind,
  severity: Severity,
  confidence: number,
  bbox: [number, number, number, number],
  zoneCtx: VisionZoneContext,
): MockFinding {
  let finalSeverity = severity;
  if (confidence >= 0.93 && (severity === "low" || severity === "medium" || severity === "high")) {
    finalSeverity = { low: "medium", medium: "high", high: "critical" }[severity] as Severity;
  }
  return {
    kind,
    issue_type: KIND_TO_ISSUE[kind],
    severity: finalSeverity,
    label: MOCK_LABELS[kind],
    detail: detail(kind, zoneCtx, confidence),
    confidence,
    bbox,
  };
}

/** Deterministic-but-varied findings so an offline demo still behaves. */
export function mockFindings(bytes: Uint8Array, zoneCtx: VisionZoneContext): MockFinding[] {
  const zoneId = zoneCtx.id ?? 0;
  const frameHash = hash32(bytes.subarray(0, 8192));
  const seed = (frameHash ^ (zoneId * 0x9e3779b1) ^ Math.floor(Date.now() / 15000)) >>> 0;
  const rng = new SeededRandom(seed);

  const pool = rng.shuffle(eligibleKinds(zoneCtx));
  const count = rng.random() > MOCK_SECOND_CHANCE ? 1 : 2;
  const kinds = pool.slice(0, count);

  const findings: MockFinding[] = [];
  for (const kind of kinds) {
    const [lo, hi] = MOCK_CONF[kind];
    const confidence = rng.uniform(lo, hi);
    let [x1, y1, w, h] = MOCK_BBOX[kind];
    x1 += rng.uniform(-0.06, 0.06);
    y1 += rng.uniform(-0.05, 0.05);
    w *= rng.uniform(0.85, 1.25);
    h *= rng.uniform(0.85, 1.2);
    const bbox: [number, number, number, number] = [
      Math.max(0.0, x1),
      Math.max(0.0, y1),
      Math.min(1.0, x1 + w),
      Math.min(1.0, y1 + h),
    ];
    findings.push(buildFinding(kind, baseSeverity(kind, confidence), confidence, bbox, zoneCtx));
  }
  return findings;
}

/** Best-effort image dimensions for the response metadata. */
export async function getImageSize(file: File): Promise<[number, number] | null> {
  try {
    if (typeof createImageBitmap === "function") {
      const bitmap = await createImageBitmap(file);
      const size: [number, number] = [bitmap.width, bitmap.height];
      bitmap.close();
      return size;
    }
  } catch {
    /* not decodable — metadata only */
  }
  return null;
}
