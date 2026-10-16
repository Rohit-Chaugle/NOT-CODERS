import { motion } from "framer-motion";

type PagePlaceholderProps = {
  title: string;
  description: string;
  planned?: string[];
};

export default function PagePlaceholder({
  title,
  description,
  planned = [],
}: PagePlaceholderProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="glass h-full p-6 md:p-8"
    >
      <header>
        <p className="label-mono mb-2">Scaffolded route</p>
        <h2 className="font-display text-2xl font-bold tracking-tight text-ink md:text-3xl">
          {title}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-dim">
          {description}
        </p>
      </header>

      <div className="mt-6 rounded-2xl border border-white/5 bg-white/[0.03] p-5">
        <p className="label-mono text-mint">Coming in a later milestone</p>

        {planned.length > 0 && (
          <ul className="mt-4 space-y-2.5">
            {planned.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2.5 text-[13px] text-ink-dim"
              >
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-mint shadow-[0_0_8px_rgba(92,255,177,0.8)]" />
                {item}
              </li>
            ))}
          </ul>
        )}

        <p className="mt-5 text-[12px] text-ink-dim/70">
          Contract lives in{" "}
          <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[11px] text-mint">
            PLAN.md
          </span>
        </p>
      </div>
    </motion.section>
  );
}
