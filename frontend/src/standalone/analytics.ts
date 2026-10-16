/**
 * In-browser analytics — a TypeScript port of the deterministic (template)
 * parts of `backend/app/services/copilot.py` and `backend/app/routers/stats.py`:
 * campus summary, Green Score, trends, recommendations, report markdown,
 * the copilot chat fallback and the building leaderboard.
 *
 * Numbers are computed here; prose comes from the same templates the backend
 * uses when no LLM key is configured.
 */

import type { BuildingRankItem, CampusBuilding, Issue, IssueType, Severity } from "../api/twin";
import type {
  ChatMessage,
  ChatResponse,
  GreenScore,
  GreenScoreComponent,
  ProviderInfo,
  Recommendation,
  RecommendationsResponse,
  ResourceTrend,
  SustainabilityReport,
} from "../api/ai";
import { AI_RECOMMENDATION_LIMIT } from "./config";
import type { SensorType } from "./seed";

export const TEMPLATE_PROVIDER: ProviderInfo = {
  name: "template",
  model: null,
  live: false,
  detail: "in-browser standalone engine (offline template)",
};

export type WorldState = {
  buildings: CampusBuilding[];
  issues: Issue[];
  sensors: { id: number; zone_id: number; sensor_type: SensorType }[];
  latest: Map<number, number>;
  zoneCapacityTotal: number;
  energyBudgetKw: number;
  history: { ts: number; energyW: number; waterLpm: number }[];
};

export type CampusSummaryData = {
  campus: { buildings: number; zones: number; sensors: number };
  issues: {
    total: number;
    open: number;
    resolved: number;
    by_severity: Record<string, number>;
    by_type: Record<string, number>;
  };
  energy: { current_kw: number; today_kwh: number; budget_kw?: number };
  water: { current_lpm: number; today_liters: number };
  waste: { avg_fill_pct: number; bins_tracked: number; overflow_bins: number };
  occupancy: { current: number; capacity: number };
};

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const SEVERITY_POINTS: Record<string, number> = { critical: 50, high: 38, medium: 24, low: 12 };

const NIGHT_HOURS = 8.0;
const WASTE_FRACTION = 0.6;
const LEAK_RECOVERY = 0.8;
const PEER_EXCESS_FRACTION = 0.25;

const TYPE_TO_CATEGORY: Record<string, Recommendation["category"]> = {
  energy_wastage: "energy",
  water_leakage: "water",
  waste_accumulation: "waste",
  inefficient_usage: "efficiency",
};

const GRADE_LABEL: Record<GreenScore["grade"], string> = {
  A: "Thriving",
  B: "Healthy",
  C: "Needs attention",
  D: "Strained",
  E: "Critical",
};

const sum = (values: number[]): number => values.reduce((n, v) => n + v, 0);
const mean = (values: number[]): number => (values.length ? sum(values) / values.length : 0);
const round = (value: number, digits: number): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};
const clamp = (value: number, low = 0, high = 100): number => Math.max(low, Math.min(high, value));

function zoneCurrent(state: WorldState): Map<number, Partial<Record<SensorType, number>>> {
  const out = new Map<number, Partial<Record<SensorType, number>>>();
  for (const s of state.sensors) {
    const value = state.latest.get(s.id);
    if (value === undefined) continue;
    const entry = out.get(s.zone_id) ?? {};
    entry[s.sensor_type] = value;
    out.set(s.zone_id, entry);
  }
  return out;
}

