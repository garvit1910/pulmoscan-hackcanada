'use client'

import { motion } from 'framer-motion'
import { Scan } from 'lucide-react'

interface AnalyzeButtonProps {
  onClick: () => void
  isAnalyzing: boolean
  disabled?: boolean
}

export default function AnalyzeButton({ onClick, isAnalyzing, disabled }: AnalyzeButtonProps) {
  return (
    <motion.button
      onClick={onClick}
      disabled={isAnalyzing || disabled}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="relative w-full py-4 bg-gradient-to-r from-blue-400 to-purple-500 text-white font-semibold text-lg rounded-lg overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
      <Scan size={20} className="relative z-10" />
      <span className="relative z-10">
        {isAnalyzing ? 'Analyzing Scan...' : 'Analyze Scan'}
      </span>
    </motion.button>
  )
}
