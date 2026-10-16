import type { ReactNode } from "react";
import { motion } from "framer-motion";

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-xl bg-white/[0.04] border border-white/5 ${className}`}
    />
  );
}

export function EmptyState({
  icon = "🌿",
  title = "No items found",
  description = "There are no entries currently recorded in this view.",
  action,
}: {
  icon?: ReactNode;
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center p-8 text-center glass rounded-2xl border border-white/10"
    >
      <div className="text-3xl mb-3">{icon}</div>
      <h3 className="font-display text-sm font-semibold text-ink">{title}</h3>
      <p className="text-xs text-ink-dim max-w-sm mt-1 mb-4 leading-relaxed">
        {description}
      </p>
      {action && <div>{action}</div>}
    </motion.div>
  );
}

export function ErrorBanner({
  message = "Failed to load telemetry data",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="p-4 rounded-xl glass border border-coral/40 bg-coral/10 flex items-center justify-between gap-3 text-xs">
      <div className="flex items-center gap-2 text-ink">
        <span className="text-coral font-bold text-sm">⚠</span>
        <span>{message}</span>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-3 py-1 rounded-lg border border-coral/40 text-coral hover:bg-coral/20 font-mono text-xs transition-colors cursor-pointer"
        >
          Retry
        </button>
      )}
    </div>
  );
}
