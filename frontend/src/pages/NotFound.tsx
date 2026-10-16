import { Link } from "react-router-dom";
import { motion } from "framer-motion";

export default function NotFound() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="glass mx-auto mt-10 max-w-xl p-8 text-center"
    >
      <div className="font-mono text-5xl font-bold text-mint glow-mint">404</div>
      <h2 className="font-display mt-3 text-xl font-bold text-ink">
        Signal lost in the canopy
      </h2>
      <p className="mt-2 text-sm text-ink-dim">
        The route you requested does not exist in the Living Campus twin.
      </p>
      <Link
        to="/"
        className="label-mono mt-6 inline-block rounded-full bg-mint px-5 py-2 text-abyss transition-transform duration-200 hover:scale-[1.04]"
      >
        ← Back to overview
      </Link>
    </motion.section>
  );
}
