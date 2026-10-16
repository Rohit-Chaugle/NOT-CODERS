/**
 * In-browser campus seed data — a TypeScript port of `backend/app/seed.py`.
 *
 * The topology (6 buildings, 20 zones, their sensors) is built with the same
 * insertion-order integer ids SQLAlchemy would assign, so the standalone twin
 * is byte-compatible with the FastAPI payload shapes.
 */

import type { CampusBuilding, CampusResponse, CampusZone } from "../api/twin";

export type SensorType = "energy" | "water" | "waste" | "occupancy";

export const SENSOR_UNITS: Record<SensorType, string> = {
  energy: "W",
  water: "L/min",
  waste: "%",
  occupancy: "people",
};

type SeedZone = {
  name: string;
  zone_type: string;
  floor: number;
  area_m2: number;
  capacity: number;
  pos: [number, number, number];
  sensors: SensorType[];
};

type SeedBuilding = {
  name: string;
  code: string;
  category: string;
  floors: number;
  area_m2: number;
  pos_x: number;
  pos_z: number;
  energy_budget_kw: number;
  zones: SeedZone[];
};

const CAMPUS: SeedBuilding[] = [
  {
    name: "Central Library",
    code: "LIB",
    category: "academic",
    floors: 3,
    area_m2: 3200,
    pos_x: 0.0,
    pos_z: 0.0,
    energy_budget_kw: 90.0,
    zones: [
      { name: "Reading Hall", zone_type: "library", floor: 0, area_m2: 600, capacity: 120, pos: [-10, 0, 0], sensors: ["occupancy", "energy", "waste"] },
      { name: "Digital Section", zone_type: "library", floor: 1, area_m2: 350, capacity: 60, pos: [12, 3, 0], sensors: ["occupancy", "energy", "waste"] },
      { name: "Periodicals Room", zone_type: "library", floor: 1, area_m2: 200, capacity: 30, pos: [-12, 3, 8], sensors: ["occupancy", "energy"] },
    ],
  },
  {
    name: "Student Hostel",
    code: "HOS",
    category: "residential",
    floors: 2,
    area_m2: 2600,
    pos_x: -70.0,
    pos_z: 40.0,
    energy_budget_kw: 70.0,
    zones: [
      { name: "Common Room", zone_type: "common", floor: 0, area_m2: 220, capacity: 50, pos: [-80, 0, 20], sensors: ["occupancy", "energy", "waste"] },
      { name: "Hostel Mess", zone_type: "mess", floor: 0, area_m2: 400, capacity: 90, pos: [-60, 0, 20], sensors: ["occupancy", "energy", "water", "waste"] },
      { name: "Laundry Room", zone_type: "utility", floor: 0, area_m2: 120, capacity: 10, pos: [-80, 0, 55], sensors: ["occupancy", "energy", "water"] },
      { name: "Warden Office", zone_type: "office", floor: 1, area_m2: 40, capacity: 6, pos: [-70, 3, 60], sensors: ["occupancy", "energy"] },
    ],
  },
  {
    name: "Central Canteen",
    code: "CAN",
    category: "amenities",
    floors: 1,
    area_m2: 900,
    pos_x: 60.0,
    pos_z: 40.0,
    energy_budget_kw: 55.0,
    zones: [
      { name: "Dining Hall", zone_type: "cafeteria", floor: 0, area_m2: 500, capacity: 150, pos: [50, 0, 30], sensors: ["occupancy", "energy", "waste"] },
      { name: "Kitchen", zone_type: "kitchen", floor: 0, area_m2: 160, capacity: 20, pos: [75, 0, 30], sensors: ["occupancy", "energy", "water", "waste"] },
    ],
  },
  {
    name: "Science & Innovation Labs",
    code: "LAB",
    category: "academic",
    floors: 2,
    area_m2: 2400,
    pos_x: 0.0,
    pos_z: 70.0,
    energy_budget_kw: 120.0,
    zones: [
      { name: "Physics Lab", zone_type: "lab", floor: 0, area_m2: 200, capacity: 40, pos: [-14, 0, 70], sensors: ["occupancy", "energy", "water"] },
      { name: "Chemistry Lab", zone_type: "lab", floor: 0, area_m2: 200, capacity: 40, pos: [14, 0, 70], sensors: ["occupancy", "energy", "water"] },
      { name: "Computer Lab", zone_type: "lab", floor: 1, area_m2: 240, capacity: 60, pos: [-14, 3, 85], sensors: ["occupancy", "energy", "waste"] },
      { name: "Electronics Lab", zone_type: "lab", floor: 1, area_m2: 180, capacity: 40, pos: [14, 3, 85], sensors: ["occupancy", "energy"] },
    ],
  },
  {
    name: "Administration Block",
    code: "ADM",
    category: "admin",
    floors: 2,
    area_m2: 1500,
    pos_x: 60.0,
    pos_z: 0.0,
    energy_budget_kw: 45.0,
    zones: [
      { name: "Admin Office", zone_type: "office", floor: 0, area_m2: 120, capacity: 25, pos: [50, 0, -8], sensors: ["occupancy", "energy", "waste"] },
      { name: "Accounts", zone_type: "office", floor: 0, area_m2: 80, capacity: 15, pos: [72, 0, -8], sensors: ["occupancy", "energy"] },
      { name: "Conference Room", zone_type: "office", floor: 1, area_m2: 90, capacity: 30, pos: [55, 3, 8], sensors: ["occupancy", "energy"] },
      { name: "Server Room", zone_type: "server", floor: 1, area_m2: 30, capacity: 2, pos: [75, 3, 8], sensors: ["occupancy", "energy"] },
    ],
  },
  {
    name: "Sports Complex",
    code: "SPT",
    category: "amenities",
    floors: 1,
    area_m2: 3800,
    pos_x: 120.0,
    pos_z: 55.0,
    energy_budget_kw: 100.0,
    zones: [
      { name: "Indoor Arena", zone_type: "sports", floor: 0, area_m2: 900, capacity: 100, pos: [110, 0, 45], sensors: ["occupancy", "energy", "water", "waste"] },
      { name: "Gymnasium", zone_type: "sports", floor: 0, area_m2: 300, capacity: 60, pos: [140, 0, 45], sensors: ["occupancy", "energy"] },
      { name: "Swimming Pool", zone_type: "pool", floor: 0, area_m2: 500, capacity: 40, pos: [125, 0, 75], sensors: ["occupancy", "energy", "water"] },
    ],
  },
];

