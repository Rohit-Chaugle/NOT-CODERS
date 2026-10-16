/** Living Campus color tokens — the single source of truth in TS. */

export const COLORS = {
  abyss: "#040b09",
  mint: "#5CFFB1",
  amber: "#FFB84D",
  coral: "#FF5C6C",
  violet: "#8B5CFF",
  ink: "#d8efe4",
} as const;

export type Accent = "mint" | "amber" | "coral" | "violet";

export const SEVERITY_ACCENT: Record<string, Accent> = {
  low: "mint",
  medium: "amber",
  high: "coral",
  critical: "coral",
};

export const ISSUE_TYPE_META: Record<string, { label: string; accent: Accent; glyph: string }> = {
  waste_accumulation: { label: "Waste accumulation", accent: "amber", glyph: "waste" },
  energy_wastage: { label: "Energy wastage", accent: "coral", glyph: "energy" },
  water_leakage: { label: "Water leakage", accent: "mint", glyph: "water" },
  inefficient_usage: { label: "Inefficient use", accent: "violet", glyph: "gauge" },
  occupancy_spike: { label: "Occupancy spike", accent: "violet", glyph: "people" },
};

export const ACCENT_HEX: Record<Accent, string> = {
  mint: COLORS.mint,
  amber: COLORS.amber,
  coral: COLORS.coral,
  violet: COLORS.violet,
};

export function hexA(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
