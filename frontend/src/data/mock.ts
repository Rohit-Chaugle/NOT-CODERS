/** Mock data used until the API is wired up (M5). */

export type Severity = "low" | "medium" | "high" | "critical";

export type MockIssue = {
  id: number;
  type: "waste_accumulation" | "energy_wastage" | "water_leakage" | "inefficient_usage" | "occupancy_spike";
  severity: Severity;
  zone: string;
  building: string;
  source: "sensor" | "vision";
  age: string;
  value: string;
  summary: string;
};

export const MOCK_ISSUES: MockIssue[] = [
  {
    id: 41,
    type: "energy_wastage",
    severity: "critical",
    zone: "Admin Office",
    building: "Administration Block",
    source: "sensor",
    age: "4m",
    value: "2.4 kW @ 0 occ",
    summary: "HVAC still drawing 2.4 kW at 01:40 with the floor empty.",
  },
  {
    id: 40,
    type: "water_leakage",
    severity: "high",
    zone: "Chemistry Lab",
    building: "Science Labs",
    source: "sensor",
    age: "12m",
    value: "14.2 L/min flat",
    summary: "Constant night flow for 40 min — fixture or pipe leak.",
  },
  {
    id: 39,
    type: "waste_accumulation",
    severity: "high",
    zone: "Dining Hall",
    building: "Central Canteen",
    source: "vision",
    age: "27m",
    value: "96% bin fill",
    summary: "Bin overflow detected by ceiling camera, aisle 2.",
  },
  {
    id: 38,
    type: "inefficient_usage",
    severity: "medium",
    zone: "Computer Lab",
    building: "Science Labs",
    source: "sensor",
    age: "1h",
    value: "3.1× peer avg",
    summary: "Draws 3.1× the average of comparable lab zones.",
  },
  {
    id: 37,
    type: "occupancy_spike",
    severity: "low",
    zone: "Reading Hall",
    building: "Central Library",
    source: "vision",
    age: "2h",
    value: "118 / 120 seats",
    summary: "Near capacity — consider overflow lighting rule.",
  },
  {
    id: 36,
    type: "waste_accumulation",
    severity: "medium",
    zone: "Hostel Mess",
    building: "Student Hostel",
    source: "vision",
    age: "3h",
    value: "88% bin fill",
    summary: "Collection due before morning breakfast service.",
  },
];

export type Insight = {
  id: number;
  accent: "mint" | "amber" | "coral" | "violet";
  label: string;
  headline: string;
  body: string;
  impact: string;
};

export const MOCK_INSIGHTS: Insight[] = [
  {
    id: 1,
    accent: "violet",
    label: "Gen-AI · nightly brief",
    headline: "Shift 3 zones to 02:00–05:00 setback",
    body:
      "Energy signatures show Admin Block and two lab zones idling at day-time load after 21:00. An automated setback schedule would cut base load without touching occupied hours.",
    impact: "−186 kWh / week",
  },
  {
    id: 2,
    accent: "mint",
    label: "Gen-AI · water",
    headline: "Chemistry Lab leak precedes a fixture fault",
    body:
      "The flat 14.2 L/min night flow pattern matches a stuck ball valve seen in Zone LAB-02 last semester. Dispatch maintenance before the morning shift.",
    impact: "≈ 5.1k L / week",
  },
  {
    id: 3,
    accent: "amber",
    label: "Gen-AI · waste",
    headline: "Move canteen collection 40 minutes earlier",
    body:
      "Two overflow events this week both landed between 20:10–20:50, right after the dinner rush. An earlier pickup clears the bin before camera detection triggers.",
    impact: "−64% overflow flags",
  },
];

export type Stat = {
  id: string;
  label: string;
  value: number;
  decimals: number;
  suffix?: string;
  prefix?: string;
  accent: "mint" | "amber" | "coral" | "violet";
  trend: number;
};

export const MOCK_STATS: Stat[] = [
  { id: "energy", label: "Energy now", value: 412.6, decimals: 1, suffix: " kW", accent: "amber", trend: -6.4 },
  { id: "water", label: "Water now", value: 86.2, decimals: 1, suffix: " L/m", accent: "mint", trend: -2.1 },
  { id: "waste", label: "Bin overflow", value: 3, decimals: 0, suffix: "/9", accent: "coral", trend: 12 },
  { id: "score", label: "Eco score", value: 78, decimals: 0, suffix: "%", accent: "violet", trend: 4.5 },
];

export type TickerRow = { time: string; kind: string; text: string; accent: "mint" | "amber" | "coral" | "violet" };

export const MOCK_TICKER: TickerRow[] = [
  { time: "01:42", kind: "SIM", text: "tick 56/56 sensors online", accent: "mint" },
  { time: "01:41", kind: "SENSOR", text: "ADM · Admin Office · 2.4 kW @ 0 occupancy", accent: "coral" },
  { time: "01:41", kind: "VISION", text: "CAN · Dining Hall · bin fill 96% (cam-2)", accent: "amber" },
  { time: "01:40", kind: "DETECT", text: "water_leakage · LAB-02 · constant 14.2 L/min", accent: "mint" },
  { time: "01:39", kind: "SENSOR", text: "SPT · Pool pumps · 118 kW baseline", accent: "violet" },
  { time: "01:38", kind: "DETECT", text: "inefficient_usage · CS Lab · 3.1× peer avg", accent: "violet" },
  { time: "01:37", kind: "SIM", text: "anomaly: energy_spike injected @ ADM", accent: "coral" },
  { time: "01:36", kind: "SENSOR", text: "HOS · Mess · 0.4 L/min (baseline)", accent: "mint" },
];

/** 24h mini series for the insight sparkline. */
export const MOCK_LOAD_SERIES = [
  { h: "00", v: 380 }, { h: "02", v: 402 }, { h: "04", v: 366 }, { h: "06", v: 310 },
  { h: "08", v: 512 }, { h: "10", v: 688 }, { h: "12", v: 742 }, { h: "14", v: 716 },
  { h: "16", v: 704 }, { h: "18", v: 622 }, { h: "20", v: 508 }, { h: "22", v: 428 },
];

/** Building footprints for the R3D background scene (x, z, w, d, h). */
export const MOCK_BUILDINGS = [
  { id: "LIB", name: "Central Library", x: -14, z: -8, w: 12, d: 9, h: 7 },
  { id: "HOS", name: "Student Hostel", x: -18, z: 12, w: 9, d: 14, h: 11 },
  { id: "CAN", name: "Central Canteen", x: 2, z: 14, w: 11, d: 8, h: 5 },
  { id: "LAB", name: "Science Labs", x: 4, z: -12, w: 13, d: 9, h: 8 },
  { id: "ADM", name: "Admin Block", x: 18, z: -2, w: 9, d: 9, h: 6 },
  { id: "SPT", name: "Sports Complex", x: 22, z: 16, w: 14, d: 10, h: 5 },
];
