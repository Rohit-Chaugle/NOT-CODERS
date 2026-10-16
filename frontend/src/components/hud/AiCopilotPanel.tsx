import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import GlassPanel from "../ui/GlassPanel";
import { SparkIcon, BoltIcon, DropIcon, WasteIcon } from "../ui/Icons";
import {
  fetchRecommendations,
  fetchReport,
  sendChatMessage,
  type RecommendationsResponse,
  type SustainabilityReport,
  type ChatMessage,
} from "../../api/ai";
import GreenScoreRing from "../copilot/GreenScoreRing";
import RecommendationCard from "../copilot/RecommendationCard";
import StreamingText from "../copilot/StreamingText";
import ReportModal from "../copilot/ReportModal";

type TabMode = "chat" | "actions";

export default function AiCopilotPanel() {
  const [activeTab, setActiveTab] = useState<TabMode>("chat");
  const [recsData, setRecsData] = useState<RecommendationsResponse | null>(null);
  const [loadingRecs, setLoadingRecs] = useState(false);

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Welcome to Verdant Copilot. I'm connected to all campus IoT telemetry, vision nodes, and energy meters. Ask me anything about our sustainability status or what to fix first.",
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([
    "What should we fix first?",
    "How is our energy use trending?",
    "Are there any water leaks?",
    "What is our Green Score?",
  ]);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Report Modal State
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [report, setReport] = useState<SustainabilityReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);

  // Initial load of recommendations
  useEffect(() => {
    loadRecommendations();
  }, []);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const loadRecommendations = async () => {
    try {
      setLoadingRecs(true);
      const data = await fetchRecommendations();
      setRecsData(data);
    } catch (e) {
      console.error("Failed to load recommendations:", e);
    } finally {
      setLoadingRecs(false);
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || isTyping) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInputText("");
    setIsTyping(true);

    try {
      const res = await sendChatMessage(newHistory);
      setMessages([...newHistory, { role: "assistant", content: res.reply }]);
      if (res.suggestions?.length) {
        setSuggestions(res.suggestions);
      }
    } catch (e) {
      setMessages([
        ...newHistory,
        {
          role: "assistant",
          content:
            "I'm temporarily having trouble connecting to the analytics engine. Please check back in a moment.",
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleOpenReport = async () => {
    setIsReportOpen(true);
    if (!report) {
      try {
        setLoadingReport(true);
        const data = await fetchReport();
        setReport(data);
      } catch (e) {
        console.error("Failed to load report:", e);
      } finally {
        setLoadingReport(false);
      }
    }
  };

  const activeProvider = recsData?.provider?.name || "template";
  const isLive = recsData?.provider?.live || false;

  return (
    <>
      <GlassPanel
        title="AI Copilot"
        subtitle={
          <span className="flex items-center gap-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isLive ? "bg-mint shadow-[0_0_6px_#5cffb1]" : "bg-amber"
              }`}
            />
            {activeProvider} {isLive ? "· live" : "· offline fallback"}
          </span>
        }
        accent="mint"
        className="flex h-full min-h-0 flex-col overflow-hidden"
        delay={0.35}
      >
        {/* Navigation Tabs */}
        <div className="flex shrink-0 items-center gap-1.5 mb-3 p-1 rounded-xl bg-white/5 border border-white/10">
          <button
            onClick={() => setActiveTab("chat")}
            className={`flex-1 py-1.5 text-xs font-mono font-medium rounded-lg transition-all ${
              activeTab === "chat"
                ? "bg-mint text-abyss font-semibold shadow-[0_0_12px_rgba(92,255,177,0.35)]"
                : "text-ink-dim hover:text-ink"
            }`}
          >
            Chat Copilot
          </button>
          <button
            onClick={() => setActiveTab("actions")}
            className={`flex-1 py-1.5 text-xs font-mono font-medium rounded-lg transition-all ${
              activeTab === "actions"
                ? "bg-mint text-abyss font-semibold shadow-[0_0_12px_rgba(92,255,177,0.35)]"
                : "text-ink-dim hover:text-ink"
            }`}
          >
            Actions ({recsData?.recommendations?.length || 0})
          </button>
        </div>

        {/* Tab 1: Chat Assistant with Streaming Typing Effect */}
        {activeTab === "chat" && (
          <div className="flex-1 flex flex-col min-h-0 justify-between">
            {/* Messages Scroll Area */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-3 min-h-0">
              {messages.map((m, idx) => {
                const isAssistant = m.role === "assistant";
                const isLatest = idx === messages.length - 1;
                return (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex flex-col ${isAssistant ? "items-start" : "items-end"}`}
                  >
                    <div className="flex items-center gap-1.5 mb-1 px-1">
                      {isAssistant && (
                        <span className="text-mint">
                          <SparkIcon size={12} />
                        </span>
                      )}
                      <span className="text-[10px] font-mono text-ink-dim">
                        {isAssistant ? "Verdant Copilot" : "You"}
                      </span>
                    </div>
                    <div
                      className={`text-xs leading-relaxed rounded-2xl p-3 max-w-[92%] ${
                        isAssistant
                          ? "bg-white/5 border border-white/10 text-ink shadow-sm"
                          : "bg-mint/20 border border-mint/40 text-ink font-medium"
                      }`}
                    >
                      {isAssistant && isLatest && !isTyping ? (
                        <StreamingText text={m.content} speed={14} />
                      ) : (
                        m.content
                      )}
                    </div>
                  </motion.div>
                );
              })}

              {isTyping && (
                <div className="flex items-center gap-2 p-2 text-ink-dim text-xs font-mono">
                  <div className="w-1.5 h-1.5 rounded-full bg-mint animate-bounce" />
                  <div className="w-1.5 h-1.5 rounded-full bg-mint animate-bounce [animation-delay:0.2s]" />
                  <div className="w-1.5 h-1.5 rounded-full bg-mint animate-bounce [animation-delay:0.4s]" />
                  <span className="text-[11px]">Thinking...</span>
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>

            {/* Quick Suggestions Chips */}
            <div className="shrink-0 pt-2 pb-1 flex flex-wrap gap-1.5 border-t border-white/5 mt-1">
              {suggestions.slice(0, 3).map((s, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(s)}
                  className="text-[10.5px] font-mono px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-ink-dim hover:text-ink transition-colors truncate max-w-full text-left cursor-pointer"
                >
                  ⚡ {s}
                </button>
              ))}
            </div>

            {/* Chat Input Box */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="shrink-0 mt-2 flex items-center gap-2"
            >
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Ask campus copilot..."
                className="flex-1 bg-black/40 border border-white/15 focus:border-mint/60 rounded-xl px-3 py-2 text-xs text-ink placeholder:text-ink-dim/50 outline-none transition-colors"
              />
              <button
                type="submit"
                disabled={!inputText.trim() || isTyping}
                className="px-3.5 py-2 bg-mint text-abyss font-mono font-bold text-xs rounded-xl hover:bg-mint/90 transition-all disabled:opacity-40 cursor-pointer shadow-[0_0_12px_rgba(92,255,177,0.3)]"
              >
                Send
              </button>
            </form>
          </div>
        )}

        {/* Tab 2: Green Score Ring & Prioritized Actions */}
        {activeTab === "actions" && (
          <div className="flex-1 overflow-y-auto pr-1 space-y-3.5 min-h-0">
            {/* Green Score Animated Ring Card */}
            <div className="glass p-3 rounded-xl border border-white/10 flex flex-col items-center text-center">
              <span className="text-[10px] font-mono uppercase tracking-widest text-mint mb-2">
                Campus Sustainability Pulse
              </span>
              <GreenScoreRing
                scoreData={recsData?.green_score}
                size={115}
                strokeWidth={8}
                showBreakdown={false}
              />

              {/* Total Estimated Savings Bar */}
              {recsData?.totals && (
                <div className="mt-3 w-full grid grid-cols-3 gap-1 pt-2 border-t border-white/10 text-center">
                  <div className="bg-black/30 p-1.5 rounded-lg">
                    <div className="text-[10px] text-coral font-mono flex items-center justify-center gap-0.5">
                      <BoltIcon size={10} /> Power
                    </div>
                    <div className="text-xs font-mono font-bold text-ink">
                      {recsData.totals.est_kwh_saved} <span className="text-[9px] font-normal">kWh</span>
                    </div>
                  </div>
                  <div className="bg-black/30 p-1.5 rounded-lg">
                    <div className="text-[10px] text-mint font-mono flex items-center justify-center gap-0.5">
                      <DropIcon size={10} /> Water
                    </div>
                    <div className="text-xs font-mono font-bold text-ink">
                      {recsData.totals.est_litres_saved} <span className="text-[9px] font-normal">L</span>
                    </div>
                  </div>
                  <div className="bg-black/30 p-1.5 rounded-lg">
                    <div className="text-[10px] text-amber font-mono flex items-center justify-center gap-0.5">
                      <WasteIcon size={10} /> Waste
                    </div>
                    <div className="text-xs font-mono font-bold text-ink">
                      {recsData.totals.est_kg_saved} <span className="text-[9px] font-normal">kg</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Recommendation Cards */}
            <div className="space-y-2.5">
              <div className="flex justify-between items-center px-1">
                <span className="label-mono">Prioritized Actions</span>
                <button
                  onClick={loadRecommendations}
                  className="text-[10px] font-mono text-mint hover:underline"
                >
                  ↻ Refresh
                </button>
              </div>

              {loadingRecs ? (
                <div className="py-8 text-center text-xs font-mono text-ink-dim">
                  Scanning active anomalies...
                </div>
              ) : recsData?.recommendations?.length ? (
                recsData.recommendations.map((rec, idx) => (
                  <RecommendationCard key={rec.id} rec={rec} delay={idx * 0.05} />
                ))
              ) : (
                <div className="py-6 text-center text-xs text-ink-dim">
                  No critical actions required right now. All facilities within thresholds.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bottom "Generate Report" Button */}
        <div className="mt-3 pt-3 border-t border-white/10">
          <button
            onClick={handleOpenReport}
            className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-mint/20 via-mint/10 to-transparent border border-mint/40 text-mint font-mono text-xs font-semibold hover:bg-mint/25 transition-all flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(92,255,177,0.15)] cursor-pointer"
          >
            <SparkIcon size={14} />
            <span>Generate Sustainability Report</span>
            <span className="text-[10px] text-mint/70 font-normal">· PDF</span>
          </button>
        </div>
      </GlassPanel>

      {/* Sustainability Report Modal */}
      <ReportModal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        report={report}
        isLoading={loadingReport}
      />
    </>
  );
}
