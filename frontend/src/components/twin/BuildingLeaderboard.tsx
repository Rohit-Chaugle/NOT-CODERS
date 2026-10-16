import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { fetchLeaderboard, type BuildingRankItem } from "../../api/twin";
import { Skeleton, EmptyState, ErrorBanner } from "../ui/FeedbackStates";
import { ACCENT_HEX, hexA } from "../../theme/palette";
import { BoltIcon, DropIcon, WasteIcon, SparkIcon } from "../ui/Icons";

export default function BuildingLeaderboard() {
  const [items, setItems] = useState<BuildingRankItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchLeaderboard();
      setItems(res.leaderboard);
    } catch (e: any) {
      setError(e.message || "Failed to load building leaderboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 12000); // refresh periodically to capture rank shifts
    return () => clearInterval(interval);
  }, []);

  if (loading && items.length === 0) {
    return (
      <div className="space-y-2.5 p-4 glass rounded-2xl border border-white/10">
        <Skeleton className="h-6 w-48 mb-3" />
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (error && items.length === 0) {
    return <ErrorBanner message={error} onRetry={loadData} />;
  }

  if (items.length === 0) {
    return <EmptyState title="No buildings found" description="Campus topology contains no active building records." />;
  }

  return (
    <div className="glass p-5 rounded-2xl border border-white/10 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="p-1.5 rounded-lg bg-mint/15 text-mint">
            <SparkIcon size={16} />
          </span>
          <div>
            <h3 className="font-display text-base font-bold text-ink">
              Campus Sustainability Leaderboard
            </h3>
            <p className="text-xs text-ink-dim">
              Live ranking of facilities by Green Score efficiency, resource stewardship, and active issues.
            </p>
          </div>
        </div>

        <button
          onClick={loadData}
          className="text-xs font-mono text-mint hover:underline self-start sm:self-auto cursor-pointer"
        >
          ↻ Refresh Ranks
        </button>
      </div>

      {/* Leaderboard Table / Cards */}
      <div className="space-y-2">
        <AnimatePresence>
          {items.map((b) => {
            const gradeColor =
              b.score >= 80 ? ACCENT_HEX.mint : b.score >= 60 ? ACCENT_HEX.amber : ACCENT_HEX.coral;

            return (
              <motion.div
                key={b.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{
                  layout: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
                  duration: 0.3,
                }}
                className="p-3.5 rounded-xl glass border border-white/10 hover:border-mint/30 transition-all flex flex-col md:flex-row md:items-center justify-between gap-3 bg-black/25"
              >
                {/* Left: Rank & Building Identity */}
                <div className="flex items-center gap-3.5">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono text-xs font-bold ${
                      b.rank === 1
                        ? "bg-mint text-abyss shadow-[0_0_12px_#5cffb1]"
                        : b.rank === 2
                        ? "bg-white/20 text-ink font-semibold"
                        : b.rank === 3
                        ? "bg-amber/25 text-amber"
                        : "bg-white/5 text-ink-dim"
                    }`}
                  >
                    #{b.rank}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-display text-sm font-bold text-ink">{b.name}</span>
                      <span className="text-[10px] font-mono text-ink-dim uppercase px-1.5 py-0.5 rounded bg-white/5">
                        {b.code}
                      </span>
                    </div>
                    <div className="text-[11px] text-ink-dim flex items-center gap-3 mt-0.5 font-mono">
                      <span>{b.category}</span>
                      <span>·</span>
                      <span>{b.floors} floors</span>
                      <span>·</span>
                      <span className={b.open_issues_count > 0 ? "text-coral" : "text-mint"}>
                        {b.open_issues_count} open issues
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: Metrics & Score Badge */}
                <div className="flex items-center justify-between md:justify-end gap-5 pt-2 md:pt-0 border-t md:border-t-0 border-white/5">
                  {/* Mini resource pills */}
                  <div className="flex items-center gap-3 text-xs font-mono">
                    <span className="flex items-center gap-1 text-coral" title="Live Load vs Budget">
                      <BoltIcon size={12} /> {b.energy_kw} kW
                    </span>
                    <span className="flex items-center gap-1 text-mint" title="Live Water Flow">
                      <DropIcon size={12} /> {b.water_lpm} L/min
                    </span>
                    <span className="flex items-center gap-1 text-amber" title="Average Waste Bin Fill">
                      <WasteIcon size={12} /> {b.avg_waste_pct}%
                    </span>
                  </div>

                  {/* Green Score Badge */}
                  <div className="flex items-center gap-2 pl-3 border-l border-white/10">
                    <div className="text-right">
                      <div className="text-xs font-mono font-bold" style={{ color: gradeColor }}>
                        {b.score}/100
                      </div>
                      <div className="text-[9.5px] font-mono text-ink-dim uppercase">
                        {b.status}
                      </div>
                    </div>
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center font-display font-bold text-xs"
                      style={{
                        backgroundColor: hexA(gradeColor, 0.18),
                        color: gradeColor,
                        border: `1px solid ${hexA(gradeColor, 0.4)}`,
                      }}
                    >
                      {b.grade}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
