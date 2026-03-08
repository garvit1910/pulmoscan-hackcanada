'use client'

import { memo } from 'react'
import { motion, useTransform } from 'framer-motion'
import { X } from 'lucide-react'
import type { HiddenQuoteProps } from './types'

interface ExtendedHiddenQuoteProps extends HiddenQuoteProps {
  onClose?: () => void
}

const HiddenQuote = memo(function HiddenQuote({ zoomScale, onClose }: ExtendedHiddenQuoteProps) {
  const opacity = useTransform(zoomScale, [1, 15, 16, 20], [0, 0, 0.8, 1])
  const scale = useTransform(zoomScale, [1, 15, 16, 20], [0.5, 0.5, 0.9, 1])
  const pointerEvents = useTransform(opacity, (v) => (v > 0.3 ? 'auto' : 'none') as 'auto' | 'none')

  return (
    <motion.div
      style={{ opacity, scale, pointerEvents }}
      className="absolute inset-0 flex items-center justify-center z-10"
    >
      <div className="relative pixel-border p-8 max-w-lg mx-4 rounded-none">
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center border-2 border-primary-coral text-primary-coral hover:bg-primary-coral hover:text-dark-base transition-colors rounded-none shadow-pixel-sm active:translate-x-[1px] active:translate-y-[1px]"
          >
            <X size={16} />
          </button>
        )}
        <p className="text-2xl font-mono text-primary-coral glow-text-coral leading-relaxed">
          &ldquo;Pulmonary fibrosis causes irreversible scarring. By the time symptoms appear,
          up to 50% of lung function may already be lost.&rdquo;
        </p>
        <p className="mt-4 text-retro-cream/40 text-sm font-mono">
          — American Lung Association
        </p>
      </div>
    </motion.div>
  )
})

export default HiddenQuote
