/**
 * In-browser sensor simulator — a TypeScript port of
 * `backend/app/services/simulator.py`.
 *
 * Every tick it synthesises one reading per sensor using day/night activity
 * cycles and occupancy-linked resource use, optionally injecting anomalies
 * (water leak, night energy spike, overflowing bin).
 */

import { SIM_ANOMALY_CHANCE, SIM_INTERVAL_SECONDS, SIM_MAX_ANOMALIES } from "./config";
import { choice, gauss, randInt, uniform } from "./random";
import type { SensorType } from "./seed";

export { SIM_INTERVAL_SECONDS };

// Standby power (W) and additional W per occupant, per zone type.
const ZONE_ENERGY: Record<string, [number, number]> = {
  library: [180.0, 22.0],
  common: [120.0, 18.0],
  mess: [500.0, 55.0],
  utility: [250.0, 90.0],
  office: [150.0, 35.0],
  cafeteria: [350.0, 28.0],
  kitchen: [900.0, 160.0],
  lab: [600.0, 110.0],
  server: [2400.0, 0.0],
  sports: [400.0, 45.0],
  pool: [900.0, 8.0],
};
const DEFAULT_ENERGY: [number, number] = [200.0, 25.0];

// Baseline flow (L/min) and L/min per occupant, per zone type.
const ZONE_WATER: Record<string, [number, number]> = {
  mess: [1.2, 0.5],
  utility: [2.5, 0.6],
  cafeteria: [0.8, 0.25],
  kitchen: [1.8, 0.7],
  lab: [0.2, 0.45],
  sports: [0.4, 0.35],
  pool: [5.0, 0.5],
};
const DEFAULT_WATER: [number, number] = [0.3, 0.3];

// Bin fill (% per occupant per tick), per zone type.
const ZONE_WASTE: Record<string, number> = {
  cafeteria: 0.01,
  mess: 0.01,
  kitchen: 0.014,
  library: 0.003,
  lab: 0.002,
  office: 0.004,
  sports: 0.006,
  common: 0.008,
};
const DEFAULT_WASTE = 0.003;

const SPIKE_HEAVY = ["energy_spike", "energy_spike", "energy_spike", "water_leak", "bin_overflow"];
const DAY_HEAVY = ["water_leak", "water_leak", "bin_overflow", "energy_spike"];

/** Campus-wide day/night activity multiplier (closed 21:00–06:00). */
export function activityFactor(hour: number): number {
  if (hour >= 6 && hour < 8) return 0.15 + (hour - 6) * 0.35;
  if (hour >= 8 && hour < 12) return 0.9;
  if (hour >= 12 && hour < 14) return 0.7;
  if (hour >= 14 && hour < 17) return 0.95;
  if (hour >= 17 && hour < 19) return 0.5;
  if (hour >= 19 && hour < 21) return 0.35;
  return 0.0;
}

/** Anomalies skew to energy spikes at night, as the campus powers down. */
function anomalyKind(ts: number): string {
  const hour = new Date(ts).getHours();
  const night = hour >= 21 || hour < 6;
  return choice(night ? SPIKE_HEAVY : DAY_HEAVY);
}

function gaussCurve(hour: number, center: number, width: number): number {
  return Math.exp(-((hour - center) ** 2) / (2 * width * width));
}

/** Zone-specific activity, layering meal/evening peaks onto the base curve. */
export function zoneActivity(zone_type: string, ts: number): number {
  const d = new Date(ts);
  const h = d.getHours() + d.getMinutes() / 60.0;
  const base = activityFactor(h);
  if (zone_type === "cafeteria" || zone_type === "mess" || zone_type === "kitchen") {
    const peak = Math.max(gaussCurve(h, 8.0, 1.0), gaussCurve(h, 13.0, 1.0), gaussCurve(h, 20.0, 1.0));
    return Math.max(base, peak);
  }
  if (zone_type === "sports") return Math.max(base, gaussCurve(h, 18.0, 2.5));
  if (zone_type === "pool") return base * (h >= 7 && h <= 19 ? 1.0 : 0.1);
  if (zone_type === "server") return 0.05;
  return base;
}

export type SimSensor = {
  id: number;
  type: SensorType;
  unit: string;
  zone_id: number;
  zone_type: string;
  zone_name: string;
  capacity: number;
};

export type SimSample = {
  sensor_id: number;
  zone_id: number;
  zone_type: string;
  zone_name: string;
  sensor_type: SensorType;
  value: number;
  occupancy: number;
};

export type TickResult = {
  samples: SimSample[];
  ts: number;
};

type Anomaly = {
  kind: string;
  ticksLeft: number;
  magnitude: number;
};

const round1 = (v: number) => Math.round(v * 10) / 10;
const round2 = (v: number) => Math.round(v * 100) / 100;

export class Simulator {
  sensors: SimSensor[] = [];
  byType: Record<string, SimSensor[]> = {};
  anomalies = new Map<number, Anomaly>();
  binFill = new Map<number, number>();

  load(sensors: SimSensor[]): void {
    this.sensors = sensors;
    this.byType = {};
    for (const info of sensors) {
      (this.byType[info.type] ??= []).push(info);
      if (info.type === "waste") this.binFill.set(info.id, uniform(5, 45));
    }
  }

