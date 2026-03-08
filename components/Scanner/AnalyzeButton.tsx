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
      whileTap={{ x: 2, y: 2 }}
      className="relative w-full py-4 bg-[#FFEF00] text-[#120D0B] font-pixel text-sm rounded-none border-4 border-[#FFEF00] shadow-pixel overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 hover:shadow-[0_0_20px_rgba(255,239,0,0.6)] transition-shadow active:translate-x-[2px] active:translate-y-[2px] active:shadow-pixel-sm"
    >
      <Scan size={18} className="relative z-10" />
      <span className="relative z-10">
        {isAnalyzing ? 'Analyzing Scan...' : 'Analyze Scan'}
      </span>
    </motion.button>
  )
}
