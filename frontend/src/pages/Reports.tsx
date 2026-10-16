import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { fetchReport, downloadReportPdf, type SustainabilityReport } from "../api/ai";
import GreenScoreRing from "../components/copilot/GreenScoreRing";
import RecommendationCard from "../components/copilot/RecommendationCard";
import ReportModal from "../components/copilot/ReportModal";
import { SparkIcon, BoltIcon, DropIcon, WasteIcon } from "../components/ui/Icons";

export default function Reports() {
  const [report, setReport] = useState<SustainabilityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    loadReport();
  }, []);

  const loadReport = async () => {
    try {
      setLoading(true);
      const data = await fetchReport();
      setReport(data);
    } catch (e) {
      console.error("Failed to load sustainability report:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPdf = async () => {
    try {
      setDownloading(true);
      await downloadReportPdf();
    } catch (e) {
      console.error("PDF download failed:", e);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="h-full min-h-0 overflow-y-auto pr-1 space-y-4">
      {/* Top Banner */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass p-5 rounded-2xl border border-white/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
      >
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="p-1.5 rounded-lg bg-mint/15 text-mint">
              <SparkIcon size={16} />
            </span>
            <span className="label-mono text-mint">Generative AI Layer · Milestone M4</span>
          </div>
          <h1 className="font-display text-2xl font-bold text-ink">
            Campus Sustainability & Green Score
          </h1>
          <p className="text-xs text-ink-dim mt-1 max-w-xl">
            Autonomous multi-domain intelligence aggregating real-time energy draws, constant water flows,
            and waste sensor telemetry into actionable operational recommendations.
          </p>
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto">
          <button
            onClick={() => setIsModalOpen(true)}
            disabled={!report || loading}
            className="flex-1 md:flex-none px-4 py-2.5 rounded-xl border border-white/20 text-xs font-mono text-ink hover:bg-white/10 transition-colors cursor-pointer"
          >
            Report Preview & Markdown
          </button>
          <button
            onClick={handleDownloadPdf}
            disabled={downloading || !report || loading}
            className="flex-1 md:flex-none px-4 py-2.5 rounded-xl bg-mint text-abyss font-mono text-xs font-bold hover:bg-mint/90 transition-all shadow-[0_0_20px_rgba(92,255,177,0.35)] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {downloading ? (
              <>
                <span className="w-3 h-3 border-2 border-abyss border-t-transparent rounded-full animate-spin" />
                <span>Exporting...</span>
              </>
            ) : (
              <>
                <span>📄</span>
                <span>Download PDF</span>
              </>
            )}
          </button>
        </div>
      </motion.div>

      {/* Main Grid: Green Score Ring Card + Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Green Score Ring */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass p-5 rounded-2xl border border-white/10 flex flex-col items-center justify-center text-center"
        >
          <span className="label-mono text-ink-dim mb-3">Overall Campus Green Score</span>
          <GreenScoreRing scoreData={report?.green_score} size={160} strokeWidth={11} showBreakdown={true} />
        </motion.div>

        {/* Right: Key Resource Metrics & Trends */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="lg:col-span-2 glass p-5 rounded-2xl border border-white/10 flex flex-col justify-between"
        >
          <div>
            <div className="flex justify-between items-center mb-4">
              <span className="label-mono">Campus Resource Metrics (Live vs Target)</span>
              <span className="text-[11px] font-mono text-ink-dim">
                Engine: {report?.provider.name} ({report?.provider.model || "template"})
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-xl bg-black/40 border border-white/5">
                <div className="flex items-center gap-1.5 text-coral text-xs mb-1">
                  <BoltIcon size={13} /> Live Load
                </div>
                <div className="font-mono text-xl font-bold text-ink">
                  {report?.metrics.energy_current_kw ?? "—"} <span className="text-xs font-normal text-ink-dim">kW</span>
                </div>
                <div className="text-[11px] text-ink-dim mt-1">
                  Budget: {report?.metrics.energy_budget_kw ?? "—"} kW
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-black/40 border border-white/5">
                <div className="flex items-center gap-1.5 text-mint text-xs mb-1">
                  <DropIcon size={13} /> Live Water Flow
                </div>
                <div className="font-mono text-xl font-bold text-ink">
                  {report?.metrics.water_current_lpm ?? "—"} <span className="text-xs font-normal text-ink-dim">L/min</span>
                </div>
                <div className="text-[11px] text-ink-dim mt-1">
                  Today: {report?.metrics.water_today_liters ?? "—"} L
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-black/40 border border-white/5">
                <div className="flex items-center gap-1.5 text-amber text-xs mb-1">
                  <WasteIcon size={13} /> Avg Bin Fill
                </div>
                <div className="font-mono text-xl font-bold text-ink">
                  {report?.metrics.waste_avg_fill_pct ?? "—"}%
                </div>
                <div className="text-[11px] text-ink-dim mt-1">
                  Overflowing: {report?.metrics.waste_overflow_bins ?? "—"} bins
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-black/40 border border-white/5">
                <div className="text-xs font-mono text-ink-dim mb-1">Open Issues</div>
                <div className="font-mono text-xl font-bold text-coral">
                  {report?.metrics.issues_open ?? "—"}
                </div>
                <div className="text-[11px] text-ink-dim mt-1">Requiring triage</div>
              </div>

              <div className="p-3.5 rounded-xl bg-black/40 border border-white/5">
                <div className="text-xs font-mono text-ink-dim mb-1">Resolved (24h)</div>
                <div className="font-mono text-xl font-bold text-mint">
                  {report?.metrics.issues_resolved_24h ?? "—"}
                </div>
                <div className="text-[11px] text-ink-dim mt-1">Recent closures</div>
              </div>

              <div className="p-3.5 rounded-xl bg-black/40 border border-white/5">
                <div className="text-xs font-mono text-ink-dim mb-1">Total Resolved</div>
                <div className="font-mono text-xl font-bold text-ink">
                  {report?.metrics.issues_resolved ?? "—"}
                </div>
                <div className="text-[11px] text-ink-dim mt-1">Cumulative</div>
              </div>
            </div>
          </div>

          {/* Resource Trends Section */}
          {report?.trends && report.trends.length > 0 && (
            <div className="mt-4 pt-4 border-t border-white/10">
              <span className="label-mono text-ink-dim block mb-2">Window Trends (Recent vs Previous Period)</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {report.trends.map((t) => (
                  <div key={t.resource} className="p-2.5 rounded-lg bg-black/30 border border-white/5 flex justify-between items-center text-xs">
                    <span className="capitalize text-ink font-medium">{t.resource} ({t.window_hours}h)</span>
                    <span className={`font-mono font-bold ${t.change_pct <= 0 ? "text-mint" : "text-coral"}`}>
                      {t.change_pct > 0 ? `▲ +${t.change_pct}%` : `▼ ${t.change_pct}%`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </div>

      {/* Prioritized Actionable Recommendations List */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass p-5 rounded-2xl border border-white/10 space-y-3"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-base font-bold text-ink">
              Prioritized Actionable Recommendations
            </h2>
            <p className="text-xs text-ink-dim">
              Calculated daily savings in kilowatt-hours, litres of potable water, and kilograms of waste diverted.
            </p>
          </div>
          <button
            onClick={loadReport}
            className="text-xs font-mono text-mint hover:underline cursor-pointer"
          >
            ↻ Re-run Analysis
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
          {report?.recommendations?.map((rec, idx) => (
            <RecommendationCard key={rec.id} rec={rec} delay={idx * 0.04} />
          ))}
        </div>
      </motion.div>

      {/* Sustainability Report Preview Modal */}
      <ReportModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        report={report}
        isLoading={loading}
      />
    </div>
  );
}
