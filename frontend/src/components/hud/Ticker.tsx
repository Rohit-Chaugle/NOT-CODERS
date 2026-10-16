import { motion } from "framer-motion";
import { ACCENT_HEX, hexA } from "../../theme/palette";
import { MOCK_TICKER } from "../../data/mock";

/**
 * Bottom sensor ticker — an infinite marquee of live events.
 */
export default function Ticker() {
  const rows = [...MOCK_TICKER, ...MOCK_TICKER];

  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.45 }}
      className="glass overflow-hidden px-0 py-2"
      style={{ "--accent": ACCENT_HEX.mint } as React.CSSProperties}
    >
      <div className="marquee-track flex w-max items-center gap-8">
        {rows.map((row, i) => (
          <div key={i} className="flex shrink-0 items-center gap-2">
            <span className="label-mono opacity-50">{row.time}</span>
            <span
              className="label-mono rounded px-1.5 py-0.5"
              style={{
                color: ACCENT_HEX[row.accent],
                background: hexA(ACCENT_HEX[row.accent], 0.12),
              }}
            >
              {row.kind}
            </span>
            <span className="font-mono text-[11px] text-ink-dim">{row.text}</span>
            <span className="opacity-30" style={{ color: ACCENT_HEX.mint }}>
              ✦
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
