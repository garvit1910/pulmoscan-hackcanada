'use client'

import { motion } from 'framer-motion'
import { Activity, Loader2 } from 'lucide-react'

interface LungViewerProps {
  isAnalyzing: boolean
  processingMessage: string
  hasResult: boolean
}

export default function LungViewer({
  isAnalyzing,
  processingMessage,
  hasResult,
}: LungViewerProps) {
  return (
    <div className="relative w-full aspect-square max-h-[400px] rounded-xl bg-black/40 border border-white/10 overflow-hidden flex items-center justify-center">
      {/* Pulsating lung SVG */}
      <svg
        viewBox="0 0 400 400"
        className="w-3/4 h-3/4"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <radialGradient id="lv-lungGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#8b0000" stopOpacity="0.7" />
            <stop offset="60%" stopColor="#b22222" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#000000" stopOpacity="1" />
          </radialGradient>
          <filter id="lv-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Bronchial tree */}
        {[
          'M 200 160 C 220 130, 270 110, 310 90',
          'M 200 160 C 230 140, 280 140, 320 150',
          'M 200 160 C 180 130, 130 110, 90 90',
          'M 200 160 C 170 140, 120 140, 80 150',
          'M 200 200 C 200 230, 200 270, 200 310',
        ].map((d, i) => (
          <motion.path
            key={i}
            d={d}
            stroke="#dc143c"
            strokeWidth={2.5 - i * 0.3}
            fill="none"
            strokeLinecap="round"
            opacity={0.6}
            animate={
              isAnalyzing
                ? { opacity: [0.3, 0.9, 0.3], strokeWidth: [1.5, 3, 1.5] }
                : {}
            }
            transition={
              isAnalyzing
                ? { duration: 2, repeat: Infinity, delay: i * 0.2 }
                : {}
            }
          />
        ))}

        {/* Trachea */}
        <path
          d="M 200 60 C 200 90, 200 130, 200 160"
          stroke="#b22222"
          strokeWidth={3}
          fill="none"
          opacity={0.7}
        />

        {/* Central body */}
        <motion.circle
          cx={200}
          cy={200}
          r={70}
          fill="url(#lv-lungGrad)"
          stroke="#dc143c"
          strokeWidth={1.5}
          filter="url(#lv-glow)"
          animate={
            isAnalyzing
              ? { scale: [1, 1.05, 1], opacity: [0.7, 1, 0.7] }
              : { scale: 1, opacity: 0.8 }
          }
          transition={
            isAnalyzing
              ? { duration: 2, repeat: Infinity, ease: 'easeInOut' }
              : {}
          }
          style={{ transformOrigin: '200px 200px' }}
        />

        {/* Inner core */}
        <circle
          cx={200}
          cy={200}
          r={20}
          fill="#000"
          stroke="#ff0000"
          strokeWidth={1}
          opacity={0.7}
        />
      </svg>

      {/* Processing overlay */}
      {isAnalyzing && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm"
        >
          <Loader2 size={36} className="text-crimson animate-spin mb-4" />
          <motion.p
            key={processingMessage}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="text-sm text-zinc-300 font-medium"
          >
            {processingMessage}
          </motion.p>
        </motion.div>
      )}

      {/* Completed badge */}
      {hasResult && !isAnalyzing && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 bg-green-500/15 border border-green-500/30 rounded-full"
        >
          <Activity size={12} className="text-green-400" />
          <span className="text-xs text-green-400 font-medium">
            Analysis Complete
          </span>
        </motion.div>
      )}
    </div>
  )
}
