import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchCampus,
  fetchIssues,
  liveSocketUrl,
  type CampusBuilding,
  type CampusSummary,
  type Issue,
  type LiveEvent,
  type LiveReading,
} from "../api/twin";
import {
  THRESHOLDS,
  worldToIsland,
  type AnomalyKind,
  type BuildingStatus,
  type ZoneAnomaly,
} from "../three/layout";

export type SensorType = "energy" | "water" | "waste" | "occupancy";

type ZoneValues = Partial<Record<SensorType, number>>;
type Series = {
  ts: number[];
  energy: number[];
  water: number[];
  waste: number[];
  occupancy: number[];
};

export type BuildingTotals = {
  energy: number;
  water: number;
  waste: number;
  occupancy: number;
};

export type AnomalyMarker = ZoneAnomaly & { position: [number, number, number] };

const MAX_POINTS = 90;

const EMPTY_SERIES: Series = { ts: [], energy: [], water: [], waste: [], occupancy: [] };

const ISSUE_KIND: Partial<Record<Issue["type"], AnomalyKind>> = {
  water_leakage: "leak",
  energy_wastage: "spike",
  inefficient_usage: "spike",
  waste_accumulation: "waste",
};

function isSpike(zone_type: string, energy: number, occupancy: number) {
  return (
    zone_type !== "server" &&
    energy >= THRESHOLDS.energyWasteWatts &&
    occupancy <= 0.5
  );
}

export type TwinData = {
  loading: boolean;
  error: string | null;
  connected: boolean;
  summary: CampusSummary | null;
  buildings: CampusBuilding[];
  issues: Issue[];
  zoneValues: Record<number, ZoneValues>;
  series: Record<number, Series>;
  totals: Record<number, BuildingTotals>;
  statuses: Record<number, BuildingStatus>;
  anomalies: AnomalyMarker[];
  reload: () => void;
};

/**
 * Loads the campus topology once, subscribes to /ws/live and folds live
 * readings into per-building series + derived status/anomaly state.
 */