export type ZoneRecord = {
  id: number;
  building_id: number;
  building_name: string;
  building_code: string;
  name: string;
  zone_type: string;
  floor: number;
  area_m2: number;
  capacity: number;
  pos_x: number;
  pos_y: number;
  pos_z: number;
};

export type SensorRecord = {
  id: number;
  zone_id: number;
  sensor_type: SensorType;
  unit: string;
  status: string;
};

export type CampusTopology = {
  buildings: CampusBuilding[];
  zones: ZoneRecord[];
  sensors: SensorRecord[];
};

/** Build the static topology with SQLAlchemy-compatible sequential ids. */
export function buildTopology(): CampusTopology {
  const buildings: CampusBuilding[] = [];
  const zones: ZoneRecord[] = [];
  const sensors: SensorRecord[] = [];

  let buildingId = 0;
  let zoneId = 0;
  let sensorId = 0;

  for (const b of CAMPUS) {
    buildingId += 1;
    const campusZones: CampusZone[] = [];

    for (const z of b.zones) {
      zoneId += 1;
      const [x, y, zz] = z.pos;

      for (const sensorType of z.sensors) {
        sensorId += 1;
        sensors.push({
          id: sensorId,
          zone_id: zoneId,
          sensor_type: sensorType,
          unit: SENSOR_UNITS[sensorType],
          status: "online",
        });
      }

      zones.push({
        id: zoneId,
        building_id: buildingId,
        building_name: b.name,
        building_code: b.code,
        name: z.name,
        zone_type: z.zone_type,
        floor: z.floor,
        area_m2: z.area_m2,
        capacity: z.capacity,
        pos_x: x,
        pos_y: y,
        pos_z: zz,
      });

      campusZones.push({
        id: zoneId,
        name: z.name,
        zone_type: z.zone_type,
        floor: z.floor,
        area_m2: z.area_m2,
        capacity: z.capacity,
        position: { x, y, z: zz },
        sensor_count: z.sensors.length,
        open_issues: 0,
      });
    }

    buildings.push({
      id: buildingId,
      name: b.name,
      code: b.code,
      category: b.category,
      floors: b.floors,
      area_m2: b.area_m2,
      position: { x: b.pos_x, y: 0, z: b.pos_z },
      energy_budget_kw: b.energy_budget_kw,
      zones: campusZones,
    });
  }

  return { buildings, zones, sensors };
}

/** Compose a `/twin/campus` response with live open-issue counts. */
export function campusResponse(topo: CampusTopology, openByZone: Map<number, number>): CampusResponse {
  const buildings = topo.buildings.map((b) => ({
    ...b,
    zones: b.zones.map((z) => ({ ...z, open_issues: openByZone.get(z.id) ?? 0 })),
  }));

  let openTotal = 0;
  openByZone.forEach((count) => {
    openTotal += count;
  });

  return {
    campus: {
      name: "Verdant Institute of Technology",
      buildings: buildings.length,
      zones: topo.zones.length,
      sensors: topo.sensors.length,
      open_issues: openTotal,
    },
    buildings,
  };
}
