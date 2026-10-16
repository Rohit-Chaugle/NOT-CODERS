import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import GlassPanel from "../ui/GlassPanel";
import { SparkIcon } from "../ui/Icons";
import { ACCENT_HEX, hexA } from "../../theme/palette";
import { MOCK_INSIGHTS, MOCK_LOAD_SERIES } from "../../data/mock";

/** Right floating Gen-AI insight panel with rotating recommendations. */
export default function InsightPanel() {
  const [index, setIndex] = useState(0);
  const insight = MOCK_INSIGHTS[index];
  const hex = ACCENT_HEX[insight.accent];

  const next = () => setIndex((i) => (i + 1) % MOCK_INSIGHTS.length);

  const max = Math.max(...MOCK_LOAD_SERIES.map((p) => p.v));
  const min = Math.min(...MOCK_LOAD_SERIES.map((p) => p.v));
  const points = MOCK_LOAD_SERIES.map((p, i) => {
    const x = (i / (MOCK_LOAD_SERIES.length - 1)) * 100;
    const y = 28 - ((p.v - min) / (max - min || 1)) * 24;
    return `${x},${y}`;
  }).join(" ");

  return (
    <GlassPanel
      title="Gen-AI insights"
      subtitle="nightly brief · campus scale"
      accent={insight.accent}
      className="flex max-h-full min-h-0 flex-col"
      delay={0.35}
    >
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={insight.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="mb-2 flex items-center gap-2">
              <span
                className="rounded-lg p-1.5"
                style={{ color: hex, background: hexA(hex, 0.14) }}
              >
                <SparkIcon size={14} />
              </span>
              <span className="label-mono" style={{ color: hex }}>
                {insight.label}
              </span>
            </div>

            <h3 className="font-display text-[15px] font-semibold leading-snug text-ink">
              {insight.headline}
            </h3>
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-dim">
              {insight.body}
            </p>

            {/* Load sparkline */}
            <svg
              viewBox="0 0 100 30"
              preserveAspectRatio="none"
              className="mt-3 h-12 w-full"
              aria-hidden
            >
              <defs>
                <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={hex} stopOpacity="0.35" />
                  <stop offset="100%" stopColor={hex} stopOpacity="0" />
                </linearGradient>
              </defs>
              <polygon points={`0,30 ${points} 100,30`} fill="url(#spark-fill)" />
              <polyline
                points={points}
                fill="none"
                stroke={hex}
                strokeWidth="1.4"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>

            <div
              className="mt-2 rounded-xl px-3 py-2 font-mono text-[13px] font-medium"
              style={{ color: hex, background: hexA(hex, 0.1) }}
            >
              est. impact · {insight.impact}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <button
        onClick={next}
        className="label-mono mt-3 w-full rounded-xl border py-2 transition-colors duration-200"
        style={{
          color: hex,
          borderColor: hexA(hex, 0.3),
          background: hexA(hex, 0.06),
        }}
      >
        Next insight →
      </button>
    </GlassPanel>
  );
}