export function useTwinData(): TwinData {
  const [token, setToken] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [summary, setSummary] = useState<CampusSummary | null>(null);
  const [buildings, setBuildings] = useState<CampusBuilding[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [live, setLive] = useState<{
    zoneValues: Record<number, ZoneValues>;
    series: Record<number, Series>;
  }>({ zoneValues: {}, series: {} });

  // zone_id -> building_id, kept in a ref for the WS handler.
  const zoneToBuilding = useRef<Map<number, number>>(new Map());
  const zoneLookup = useRef<Map<number, { buildingId: number; name: string; zone_type: string; capacity: number }>>(
    new Map(),
  );
  const buildingCodes = useRef<Map<number, string>>(new Map());

  // ---- initial load ----
  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);

    Promise.all([fetchCampus(ctrl.signal), fetchIssues({ status: "open", limit: 200 }, ctrl.signal)])
      .then(([campus, issueRes]) => {
        setSummary(campus.campus);
        setBuildings(campus.buildings);

        const z2b = new Map<number, number>();
        const zLookup = new Map<number, { buildingId: number; name: string; zone_type: string; capacity: number }>();
        for (const b of campus.buildings) {
          for (const z of b.zones) {
            z2b.set(z.id, b.id);
            zLookup.set(z.id, { buildingId: b.id, name: z.name, zone_type: z.zone_type, capacity: z.capacity });
          }
        }
        zoneToBuilding.current = z2b;
        zoneLookup.current = zLookup;
        buildingCodes.current = new Map(campus.buildings.map((b) => [b.id, b.code]));

        setIssues(issueRes.issues.filter((i) => i.status === "open"));
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load campus");
        setLoading(false);
      });

    return () => ctrl.abort();
  }, [token]);

  // ---- websocket ----
  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let closed = false;

    const applyReadings = (payload: { ts: string; readings: LiveReading[] }) => {
      const ts = Date.parse(payload.ts) || Date.now();
      setLive((prev) => {
        const zoneValues: Record<number, ZoneValues> = { ...prev.zoneValues };
        const series: Record<number, Series> = { ...prev.series };
        const acc = new Map<number, { energy: number; water: number; waste: number; wasteN: number; occupancy: number }>();

        for (const r of payload.readings) {
          zoneValues[r.zone_id] = { ...(zoneValues[r.zone_id] ?? {}), [r.type]: r.value };
          const buildingId = zoneToBuilding.current.get(r.zone_id);
          if (buildingId === undefined) continue;
          const a = acc.get(buildingId) ?? { energy: 0, water: 0, waste: 0, wasteN: 0, occupancy: 0 };
          if (r.type === "energy") a.energy += r.value;
          else if (r.type === "water") a.water += r.value;
          else if (r.type === "occupancy") a.occupancy += r.value;
          else if (r.type === "waste") {
            a.waste += r.value;
            a.wasteN += 1;
          }
          acc.set(buildingId, a);
        }

        for (const [buildingId, a] of acc) {
          const s = prev.series[buildingId] ?? EMPTY_SERIES;
          const wasteAvg = a.wasteN > 0 ? a.waste / a.wasteN : 0;
          series[buildingId] = {
            ts: [...s.ts, ts].slice(-MAX_POINTS),
            energy: [...s.energy, a.energy].slice(-MAX_POINTS),
            water: [...s.water, a.water].slice(-MAX_POINTS),
            waste: [...s.waste, wasteAvg].slice(-MAX_POINTS),
            occupancy: [...s.occupancy, a.occupancy].slice(-MAX_POINTS),
          };
        }

        return { zoneValues, series };
      });
    };

    const handle = (event: LiveEvent) => {
      switch (event.type) {
        case "hello":
          setConnected(true);
          break;
        case "readings":
          applyReadings(event.payload);
          break;
        case "issue:created":
          setIssues((prev) => (prev.some((i) => i.id === event.payload.id) ? prev : [event.payload, ...prev]));
          break;
        case "issue:resolved":
          setIssues((prev) => prev.filter((i) => i.id !== event.payload.id));
          break;
        default:
          break;
      }
    };

    const connect = () => {
      socket = new WebSocket(liveSocketUrl());
      socket.onopen = () => setConnected(true);
      socket.onmessage = (ev) => {
        try {
          handle(JSON.parse(ev.data as string) as LiveEvent);
        } catch {
          /* ignore malformed frames */
        }
      };
      socket.onclose = () => {
        setConnected(false);
        if (!closed) reconnectTimer = window.setTimeout(connect, 2500);
      };
      socket.onerror = () => socket?.close();
    };

    connect();
    return () => {
      closed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [token]);

  const reload = useCallback(() => setToken((t) => t + 1), []);

  // ---- derived: building totals ----
  const totals = useMemo(() => {
    const out: Record<number, BuildingTotals> = {};
    for (const b of buildings) {
      let energy = 0;
      let water = 0;
      let wasteSum = 0;
      let wasteN = 0;
      let occupancy = 0;
      for (const z of b.zones) {
        const v = live.zoneValues[z.id];
        if (!v) continue;
        if (v.energy !== undefined) energy += v.energy;
        if (v.water !== undefined) water += v.water;
        if (v.occupancy !== undefined) occupancy += v.occupancy;
        if (v.waste !== undefined) {
          wasteSum += v.waste;
          wasteN += 1;
        }
      }
      out[b.id] = { energy, water, waste: wasteN ? wasteSum / wasteN : 0, occupancy };
    }
    return out;
  }, [buildings, live.zoneValues]);

  // ---- derived: anomalies (readings + open issues) ----
  const anomalies = useMemo(() => {
    const markers = new Map<string, AnomalyMarker>();

    for (const b of buildings) {
      for (const z of b.zones) {
        const v = live.zoneValues[z.id];
        if (!v) continue;
        const [ix, iy, iz] = worldToIsland(z.position.x, z.position.z, z.position.y);
        const add = (kind: AnomalyKind) => {
          markers.set(`${z.id}:${kind}`, {
            kind,
            zoneId: z.id,
            zoneName: z.name,
            buildingId: b.id,
            buildingCode: b.code,
            position: [ix, iy, iz],
          });
        };
        if (v.water !== undefined && v.water >= THRESHOLDS.waterLeakLpm) add("leak");
        if (v.waste !== undefined && v.waste >= THRESHOLDS.wasteFillPct) add("waste");
        if (v.energy !== undefined && isSpike(z.zone_type, v.energy, v.occupancy ?? 0)) add("spike");
      }
    }

    for (const issue of issues) {
      const kind = ISSUE_KIND[issue.type];
      if (!kind || issue.zone_id === null) continue;
      const zone = zoneLookup.current.get(issue.zone_id);
      if (!zone) continue;
      markers.set(`${issue.zone_id}:${kind}`, {
        kind,
        zoneId: issue.zone_id,
        zoneName: zone.name,
        buildingId: zone.buildingId,
        buildingCode: buildingCodes.current.get(zone.buildingId) ?? "",
        position: worldToIsland(
          ...zonePositionLookup(buildings, issue.zone_id),
        ),
      });
    }

    return [...markers.values()];
  }, [buildings, live.zoneValues, issues]);

  // ---- derived: building status ----
  const statuses = useMemo(() => {
    const out: Record<number, BuildingStatus> = {};
    const severityByBuilding = new Map<number, Issue["severity"][]>();
    for (const issue of issues) {
      if (issue.building_id === null) continue;
      const list = severityByBuilding.get(issue.building_id) ?? [];
      list.push(issue.severity);
      severityByBuilding.set(issue.building_id, list);
    }

    const anomalyByBuilding = new Map<number, AnomalyKind[]>();
    for (const a of anomalies) {
      const list = anomalyByBuilding.get(a.buildingId) ?? [];
      list.push(a.kind);
      anomalyByBuilding.set(a.buildingId, list);
    }

    for (const b of buildings) {
      const sevs = severityByBuilding.get(b.id) ?? [];
      const anoms = anomalyByBuilding.get(b.id) ?? [];
      const budget = b.energy_budget_kw * 1000;
      const energy = totals[b.id]?.energy ?? 0;

      let status: BuildingStatus = "healthy";
      if (
        sevs.some((s) => s === "high" || s === "critical") ||
        anoms.some((k) => k === "leak" || k === "waste") ||
        (budget > 0 && energy > budget * 1.5)
      ) {
        status = "critical";
      } else if (
        sevs.length > 0 ||
        anoms.length > 0 ||
        (budget > 0 && energy > budget * 1.15)
      ) {
        status = "warning";
      }
      out[b.id] = status;
    }
    return out;
  }, [buildings, issues, anomalies, totals]);

  return {
    loading,
    error,
    connected,
    summary,
    buildings,
    issues,
    zoneValues: live.zoneValues,
    series: live.series,
    totals,
    statuses,
    anomalies,
    reload,
  };
}

/** Helper: resolve a zone's world position from the campus payload. */
function zonePositionLookup(
  buildings: CampusBuilding[],
  zoneId: number,
): [number, number, number] {
  for (const b of buildings) {
    const z = b.zones.find((zz) => zz.id === zoneId);
    if (z) return [z.position.x, z.position.z, z.position.y];
  }
  return [0, 0, 0];
}
