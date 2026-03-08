'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence, useTransform, type MotionValue } from 'framer-motion'
import { X } from 'lucide-react'

interface DiagnosticQuoteProps {
  quoteOpacity: MotionValue<number>
  onClose?: () => void
}

export default function DiagnosticQuote({ quoteOpacity, onClose }: DiagnosticQuoteProps) {
  const [visible, setVisible] = useState(false)

  // Track the MotionValue — show toast when opacity crosses threshold
  useEffect(() => {
    const unsubscribe = quoteOpacity.on('change', (v) => {
      if (v > 0.4 && !visible) setVisible(true)
      if (v < 0.1 && visible) setVisible(false)
    })
    return unsubscribe
  })

  // Auto-dismiss after 5 seconds
  useEffect(() => {
    if (!visible) return
    const timer = setTimeout(() => {
      onClose?.()
    }, 5000)
    return () => clearTimeout(timer)
  }, [visible, onClose])

  const handleDismiss = () => {
    setVisible(false)
    onClose?.()
  }

  // Derive a simple opacity number for the toast backdrop
  const backdropOpacity = useTransform(quoteOpacity, [0, 0.5, 1], [0, 0, 0.3])

  return (
    <>
      {/* Subtle backdrop dim — not a full overlay */}
      <motion.div
        style={{ opacity: backdropOpacity }}
        className="fixed inset-0 bg-dark-base pointer-events-none z-19"
      />

      {/* Floating toast — bottom-right */}
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ x: 320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 320, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 120, damping: 18 }}
            className="fixed bottom-6 right-6 z-20 max-w-sm"
          >
            <div className="relative pixel-border rounded-none p-5 pr-10">
              {/* Close X */}
              <button
                onClick={handleDismiss}
                className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center text-[#FF775E] hover:bg-[#FF775E] hover:text-[#120D0B] transition-colors"
              >
                <X size={14} />
              </button>

              <p className="font-pixel text-[8px] text-[#FF775E] mb-2 leading-relaxed tracking-wide">
                PULMO-FACT
              </p>
              <p className="font-mono text-sm text-retro-cream/80 leading-relaxed">
                &ldquo;Early detection of pulmonary fibrosis can slow progression by up to 50%.
                Every breath analyzed is a step toward saving lives.&rdquo;
              </p>
              <p className="mt-3 text-retro-cream/30 text-xs font-mono">
                — Pulmonary Disease Research Foundation
              </p>

              {/* Auto-dismiss progress bar */}
              <motion.div
                initial={{ scaleX: 1 }}
                animate={{ scaleX: 0 }}
                transition={{ duration: 5, ease: 'linear' }}
                className="absolute bottom-0 left-0 right-0 h-[3px] bg-[#FF775E] origin-left"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
