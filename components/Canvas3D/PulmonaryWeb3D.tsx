'use client'

import { type MotionValue } from 'framer-motion'
import { usePulmonaryWeb3D } from './usePulmonaryWeb3D'

interface PulmonaryWeb3DProps {
  zoomLevel: MotionValue<number>
}

export default function PulmonaryWeb3D({ zoomLevel }: PulmonaryWeb3DProps) {
  const canvasRef = usePulmonaryWeb3D(zoomLevel)

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0"
      style={{
        willChange: 'transform',
        transform: 'translateZ(0)',
      }}
    />
  )
}
