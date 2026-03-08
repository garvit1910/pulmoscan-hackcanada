'use client'

import { motion, useTransform, type MotionValue } from 'framer-motion'

interface DiagnosticQuoteProps {
  quoteOpacity: MotionValue<number>
}

export default function DiagnosticQuote({ quoteOpacity }: DiagnosticQuoteProps) {
  const scale = useTransform(quoteOpacity, [0, 1], [0.9, 1])

  return (
    <motion.div
      style={{ opacity: quoteOpacity }}
      className="fixed inset-0 flex items-center justify-center pointer-events-none z-20"
    >
      <motion.div
        style={{ scale }}
        className="max-w-3xl p-12 pixel-border"
      >
        <p className="text-2xl font-mono text-primary-coral glow-text-coral leading-relaxed">
          &ldquo;Early detection of pulmonary fibrosis can slow progression by up to 50%.
          Every breath analyzed is a step toward saving lives.&rdquo;
        </p>
        <p className="mt-6 text-retro-cream/40 text-sm font-mono">
          — Pulmonary Disease Research Foundation
        </p>
      </motion.div>
    </motion.div>
  )
}