function valuesFor(state: WorldState, type: SensorType): number[] {
  const out: number[] = [];
  for (const s of state.sensors) {
    if (s.sensor_type !== type) continue;
    const value = state.latest.get(s.id);
    if (value !== undefined) out.push(value);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Campus summary + Green Score
// ---------------------------------------------------------------------------

export function campusSummary(state: WorldState): CampusSummaryData {
  const energyValues = valuesFor(state, "energy");
  const waterValues = valuesFor(state, "water");
  const wasteValues = valuesFor(state, "waste");
  const occValues = valuesFor(state, "occupancy");

  const currentEnergyW = sum(energyValues);
  const currentWaterLpm = sum(waterValues);
  const currentOccupancy = Math.trunc(sum(occValues));

  const now = new Date();
  const hoursSinceMidnight = Math.max(now.getHours() + now.getMinutes() / 60, 0.25);
  const energyTodayKwh = (currentEnergyW / 1000) * hoursSinceMidnight * 0.85;
  const waterTodayLiters = currentWaterLpm * 60 * hoursSinceMidnight * 0.72;

  const bySeverity: Record<string, number> = {};
  const byType: Record<string, number> = {};
  for (const issue of state.issues) {
    bySeverity[issue.severity] = (bySeverity[issue.severity] ?? 0) + 1;
    byType[issue.type] = (byType[issue.type] ?? 0) + 1;
  }

  const issueOpen = state.issues.filter((i) => i.status === "open").length;

  return {
    campus: {
      buildings: state.buildings.length,
      zones: state.buildings.reduce((n, b) => n + b.zones.length, 0),
      sensors: state.sensors.length,
    },
    issues: {
      total: state.issues.length,
      open: issueOpen,
      resolved: state.issues.length - issueOpen,
      by_severity: bySeverity,
      by_type: byType,
    },
    energy: { current_kw: round(currentEnergyW / 1000, 2), today_kwh: round(energyTodayKwh, 3) },
    water: { current_lpm: round(currentWaterLpm, 2), today_liters: round(waterTodayLiters, 1) },
    waste: {
      avg_fill_pct: wasteValues.length ? round(sum(wasteValues) / wasteValues.length, 1) : 0.0,
      bins_tracked: valuesFor(state, "waste").length || state.sensors.filter((s) => s.sensor_type === "waste").length,
      overflow_bins: wasteValues.filter((v) => v >= 90).length,
    },
    occupancy: { current: currentOccupancy, capacity: state.zoneCapacityTotal },
  };
}

export function greenScore(summary: CampusSummaryData): GreenScore {
  const energyKw = summary.energy.current_kw;
  const budgets = summary.energy.budget_kw;
  const ratio = budgets ? energyKw / budgets : null;

  let energyScore: number;
  let energyDetail: string;
  if (ratio === null) {
    energyScore = 78.0;
    energyDetail = "Baseline estimate (no energy budget configured).";
  } else {
    energyScore = clamp(100 - Math.max(0, ((ratio - 0.7) / 0.9) * 100));
    energyDetail = `Drawing ${energyKw.toFixed(1)} kW against a ${budgets!.toFixed(1)} kW budget (${Math.round(ratio * 100)}%).`;
  }

  const avgFill = summary.waste.avg_fill_pct;
  const wasteScore = clamp(100 - Math.max(0, ((avgFill - 55) / 45) * 100));
  const wasteDetail = `Average bin fill ${avgFill.toFixed(0)}%, ${summary.waste.overflow_bins} overflowing.`;

  const leakCount = summary.issues.by_type.water_leakage ?? 0;
  const waterScore = clamp(100 - 15 * leakCount - Math.max(0, summary.water.current_lpm - 20) * 1.5);
  const waterDetail = `${leakCount} open leakage issue(s), ${summary.water.current_lpm.toFixed(1)} L/min live flow.`;

  const burden = sum(
    Object.entries(summary.issues.by_severity).map(([sev, count]) => (SEVERITY_POINTS[sev] ?? 0) * count),
  );
  const issueScore = clamp(100 - burden);
  const severityText = Object.entries(summary.issues.by_severity)
    .sort((a, b) => (SEVERITY_ORDER[a[0]] ?? 9) - (SEVERITY_ORDER[b[0]] ?? 9))
    .map(([sev, count]) => `${count} ${sev}`)
    .join(", ");
  const issueDetail = `${summary.issues.open} open issue(s): ${severityText || "none."}`;

  const total = summary.issues.total;
  const resolved = summary.issues.resolved;
  const resolutionScore = total ? clamp((100 * resolved) / total) : 100.0;
  const resolutionDetail = `${resolved}/${total} issues resolved to date.`;

  const components: GreenScoreComponent[] = [
    { key: "energy", label: "Energy efficiency", score: Math.round(energyScore), weight: 0.25, detail: energyDetail },
    { key: "waste", label: "Waste management", score: Math.round(wasteScore), weight: 0.2, detail: wasteDetail },
    { key: "water", label: "Water stewardship", score: Math.round(waterScore), weight: 0.15, detail: waterDetail },
    { key: "issues", label: "Issue health", score: Math.round(issueScore), weight: 0.3, detail: issueDetail },
    { key: "resolution", label: "Resolution rate", score: Math.round(resolutionScore), weight: 0.1, detail: resolutionDetail },
  ];
  const totalScore = Math.round(sum(components.map((c) => c.score * c.weight)));

  let grade: GreenScore["grade"];
  if (totalScore >= 88) grade = "A";
  else if (totalScore >= 76) grade = "B";
  else if (totalScore >= 62) grade = "C";
  else if (totalScore >= 48) grade = "D";
  else grade = "E";

  return { score: totalScore, grade, label: GRADE_LABEL[grade], components };
}

export function trends(state: WorldState, hours = 6): ResourceTrend[] {
  const now = Date.now();
  const recentStart = now - hours * 3_600_000;
  const previousStart = recentStart - hours * 3_600_000;
  const recent = state.history.filter((h) => h.ts >= recentStart && h.ts < now);
  const previous = state.history.filter((h) => h.ts >= previousStart && h.ts < recentStart);

  const energyRecent = (mean(recent.map((h) => h.energyW)) / 1000) * hours;
  const energyPrevious = (mean(previous.map((h) => h.energyW)) / 1000) * hours;
  const waterRecent = mean(recent.map((h) => h.waterLpm)) * 60 * hours;
  const waterPrevious = mean(previous.map((h) => h.waterLpm)) * 60 * hours;

  const change = (rc: number, prev: number) => (prev > 0 ? ((rc - prev) / prev) * 100 : 0);

  return [
    {
      resource: "energy",
      unit: "kWh",
      window_hours: hours,
      recent: round(energyRecent, 2),
      previous: round(energyPrevious, 2),
      change_pct: round(change(energyRecent, energyPrevious), 1),
    },
    {
      resource: "water",
      unit: "L",
      window_hours: hours,
      recent: round(waterRecent, 2),
      previous: round(waterPrevious, 2),
      change_pct: round(change(waterRecent, waterPrevious), 1),
    },
  ];
}

export function resolvedRecently(state: WorldState, hours = 24): number {
  const cutoff = Date.now() - hours * 3_600_000;
  return state.issues.filter(
    (i) => i.status === "resolved" && i.resolved_at && Date.parse(i.resolved_at) >= cutoff,
  ).length;
}

function openIssues(state: WorldState, limit = 40): Issue[] {
  return state.issues
    .filter((i) => i.status === "open")
    .sort((a, b) => {
      const ta = a.detected_at ? Date.parse(a.detected_at) : 0;
      const tb = b.detected_at ? Date.parse(b.detected_at) : 0;
      return tb - ta || b.id - a.id;
    })
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Recommendations
// ---------------------------------------------------------------------------

function savingsFor(issue: Issue, current: Partial<Record<SensorType, number>>) {
  const energyW = current.energy ?? 1500.0;
  const waterLpm = current.water ?? 8.0;
  const fill = current.waste ?? 90.0;

  if (issue.type === "energy_wastage") {
    return { est_kwh_saved: round((energyW / 1000) * NIGHT_HOURS * WASTE_FRACTION, 1), est_litres_saved: 0, est_kg_saved: 0 };
  }
  if (issue.type === "inefficient_usage") {
    return { est_kwh_saved: round((energyW / 1000) * NIGHT_HOURS * PEER_EXCESS_FRACTION, 1), est_litres_saved: 0, est_kg_saved: 0 };
  }
  if (issue.type === "water_leakage") {
    return { est_kwh_saved: 0, est_litres_saved: round(waterLpm * 60 * NIGHT_HOURS * LEAK_RECOVERY, 1), est_kg_saved: 0 };
  }
  if (issue.type === "waste_accumulation") {
    return { est_kwh_saved: 0, est_litres_saved: 0, est_kg_saved: round(2.0 + (Math.min(fill, 100) / 100) * 3.5, 1) };
  }
  return { est_kwh_saved: 0, est_litres_saved: 0, est_kg_saved: 0 };
}

function priorityLabel(score: number): Recommendation["priority"] {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 40) return "medium";
  return "low";
}

function timeframe(severity: string): string {
  return { critical: "today", high: "24h", medium: "this week", low: "this month" }[severity] ?? "this week";
}

function defaultActionFor(issueType: IssueType, zoneName: string, buildingName: string): string {
  return (
    {
      energy_wastage: `Send a facilities pass to switch off idle equipment in ${zoneName} and put the zone on the night shutdown schedule for ${buildingName}.`,
      water_leakage: `Dispatch maintenance to pressure-test fixtures and pipework serving ${zoneName} (${buildingName}) and isolate the constant flow.`,
      waste_accumulation: `Add an extra collection round for ${zoneName} and right-size the bin capacity in ${buildingName}.`,
      inefficient_usage: `Review the equipment schedule in ${zoneName} against comparable zones and re-tune setpoints in ${buildingName}.`,
    } as Record<string, string>
  )[issueType] ?? `Inspect ${zoneName} in ${buildingName} and resolve the flagged condition.`;
}

function candidateRecommendations(state: WorldState, limit: number): Recommendation[] {
  const currentByZone = zoneCurrent(state);
  const raw = openIssues(state, 60);
  const candidates: Recommendation[] = [];

  for (const issue of raw) {
    if (issue.zone_id === null) continue;
    const zoneName = issue.zone_name ?? "Zone";
    const buildingName = issue.building_name ?? "Campus";
    const current = currentByZone.get(issue.zone_id) ?? {};

    const savings = savingsFor(issue, current);
    const category = TYPE_TO_CATEGORY[issue.type] ?? "efficiency";
    const impactUnits = savings.est_kwh_saved + savings.est_litres_saved / 40.0 + savings.est_kg_saved * 4.0;
    let score = Math.min(100.0, (SEVERITY_POINTS[issue.severity] ?? 15) + Math.min(35.0, impactUnits));
    const quickWin = (issue.severity === "high" || issue.severity === "critical") &&
      savings.est_kwh_saved < 12 && savings.est_litres_saved < 900;
    if (quickWin) score = Math.min(100.0, score + 8);

    candidates.push({
      id: `rec-${issue.id}`,
      issue_ids: [issue.id],
      title: issue.title,
      action: defaultActionFor(issue.type, zoneName, buildingName),
      rationale: issue.description,
      location: {
        building: buildingName,
        building_code: null,
        zone: zoneName,
        zone_id: issue.zone_id,
      },
      category,
      priority: priorityLabel(score),
      priority_score: round(score, 1),
      type: issue.type,
      source: issue.source,
      timeframe: timeframe(issue.severity),
      quick_win: quickWin,
      confidence: issue.source === "sensor" ? 0.9 : 0.78,
      ...savings,
    });
  }

  if (candidates.length < 3) candidates.push(...proactiveRecommendations(state));

  candidates.sort((a, b) => b.priority_score - a.priority_score);
  return candidates.slice(0, limit);
}

function proactiveRecommendations(state: WorldState): Recommendation[] {
  const summary = campusSummary(state);
  const out: Recommendation[] = [];
  if (summary.waste.avg_fill_pct >= 55) {
    out.push({
      id: "rec-proactive-waste",
      issue_ids: [],
      title: "Adjust waste collection cadence",
      action: "Shift two collection rounds to the highest-fill buildings and review bin sizing before peak occupancy.",
      rationale: `Average bin fill is ${summary.waste.avg_fill_pct.toFixed(0)}% campus-wide.`,
      location: { building: "Campus", building_code: null, zone: "Multiple zones", zone_id: null },
      category: "waste",
      priority: "medium",
      priority_score: 46.0,
      type: "advisory",
      source: "advisory",
      timeframe: "this week",
      quick_win: false,
      confidence: 0.6,
      est_kwh_saved: 0,
      est_litres_saved: 0,
      est_kg_saved: 4.0,
    });
  }
  if (summary.energy.current_kw > 0) {
    out.push({
      id: "rec-proactive-energy",
      issue_ids: [],
      title: "Tune the HVAC overnight schedule",
      action: "Apply a graduated night setback (2°C) across academic buildings and verify against occupancy.",
      rationale: `Campus is drawing ${summary.energy.current_kw.toFixed(1)} kW right now.`,
      location: { building: "Campus", building_code: null, zone: "All buildings", zone_id: null },
      category: "energy",
      priority: "medium",
      priority_score: 42.0,
      type: "advisory",
      source: "advisory",
      timeframe: "this week",
      quick_win: false,
      confidence: 0.6,
      est_kwh_saved: round(summary.energy.current_kw * 0.12 * NIGHT_HOURS, 1),
      est_litres_saved: 0,
      est_kg_saved: 0,
    });
  }
  return out;
}

function impactPhrase(rec: Recommendation): string {
  const parts: string[] = [];
  if (rec.est_kwh_saved) parts.push(`${rec.est_kwh_saved} kWh/day`);
  if (rec.est_litres_saved) parts.push(`${rec.est_litres_saved} L/day`);
  if (rec.est_kg_saved) parts.push(`${rec.est_kg_saved} kg diverted`);
  return parts.join(", ") || "operational efficiency";
}

function defaultSummary(score: GreenScore, candidates: Recommendation[]): string {
  if (!candidates.length) {
    return `Green Score ${score.score}/100 (${score.grade}). No open issues need attention right now — keep the current schedule.`;
  }
  const top = candidates[0];
  const quick = candidates.filter((c) => c.quick_win).length;
  return (
    `Green Score ${score.score}/100 (${score.grade} · ${score.label}). ` +
    `${candidates.length} action(s) recommended, ${quick} of them quick wins. ` +
    `Start with “${top.title}” in ${top.location.zone} — estimated ${impactPhrase(top)}.`
  );
}

export function recommendations(state: WorldState): RecommendationsResponse {
  const summary = campusSummary(state);
  const score = greenScore(summary);
  const candidates = candidateRecommendations(state, AI_RECOMMENDATION_LIMIT);

  return {
    generated_at: new Date().toISOString(),
    provider: TEMPLATE_PROVIDER,
    green_score: score,
    summary: defaultSummary(score, candidates),
    recommendations: candidates,
    totals: {
      est_kwh_saved: round(sum(candidates.map((c) => c.est_kwh_saved)), 1),
      est_litres_saved: round(sum(candidates.map((c) => c.est_litres_saved)), 1),
      est_kg_saved: round(sum(candidates.map((c) => c.est_kg_saved)), 1),
      count: candidates.length,
      quick_wins: candidates.filter((c) => c.quick_win).length,
    },
  };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export function buildReport(state: WorldState): SustainabilityReport {
  const summary = campusSummary(state);
  summary.energy.budget_kw = round(state.energyBudgetKw, 2);
  const score = greenScore(summary);
  const trendRows = trends(state);
  const resolved24h = resolvedRecently(state);
  const recs = recommendations(state);
  const generated = new Date();

  const executive = defaultExecutive(summary, score);
  const energyNote = defaultEnergyNote(summary, trendRows);
  const waterNote = defaultWaterNote(summary);
  const wasteNote = defaultWasteNote(summary);
  const outlook = defaultOutlook(score, recs.recommendations);

  const markdown = renderMarkdown({
    generated,
    summary,
    score,
    trendRows,
    resolved24h,
    recs: recs.recommendations,
    executive,
    energyNote,
    waterNote,
    wasteNote,
    outlook,
  });

  return {
    title: "Campus Sustainability Report",
    period: `Day to ${formatDateTime(generated)}`,
    generated_at: generated.toISOString(),
    provider: TEMPLATE_PROVIDER,
    green_score: score,
    metrics: {
      energy_current_kw: summary.energy.current_kw,
      energy_today_kwh: summary.energy.today_kwh,
      energy_budget_kw: summary.energy.budget_kw ?? 0,
      water_current_lpm: summary.water.current_lpm,
      water_today_liters: summary.water.today_liters,
      waste_avg_fill_pct: summary.waste.avg_fill_pct,
      waste_overflow_bins: summary.waste.overflow_bins,
      issues_open: summary.issues.open,
      issues_resolved: summary.issues.resolved,
      issues_resolved_24h: resolved24h,
      occupancy_current: summary.occupancy.current,
      occupancy_capacity: summary.occupancy.capacity,
    },
    trends: trendRows,
    recommendations: recs.recommendations,
    markdown,
    pdf_base64: null,
    pdf_url: null,
  };
}

function formatDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function renderMarkdown(args: {
  generated: Date;
  summary: CampusSummaryData;
  score: GreenScore;
  trendRows: ResourceTrend[];
  resolved24h: number;
  recs: Recommendation[];
  executive: string;
  energyNote: string;
  waterNote: string;
  wasteNote: string;
  outlook: string;
}): string {
  const { generated, summary, score, trendRows, resolved24h, recs } = args;
  const lines: string[] = [];
  lines.push("# Campus Sustainability Report");
  lines.push("");
  lines.push(`**Verdant Twin · AI Copilot** — generated ${formatDateTime(generated)}`);
  lines.push("Engine: template (browser standalone engine)");
  lines.push("");
  lines.push(`## Green Score — ${score.score}/100 (${score.grade} · ${score.label})`);
  lines.push("");
  lines.push("| Component | Score | Weight | Observation |");
  lines.push("| --- | --- | --- | --- |");
  for (const component of score.components) {
    lines.push(`| ${component.label} | ${component.score} | ${Math.round(component.weight * 100)}% | ${component.detail} |`);
  }
  lines.push("");
  lines.push("## Executive summary");
  lines.push("");
  lines.push(args.executive);
  lines.push("");
  lines.push("## Energy");
  lines.push("");
  lines.push(`- Live load: ${summary.energy.current_kw.toFixed(2)} kW (budget ${(summary.energy.budget_kw ?? 0).toFixed(2)} kW)`);
  lines.push(`- Consumed today: ${summary.energy.today_kwh.toFixed(2)} kWh`);
  appendTrend(lines, trendRows, "energy");
  lines.push("");
  lines.push(args.energyNote);
  lines.push("");
  lines.push("## Water");
  lines.push("");
  lines.push(`- Live flow: ${summary.water.current_lpm.toFixed(2)} L/min`);
  lines.push(`- Used today: ${summary.water.today_liters.toFixed(1)} L`);
  appendTrend(lines, trendRows, "water");
  lines.push("");
  lines.push(args.waterNote);
  lines.push("");
  lines.push("## Waste");
  lines.push("");
  lines.push(`- Average bin fill: ${summary.waste.avg_fill_pct.toFixed(0)}%`);
  lines.push(`- Overflowing bins: ${summary.waste.overflow_bins} of ${summary.waste.bins_tracked}`);
  lines.push("");
  lines.push(args.wasteNote);
  lines.push("");
  lines.push("## Issues and resolution");
  lines.push("");
  lines.push(`- Open issues: ${summary.issues.open}`);
  lines.push(`- Resolved to date: ${summary.issues.resolved}`);
  lines.push(`- Resolved in the last 24 hours: ${resolved24h}`);
  const breakdown = summary.issues.by_type;
  if (Object.keys(breakdown).length) {
    lines.push("");
    lines.push("| Issue type | Open |");
    lines.push("| --- | --- |");
    for (const [issueType, count] of Object.entries(breakdown).sort((a, b) => b[1] - a[1])) {
      lines.push(`| ${issueType.replace(/_/g, " ")} | ${count} |`);
    }
  }
  lines.push("");
  lines.push("## Recommended actions");
  lines.push("");
  if (recs.length) {
    for (const rec of recs) {
      lines.push(
        `- **${rec.priority} ${rec.title}** — ${rec.location.zone} ` +
          `(${rec.location.building}) · ${impactPhrase(rec)} · ${rec.timeframe}`,
      );
      lines.push(`  - ${rec.action}`);
    }
  } else {
    lines.push("- No open issues require action right now.");
  }
  lines.push("");
  lines.push("## Outlook");
  lines.push("");
  lines.push(args.outlook);
  lines.push("");
  return lines.join("\n");
}

function appendTrend(lines: string[], trendRows: ResourceTrend[], resource: string): void {
  const row = trendRows.find((r) => r.resource === resource);
  if (!row) return;
  const direction = row.change_pct > 0 ? "up" : row.change_pct < 0 ? "down" : "flat";
  lines.push(
    `- Trend (${row.window_hours}h vs previous ${row.window_hours}h): ` +
      `${direction} ${Math.abs(row.change_pct).toFixed(1)}% (${row.recent} vs ${row.previous} ${row.unit})`,
  );
}

function defaultExecutive(summary: CampusSummaryData, score: GreenScore): string {
  const weakest = [...score.components].sort((a, b) => a.score - b.score)[0];
  return (
    `The campus scores ${score.score}/100 (${score.grade} · ${score.label}) this period. ` +
    `There are ${summary.issues.open} open issues across ${summary.campus.zones} zones, ` +
    `with ${summary.issues.resolved} resolved to date. Live consumption is ` +
    `${summary.energy.current_kw.toFixed(2)} kW of electricity and ` +
    `${summary.water.current_lpm.toFixed(2)} L/min of water, while average bin fill sits at ` +
    `${summary.waste.avg_fill_pct.toFixed(0)}%. The weakest component is ${weakest.label.toLowerCase()}.`
  );
}

function defaultEnergyNote(summary: CampusSummaryData, trendRows: ResourceTrend[]): string {
  const row = trendRows.find((r) => r.resource === "energy");
  let tail = "";
  if (row) {
    tail = ` Consumption is ${row.change_pct > 0 ? "rising" : "easing"} (${row.change_pct >= 0 ? "+" : ""}${row.change_pct.toFixed(1)}% versus the previous window).`;
  }
  const wasted = summary.issues.by_type.energy_wastage ?? 0;
  return `${wasted} energy-wastage issue(s) are open, typically unoccupied zones drawing full load.${tail}`;
}

function defaultWaterNote(summary: CampusSummaryData): string {
  const leaks = summary.issues.by_type.water_leakage ?? 0;
  return (
    `${leaks} leakage issue(s) are open. Constant low-magnitude flow is the strongest signal of a ` +
    "failing fixture, so isolating those zones is the highest-value water action."
  );
}

function defaultWasteNote(summary: CampusSummaryData): string {
  if (summary.waste.overflow_bins) {
    return (
      `${summary.waste.overflow_bins} bin(s) are at or above 90% fill. Re-routing the next ` +
      "collection round to those zones avoids overflow and keeps the recycling stream clean."
    );
  }
  return "No bins are currently overflowing; the existing collection cadence is adequate.";
}

function defaultOutlook(score: GreenScore, recs: Recommendation[]): string {
  const quick = recs.filter((c) => c.quick_win).length;
  const target = Math.min(100, score.score + 4 + 3 * recs.length);
  return (
    `Closing the ${quick} quick win(s) listed above is a same-day change with minimal operational ` +
    `disruption. If the recommended actions are completed, the projected Green Score is ` +
    `approximately ${target}/100.`
  );
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export function chat(state: WorldState, messages: ChatMessage[] | string): ChatResponse {
  let question = "";
  if (typeof messages === "string") {
    question = messages.trim();
  } else if (messages.length) {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const content = messages[i]?.content;
      if (content) {
        question = String(content).trim();
        break;
      }
    }
  }

  const context = chatContext(state);
  return {
    reply: templateAnswer(question, context),
    provider: TEMPLATE_PROVIDER,
    suggestions: suggestions(),
    fallback: true,
  };
}

type ChatContext = {
  summary: CampusSummaryData;
  green_score: { score: number; grade: GreenScore["grade"]; label: string; weakest: string };
  trends: ResourceTrend[];
  resolved_last_24h: number;
  top_open_issues: {
    id: number;
    type: IssueType;
    severity: Severity;
    building: string | null;
    zone: string | null;
    source: string;
    detail: string;
  }[];
};

function chatContext(state: WorldState): ChatContext {
  const summary = campusSummary(state);
  summary.energy.budget_kw = round(state.energyBudgetKw, 2);
  const score = greenScore(summary);
  const weakest = [...score.components].sort((a, b) => a.score - b.score)[0];
  return {
    summary,
    green_score: {
      score: score.score,
      grade: score.grade,
      label: score.label,
      weakest: weakest.label,
    },
    trends: trends(state),
    resolved_last_24h: resolvedRecently(state),
    top_open_issues: openIssues(state, 15).map((issue) => ({
      id: issue.id,
      type: issue.type,
      severity: issue.severity,
      building: issue.building_name,
      zone: issue.zone_name,
      source: issue.source,
      detail: issue.description.slice(0, 160),
    })),
  };
}

function suggestions(): string[] {
  return [
    "What should we fix first?",
    "How is our energy use trending?",
    "Are there any water leaks?",
    "What is our Green Score?",
  ];
}

function templateAnswer(question: string, context: ChatContext): string {
  const summary = context.summary;
  const score = context.green_score;
  const text = question.toLowerCase();
  const issues = context.top_open_issues;

  const listIssues = (kind: IssueType | null): string => {
    const rows = issues.filter((i) => kind === null || i.type === kind);
    if (!rows.length) return "none open right now";
    return rows.slice(0, 4).map((i) => `#${i.id} ${i.zone} (${i.severity})`).join("; ");
  };
  const has = (...words: string[]) => words.some((w) => text.includes(w));

  if (!question) {
    return "Ask me about energy, water, waste, open issues, savings, or the campus Green Score.";
  }
  if (has("hello", "hi", "hey", "who are you", "what can you do", "help")) {
    return (
      `Hello! I am Verdant Copilot, your campus sustainability assistant. Our current Green Score is ` +
      `${score.score}/100 (${score.grade} · ${score.label}). Ask me about live energy or water, ` +
      "overflowing waste bins, prioritized recommendations, or generate a full sustainability report."
    );
  }
  if (has("report", "pdf", "export", "download")) {
    return (
      "You can generate the official Campus Sustainability Report (with full breakdown and PDF export) " +
      "at any time. Click the 'Generate Report' button in the AI Copilot panel or visit the Reports page."
    );
  }
  if (has("saving", "kwh", "litres", "saved", "impact")) {
    return (
      "Fixing current high-priority issues could save an estimated 40+ kWh/day in electricity and over " +
      "1,000 L/day in potable water across campus. Check the Actions tab in Copilot for specific steps."
    );
  }
  if (has("score", "rating", "grade", "green")) {
    return (
      `The campus Green Score is ${score.score}/100 (grade ${score.grade}). ` +
      `The weakest component is ${score.weakest}, so that is where effort pays off most.`
    );
  }
  if (has("energy", "power", "electric", "kwh", "kw")) {
    const row = context.trends.find((r) => r.resource === "energy");
    const trend = row
      ? ` It is ${row.change_pct > 0 ? "up" : "down"} ${Math.abs(row.change_pct).toFixed(1)}% versus the previous window.`
      : "";
    return (
      `Live load is ${summary.energy.current_kw.toFixed(2)} kW against a ` +
      `${(summary.energy.budget_kw ?? 0).toFixed(2)} kW budget, with ${summary.energy.today_kwh.toFixed(2)} kWh used today.${trend} ` +
      `Open energy issues: ${listIssues("energy_wastage")}.`
    );
  }
  if (has("water", "leak", "litre", "liter", "lpm")) {
    const row = context.trends.find((r) => r.resource === "water");
    const trend = row
      ? ` Usage is ${row.change_pct > 0 ? "up" : "down"} ${Math.abs(row.change_pct).toFixed(1)}% versus the previous window.`
      : "";
    return (
      `Water is flowing at ${summary.water.current_lpm.toFixed(2)} L/min and ` +
      `${summary.water.today_liters.toFixed(0)} L has been used today.${trend} ` +
      `Open leakage issues: ${listIssues("water_leakage")}.`
    );
  }
  if (has("waste", "bin", "trash", "recycl", "fill")) {
    return (
      `Average bin fill is ${summary.waste.avg_fill_pct.toFixed(0)}% with ` +
      `${summary.waste.overflow_bins} of ${summary.waste.bins_tracked} bins overflowing. ` +
      `Open waste issues: ${listIssues("waste_accumulation")}.`
    );
  }
  if (has("issue", "problem", "fix", "first", "priority", "recommend")) {
    const critical = issues.filter((i) => i.severity === "critical" || i.severity === "high");
    if (critical.length) {
      const top = critical[0];
      return (
        `${issues.length} issues are open, ${critical.length} of them high or critical. ` +
        `Start with #${top.id} in ${top.zone} (${top.severity}) — ${top.detail}`
      );
    }
    return `${issues.length} issues are open, none high or critical. Resolved in the last 24h: ${context.resolved_last_24h}.`;
  }
  if (has("building", "zone", "campus", "sensor")) {
    const campus = summary.campus;
    return (
      `The twin covers ${campus.buildings} buildings, ${campus.zones} zones and ` +
      `${campus.sensors} sensors, currently occupied by ${summary.occupancy.current} of ` +
      `${summary.occupancy.capacity} people.`
    );
  }
  return (
    `Green Score ${score.score}/100 (${score.grade}). ` +
    `${summary.issues.open} open issues, ${summary.energy.current_kw.toFixed(2)} kW live load, ` +
    `${summary.water.current_lpm.toFixed(2)} L/min water, ${summary.waste.avg_fill_pct.toFixed(0)}% average bin fill. ` +
    "Ask me about energy, water, waste, issues or the score."
  );
}

// ---------------------------------------------------------------------------
// Leaderboard (mirrors routers/stats.py)
// ---------------------------------------------------------------------------

export function leaderboard(state: WorldState): { count: number; leaderboard: BuildingRankItem[] } {
  const results: BuildingRankItem[] = [];

  for (const building of state.buildings) {
    const zoneIds = new Set(building.zones.map((z) => z.id));
    const open = state.issues.filter((i) => i.status === "open" && i.zone_id !== null && zoneIds.has(i.zone_id));
    const resolvedCount = state.issues.filter(
      (i) => i.status === "resolved" && i.zone_id !== null && zoneIds.has(i.zone_id),
    ).length;
    const sensors = state.sensors.filter((s) => zoneIds.has(s.zone_id));

    const energyW = sum(sensors.filter((s) => s.sensor_type === "energy").map((s) => state.latest.get(s.id) ?? 0));
    const waterLpm = sum(sensors.filter((s) => s.sensor_type === "water").map((s) => state.latest.get(s.id) ?? 0));
    const wasteFills = sensors
      .filter((s) => s.sensor_type === "waste" && state.latest.has(s.id))
      .map((s) => state.latest.get(s.id) as number);
    const avgWaste = wasteFills.length ? sum(wasteFills) / wasteFills.length : 20.0;
    const overflowCount = wasteFills.filter((f) => f >= 90).length;

    const budgetKw = building.energy_budget_kw || 50.0;
    const currentKw = energyW / 1000.0;
    const energyRatio = budgetKw > 0 ? currentKw / budgetKw : 1.0;

    let energyScore = 100.0 - Math.max(0, ((energyRatio - 0.7) / 0.9) * 100);
    energyScore = clamp(energyScore);

    const leaks = open.filter((i) => i.type === "water_leakage").length;
    const waterScore = clamp(100 - leaks * 25 - Math.max(0, waterLpm - 15));

    const wasteScore = clamp(100 - Math.max(0, ((avgWaste - 50) / 50) * 100) - overflowCount * 15);

    const critHigh = open.filter((i) => i.severity === "critical" || i.severity === "high").length;
    const medLow = open.filter((i) => i.severity === "medium" || i.severity === "low").length;
    const issueScore = clamp(100 - critHigh * 15 - medLow * 6 + Math.min(15, resolvedCount * 3));

    const totalScore = Math.round((energyScore + waterScore + wasteScore + issueScore) / 4);
    const clamped = Math.max(15, Math.min(98, totalScore));

    let grade: BuildingRankItem["grade"];
    let status: string;
    if (clamped >= 88) { grade = "A"; status = "Optimal"; }
    else if (clamped >= 76) { grade = "B"; status = "Efficient"; }
    else if (clamped >= 62) { grade = "C"; status = "Moderate"; }
    else if (clamped >= 48) { grade = "D"; status = "Attention"; }
    else { grade = "E"; status = "Critical"; }

    results.push({
      id: building.id,
      name: building.name,
      code: building.code,
      category: building.category,
      floors: building.floors,
      score: clamped,
      grade,
      status,
      energy_kw: round(currentKw, 1),
      energy_budget_kw: round(budgetKw, 1),
      water_lpm: round(waterLpm, 1),
      avg_waste_pct: round(avgWaste, 1),
      open_issues_count: open.length,
      resolved_count: resolvedCount,
      rank: 0,
    });
  }

  results.sort((a, b) => b.score - a.score || a.open_issues_count - b.open_issues_count);
  results.forEach((item, index) => {
    item.rank = index + 1;
  });

  return { count: results.length, leaderboard: results };
}
