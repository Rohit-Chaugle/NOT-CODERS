import { motion } from "framer-motion";
import type { Recommendation } from "../../api/ai";
import { ACCENT_HEX, hexA } from "../../theme/palette";
import { BoltIcon, DropIcon, WasteIcon, GaugeIcon, SparkIcon } from "../ui/Icons";

type RecommendationCardProps = {
  rec: Recommendation;
  delay?: number;
};

const CATEGORY_ICONS = {
  energy: BoltIcon,
  water: DropIcon,
  waste: WasteIcon,
  efficiency: GaugeIcon,
};

export default function RecommendationCard({ rec, delay = 0 }: RecommendationCardProps) {
  const Icon = CATEGORY_ICONS[rec.category] || SparkIcon;
  const priorityColor =
    rec.priority === "critical" || rec.priority === "high"
      ? ACCENT_HEX.coral
      : rec.priority === "medium"
      ? ACCENT_HEX.amber
      : ACCENT_HEX.mint;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: [0.16, 1, 0.3, 1] }}
      className="glass p-3.5 rounded-xl border border-white/10 hover:border-mint/30 transition-all duration-300 relative group"
    >
      {/* Header: Priority Badge + Category + Location */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          <span
            className="rounded-md p-1"
            style={{
              color: priorityColor,
              backgroundColor: hexA(priorityColor, 0.12),
            }}
          >
            <Icon size={13} />
          </span>
          <span
            className="text-[10px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{
              color: priorityColor,
              backgroundColor: hexA(priorityColor, 0.14),
            }}
          >
            {rec.priority}
          </span>
          {rec.quick_win && (
            <span
              className="text-[9.5px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded text-amber bg-amber/15 border border-amber/30"
              title="Low effort, rapid payoff"
            >
              ⚡ Quick Win
            </span>
          )}
        </div>
        <span className="text-[10px] font-mono text-ink-dim tracking-tight truncate max-w-[120px]">
          {rec.location.zone}
        </span>
      </div>

      {/* Title */}
      <h4 className="font-display text-[13.5px] font-semibold text-ink leading-snug">
        {rec.title}
      </h4>

      {/* Action imperative */}
      <p className="mt-1.5 text-[12px] text-ink-dim leading-relaxed">
        {rec.action}
      </p>

      {/* Savings Badges */}
      <div className="mt-3 flex flex-wrap gap-1.5 pt-2 border-t border-white/5">
        {rec.est_kwh_saved > 0 && (
          <span
            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-mono font-medium text-coral"
            style={{ backgroundColor: hexA(ACCENT_HEX.coral, 0.12) }}
          >
            <BoltIcon size={11} /> {rec.est_kwh_saved} kWh/day
          </span>
        )}
        {rec.est_litres_saved > 0 && (
          <span
            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-mono font-medium text-mint"
            style={{ backgroundColor: hexA(ACCENT_HEX.mint, 0.12) }}
          >
            <DropIcon size={11} /> {rec.est_litres_saved} L/day
          </span>
        )}
        {rec.est_kg_saved > 0 && (
          <span
            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-mono font-medium text-amber"
            style={{ backgroundColor: hexA(ACCENT_HEX.amber, 0.12) }}
          >
            <WasteIcon size={11} /> {rec.est_kg_saved} kg diverted
          </span>
        )}
      </div>

      {/* Location footer */}
      <div className="mt-2 flex items-center justify-between text-[10px] text-ink-dim/80 font-mono">
        <span>📍 {rec.location.building}</span>
        <span className="capitalize">{rec.timeframe}</span>
      </div>
    </motion.div>
  );
}
