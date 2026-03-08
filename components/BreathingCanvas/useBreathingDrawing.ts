'use client'

import { useCallback, useRef, useState } from 'react'
import type { BreathingPoint } from './types'

interface UseBreathingDrawingOptions {
  onComplete?: (points: BreathingPoint[]) => void
}

export function useBreathingDrawing({ onComplete }: UseBreathingDrawingOptions = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [points, setPoints] = useState<BreathingPoint[]>([])
  const pointsRef = useRef<BreathingPoint[]>([])

  const getPos = useCallback((e: React.MouseEvent | React.TouchEvent): { x: number; y: number } => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()

    if ('touches' in e) {
      const touch = e.touches[0]
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
      }
    }

    return {
      x: (e as React.MouseEvent).clientX - rect.left,
      y: (e as React.MouseEvent).clientY - rect.top,
    }
  }, [])

  const drawLine = useCallback((from: BreathingPoint, to: BreathingPoint) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.strokeStyle = '#E8506A'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
  }, [])

  const handleStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    const pos = getPos(e)
    const point: BreathingPoint = { ...pos, timestamp: Date.now() }
    pointsRef.current = [point]
    setPoints([point])
    setIsDrawing(true)
  }, [getPos])

  const handleMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return
    e.preventDefault()
    const pos = getPos(e)
    const point: BreathingPoint = { ...pos, timestamp: Date.now() }
    const prevPoint = pointsRef.current[pointsRef.current.length - 1]
    pointsRef.current.push(point)
    setPoints([...pointsRef.current])
    if (prevPoint) {
      drawLine(prevPoint, point)
    }
  }, [isDrawing, getPos, drawLine])

  const handleEnd = useCallback(() => {
    if (!isDrawing) return
    setIsDrawing(false)
    if (onComplete && pointsRef.current.length > 0) {
      onComplete([...pointsRef.current])
    }
  }, [isDrawing, onComplete])

  const clear = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    pointsRef.current = []
    setPoints([])
  }, [])

  return {
    canvasRef,
    points,
    isDrawing,
    handleStart,
    handleMove,
    handleEnd,
    clear,
  }
}