  // -- anomaly injection --------------------------------------------------
  private injectAnomaly(ts: number): void {
    if (this.anomalies.size >= SIM_MAX_ANOMALIES) return;
    if (Math.random() > SIM_ANOMALY_CHANCE) return;

    const kind = anomalyKind(ts);
    const poolType = { water_leak: "water", energy_spike: "energy", bin_overflow: "waste" }[kind];
    const pool = this.byType[poolType ?? ""];
    if (!pool || pool.length === 0) return;

    const target = choice(pool);
    if (this.anomalies.has(target.id)) return;

    let magnitude: number;
    if (kind === "water_leak") magnitude = uniform(9.0, 20.0);
    else if (kind === "energy_spike") magnitude = uniform(3.0, 6.0);
    else magnitude = uniform(92.0, 100.0);

    this.anomalies.set(target.id, {
      kind,
      ticksLeft: randInt(20, 70),
      magnitude,
    });
  }

  private expireAnomalies(): void {
    for (const sid of [...this.anomalies.keys()]) {
      const anomaly = this.anomalies.get(sid);
      if (anomaly && anomaly.ticksLeft <= 0) this.anomalies.delete(sid);
    }
    for (const anomaly of this.anomalies.values()) anomaly.ticksLeft -= 1;
  }

  // -- value synthesis ----------------------------------------------------
  private noise(scale = 0.05): number {
    return Math.max(0.2, gauss(1.0, scale));
  }

  private occupancy(info: SimSensor, ts: number): number {
    const activity = zoneActivity(info.zone_type, ts);
    const people = info.capacity * activity * uniform(0.65, 1.15);
    return Math.max(0.0, round1(people));
  }

  private energy(info: SimSensor, occupancy: number): number {
    let base: number;
    if (info.zone_type === "server") {
      base = ZONE_ENERGY.server[0] * this.noise(0.03);
    } else {
      const [standby, perPerson] = ZONE_ENERGY[info.zone_type] ?? DEFAULT_ENERGY;
      base = (standby + perPerson * occupancy) * this.noise();
    }
    const anomaly = this.anomalies.get(info.id);
    if (anomaly && anomaly.kind === "energy_spike") {
      const [standby, perPerson] = ZONE_ENERGY[info.zone_type] ?? DEFAULT_ENERGY;
      const peak = standby + perPerson * Math.max(info.capacity, 1);
      base = peak * anomaly.magnitude * this.noise(0.03);
    }
    return round1(base);
  }

  private water(info: SimSensor, occupancy: number): number {
    const [rateBase, perPerson] = ZONE_WATER[info.zone_type] ?? DEFAULT_WATER;
    let value = (rateBase + perPerson * occupancy) * this.noise();
    const anomaly = this.anomalies.get(info.id);
    if (anomaly && anomaly.kind === "water_leak") {
      // ~constant flow regardless of occupancy (real leaks barely fluctuate)
      value = anomaly.magnitude * this.noise(0.01);
    }
    return round2(Math.max(0.0, value));
  }

  private waste(info: SimSensor, occupancy: number): number {
    let fill = this.binFill.get(info.id) ?? 10.0;
    const anomaly = this.anomalies.get(info.id);
    if (anomaly && anomaly.kind === "bin_overflow") {
      fill = anomaly.magnitude;
    } else {
      const rate = ZONE_WASTE[info.zone_type] ?? DEFAULT_WASTE;
      fill += rate * occupancy + 0.02;
      if (fill >= 65 && Math.random() < 0.05) fill = uniform(2, 12); // crew empties it
    }
    fill = Math.min(100.0, Math.max(0.0, fill));
    this.binFill.set(info.id, fill);
    return round1(fill);
  }

  // -- tick ---------------------------------------------------------------
  tick(ts: number = Date.now()): TickResult {
    const result: TickResult = { ts, samples: [] };

    this.expireAnomalies();
    this.injectAnomaly(ts);

    const occupancyByZone = new Map<number, number>();
    for (const info of this.byType.occupancy ?? []) {
      occupancyByZone.set(info.zone_id, this.occupancy(info, ts));
    }

    for (const info of this.sensors) {
      const occupancy = occupancyByZone.get(info.zone_id) ?? 0.0;
      let value: number;
      if (info.type === "occupancy") value = occupancy;
      else if (info.type === "energy") value = this.energy(info, occupancy);
      else if (info.type === "water") value = this.water(info, occupancy);
      else if (info.type === "waste") value = this.waste(info, occupancy);
      else continue;

      result.samples.push({
        sensor_id: info.id,
        zone_id: info.zone_id,
        zone_type: info.zone_type,
        zone_name: info.zone_name,
        sensor_type: info.type,
        value,
        occupancy,
      });
    }

    return result;
  }

  /**
   * Expected campus energy (W) and water (L/min) load at a given time without
   * noise or anomalies — used to backfill historical trend samples.
   */
  baselineLoad(ts: number): { energyW: number; waterLpm: number } {
    let energyW = 0;
    let waterLpm = 0;
    for (const info of this.sensors) {
      const occupancy = info.capacity * zoneActivity(info.zone_type, ts);
      if (info.type === "energy") {
        const [standby, perPerson] = ZONE_ENERGY[info.zone_type] ?? DEFAULT_ENERGY;
        energyW += info.zone_type === "server" ? ZONE_ENERGY.server[0] : standby + perPerson * occupancy;
      } else if (info.type === "water") {
        const [rateBase, perPerson] = ZONE_WATER[info.zone_type] ?? DEFAULT_WATER;
        waterLpm += rateBase + perPerson * occupancy;
      }
    }
    return { energyW, waterLpm };
  }
}
