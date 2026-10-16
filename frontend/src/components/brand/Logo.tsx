import { motion } from "framer-motion";

type LogoProps = { size?: number; showWordmark?: boolean };

/**
 * Animated bioluminescent spore/leaf mark with an orbiting satellite and a
 * slow outer pulse.
 */
export default function Logo({ size = 40, showWordmark = true }: LogoProps) {
  return (
    <div className="flex items-center gap-3">
      <motion.svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        aria-hidden
        initial={{ rotate: -12, opacity: 0, scale: 0.8 }}
        animate={{ rotate: 0, opacity: 1, scale: 1 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        className="shrink-0"
      >
        <defs>
          <radialGradient id="lg-core" cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor="#d7fff0" />
            <stop offset="55%" stopColor="#5CFFB1" />
            <stop offset="100%" stopColor="#1d7d55" />
          </radialGradient>
          <linearGradient id="lg-leaf" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#5CFFB1" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#8B5CFF" stopOpacity="0.75" />
          </linearGradient>
        </defs>

        {/* Soft halo */}
        <motion.circle
          cx="32"
          cy="32"
          r="26"
          stroke="#5CFFB1"
          strokeOpacity="0.35"
          strokeWidth="1"
          fill="none"
          animate={{ r: [24, 29, 24], strokeOpacity: [0.45, 0.1, 0.45] }}
          transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Leaf */}
        <motion.path
          d="M32 12c11 4 18 13 18 24 0 4-1 7-3 10-6-2-11-6-14-12-3 6-8 10-14 12-2-3-3-6-3-10 0-11 7-20 16-24Z"
          fill="url(#lg-leaf)"
          fillOpacity="0.22"
          stroke="url(#lg-leaf)"
          strokeWidth="1.6"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.6, ease: "easeInOut", delay: 0.3 }}
        />
        {/* Vein */}
        <motion.path
          d="M32 16v26"
          stroke="#5CFFB1"
          strokeOpacity="0.7"
          strokeWidth="1.2"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 1.2 }}
        />

        {/* Core spore */}
        <motion.circle
          cx="32"
          cy="30"
          r="5"
          fill="url(#lg-core)"
          animate={{ scale: [1, 1.18, 1], opacity: [0.9, 1, 0.9] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
          style={{ transformOrigin: "32px 30px" }}
        />

        {/* Orbiting satellite */}
        <motion.g
          animate={{ rotate: 360 }}
          transition={{ duration: 7, repeat: Infinity, ease: "linear" }}
          style={{ transformOrigin: "32px 32px" }}
        >
          <circle cx="52" cy="32" r="2.4" fill="#FFB84D" />
          <circle cx="52" cy="32" r="5" fill="#FFB84D" fillOpacity="0.18" />
        </motion.g>
      </motion.svg>

      {showWordmark && (
        <div className="leading-none">
          <div className="font-display text-lg font-bold tracking-tight text-ink">
            Verdant<span className="text-mint glow-mint">Twin</span>
          </div>
          <div className="label-mono mt-1">Living Campus · Digital Twin</div>
        </div>
      )}
    </div>
  );
}
