import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import Logo from "../brand/Logo";
import { NAV_ITEMS } from "../../theme/navigation";
import { MOCK_STATS } from "../../data/mock";
import AnimatedNumber from "../ui/AnimatedNumber";
import { ACCENT_HEX, hexA } from "../../theme/palette";
import DemoModeButton from "./DemoModeButton";

/** Floating top HUD: brand, navigation pills and live stat readouts. */
export default function TopHud() {
  return (
    <motion.header
      initial={{ opacity: 0, y: -28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className="glass flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3"
      style={{ "--accent": ACCENT_HEX.mint } as React.CSSProperties}
    >
      <Logo size={36} showWordmark={false} />

      {/* Wordmark hidden on very small screens */}
      <div className="hidden leading-none sm:block">
        <div className="font-display text-base font-bold tracking-tight text-ink">
          Verdant<span className="text-mint glow-mint">Twin</span>
        </div>
        <div className="label-mono mt-1">Living Campus</div>
      </div>

      <nav className="order-3 flex w-full items-center gap-1 overflow-x-auto md:order-none md:mx-auto md:w-auto md:overflow-visible">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `label-mono shrink-0 rounded-full px-3 py-1.5 transition-colors duration-200 ${
                isActive
                  ? "text-abyss"
                  : "text-ink-dim hover:text-ink"
              }`
            }
            style={({ isActive }) =>
              isActive
                ? {
                    background: hexA(ACCENT_HEX.mint, 0.9),
                    boxShadow: `0 0 18px ${hexA(ACCENT_HEX.mint, 0.45)}`,
                  }
                : undefined
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-4 md:ml-0">
        {MOCK_STATS.slice(0, 3).map((s) => (
          <div key={s.id} className="hidden text-right lg:block">
            <div
              className="font-mono text-sm font-medium tabular-nums"
              style={{ color: ACCENT_HEX[s.accent] }}
            >
              <AnimatedNumber
                value={s.value}
                decimals={s.decimals}
                suffix={s.suffix}
              />
            </div>
            <div className="label-mono">{s.label}</div>
          </div>
        ))}
        <DemoModeButton />
        <div className="flex items-center gap-2">
          <span className="live-dot" style={{ background: ACCENT_HEX.mint }} />
          <span className="label-mono">LIVE</span>
        </div>
      </div>
    </motion.header>
  );
}
