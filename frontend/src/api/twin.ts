/**
 * Typed client for the Verdant Twin backend. In dev the Vite proxy forwards
 * these root-level paths to http://127.0.0.1:8000 (see vite.config.ts).
 */

export type Position = { x: number; y: number; z: number };

export type CampusZone = {
  id: number;
  name: string;
  zone_type: string;
  floor: number;
  area_m2: number;
  capacity: number;
  position: Position;
  sensor_count: number;
  open_issues: number;
};

export type CampusBuilding = {
  id: number;
  name: string;
  code: string;
  category: string;
  floors: number;
  area_m2: number;
  position: Position;
  energy_budget_kw: number;
  zones: CampusZone[];
};

export type CampusSummary = {
  name: string;
  buildings: number;
  zones: number;
  sensors: number;
  open_issues: number;
};

export type CampusResponse = {
  campus: CampusSummary;
  buildings: CampusBuilding[];
};

export type IssueType =
  | "waste_accumulation"
  | "energy_wastage"
  | "water_leakage"
  | "inefficient_usage";

export type Severity = "low" | "medium" | "high" | "critical";
export type IssueStatus = "open" | "resolved";

export type Issue = {
  id: number;
  type: IssueType;
  title: string;
  description: string;
  severity: Severity;
  status: IssueStatus;
  source: "sensor" | "vision" | "manual";
  zone_id: number;
  zone_name: string | null;
  building_id: number | null;
  building_name: string | null;
  sensor_id: number | null;
  detected_at: string | null;
  resolved_at: string | null;
  created_at: string | null;
};

export type LiveReading = {
  sensor_id: number;
  zone_id: number;
  type: "energy" | "water" | "waste" | "occupancy";
  value: number;
};

export type LiveEvent =
  | { type: "hello"; payload: { message: string; clients: number }; ts: string }
  | { type: "pong"; payload: Record<string, never>; ts: string }
  | { type: "readings"; payload: { ts: string; readings: LiveReading[] }; ts: string }
  | { type: "issue:created"; payload: Issue; ts: string }
  | { type: "issue:resolved"; payload: Issue; ts: string }
  | { type: "notification"; payload: unknown; ts: string };

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${path} responded ${res.status}`);
  return (await res.json()) as T;
}

export function fetchCampus(signal?: AbortSignal): Promise<CampusResponse> {
  return getJson<CampusResponse>("/twin/campus", signal);
}

export function fetchIssues(
  params: { status?: IssueStatus; limit?: number } = {},
  signal?: AbortSignal,
): Promise<{ count: number; issues: Issue[] }> {
  const q = new URLSearchParams();
  if (params.status) q.set("status", params.status);
  if (params.limit) q.set("limit", String(params.limit));
  const qs = q.toString();
  return getJson(`/issues${qs ? `?${qs}` : ""}`, signal);
}

export function resolveIssue(id: number): Promise<Issue> {
  return fetch(`/issues/${id}/resolve`, { method: "PATCH" }).then((r) => {
    if (!r.ok) throw new Error(`resolve ${id} responded ${r.status}`);
    return r.json() as Promise<Issue>;
  });
}

export type BuildingRankItem = {
  id: number;
  name: string;
  code: string;
  category: string;
  floors: number;
  score: number;
  grade: "A" | "B" | "C" | "D" | "E";
  status: string;
  energy_kw: number;
  energy_budget_kw: number;
  water_lpm: number;
  avg_waste_pct: number;
  open_issues_count: number;
  resolved_count: number;
  rank: number;
};

export function fetchLeaderboard(signal?: AbortSignal): Promise<{ count: number; leaderboard: BuildingRankItem[] }> {
  return getJson<{ count: number; leaderboard: BuildingRankItem[] }>("/stats/leaderboard", signal);
}

export async function triggerDemoAnomaly(step: number = 1): Promise<{
  step: number;
  title: string;
  issue: Issue;
  zone: string;
  building: string;
}> {
  const res = await fetch(`/twin/demo/anomaly?step=${step}`, {
    method: "POST",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Demo anomaly trigger failed with ${res.status}`);
  return res.json();
}

/** WebSocket URL for /ws/live, derived from the current origin. */
export function liveSocketUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws/live`;
}
