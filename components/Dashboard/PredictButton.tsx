'use client'

import { motion } from 'framer-motion'

interface PredictButtonProps {
  onClick: () => void
  isPredicting: boolean
}

export default function PredictButton({ onClick, isPredicting }: PredictButtonProps) {
  return (
    <motion.button
      onClick={onClick}
      disabled={isPredicting}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="relative w-full py-4 bg-gradient-to-r from-blue-400 to-purple-500 text-white font-semibold text-lg rounded-lg overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {/* Shimmer overlay */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
        animate={{ x: ['-200%', '200%'] }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: 'linear',
        }}
      />
      <span className="relative z-10">
        {isPredicting ? 'Analyzing...' : 'Run Prediction'}
      </span>
    </motion.button>
  )
}
