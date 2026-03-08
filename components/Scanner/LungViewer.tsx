'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Activity } from 'lucide-react'
import RetroLoadingBar from '@/components/ui/RetroLoadingBar'

interface LungViewerProps {
  isAnalyzing: boolean
  processingMessage: string
  hasResult: boolean
}

export default function LungViewer({
  isAnalyzing,
  processingMessage,
  hasResult,
}: LungViewerProps) {
  // Smooth progress for the retro loading bar
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (!isAnalyzing) {
      setProgress(0)
      return
    }
    // Animate to ~90% over 12s, reaching 100% only when done
    let step = 0
    const maxSteps = 120
    const timer = setInterval(() => {
      step++
      // Ease-out curve: fast start, slow toward 90%
      const pct = 90 * (1 - Math.pow(1 - step / maxSteps, 2))
      setProgress(Math.min(pct, 90))
      if (step >= maxSteps) clearInterval(timer)
    }, 100)

    return () => clearInterval(timer)
  }, [isAnalyzing])

  // Jump to 100% when analysis completes
  useEffect(() => {
    if (hasResult && !isAnalyzing) setProgress(100)
  }, [hasResult, isAnalyzing])
  return (
    <div className="relative w-full aspect-square max-h-[400px] rounded-none pixel-border overflow-hidden flex items-center justify-center">
      {/* Empty scan area */}
      {!isAnalyzing && !hasResult && (
        <div className="flex flex-col items-center gap-3 text-retro-cream/30">
          <Activity size={48} strokeWidth={1} />
          <span className="font-mono text-sm">Awaiting CT Scan</span>
        </div>
      )}

      {/* Processing overlay with retro loading bar */}
      {isAnalyzing && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 flex flex-col items-center justify-center bg-dark-base/80"
        >
          <RetroLoadingBar
            progress={progress}
            label="SCANNING"
            message={processingMessage}
          />
        </motion.div>
      )}

      {/* Completed badge */}
      {hasResult && !isAnalyzing && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 bg-primary-coral/15 border-2 border-primary-coral rounded-none shadow-pixel-sm"
        >
          <Activity size={12} className="text-primary-coral" />
          <span className="text-xs text-primary-coral font-mono">
            Analysis Complete
          </span>
        </motion.div>
      )}
    </div>
  )
}
