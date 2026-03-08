'use client'

import { memo } from 'react'
import { motion, useTransform } from 'framer-motion'
import type { HiddenQuoteProps } from './types'

const HiddenQuote = memo(function HiddenQuote({ zoomScale }: HiddenQuoteProps) {
  /*
   * From zoomScale 1→15:  opacity=0, scale=0.5 — completely invisible
   * From zoomScale 15→16: opacity jumps to 0.8, scale to 0.9 — quote appears
   * From zoomScale 16→20: opacity eases to 1, scale to 1 — fully visible
   * The quote is hidden for 75% of the zoom, then materializes in the final 25%.
   */
  const opacity = useTransform(zoomScale, [1, 15, 16, 20], [0, 0, 0.8, 1])
  const scale = useTransform(zoomScale, [1, 15, 16, 20], [0.5, 0.5, 0.9, 1])

  return (
    <motion.div
      style={{ opacity, scale }}
      className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
    >
      <div className="max-w-2xl mx-auto p-8 rounded-2xl bg-black/80 backdrop-blur-md border border-[#FF775E]/20 shadow-coral-glow-lg">
        <blockquote className="text-center">
          <p className="text-2xl font-mono font-light text-[#FF775E] glow-text-coral leading-relaxed">
            &ldquo;Pulmonary fibrosis causes irreversible scarring. By the time symptoms
            appear, up to 50% of lung function may already be lost.&rdquo;
          </p>
          <footer className="mt-4 text-sm text-zinc-400 font-mono">
            — American Lung Association
          </footer>
        </blockquote>
      </div>
    </motion.div>
  )
})

export default HiddenQuote
