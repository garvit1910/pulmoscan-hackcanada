'use client'

import { motion } from 'framer-motion'
import { Scan } from 'lucide-react'

interface PredictButtonProps {
  onClick: () => void
  isPredicting: boolean
}

export default function PredictButton({ onClick, isPredicting }: PredictButtonProps) {
  return (
    <motion.button
      onClick={onClick}
      disabled={isPredicting}
      whileTap={{ x: 2, y: 2 }}
      className="relative w-full py-4 bg-[#FF775E] text-[#120D0B] font-pixel text-sm rounded-none border-4 border-[#FF775E] shadow-pixel overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 hover:shadow-[0_0_20px_rgba(255,119,94,0.6)] transition-shadow active:translate-x-[2px] active:translate-y-[2px] active:shadow-pixel-sm"
    >
      <Scan size={18} className="relative z-10" />
      <span className="relative z-10">
        {isPredicting ? 'Analyzing...' : 'Run Prediction'}
      </span>
    </motion.button>
  )
}
