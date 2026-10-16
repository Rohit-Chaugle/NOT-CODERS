/**
 * The in-browser standalone engine.
 *
 * Holds the entire digital-twin world (topology, live readings, issues) and
 * exposes the same operations the FastAPI backend does, so the existing
 * `api/*` clients can be served locally. Live updates are published through a
 * tiny pub/sub that mirrors the `/ws/live` event envelope.
 */

import {
  buildTopology,
  campusResponse,
  type CampusTopology,
  type SensorRecord,
  type SensorType,
  type ZoneRecord,
} from "./seed";
import { SIM_INTERVAL_SECONDS, Simulator, type SimSensor } from "./simulator";
import { Detector, SEVERITY_TO_LEVEL, type CreateSpec } from "./detection";
import * as analytics from "./analytics";
import { getImageSize, mockFindings, type VisionZoneContext } from "./vision";
import { generateReportPdf } from "./pdf";
import { ISSUE_COOLDOWN_SECONDS, VISION_CONF, VISION_ISSUE_COOLDOWN } from "./config";
import type {
  CampusResponse,
  Issue,
  IssueStatus,
  LiveEvent,
  LiveReading,
} from "../api/twin";
import type {
  ChatMessage,
  ChatResponse,
  ProviderInfo,
  RecommendationsResponse,
  SustainabilityReport,
} from "../api/ai";
import type { VisionDetection, VisionResponse } from "../api/vision";

// ---------------------------------------------------------------------------
// World state
// ---------------------------------------------------------------------------

const topology: CampusTopology = buildTopology();
const zoneById = new Map<number, ZoneRecord>(topology.zones.map((z) => [z.id, z]));
const sensorById = new Map<number, SensorRecord>(topology.sensors.map((s) => [s.id, s]));

let issues: Issue[] = [];
let nextIssueId = 1;

const latest = new Map<number, number>();
const history: { ts: number; energyW: number; waterLpm: number }[] = [];
const listeners = new Set<(event: LiveEvent) => void>();

const detector = new Detector();
const simulator = new Simulator();

function toSimSensor(sensor: SensorRecord): SimSensor {
  const zone = zoneById.get(sensor.zone_id);
  return {
    id: sensor.id,
    type: sensor.sensor_type,
    unit: sensor.unit,
    zone_id: sensor.zone_id,
    zone_type: zone?.zone_type ?? "classroom",
    zone_name: zone?.name ?? "Zone",
    capacity: zone?.capacity ?? 0,
  };
}

simulator.load(topology.sensors.map(toSimSensor));

const zoneCapacityTotal = topology.zones.reduce((n, z) => n + z.capacity, 0);
const energyBudgetKw = topology.buildings.reduce((n, b) => n + b.energy_budget_kw, 0);

let started = false;
let timer: number | null = null;

// ---------------------------------------------------------------------------
// Event bus (mirrors /ws/live)
// ---------------------------------------------------------------------------

function emit(event: LiveEvent): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      /* a broken subscriber must not stop the tick */
    }
  }
}

