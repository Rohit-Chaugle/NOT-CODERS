import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import GlassPanel from "../ui/GlassPanel";
import { CameraIcon, Glyph } from "../ui/Icons";
import { useIssues } from "../../hooks/useIssues";
import { ACCENT_HEX, ISSUE_TYPE_META, SEVERITY_ACCENT, hexA } from "../../theme/palette";

/** Compact relative age, e.g. "4m", "2h". */
function relativeAge(iso: string | null, now: number): string {
  if (!iso) return "—";
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "—";
  const seconds = Math.max(0, (now - ts) / 1000);
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

/** Left floating issue feed — live open issues as living cards. */
export default function IssueFeed() {
  const { issues, connected, loading, error } = useIssues();
  // Ages are relative, so keep them fresh without re-fetching.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 20_000);
    return () => window.clearInterval(id);
  }, []);

  const subtitle = error
    ? "feed offline"
    : `${issues.length} open · rules + vision`;

  return (
    <GlassPanel
      title="Signal feed"
      subtitle={subtitle}
      accent="coral"
      className="flex max-h-full min-h-0 flex-col"
      delay={0.25}
    >
      <div className="label-mono mb-2 flex items-center gap-2">
        <span
          className={connected ? "live-dot h-1.5 w-1.5 rounded-full" : "h-1.5 w-1.5 rounded-full"}
          style={{ background: connected ? ACCENT_HEX.mint : ACCENT_HEX.coral }}
        />
        <span style={{ color: connected ? ACCENT_HEX.mint : ACCENT_HEX.coral }}>
          {connected ? "live" : "reconnecting"}
        </span>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {loading && (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-xl border border-white/5 bg-white/[0.03]"
              />
            ))}
          </div>
        )}

        {!loading && error && (
          <p className="rounded-xl border border-coral/25 bg-coral/[0.06] p-3 text-[12px] text-ink-dim">
            Could not reach the issues API. {error}
          </p>
        )}

        {!loading && !error && issues.length === 0 && (
          <p className="rounded-xl border border-white/8 bg-white/[0.02] p-3 text-[12px] text-ink-dim">
            No open issues. The campus is running clean.
          </p>
        )}

        <AnimatePresence initial={false}>
          {issues.map((issue, i) => {
            const meta = ISSUE_TYPE_META[issue.type] ?? {
              label: issue.title,
              accent: "violet" as const,
              glyph: "gauge",
            };
            const accent = SEVERITY_ACCENT[issue.severity] ?? "amber";
            const hex = ACCENT_HEX[accent];
            const isVision = issue.source === "vision";
            return (
              <motion.article
                key={issue.id}
                layout
                initial={{ opacity: 0, x: -24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.5, delay: Math.min(0.05 * i, 0.3), ease: [0.16, 1, 0.3, 1] }}
                className="group cursor-pointer rounded-xl border p-3 transition-colors duration-200"
                style={{
                  borderColor: hexA(hex, 0.22),
                  background: hexA(hex, 0.05),
                }}
              >
                <div className="flex items-start gap-3">
                  <span
                    className="mt-0.5 shrink-0 rounded-lg p-1.5"
                    style={{
                      color: ACCENT_HEX[meta.accent],
                      background: hexA(ACCENT_HEX[meta.accent], 0.12),
                    }}
                  >
                    <Glyph name={meta.glyph} size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-display truncate text-[13px] font-semibold text-ink">
                        {meta.label}
                      </h3>
                      <span
                        className="label-mono shrink-0 rounded-full px-2 py-0.5"
                        style={{ color: hex, background: hexA(hex, 0.14) }}
                      >
                        {issue.severity}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-ink-dim">
                      {issue.description || issue.title}
                    </p>
                    <div className="label-mono mt-1.5 flex items-center gap-2">
                      <span className="truncate">{issue.building_name ?? "Campus"}</span>
                      <span className="opacity-40">/</span>
                      <span className="truncate">{issue.zone_name ?? "—"}</span>
                      {isVision && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5"
                          style={{ color: ACCENT_HEX.violet, background: hexA(ACCENT_HEX.violet, 0.16) }}
                          title="Raised by the vision lab"
                          data-testid="feed-vision-badge"
                        >
                          <CameraIcon size={10} />
                          vision
                        </span>
                      )}
                      <span className="ml-auto shrink-0 opacity-60">{relativeAge(issue.detected_at, now)}</span>
                    </div>
                  </div>
                </div>
              </motion.article>
            );
          })}
        </AnimatePresence>
      </div>
    </GlassPanel>
  );
}
