'use client'

import { memo } from 'react'
import { motion, useTransform } from 'framer-motion'
import type { HiddenQuoteProps } from './types'

const HiddenQuote = memo(function HiddenQuote({ zoomScale }: HiddenQuoteProps) {
  const opacity = useTransform(zoomScale, [1, 15, 16, 20], [0, 0, 0.8, 1])
  const scale = useTransform(zoomScale, [1, 15, 16, 20], [0.5, 0.5, 0.9, 1])

  return (
    <motion.div
      style={{ opacity, scale }}
      className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
    >
      <div className="bg-black/80 backdrop-blur-md border border-red-600/20 shadow-red-glow-lg rounded-2xl p-8 max-w-lg mx-4">
        <p className="text-2xl font-light text-transparent bg-clip-text bg-gradient-to-r from-crimson to-red-600 leading-relaxed">
          &ldquo;Pulmonary fibrosis causes irreversible scarring. By the time symptoms appear,
          up to 50% of lung function may already be lost.&rdquo;
        </p>
        <p className="mt-4 text-zinc-500 text-sm">
          — American Lung Association
        </p>
      </div>
    </motion.div>
  )
})

export default HiddenQuote
