'use client'

import { useEffect, useState } from 'react'
import { type MotionValue, motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import { usePulmonaryWeb3D } from './usePulmonaryWeb3D'

interface PulmonaryWeb3DProps {
  zoomLevel: MotionValue<number>
}

export default function PulmonaryWeb3D({ zoomLevel }: PulmonaryWeb3DProps) {
  const { canvasRef, activeSacFact } = usePulmonaryWeb3D(zoomLevel)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  return (
    <>
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{
          willChange: 'transform',
          transform: 'translateZ(0)',
        }}
      />

      {/* Sac Fact overlay — portalled to body to escape z-0 stacking context */}
      {mounted && createPortal(
        <SacFactOverlay fact={activeSacFact} />,
        document.body,
      )}
    </>
  )
}

/** Minimal fact window that slides in when a sac cluster reaches the camera */
function SacFactOverlay({ fact }: { fact: string | null }) {
  return (
    <AnimatePresence>
      {fact && (
        <motion.div
          key={fact}
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -20, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 22 }}
          className="fixed bottom-10 right-10 z-[100] pointer-events-none"
        >
          <div className="bg-[#0a0a0a]/90 border-2 border-[#FF775E] px-6 py-3 max-w-md">
            <p className="font-pixel text-[7px] text-[#FF775E] tracking-[0.2em] mb-1">
              ALVEOLAR SAC
            </p>
            <p className="font-mono text-xs text-[#FF775E]/80 leading-relaxed">
              {fact}
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
