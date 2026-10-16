import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";

export type ToastType = "info" | "success" | "warning" | "alert";

export type Toast = {
  id: string;
  type: ToastType;
  title: string;
  message: string;
  duration?: number;
};

type ToastContextType = {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    ({ type, title, message, duration = 4500 }: Omit<Toast, "id">) => {
      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const newToast: Toast = { id, type, title, message, duration };

      setToasts((prev) => [newToast, ...prev].slice(0, 5));

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}

      {/* Floating Sound-Free Toast Container */}
      <div className="fixed bottom-12 right-4 z-50 flex flex-col gap-2 pointer-events-none max-w-sm w-full">
        <AnimatePresence>
          {toasts.map((toast) => {
            const borderColors = {
              info: "border-mint/30",
              success: "border-mint/50",
              warning: "border-amber/50",
              alert: "border-coral/60",
            }[toast.type];

            const badgeBg = {
              info: "bg-mint/15 text-mint",
              success: "bg-mint/20 text-mint",
              warning: "bg-amber/20 text-amber",
              alert: "bg-coral/20 text-coral",
            }[toast.type];

            const glyphs = {
              info: "ℹ",
              success: "✓",
              warning: "⚡",
              alert: "⚠",
            }[toast.type];

            return (
              <motion.div
                key={toast.id}
                initial={{ opacity: 0, y: 16, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className={`glass pointer-events-auto p-3.5 rounded-xl border ${borderColors} shadow-2xl backdrop-blur-xl bg-abyss-soft/90 flex items-start gap-3 relative overflow-hidden`}
              >
                <span className={`p-1.5 rounded-lg text-xs font-mono font-bold shrink-0 ${badgeBg}`}>
                  {glyphs}
                </span>

                <div className="flex-1 min-w-0 pr-4">
                  <div className="font-display text-xs font-bold text-ink leading-tight">
                    {toast.title}
                  </div>
                  <p className="text-[11.5px] text-ink-dim leading-snug mt-1 line-clamp-2">
                    {toast.message}
                  </p>
                </div>

                <button
                  onClick={() => removeToast(toast.id)}
                  className="absolute top-2.5 right-2.5 text-ink-dim/60 hover:text-ink text-xs transition-colors p-1"
                >
                  ✕
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      toasts: [],
      addToast: () => {},
      removeToast: () => {},
    };
  }
  return ctx;
}
