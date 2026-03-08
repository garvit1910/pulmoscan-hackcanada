'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useMotionValue, useTransform, animate } from 'framer-motion'
import type { BreathingPoint, PredictionResult } from './types'

export function useDashboardState() {
  const zoomLevel = useMotionValue(1)
  const dashboardOpacity = useTransform(zoomLevel, [1, 10, 50], [1, 0.5, 0.2])
  const quoteOpacity = useTransform(zoomLevel, [1, 40, 45, 50], [0, 0, 0.8, 1])

  const [breathingData, setBreathingData] = useState<BreathingPoint[]>([])
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [predictionResult, setPredictionResult] = useState<PredictionResult | null>(null)
  const [isPredicting, setIsPredicting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // PROCESS REAPER — track pending timers for cleanup
  const predictTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Immediately dismiss the fact/quote overlay
  const closeFact = useCallback(() => {
    animate(zoomLevel, 1, {
      duration: 1.5,
      ease: [0.6, 0.01, 0.05, 0.95],
    })
  }, [zoomLevel])

  const handleBreathingComplete = useCallback((points: BreathingPoint[]) => {
    setBreathingData(points)
    setError(null)
  }, [])

  const handleFileUpload = useCallback((file: File) => {
    setUploadedFile(file)
    setError(null)
  }, [])

  const handlePredict = useCallback(() => {
    // Always dismiss fact first
    closeFact()

    // Validate input
    if (breathingData.length === 0 && !uploadedFile) {
      setError('Please draw a breathing pattern or upload a file first.')
      return
    }

    // Clear any pending prediction timer
    if (predictTimerRef.current) {
      clearTimeout(predictTimerRef.current)
      predictTimerRef.current = null
    }

    setError(null)
    setIsPredicting(true)

    // Trigger "System Overdrive" zoom
    animate(zoomLevel, 50, {
      duration: 3,
      ease: [0.6, 0.01, 0.05, 0.95],
    })

    // No backend endpoint for breathing pattern analysis yet
    setError('Breathing pattern analysis is not yet connected to a backend endpoint.')
    setIsPredicting(false)
  }, [breathingData, uploadedFile, zoomLevel, closeFact])

  const handleReset = useCallback(() => {
    // Kill pending prediction timer
    if (predictTimerRef.current) {
      clearTimeout(predictTimerRef.current)
      predictTimerRef.current = null
    }
    closeFact()
    setBreathingData([])
    setUploadedFile(null)
    setPredictionResult(null)
    setIsPredicting(false)
    setError(null)
  }, [closeFact])

  const handleClearBreathing = useCallback(() => {
    setBreathingData([])
  }, [])

  // PROCESS REAPER — cleanup on unmount
  useEffect(() => {
    return () => {
      if (predictTimerRef.current) {
        clearTimeout(predictTimerRef.current)
        predictTimerRef.current = null
      }
    }
  }, [])

  return {
    zoomLevel,
    dashboardOpacity,
    quoteOpacity,
    breathingData,
    uploadedFile,
    predictionResult,
    isPredicting,
    error,
    closeFact,
    handleBreathingComplete,
    handleFileUpload,
    handlePredict,
    handleReset,
    handleClearBreathing,
  }
}
