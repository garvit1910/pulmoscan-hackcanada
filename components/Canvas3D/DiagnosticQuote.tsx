'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence, type MotionValue } from 'framer-motion'
import { X } from 'lucide-react'

interface DiagnosticQuoteProps {
  quoteOpacity: MotionValue<number>
  closeFact: () => void
}

export default function DiagnosticQuote({ quoteOpacity, closeFact }: DiagnosticQuoteProps) {
  const [visible, setVisible] = useState(false)

  // Track the MotionValue — show toast when opacity crosses threshold
  useEffect(() => {
    const unsubscribe = quoteOpacity.on('change', (v) => {
      if (v > 0.4 && !visible) setVisible(true)
      if (v < 0.1 && visible) setVisible(false)
    })
    return unsubscribe
  })

  // Auto-dismiss after 6 seconds
  useEffect(() => {
    if (!visible) return
    const timer = setTimeout(() => {
      closeFact()
    }, 6000)
    return () => clearTimeout(timer)
  }, [visible, closeFact])

  const handleDismiss = () => {
    setVisible(false)
    closeFact()
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ x: 360, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 360, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 120, damping: 18 }}
          className="fixed bottom-10 right-10 z-[9999] max-w-sm pointer-events-auto"
        >
          <div className="relative rounded-none overflow-hidden border-4 border-[#E8506A] shadow-pixel bg-[#0a0a0a]/95">
            {/* Neon pink header bar */}
            <div className="bg-[#E8506A] px-4 py-2 flex items-center justify-between">
              <p className="font-pixel text-[8px] text-[#0a0a0a] tracking-[0.2em]">
                PULMO-FACT
              </p>
              {/* X button — peach bg, black X, pointer-events-auto */}
              <button
                onClick={handleDismiss}
                className="pointer-events-auto w-6 h-6 flex items-center justify-center bg-[#0a0a0a] text-[#E8506A] hover:bg-[#E8506A] hover:text-[#0a0a0a] border border-[#E8506A] transition-colors rounded-none"
              >
                <X size={14} />
              </button>
            </div>

            {/* Body */}
            <div className="p-5">
              <p className="font-mono text-sm text-[#E8506A] leading-relaxed">
                &ldquo;Early detection of pulmonary fibrosis can slow progression by up to 50%.
                Every breath analyzed is a step toward saving lives.&rdquo;
              </p>
              <p className="mt-3 text-retro-cream/30 text-xs font-mono">
                — Pulmonary Disease Research Foundation
              </p>
            </div>

            {/* Auto-dismiss progress bar — peach */}
            <motion.div
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: 6, ease: 'linear' }}
              className="h-[3px] bg-[#E8506A] origin-left"
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
