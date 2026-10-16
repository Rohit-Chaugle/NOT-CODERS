import { motion } from "framer-motion";
import type { CSSProperties, ReactNode } from "react";
import type { Accent } from "../../theme/palette";
import { ACCENT_HEX, hexA } from "../../theme/palette";

type GlassPanelProps = {
  children: ReactNode;
  accent?: Accent;
  title?: string;
  subtitle?: ReactNode;
  className?: string;
  style?: CSSProperties;
  delay?: number;
  /** Remove inner padding for full-bleed children (charts, tickers). */
  flush?: boolean;
};

/**
 * Floating translucent panel with a glowing accent border — the primary
 * content surface of the Living Campus HUD.
 */
export default function GlassPanel({
  children,
  accent = "mint",
  title,
  subtitle,
  className = "",
  style,
  delay = 0,
  flush = false,
}: GlassPanelProps) {
  const hex = ACCENT_HEX[accent];

  return (
    <motion.section
      data-accent={accent}
      initial={{ opacity: 0, y: 24, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay }}
      className={`glass relative ${flush ? "p-0" : "p-4"} ${className}`}
      style={
        {
          "--accent": hex,
          "--accent-soft": hexA(hex, 0.14),
          "--accent-border": hexA(hex, 0.35),
          ...style,
        } as CSSProperties
      }
    >
      {(title || subtitle) && (
        <header className={`flex items-baseline justify-between gap-3 ${flush ? "px-4 pt-4" : "mb-3"}`}>
          <div className="min-w-0">
            {title && (
              <h2 className="font-display truncate text-sm font-semibold tracking-wide text-ink">
                {title}
              </h2>
            )}
            {subtitle && <p className="label-mono mt-1 truncate">{subtitle}</p>}
          </div>
        </header>
      )}
      {children}
    </motion.section>
  );
}
