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
        className="max-w-3xl p-12 rounded-2xl bg-black/90 backdrop-blur-md border border-purple-500/30 shadow-2xl"
      >
        <p className="text-3xl font-light text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-orange-500 leading-relaxed">
          &ldquo;Early detection of pulmonary fibrosis can slow progression by up to 50%.
          Every breath analyzed is a step toward saving lives.&rdquo;
        </p>
        <p className="mt-6 text-zinc-500 text-sm">
          — Pulmonary Disease Research Foundation
        </p>
      </motion.div>
    </motion.div>
  )
}
