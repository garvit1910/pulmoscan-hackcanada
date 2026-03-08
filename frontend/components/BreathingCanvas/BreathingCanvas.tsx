'use client'

import { useEffect } from 'react'
import { useBreathingDrawing } from './useBreathingDrawing'
import type { BreathingPoint } from './types'

interface BreathingCanvasProps {
  onComplete?: (points: BreathingPoint[]) => void
  onClear?: () => void
}

export default function BreathingCanvas({ onComplete, onClear }: BreathingCanvasProps) {
  const {
    canvasRef,
    handleStart,
    handleMove,
    handleEnd,
    clear,
  } = useBreathingDrawing({ onComplete })

  // Initialize canvas background on mount
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }, [canvasRef])

  const handleClear = () => {
    clear()
    onClear?.()
  }

  return (
    <div className="space-y-3">
      <canvas
        ref={canvasRef}
        width={400}
        height={400}
        className="w-full aspect-square bg-deep-black border border-white/10 rounded-lg cursor-crosshair"
        onMouseDown={handleStart}
        onMouseMove={handleMove}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
        onTouchStart={handleStart}
        onTouchMove={handleMove}
        onTouchEnd={handleEnd}
      />
      <button
        onClick={handleClear}
        className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors"
      >
        Clear Canvas
      </button>
    </div>
  )
}
