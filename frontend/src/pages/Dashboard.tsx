import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import BuildingLeaderboard from "../components/twin/BuildingLeaderboard";
import { fetchReport, type SustainabilityReport } from "../api/ai";
import GreenScoreRing from "../components/copilot/GreenScoreRing";
import { SparkIcon, BoltIcon, DropIcon, WasteIcon } from "../components/ui/Icons";
import { Skeleton, ErrorBanner } from "../components/ui/FeedbackStates";

export default function Dashboard() {
  const [report, setReport] = useState<SustainabilityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const rep = await fetchReport();
      setReport(rep);
    } catch (e: any) {
      setError(e.message || "Failed to load campus dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="h-full min-h-0 overflow-y-auto pr-1 space-y-4">
      {/* Welcome Banner */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass p-5 rounded-2xl border border-white/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
      >
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1 rounded-md bg-mint/20 text-mint">
              <SparkIcon size={14} />
            </span>
            <span className="label-mono text-mint">Live Operations · Overview</span>
          </div>
          <h1 className="font-display text-2xl font-bold text-ink">
            Verdant Twin Executive Dashboard
          </h1>
          <p className="text-xs text-ink-dim mt-1 max-w-xl">
            Real-time digital twin telemetry, building sustainability rankings, and autonomous multi-agent recommendations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/twin"
            className="px-3.5 py-2 rounded-xl border border-white/20 text-xs font-mono text-ink hover:bg-white/10 transition-colors"
          >
            Explore 3D Twin →
          </Link>
          <Link
            to="/reports"
            className="px-3.5 py-2 rounded-xl bg-mint text-abyss text-xs font-mono font-bold hover:bg-mint/90 transition-all shadow-[0_0_15px_rgba(92,255,177,0.3)]"
          >
            Sustainability Report →
          </Link>
        </div>
      </motion.div>

      {error && <ErrorBanner message={error} onRetry={loadData} />}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5">
        {loading && !report ? (
          [1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28" />)
        ) : report ? (
          <>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="glass p-4 rounded-xl border border-white/10 relative overflow-hidden"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="label-mono text-coral flex items-center gap-1">
                  <BoltIcon size={12} /> Live Load
                </span>
                <span className="text-[10px] font-mono text-ink-dim">
                  Budget: {report.metrics.energy_budget_kw} kW
                </span>
              </div>
              <div className="font-mono text-2xl font-bold text-ink">
                {report.metrics.energy_current_kw} <span className="text-sm font-normal text-ink-dim">kW</span>
              </div>
              <div className="text-[11px] text-ink-dim mt-1">
                Consumed today: <span className="text-ink font-mono font-medium">{report.metrics.energy_today_kwh} kWh</span>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="glass p-4 rounded-xl border border-white/10 relative overflow-hidden"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="label-mono text-mint flex items-center gap-1">
                  <DropIcon size={12} /> Water Flow
                </span>
                <span className="text-[10px] font-mono text-ink-dim">Continuous</span>
              </div>
              <div className="font-mono text-2xl font-bold text-ink">
                {report.metrics.water_current_lpm} <span className="text-sm font-normal text-ink-dim">L/min</span>
              </div>
              <div className="text-[11px] text-ink-dim mt-1">
                Used today: <span className="text-ink font-mono font-medium">{report.metrics.water_today_liters} L</span>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="glass p-4 rounded-xl border border-white/10 relative overflow-hidden"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="label-mono text-amber flex items-center gap-1">
                  <WasteIcon size={12} /> Avg Bin Fill
                </span>
                <span className="text-[10px] font-mono text-ink-dim">
                  {report.metrics.waste_overflow_bins} overflowing
                </span>
              </div>
              <div className="font-mono text-2xl font-bold text-ink">
                {report.metrics.waste_avg_fill_pct}%
              </div>
              <div className="text-[11px] text-ink-dim mt-1">
                Recycling diversion on schedule
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="glass p-4 rounded-xl border border-white/10 relative overflow-hidden"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="label-mono text-violet">Open Issues</span>
                <span className="text-[10px] font-mono text-mint">
                  +{report.metrics.issues_resolved_24h} resolved (24h)
                </span>
              </div>
              <div className="font-mono text-2xl font-bold text-coral">
                {report.metrics.issues_open}
              </div>
              <div className="text-[11px] text-ink-dim mt-1">
                Total resolved: <span className="text-ink font-mono font-medium">{report.metrics.issues_resolved}</span>
              </div>
            </motion.div>
          </>
        ) : null}
      </div>

      {/* Middle Grid: Campus Green Score Pulse + Sustainability Leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Score Ring Pulse */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass p-5 rounded-2xl border border-white/10 flex flex-col items-center justify-center text-center"
        >
          <span className="label-mono text-ink-dim mb-3">Campus Sustainability Pulse</span>
          {report ? (
            <GreenScoreRing scoreData={report.green_score} size={150} strokeWidth={10} showBreakdown={true} />
          ) : (
            <Skeleton className="h-36 w-36 rounded-full" />
          )}
        </motion.div>

        {/* Building Sustainability Leaderboard */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="lg:col-span-2"
        >
          <BuildingLeaderboard />
        </motion.div>
      </div>
    </div>
  );
}
