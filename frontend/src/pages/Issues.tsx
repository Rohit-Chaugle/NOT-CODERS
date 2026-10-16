import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useIssues } from "../hooks/useIssues";
import { resolveIssue, type Issue } from "../api/twin";
import { useToast } from "../components/ui/Toast";
import { Skeleton, EmptyState, ErrorBanner } from "../components/ui/FeedbackStates";
import { BoltIcon, DropIcon, WasteIcon, GaugeIcon, SparkIcon } from "../components/ui/Icons";
import { ACCENT_HEX, hexA } from "../theme/palette";

export default function Issues() {
  const { issues, loading, error } = useIssues();
  const { addToast } = useToast();
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [resolvingId, setResolvingId] = useState<number | null>(null);

  const filteredIssues = useMemo(() => {
    return issues.filter((i) => {
      if (filterSeverity !== "all" && i.severity !== filterSeverity) return false;
      if (filterCategory !== "all" && i.type !== filterCategory) return false;
      return true;
    });
  }, [issues, filterSeverity, filterCategory]);

  const handleResolve = async (issue: Issue) => {
    try {
      setResolvingId(issue.id);
      await resolveIssue(issue.id);
      addToast({
        type: "success",
        title: "Issue Resolved",
        message: `${issue.title} in ${issue.zone_name || "campus"} marked resolved.`,
      });
    } catch (e: any) {
      addToast({
        type: "alert",
        title: "Action Failed",
        message: e.message || "Failed to resolve issue.",
      });
    } finally {
      setResolvingId(null);
    }
  };

  const CATEGORY_ICONS: Record<string, any> = {
    energy_wastage: BoltIcon,
    water_leakage: DropIcon,
    waste_accumulation: WasteIcon,
    inefficient_usage: GaugeIcon,
  };

  return (
    <div className="h-full min-h-0 overflow-y-auto pr-1 space-y-4">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass p-5 rounded-2xl border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4"
      >
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1 rounded-md bg-coral/20 text-coral">
              <SparkIcon size={14} />
            </span>
            <span className="label-mono text-coral">Live Triage Board</span>
          </div>
          <h1 className="font-display text-2xl font-bold text-ink">
            Campus Issues & Operational Signals
          </h1>
          <p className="text-xs text-ink-dim mt-1 max-w-xl">
            Autonomous anomaly detections fused across IoT sensor telemetry and computer vision cameras.
          </p>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Severity filter */}
          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value)}
            className="bg-black/50 border border-white/15 text-ink text-xs rounded-xl px-3 py-2 outline-none cursor-pointer font-mono"
          >
            <option value="all">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          {/* Category filter */}
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="bg-black/50 border border-white/15 text-ink text-xs rounded-xl px-3 py-2 outline-none cursor-pointer font-mono"
          >
            <option value="all">All Types</option>
            <option value="energy_wastage">Energy Wastage</option>
            <option value="water_leakage">Water Leakage</option>
            <option value="waste_accumulation">Waste Overflow</option>
            <option value="inefficient_usage">Inefficient Use</option>
          </select>
        </div>
      </motion.div>

      {error && <ErrorBanner message={error} />}

      {/* Issues Grid */}
      {loading && issues.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : filteredIssues.length === 0 ? (
        <EmptyState
          title="No open issues matching filters"
          description="Either no anomalies match your criteria or all reported issues in this domain have been resolved."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <AnimatePresence>
            {filteredIssues.map((issue) => {
              const Icon = CATEGORY_ICONS[issue.type] || SparkIcon;
              const severityColor =
                issue.severity === "critical" || issue.severity === "high"
                  ? ACCENT_HEX.coral
                  : issue.severity === "medium"
                  ? ACCENT_HEX.amber
                  : ACCENT_HEX.mint;

              return (
                <motion.div
                  key={issue.id}
                  layout
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.94 }}
                  transition={{ duration: 0.25 }}
                  className="glass p-4 rounded-xl border border-white/10 hover:border-mint/30 transition-all flex flex-col justify-between gap-3 bg-black/25"
                >
                  <div>
                    {/* Top row badges */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="p-1 rounded-md"
                          style={{
                            color: severityColor,
                            backgroundColor: hexA(severityColor, 0.12),
                          }}
                        >
                          <Icon size={12} />
                        </span>
                        <span
                          className="text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded"
                          style={{
                            color: severityColor,
                            backgroundColor: hexA(severityColor, 0.15),
                          }}
                        >
                          {issue.severity}
                        </span>
                        <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-white/5 text-ink-dim">
                          {issue.source}
                        </span>
                      </div>

                      <span className="text-[10.5px] font-mono text-ink-dim">
                        #{issue.id}
                      </span>
                    </div>

                    {/* Title & Desc */}
                    <h3 className="font-display text-sm font-bold text-ink leading-snug">
                      {issue.title}
                    </h3>
                    <p className="text-xs text-ink-dim mt-1.5 leading-relaxed line-clamp-2">
                      {issue.description}
                    </p>
                  </div>

                  {/* Location & Action row */}
                  <div className="flex items-center justify-between pt-3 border-t border-white/5">
                    <div className="text-[11px] font-mono text-ink-dim">
                      <span>📍 {issue.zone_name || "Zone"}</span>
                      {issue.building_name && <span className="opacity-70"> · {issue.building_name}</span>}
                    </div>

                    <button
                      onClick={() => handleResolve(issue)}
                      disabled={resolvingId === issue.id}
                      className="px-3 py-1 rounded-lg border border-mint/40 text-mint hover:bg-mint/15 font-mono text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {resolvingId === issue.id ? (
                        <>
                          <span className="w-2.5 h-2.5 border-2 border-mint border-t-transparent rounded-full animate-spin" />
                          <span>Closing...</span>
                        </>
                      ) : (
                        <span>✓ Resolve</span>
                      )}
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
