import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import type { CampusBuilding, Issue } from "../../api/twin";
import type { BuildingTotals, SensorType } from "../../hooks/useTwinData";
import { STATUS_HEX, STATUS_LABEL, type BuildingStatus } from "../../three/layout";
import { ACCENT_HEX, ISSUE_TYPE_META, SEVERITY_ACCENT, hexA } from "../../theme/palette";
import AnimatedNumber from "../ui/AnimatedNumber";
import { AlertIcon, Glyph, SparkIcon } from "../ui/Icons";

type Series = {
  ts: number[];
  energy: number[];
  water: number[];
  waste: number[];
  occupancy: number[];
} | null;

const METRICS: { key: Exclude<SensorType, never>; label: string; unit: string; decimals: number; hex: string }[] = [
  { key: "energy", label: "Energy", unit: "W", decimals: 0, hex: ACCENT_HEX.amber },
  { key: "water", label: "Water", unit: "L/min", decimals: 1, hex: ACCENT_HEX.mint },
  { key: "waste", label: "Bin fill", unit: "%", decimals: 0, hex: ACCENT_HEX.coral },
  { key: "occupancy", label: "Occupancy", unit: "ppl", decimals: 0, hex: ACCENT_HEX.violet },
];

function MiniChart({ values, hex }: { values: number[]; hex: string }) {
  const data = useMemo(() => values.map((v, i) => ({ i, v })), [values]);
  if (data.length < 2) {
    return (
      <div className="flex h-14 items-center justify-center rounded-lg bg-white/[0.03]">
        <span className="label-mono text-ink-dim/60">awaiting live data…</span>
      </div>
    );
  }
  const id = `g-${hex.slice(1)}`;
  return (
    <div className="h-14 rounded-lg bg-white/[0.03] pr-1">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 0, bottom: 2, left: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={hex} stopOpacity={0.4} />
              <stop offset="100%" stopColor={hex} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={hex}
            strokeWidth={1.6}
            fill={`url(#${id})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

type Props = {
  building: CampusBuilding;
  status: BuildingStatus;
  totals: BuildingTotals;
  series: Series;
  issues: Issue[];
  onClose: () => void;
};

export default function BuildingDetailPanel({ building, status, totals, series, issues, onClose }: Props) {
  const hex = STATUS_HEX[status];
  const [ai, setAi] = useState<{ state: "idle" | "thinking" | "done"; text: string }>({
    state: "idle",
    text: "",
  });

  useEffect(() => {
    setAi({ state: "idle", text: "" });
  }, [building.id]);

  useEffect(() => {
    if (ai.state !== "thinking") return;
    const t = window.setTimeout(() => {
      const critical = issues.filter((i) => i.severity === "high" || i.severity === "critical");
      const lines = [
        `${building.name} is currently ${STATUS_LABEL[status].toLowerCase()} with ${issues.length} open issue${issues.length === 1 ? "" : "s"}.`,
        `Live draw is ${totals.energy.toFixed(0)} W against a ${building.energy_budget_kw.toFixed(0)} kW budget` +
          ` (${((totals.energy / (building.energy_budget_kw * 1000)) * 100).toFixed(1)}% of budget).`,
      ];
      if (critical.length > 0) {
        lines.push(
          `Priority: resolve "${critical[0].title}" in ${critical[0].zone_name ?? "this building"} first — it is the highest-severity signal.`,
        );
      }
      lines.push(
        totals.waste > THRESH_WASTE
          ? "Schedule a collection run: bin fill is above the overflow threshold."
          : "No waste action needed right now.",
      );
      setAi({ state: "done", text: lines.join(" ") });
    }, 900);
    return () => window.clearTimeout(t);
  }, [ai.state, building, issues, status, totals]);

  const ask = () => setAi({ state: "thinking", text: "" });

  return (
    <motion.aside
      key={building.id}
      data-accent={status === "critical" ? "coral" : status === "warning" ? "amber" : "mint"}
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="glass pointer-events-auto absolute inset-y-3 right-3 z-20 flex w-[min(370px,88%)] flex-col overflow-hidden p-0"
    >
      <header className="flex items-start gap-3 border-b border-white/5 px-4 py-3">
        <span
          className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: hex, boxShadow: `0 0 12px ${hex}` }}
        />
        <div className="min-w-0 flex-1">
          <h3 className="font-display truncate text-sm font-semibold text-ink">{building.name}</h3>
          <p className="label-mono mt-1">
            {building.code} · {building.floors} floors · {building.zones.length} zones
          </p>
        </div>
        <span
          className="label-mono shrink-0 rounded-full px-2 py-1"
          style={{ color: hex, background: hexA(hex, 0.14) }}
        >
          {STATUS_LABEL[status]}
        </span>
        <button
          onClick={onClose}
          aria-label="Close"
          className="label-mono -mr-1 rounded-lg px-1.5 py-1 text-ink-dim transition-colors hover:text-ink"
        >
          ✕
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {/* Live totals */}
        <div className="grid grid-cols-2 gap-2">
          {METRICS.map((m) => (
            <div key={m.key} className="rounded-xl bg-white/[0.03] px-3 py-2">
              <div className="label-mono" style={{ color: m.hex }}>
                {m.label}
              </div>
              <div className="mt-1 font-mono text-sm text-ink">
                <AnimatedNumber value={totals[m.key]} decimals={m.decimals} suffix={` ${m.unit}`} duration={0.6} />
              </div>
            </div>
          ))}
        </div>

        {/* Charts */}
        <div className="space-y-2">
          <div className="label-mono text-ink-dim">Live sensor traces</div>
          {METRICS.map((m) => (
            <div key={m.key}>
              <div className="mb-1 flex items-center justify-between">
                <span className="label-mono" style={{ color: m.hex }}>
                  {m.label}
                </span>
                <span className="font-mono text-[11px] text-ink-dim">
                  {totals[m.key].toFixed(m.decimals)} {m.unit}
                </span>
              </div>
              <MiniChart values={series?.[m.key] ?? []} hex={m.hex} />
            </div>
          ))}
        </div>

        {/* Issues */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="label-mono text-ink-dim">Open issues</span>
            <span className="font-mono text-[11px] text-ink-dim">{issues.length}</span>
          </div>
          {issues.length === 0 ? (
            <div className="rounded-xl bg-white/[0.03] px-3 py-4 text-center text-[12px] text-ink-dim">
              All clear — no open issues.
            </div>
          ) : (
            issues.map((issue) => {
              const meta = ISSUE_TYPE_META[issue.type];
              const sev = SEVERITY_ACCENT[issue.severity] ?? "amber";
              const sevHex = ACCENT_HEX[sev];
              return (
                <div
                  key={issue.id}
                  className="rounded-xl border px-3 py-2"
                  style={{ borderColor: hexA(sevHex, 0.22), background: hexA(sevHex, 0.05) }}
                >
                  <div className="flex items-center gap-2">
                    <span style={{ color: ACCENT_HEX[meta?.accent ?? "amber"] }}>
                      <Glyph name={meta?.glyph ?? "gauge"} size={14} />
                    </span>
                    <span className="font-display text-[12.5px] font-semibold text-ink">
                      {issue.title}
                    </span>
                    <span
                      className="label-mono ml-auto rounded-full px-2 py-0.5"
                      style={{ color: sevHex, background: hexA(sevHex, 0.14) }}
                    >
                      {issue.severity}
                    </span>
                  </div>
                  <p className="mt-1 text-[11.5px] leading-snug text-ink-dim">{issue.description}</p>
                  <p className="label-mono mt-1">{issue.zone_name}</p>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Ask AI */}
      <div className="border-t border-white/5 p-3">
        {ai.state === "idle" && (
          <button
            onClick={ask}
            className="label-mono flex w-full items-center justify-center gap-2 rounded-xl py-2.5 transition-transform duration-200 hover:scale-[1.02]"
            style={{ color: "#040b09", background: ACCENT_HEX.mint, boxShadow: `0 0 20px ${hexA(ACCENT_HEX.mint, 0.35)}` }}
          >
            <SparkIcon size={14} />
            Ask AI about this building
          </button>
        )}
        {ai.state === "thinking" && (
          <div className="flex items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-3">
            <span className="h-2 w-2 animate-ping rounded-full" style={{ background: ACCENT_HEX.violet }} />
            <span className="label-mono text-violet">Analysing building signals…</span>
          </div>
        )}
        {ai.state === "done" && (
          <div className="rounded-xl border px-3 py-2.5" style={{ borderColor: hexA(ACCENT_HEX.violet, 0.28), background: hexA(ACCENT_HEX.violet, 0.07) }}>
            <div className="mb-1 flex items-center gap-2">
              <AlertIcon size={13} style={{ color: ACCENT_HEX.violet }} />
              <span className="label-mono text-violet">Gen-AI recommendation</span>
            </div>
            <p className="text-[12px] leading-relaxed text-ink-dim">{ai.text}</p>
            <button onClick={() => setAi({ state: "idle", text: "" })} className="label-mono mt-2 text-ink-dim hover:text-ink">
              Dismiss
            </button>
          </div>
        )}
      </div>
    </motion.aside>
  );
}

const THRESH_WASTE = 90;
