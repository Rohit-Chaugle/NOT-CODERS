/**
 * Rule-based detection — a TypeScript port of
 * `backend/app/services/detection.py`.
 *
 * Rules:
 *   * waste_accumulation - bin fill at/above threshold
 *   * energy_wastage     - high draw while the zone is unoccupied
 *   * water_leakage      - sustained, near-constant flow at/above leak rate
 *   * inefficient_usage  - draw far above the average for peer zones
 */

import { ENERGY_WASTE_WATTS, INEFFICIENT_FACTOR, WATER_LEAK_LPM, WASTE_THRESHOLD } from "./config";
import type { Issue, IssueType, Severity } from "../api/twin";
import type { SensorType } from "./seed";
import type { SimSample } from "./simulator";

export const TITLES: Record<string, string> = {
  waste_accumulation: "Waste accumulation",
  energy_wastage: "Energy wastage",
  water_leakage: "Possible water leakage",
  inefficient_usage: "Inefficient resource use",
};

export const SEVERITY_TO_LEVEL: Record<string, string> = {
  critical: "alert",
  high: "warning",
  medium: "info",
  low: "info",
};

export type CreateSpec = {
  ts: number;
  zone_id: number;
  sensor_id: number | null;
  type: IssueType;
  severity: Severity;
  title: string;
  description: string;
  source: "sensor" | "vision" | "manual";
};

export type CreateFn = (spec: CreateSpec) => Issue | null;

type ZoneCtx = {
  zone_type: string;
  zone_name: string;
  occupancy: number;
  vals: Partial<Record<SensorType, [number, number]>>;
};

function mean(values: number[]): number {
  let total = 0;
  for (const v of values) total += v;
  return total / values.length;
}

export class Detector {
  // zone_id -> recent water readings (to spot an almost constant leak flow)
  private waterHistory = new Map<number, number[]>();
  private inefficientStreak = new Map<string, number>();

  evaluate(samples: SimSample[], ts: number, create: CreateFn): Issue[] {
    const zones = new Map<number, ZoneCtx>();
    for (const s of samples) {
      let ctx = zones.get(s.zone_id);
      if (!ctx) {
        ctx = { zone_type: s.zone_type, zone_name: s.zone_name, occupancy: s.occupancy, vals: {} };
        zones.set(s.zone_id, ctx);
      }
      ctx.vals[s.sensor_type] = [s.sensor_id, s.value];
    }

    return [
      ...this.waste(zones, ts, create),
      ...this.energyWastage(zones, ts, create),
      ...this.waterLeak(zones, ts, create),
      ...this.inefficient(zones, ts, create),
    ];
  }

  private waste(zones: Map<number, ZoneCtx>, ts: number, create: CreateFn): Issue[] {
    const out: Issue[] = [];
    for (const [zone_id, ctx] of zones) {
      const hit = ctx.vals.waste;
      if (!hit) continue;
      const [sensor_id, value] = hit;
      if (value >= WASTE_THRESHOLD) {
        const severity: Severity = value >= 98 ? "critical" : "high";
        const issue = create({
          ts,
          zone_id,
          sensor_id,
          type: "waste_accumulation",
          severity,
          title: TITLES.waste_accumulation,
          description: `Bin in ${ctx.zone_name} is ${value.toFixed(0)}% full.`,
          source: "sensor",
        });
        if (issue) out.push(issue);
      }
    }
    return out;
  }

  private energyWastage(zones: Map<number, ZoneCtx>, ts: number, create: CreateFn): Issue[] {
    const out: Issue[] = [];
    for (const [zone_id, ctx] of zones) {
      if (ctx.zone_type === "server") continue; // server rooms run 24/7
      const hit = ctx.vals.energy;
      if (!hit) continue;
      const [sensor_id, value] = hit;
      const occupancy = ctx.occupancy;
      if (value >= ENERGY_WASTE_WATTS && occupancy <= 0.5) {
        const severity: Severity = value >= 3 * ENERGY_WASTE_WATTS ? "critical" : "high";
        const issue = create({
          ts,
          zone_id,
          sensor_id,
          type: "energy_wastage",
          severity,
          title: TITLES.energy_wastage,
          description:
            `${ctx.zone_name} is drawing ${value.toFixed(0)} W with no occupants ` +
            `(occupancy ${occupancy.toFixed(0)}).`,
          source: "sensor",
        });
        if (issue) out.push(issue);
      }
    }
    return out;
  }

  private waterLeak(zones: Map<number, ZoneCtx>, ts: number, create: CreateFn): Issue[] {
    const out: Issue[] = [];
    for (const [zone_id, ctx] of zones) {
      const hit = ctx.vals.water;
      if (!hit) {
        this.waterHistory.delete(zone_id);
        continue;
      }
      const [sensor_id, value] = hit;
      const history = this.waterHistory.get(zone_id) ?? [];
      history.push(value);
      while (history.length > 8) history.shift();
      this.waterHistory.set(zone_id, history);

      if (history.length >= 6) {
        const recent = history.slice(-6);
        const avg = mean(recent);
        const spread = Math.max(...recent) - Math.min(...recent);
        const constant = spread <= Math.max(0.2, 0.15 * avg);
        if (Math.min(...recent) >= WATER_LEAK_LPM && constant) {
          const issue = create({
            ts,
            zone_id,
            sensor_id,
            type: "water_leakage",
            severity: "high",
            title: TITLES.water_leakage,
            description:
              `Constant flow of ${avg.toFixed(1)} L/min detected in ${ctx.zone_name} ` +
              "— likely a leaking fixture or pipe.",
            source: "sensor",
          });
          if (issue) out.push(issue);
        }
      }
    }
    return out;
  }

  private inefficient(zones: Map<number, ZoneCtx>, ts: number, create: CreateFn): Issue[] {
    const peers = new Map<string, number[]>();
    for (const ctx of zones.values()) {
      if (ctx.occupancy <= 0) continue;
      const hit = ctx.vals.energy;
      if (hit && ctx.zone_type !== "server") {
        const list = peers.get(ctx.zone_type) ?? [];
        list.push(hit[1]);
        peers.set(ctx.zone_type, list);
      }
    }

    const out: Issue[] = [];
    for (const [zone_id, ctx] of zones) {
      const hit = ctx.vals.energy;
      const key = `${zone_id}:energy`;
      const peerValues = peers.get(ctx.zone_type) ?? [];
      if (!hit || ctx.occupancy <= 0 || peerValues.length < 2) {
        this.inefficientStreak.set(key, 0);
        continue;
      }
      const avg = mean(peerValues);
      const value = hit[1];
      if (avg > 0 && value > INEFFICIENT_FACTOR * avg) {
        const streak = (this.inefficientStreak.get(key) ?? 0) + 1;
        this.inefficientStreak.set(key, streak);
        if (streak >= 2) {
          const issue = create({
            ts,
            zone_id,
            sensor_id: hit[0],
            type: "inefficient_usage",
            severity: "medium",
            title: TITLES.inefficient_usage,
            description:
              `${ctx.zone_name} draws ${value.toFixed(0)} W, ` +
              `${(value / avg).toFixed(1)}x the average of comparable ` +
              `${ctx.zone_type} zones (${avg.toFixed(0)} W).`,
            source: "sensor",
          });
          if (issue) out.push(issue);
          this.inefficientStreak.set(key, 0);
        }
      } else {
        this.inefficientStreak.set(key, 0);
      }
    }
    return out;
  }
}
