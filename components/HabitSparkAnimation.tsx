'use client';

import { motion } from 'framer-motion';

// Ring geometry
const SIZE = 168;     // container px
const R    = 70;      // ring radius
const SW   = 9;       // stroke width

export default function HabitSparkAnimation() {
  return (
    <div className="flex flex-col items-center">

      {/* ── Ring + spark + flame ────────────────────────────────── */}
      <div className="relative" style={{ width: SIZE, height: SIZE }}>

        {/* Radial glow backdrop */}
        <motion.div
          className="absolute rounded-full pointer-events-none"
          style={{
            inset: '-40%',
            background: 'radial-gradient(circle, rgba(34,197,94,0.18) 0%, transparent 65%)',
          }}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: [0, 1, 0.55], scale: [0.6, 1.1, 1] }}
          transition={{ duration: 1.4, delay: 0.2, ease: 'easeOut' }}
        />

        {/* SVG progress ring — rotated so fill starts at top */}
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="absolute inset-0"
          style={{ transform: 'rotate(-90deg)' }}
        >
          {/* Track */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke="#1e293b"
            strokeWidth={SW}
          />
          {/* Animated fill */}
          <motion.circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke="#22c55e"
            strokeWidth={SW}
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{
              pathLength: { duration: 2.0, delay: 0.9, ease: [0.4, 0, 0.2, 1] },
              opacity:    { duration: 0.3, delay: 0.9 },
            }}
          />
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">

          {/* Phase 1: Spark dot */}
          <motion.div
            className="absolute rounded-full"
            style={{
              width: 18,
              height: 18,
              backgroundColor: '#22c55e',
              boxShadow: '0 0 18px 6px rgba(34,197,94,0.75)',
            }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [0, 1, 0.6, 0], opacity: [0, 1, 1, 0] }}
            transition={{ duration: 0.7, delay: 0, ease: 'easeOut' }}
          />

          {/* Phase 2: Flame grows from spark */}
          <motion.span
            className="text-5xl leading-none select-none"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [0, 1.4, 1], opacity: [0, 1, 1] }}
            transition={{
              scale:   { duration: 0.6, delay: 0.5, ease: [0.34, 1.56, 0.64, 1] },
              opacity: { duration: 0.25, delay: 0.5 },
            }}
          >
            🔥
          </motion.span>

          {/* Phase 3: "21 Days" label appears after ring fills */}
          <motion.p
            className="text-[10px] font-bold tracking-[0.18em] uppercase"
            style={{ color: '#22c55e' }}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 2.7 }}
          >
            21 Days
          </motion.p>
        </div>
      </div>

      {/* ── Tagline ─────────────────────────────────────────────── */}
      <motion.p
        className="text-[#94a3b8] text-sm text-center mt-8 leading-relaxed"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 3.0 }}
      >
        Small actions. Repeated daily.
        <br />
        Become powerful habits.
      </motion.p>
    </div>
  );
}