function notificationFor(issue: Issue, level: string) {
  return {
    id: issue.id,
    issue_id: issue.id,
    level,
    title: `${issue.title} — ${issue.zone_name ?? "campus"}`,
    message: issue.description,
    is_read: false,
    created_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Issue creation
// ---------------------------------------------------------------------------

function isSuppressed(
  zoneId: number,
  type: Issue["type"],
  source: Issue["source"] | null,
  cooldown = ISSUE_COOLDOWN_SECONDS,
): boolean {
  if (
    issues.some(
      (i) => i.zone_id === zoneId && i.type === type && i.status === "open" && (!source || i.source === source),
    )
  ) {
    return true;
  }
  const cutoff = Date.now() - cooldown * 1000;
  return issues.some(
    (i) =>
      i.zone_id === zoneId &&
      i.type === type &&
      i.status === "resolved" &&
      !!i.resolved_at &&
      Date.parse(i.resolved_at) >= cutoff &&
      (!source || i.source === source),
  );
}

function createIssue(spec: CreateSpec): Issue {
  const zone = zoneById.get(spec.zone_id);
  const iso = new Date(spec.ts).toISOString();
  const issue: Issue = {
    id: nextIssueId++,
    type: spec.type,
    title: spec.title,
    description: spec.description,
    severity: spec.severity,
    status: "open",
    source: spec.source,
    zone_id: spec.zone_id,
    zone_name: zone?.name ?? null,
    building_id: zone?.building_id ?? null,
    building_name: zone?.building_name ?? null,
    sensor_id: spec.sensor_id,
    detected_at: iso,
    resolved_at: null,
    created_at: iso,
  };
  issues = [issue, ...issues];
  return issue;
}

function raiseIssue(spec: CreateSpec, cooldown = ISSUE_COOLDOWN_SECONDS, force = false): Issue | null {
  if (!force && isSuppressed(spec.zone_id, spec.type, spec.source, cooldown)) return null;
  const issue = createIssue(spec);
  const ts = new Date(spec.ts).toISOString();
  const level = SEVERITY_TO_LEVEL[issue.severity] ?? "info";
  emit({ type: "issue:created", payload: issue, ts });
  emit({ type: "notification", payload: notificationFor(issue, level), ts });
  return issue;
}

// ---------------------------------------------------------------------------
// Simulator loop
// ---------------------------------------------------------------------------

function appendHistory(ts: number, samples: { sensor_type: SensorType; value: number }[]): void {
  let energyW = 0;
  let waterLpm = 0;
  for (const sample of samples) {
    if (sample.sensor_type === "energy") energyW += sample.value;
    else if (sample.sensor_type === "water") waterLpm += sample.value;
  }
  history.push({ ts, energyW, waterLpm });
  if (history.length > 5000) history.shift();
}

function tick(): void {
  const result = simulator.tick();
  for (const sample of result.samples) latest.set(sample.sensor_id, sample.value);
  appendHistory(result.ts, result.samples);

  const iso = new Date(result.ts).toISOString();
  const readings: LiveReading[] = result.samples.map((sample) => ({
    sensor_id: sample.sensor_id,
    zone_id: sample.zone_id,
    type: sample.sensor_type,
    value: sample.value,
  }));
  emit({ type: "readings", payload: { ts: iso, readings }, ts: iso });

  detector.evaluate(result.samples, result.ts, (spec) => raiseIssue(spec));
}

function backfillHistory(): void {
  if (history.length) return;
  const now = Date.now();
  for (let hoursAgo = 12; hoursAgo >= 1; hoursAgo -= 1) {
    const ts = now - hoursAgo * 3_600_000;
    const { energyW, waterLpm } = simulator.baselineLoad(ts);
    history.push({ ts, energyW, waterLpm });
  }
  const current = simulator.baselineLoad(now);
  history.push({ ts: now, energyW: current.energyW, waterLpm: current.waterLpm });
}

function ensureStarted(): void {
  if (started) return;
  started = true;
  backfillHistory();
  tick();
  timer = window.setInterval(tick, SIM_INTERVAL_SECONDS * 1000);
}

function stop(): void {
  if (timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
  started = false;
}

function worldState(): analytics.WorldState {
  return {
    buildings: topology.buildings,
    issues,
    sensors: topology.sensors,
    latest,
    zoneCapacityTotal,
    energyBudgetKw,
    history,
  };
}

// ---------------------------------------------------------------------------
// Public API (mirrors the backend endpoints)
// ---------------------------------------------------------------------------

function subscribe(listener: (event: LiveEvent) => void): () => void {
  ensureStarted();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function fetchCampus(): CampusResponse {
  ensureStarted();
  const openByZone = new Map<number, number>();
  for (const issue of issues) {
    if (issue.status === "open" && issue.zone_id !== null) {
      openByZone.set(issue.zone_id, (openByZone.get(issue.zone_id) ?? 0) + 1);
    }
  }
  return campusResponse(topology, openByZone);
}

function fetchIssues(params: { status?: IssueStatus; limit?: number } = {}): {
  count: number;
  issues: Issue[];
} {
  ensureStarted();
  let rows = issues;
  if (params.status) rows = rows.filter((i) => i.status === params.status);
  rows = [...rows].sort((a, b) => {
    const ta = a.detected_at ? Date.parse(a.detected_at) : 0;
    const tb = b.detected_at ? Date.parse(b.detected_at) : 0;
    return tb - ta || b.id - a.id;
  });
  const limit = Math.max(1, Math.min(params.limit ?? 100, 500));
  rows = rows.slice(0, limit);
  return { count: rows.length, issues: rows };
}

function resolveIssue(id: number): Issue {
  ensureStarted();
  const issue = issues.find((i) => i.id === id);
  if (!issue) throw new Error(`Issue ${id} not found`);
  if (issue.status !== "resolved") {
    issue.status = "resolved";
    issue.resolved_at = new Date().toISOString();
    emit({ type: "issue:resolved", payload: issue, ts: issue.resolved_at });
    emit({ type: "notification", payload: notificationFor(issue, "info"), ts: issue.resolved_at });
  }
  return issue;
}

function fetchLeaderboard(): { count: number; leaderboard: ReturnType<typeof analytics.leaderboard>["leaderboard"] } {
  ensureStarted();
  return analytics.leaderboard(worldState());
}

function findZone(buildingMatch: string, zoneMatch?: string): ZoneRecord | undefined {
  const candidates = topology.zones.filter((z) => z.building_name.toLowerCase().includes(buildingMatch));
  if (zoneMatch) {
    const exact = candidates.find((z) => z.name.toLowerCase().includes(zoneMatch));
    if (exact) return exact;
  }
  return candidates[0];
}

function demoReading(zoneId: number, type: SensorType, value: number): number | null {
  const sensor = topology.sensors.find((s) => s.zone_id === zoneId && s.sensor_type === type);
  if (!sensor) return null;
  latest.set(sensor.id, value);
  return sensor.id;
}

function triggerDemoAnomaly(step = 1): {
  step: number;
  title: string;
  issue: Issue;
  zone: string;
  building: string;
} {
  ensureStarted();
  const now = Date.now();

  const configs: Record<
    number,
    {
      title: string;
      building: string;
      zone: string;
      sensor: SensorType;
      value: number;
      type: Issue["type"];
      severity: Issue["severity"];
      source: Issue["source"];
      issueTitle: string;
      description: string;
    }
  > = {
    1: {
      title: "Water Leak in Student Hostel",
      building: "hostel",
      zone: "mess",
      sensor: "water",
      value: 18.4,
      type: "water_leakage",
      severity: "critical",
      source: "sensor",
      issueTitle: "Sustained Pipe Rupture / Leak",
      description:
        "Continuous 18.4 L/min water flow detected in the Hostel Mess (Student Hostel) indicating severe fixture failure.",
    },
    2: {
      title: "Energy Spike in Science Labs",
      building: "lab",
      zone: "physics",
      sensor: "energy",
      value: 4800.0,
      type: "energy_wastage",
      severity: "high",
      source: "sensor",
      issueTitle: "Unoccupied High-Load Energy Spike",
      description:
        "High load draw of 4.8 kW in the Physics Lab (Science & Innovation Labs) while occupancy is 0.",
    },
    3: {
      title: "Waste Overflow at Central Canteen",
      building: "canteen",
      zone: "dining",
      sensor: "waste",
      value: 98.5,
      type: "waste_accumulation",
      severity: "high",
      source: "vision",
      issueTitle: "Critical Bin Overflow & Accumulation",
      description:
        "Sensors and computer vision detect 98.5% bin capacity and waste accumulation around the Dining Hall (Central Canteen).",
    },
  };

  const config = configs[step] ?? configs[1];
  const zone = findZone(config.building, config.zone);
  if (!zone) throw new Error("Demo zone not found in campus seed");

  const sensorId = demoReading(zone.id, config.sensor, config.value);
  const issue = raiseIssue(
    {
      ts: now,
      zone_id: zone.id,
      sensor_id: sensorId,
      type: config.type,
      severity: config.severity,
      title: config.issueTitle,
      description: config.description,
      source: config.source,
    },
    ISSUE_COOLDOWN_SECONDS,
    true,
  );
  if (!issue) throw new Error("Demo anomaly could not be created");

  return {
    step,
    title: config.title,
    issue,
    zone: zone.name,
    building: zone.building_name,
  };
}

function fetchRecommendations(): RecommendationsResponse {
  ensureStarted();
  return analytics.recommendations(worldState());
}

function fetchReport(): SustainabilityReport {
  ensureStarted();
  return analytics.buildReport(worldState());
}

function sendChatMessage(messages: ChatMessage[] | string): ChatResponse {
  ensureStarted();
  return analytics.chat(worldState(), messages);
}

function providerInfo(): ProviderInfo {
  return analytics.TEMPLATE_PROVIDER;
}

async function downloadReportPdf(): Promise<void> {
  ensureStarted();
  generateReportPdf(analytics.buildReport(worldState()));
}

function latestOccupancy(zoneId: number): number | null {
  const sensor = topology.sensors.find((s) => s.zone_id === zoneId && s.sensor_type === "occupancy");
  if (!sensor) return null;
  const value = latest.get(sensor.id);
  return value === undefined ? null : value;
}

async function analyzeImage(file: File, zoneId: number): Promise<VisionResponse> {
  ensureStarted();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const zone = zoneById.get(zoneId);
  const occupancy = latestOccupancy(zoneId);
  const context: VisionZoneContext = {
    id: zoneId,
    name: zone?.name,
    zone_type: zone?.zone_type,
    occupancy,
  };

  const findings = mockFindings(bytes, context);
  const now = Date.now();
  const created: Issue[] = [];
  const suppressed: VisionResponse["suppressed"] = [];

  for (const finding of findings) {
    const issue = raiseIssue(
      {
        ts: now,
        zone_id: zoneId,
        sensor_id: null,
        type: finding.issue_type,
        severity: finding.severity,
        title: finding.label,
        description: finding.detail,
        source: "vision",
      },
      VISION_ISSUE_COOLDOWN,
    );
    if (issue) {
      created.push(issue);
    } else {
      suppressed.push({
        type: finding.issue_type,
        label: finding.label,
        reason: "this zone was already flagged by a recent vision scan",
      });
    }
  }

  const detections: VisionDetection[] = findings.map((finding) => ({
    kind: finding.kind,
    issue_type: finding.issue_type,
    severity: finding.severity,
    label: finding.label,
    detail: finding.detail,
    confidence: Math.round(finding.confidence * 1000) / 1000,
    bbox: finding.bbox,
  }));

  return {
    engine: "mock",
    model: null,
    reason: "standalone in-browser engine (YOLO unavailable)",
    zone: {
      id: zoneId,
      name: zone?.name ?? "Zone",
      building_id: zone?.building_id ?? 0,
      building_name: zone?.building_name ?? null,
      zone_type: zone?.zone_type ?? "classroom",
      occupancy,
    },
    image: {
      bytes: bytes.length,
      content_type: file.type || "application/octet-stream",
      size: await getImageSize(file),
    },
    config: { conf: VISION_CONF, model: "mock" },
    scanned_at: new Date(now).toISOString(),
    detections,
    issues: created,
    suppressed,
  };
}

export const engine = {
  subscribe,
  stop,
  fetchCampus,
  fetchIssues,
  resolveIssue,
  fetchLeaderboard,
  triggerDemoAnomaly,
  fetchRecommendations,
  fetchReport,
  sendChatMessage,
  providerInfo,
  downloadReportPdf,
  analyzeImage,
  // exposed for debugging/tests
  _sensorById: sensorById,
};
