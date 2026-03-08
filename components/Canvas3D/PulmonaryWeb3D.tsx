'use client'

import { type MotionValue } from 'framer-motion'
import { usePulmonaryWeb3D } from './usePulmonaryWeb3D'
import DiagnosticQuote from './DiagnosticQuote'

interface PulmonaryWeb3DProps {
  zoomLevel: MotionValue<number>
  quoteOpacity: MotionValue<number>
  onQuoteClose?: () => void
}

export default function PulmonaryWeb3D({ zoomLevel, quoteOpacity, onQuoteClose }: PulmonaryWeb3DProps) {
  const canvasRef = usePulmonaryWeb3D(zoomLevel)

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
      <DiagnosticQuote quoteOpacity={quoteOpacity} onClose={onQuoteClose} />
    </>
  )
}
