import { motion } from "framer-motion";
import type { GreenScore } from "../../api/ai";
import { ACCENT_HEX, hexA } from "../../theme/palette";

type GreenScoreRingProps = {
  scoreData?: GreenScore | null;
  size?: number;
  strokeWidth?: number;
  showBreakdown?: boolean;
};

export default function GreenScoreRing({
  scoreData,
  size = 130,
  strokeWidth = 9,
  showBreakdown = false,
}: GreenScoreRingProps) {
  const score = scoreData?.score ?? 78;
  const grade = scoreData?.grade ?? "B";
  const label = scoreData?.label ?? "Healthy";

  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  const accentColor =
    score >= 80 ? ACCENT_HEX.mint : score >= 60 ? ACCENT_HEX.amber : ACCENT_HEX.coral;

  return (
    <div className="flex flex-col items-center">
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke="rgba(255, 255, 255, 0.08)"
            strokeWidth={strokeWidth}
          />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke={accentColor}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
            strokeLinecap="round"
            style={{
              filter: `drop-shadow(0 0 10px ${hexA(accentColor, 0.65)})`,
            }}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <div className="font-display font-bold leading-none tracking-tight text-ink" style={{ fontSize: size * 0.28 }}>
            {score}
          </div>
          <div className="label-mono mt-1 text-[10px] tracking-widest text-ink-dim">
            / 100
          </div>
          <div
            className="mt-1 rounded-full px-2 py-0.5 text-[10px] font-mono font-semibold"
            style={{
              color: accentColor,
              backgroundColor: hexA(accentColor, 0.15),
              border: `1px solid ${hexA(accentColor, 0.3)}`,
            }}
          >
            {grade} · {label}
          </div>
        </div>
      </div>

      {showBreakdown && scoreData?.components && (
        <div className="mt-4 w-full space-y-2">
          {scoreData.components.map((c) => {
            const compColor =
              c.score >= 80 ? ACCENT_HEX.mint : c.score >= 60 ? ACCENT_HEX.amber : ACCENT_HEX.coral;
            return (
              <div key={c.key} className="text-xs">
                <div className="flex justify-between items-center text-ink-dim mb-1">
                  <span>{c.label}</span>
                  <span className="font-mono font-medium" style={{ color: compColor }}>
                    {c.score}/100
                  </span>
                </div>
                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: compColor }}
                    initial={{ width: 0 }}
                    animate={{ width: `${c.score}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
