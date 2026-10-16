import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { SustainabilityReport } from "../../api/ai";
import { downloadReportPdf } from "../../api/ai";
import GreenScoreRing from "./GreenScoreRing";
import { SparkIcon, BoltIcon, DropIcon, WasteIcon } from "../ui/Icons";

type ReportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  report: SustainabilityReport | null;
  isLoading?: boolean;
};

export default function ReportModal({ isOpen, onClose, report, isLoading }: ReportModalProps) {
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<"visual" | "markdown">("visual");

  if (!isOpen) return null;

  const handleDownloadPdf = async () => {
    try {
      setDownloading(true);
      await downloadReportPdf();
    } catch (e) {
      console.error("PDF download error:", e);
    } finally {
      setDownloading(false);
    }
  };

  const handleCopyMarkdown = () => {
    if (!report?.markdown) return;
    navigator.clipboard.writeText(report.markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/75 backdrop-blur-md"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="glass relative z-10 flex flex-col w-full max-w-4xl max-h-[90vh] rounded-2xl border border-mint/25 bg-abyss-soft/95 shadow-2xl overflow-hidden"
        >
          {/* Modal Header */}
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
            <div className="flex items-center gap-3">
              <span className="p-2 rounded-xl bg-mint/15 text-mint">
                <SparkIcon size={18} />
              </span>
              <div>
                <h2 className="font-display text-lg font-bold text-ink">
                  Campus Sustainability Report
                </h2>
                <p className="text-xs font-mono text-ink-dim">
                  {report?.period || "Day report"} · Engine: {report?.provider.name} ({report?.provider.model || "template"})
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="bg-white/5 rounded-lg p-0.5 border border-white/10 flex text-xs">
                <button
                  onClick={() => setViewMode("visual")}
                  className={`px-3 py-1 rounded-md transition-all ${
                    viewMode === "visual" ? "bg-mint text-abyss font-semibold" : "text-ink-dim hover:text-ink"
                  }`}
                >
                  Visual
                </button>
                <button
                  onClick={() => setViewMode("markdown")}
                  className={`px-3 py-1 rounded-md transition-all ${
                    viewMode === "markdown" ? "bg-mint text-abyss font-semibold" : "text-ink-dim hover:text-ink"
                  }`}
                >
                  Markdown
                </button>
              </div>

              <button
                onClick={onClose}
                className="rounded-lg p-2 text-ink-dim hover:text-ink hover:bg-white/10 transition-colors"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Modal Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-10 h-10 border-2 border-mint border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-sm font-mono text-ink">Generative AI is compiling campus telemetry and calculating score...</p>
              </div>
            ) : report ? (
              viewMode === "visual" ? (
                <>
                  {/* Top Score & Key Metrics Banner */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center bg-white/5 rounded-2xl p-4 border border-white/10">
                    <div className="flex justify-center md:border-r md:border-white/10 pr-2">
                      <GreenScoreRing scoreData={report.green_score} size={135} strokeWidth={9} />
                    </div>

                    <div className="md:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                        <div className="flex items-center gap-1.5 text-coral text-xs mb-1">
                          <BoltIcon size={12} /> Live Load
                        </div>
                        <div className="font-mono text-lg font-bold text-ink">
                          {report.metrics.energy_current_kw} <span className="text-xs font-normal text-ink-dim">kW</span>
                        </div>
                        <div className="text-[10px] text-ink-dim">Today: {report.metrics.energy_today_kwh} kWh</div>
                      </div>

                      <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                        <div className="flex items-center gap-1.5 text-mint text-xs mb-1">
                          <DropIcon size={12} /> Live Water
                        </div>
                        <div className="font-mono text-lg font-bold text-ink">
                          {report.metrics.water_current_lpm} <span className="text-xs font-normal text-ink-dim">L/min</span>
                        </div>
                        <div className="text-[10px] text-ink-dim">Today: {report.metrics.water_today_liters} L</div>
                      </div>

                      <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                        <div className="flex items-center gap-1.5 text-amber text-xs mb-1">
                          <WasteIcon size={12} /> Avg Bin Fill
                        </div>
                        <div className="font-mono text-lg font-bold text-ink">
                          {report.metrics.waste_avg_fill_pct}%
                        </div>
                        <div className="text-[10px] text-ink-dim">{report.metrics.waste_overflow_bins} overflowing</div>
                      </div>

                      <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                        <div className="text-[11px] text-ink-dim mb-1 font-mono uppercase">Open Issues</div>
                        <div className="font-mono text-lg font-bold text-coral">{report.metrics.issues_open}</div>
                      </div>

                      <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                        <div className="text-[11px] text-ink-dim mb-1 font-mono uppercase">Resolved 24h</div>
                        <div className="font-mono text-lg font-bold text-mint">{report.metrics.issues_resolved_24h}</div>
                      </div>

                      <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                        <div className="text-[11px] text-ink-dim mb-1 font-mono uppercase">Total Resolved</div>
                        <div className="font-mono text-lg font-bold text-ink">{report.metrics.issues_resolved}</div>
                      </div>
                    </div>
                  </div>

                  {/* Components Breakdown */}
                  <div>
                    <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-ink-dim mb-3">
                      Green Score Breakdown
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {report.green_score.components.map((comp) => (
                        <div key={comp.key} className="p-3 rounded-xl bg-white/5 border border-white/10">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-medium text-ink text-sm">{comp.label}</span>
                            <span className="font-mono text-xs font-bold text-mint">{comp.score}/100</span>
                          </div>
                          <p className="text-xs text-ink-dim leading-relaxed">{comp.detail}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Trends */}
                  {report.trends?.length > 0 && (
                    <div>
                      <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-ink-dim mb-3">
                        Resource Consumption Trends
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {report.trends.map((t) => (
                          <div key={t.resource} className="p-3 rounded-xl bg-white/5 border border-white/10 flex justify-between items-center">
                            <div>
                              <div className="font-medium text-ink capitalize text-sm">{t.resource}</div>
                              <div className="text-xs text-ink-dim font-mono">
                                Recent: {t.recent} {t.unit} vs Prev: {t.previous} {t.unit}
                              </div>
                            </div>
                            <div className={`font-mono text-sm font-bold ${t.change_pct <= 0 ? "text-mint" : "text-coral"}`}>
                              {t.change_pct > 0 ? `▲ +${t.change_pct}%` : `▼ ${t.change_pct}%`}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Top Recommendations */}
                  <div>
                    <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-ink-dim mb-3">
                      High-Priority Recommendations in Report
                    </h3>
                    <div className="space-y-2">
                      {report.recommendations.slice(0, 4).map((rec) => (
                        <div key={rec.id} className="p-3 rounded-xl bg-white/5 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] uppercase font-mono font-bold px-1.5 py-0.5 rounded bg-coral/20 text-coral">
                                {rec.priority}
                              </span>
                              <span className="text-sm font-semibold text-ink">{rec.title}</span>
                              <span className="text-xs font-mono text-ink-dim">({rec.location.zone})</span>
                            </div>
                            <p className="text-xs text-ink-dim mt-1">{rec.action}</p>
                          </div>
                          <div className="text-right shrink-0">
                            {rec.est_kwh_saved > 0 && <span className="text-xs font-mono text-coral block">⚡ {rec.est_kwh_saved} kWh</span>}
                            {rec.est_litres_saved > 0 && <span className="text-xs font-mono text-mint block">💧 {rec.est_litres_saved} L</span>}
                            {rec.est_kg_saved > 0 && <span className="text-xs font-mono text-amber block">♻️ {rec.est_kg_saved} kg</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="relative">
                  <pre className="font-mono text-xs leading-relaxed text-ink bg-black/50 p-4 rounded-xl border border-white/10 whitespace-pre-wrap overflow-x-auto">
                    {report.markdown}
                  </pre>
                </div>
              )
            ) : null}
          </div>

          {/* Modal Footer with Actions */}
          <div className="flex items-center justify-between border-t border-white/10 px-6 py-4 bg-abyss">
            <button
              onClick={handleCopyMarkdown}
              disabled={!report}
              className="px-4 py-2 rounded-xl text-xs font-mono border border-white/20 text-ink hover:bg-white/10 transition-colors"
            >
              {copied ? "✓ Copied Markdown!" : "Copy Markdown"}
            </button>

            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-mono text-ink-dim hover:text-ink transition-colors"
              >
                Close
              </button>
              <button
                onClick={handleDownloadPdf}
                disabled={downloading || !report}
                className="px-5 py-2.5 rounded-xl text-xs font-mono font-semibold bg-mint text-abyss hover:bg-mint/90 transition-all shadow-[0_0_20px_rgba(92,255,177,0.35)] flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {downloading ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-abyss border-t-transparent rounded-full animate-spin" />
                    Exporting PDF...
                  </>
                ) : (
                  <>
                    <span>📄</span> Download PDF Report
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
