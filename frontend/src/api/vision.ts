/**
 * Client for the computer-vision lab (POST /vision/analyze).
 *
 * The backend returns detections with bounding boxes normalized to 0..1 of the
 * submitted image, so the UI can overlay them without knowing pixel sizes.
 */

import type { Issue, IssueType, Severity } from "./twin";

export type VisionKind = "waste" | "lights" | "water";

export type VisionDetection = {
  kind: VisionKind;
  issue_type: IssueType;
  severity: Severity;
  label: string;
  detail: string;
  confidence: number;
  /** Normalized [x1, y1, x2, y2] in 0..1 relative to the image. */
  bbox: [number, number, number, number];
};

export type VisionZone = {
  id: number;
  name: string;
  building_id: number;
  building_name: string | null;
  zone_type: string;
  occupancy: number | null;
};

export type VisionResponse = {
  /** Which detector produced this result. */
  engine: "yolo" | "mock";
  model: string | null;
  /** Why the mock detector was used instead of the model, when it was. */
  reason: string | null;
  zone: VisionZone;
  image: { bytes: number; content_type: string; size: [number, number] | null };
  config: { conf: number; model: string };
  scanned_at: string;
  detections: VisionDetection[];
  /** Issues actually created (source="vision"). */
  issues: Issue[];
  /** Detections skipped because this zone was already flagged recently. */
  suppressed: { type: string; label: string; reason: string }[];
};

const KIND_LABEL: Record<VisionKind, string> = {
  waste: "Overflowing waste",
  lights: "Lights on in empty room",
  water: "Water pooling",
};

export function kindLabel(kind: VisionKind): string {
  return KIND_LABEL[kind];
}

export async function analyzeImage(
  file: File,
  zoneId: number,
  signal?: AbortSignal,
): Promise<VisionResponse> {
  const body = new FormData();
  body.append("file", file);
  body.append("zone_id", String(zoneId));

  const res = await fetch("/vision/analyze", {
    method: "POST",
    body,
    signal,
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    let detail = `vision/analyze responded ${res.status}`;
    try {
      const payload = (await res.json()) as { detail?: unknown };
      if (payload?.detail) detail = String(payload.detail);
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail);
  }

  return (await res.json()) as VisionResponse;
}
