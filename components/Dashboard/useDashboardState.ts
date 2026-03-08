'use client'

import { useState, useCallback } from 'react'
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

  const handleBreathingComplete = useCallback((points: BreathingPoint[]) => {
    setBreathingData(points)
    setError(null)
  }, [])

  const handleFileUpload = useCallback((file: File) => {
    setUploadedFile(file)
    setError(null)
  }, [])

  const handlePredict = useCallback(() => {
    // Validate input
    if (breathingData.length === 0 && !uploadedFile) {
      setError('Please draw a breathing pattern or upload a file first.')
      return
    }

    setError(null)
    setIsPredicting(true)

    // Trigger "System Overdrive" zoom
    animate(zoomLevel, 50, {
      duration: 3,
      ease: [0.6, 0.01, 0.05, 0.95],
    })

    // After 3s: set mock prediction result
    setTimeout(() => {
      const mockResult: PredictionResult = {
        prediction: 'Pulmonary Fibrosis Detected',
        confidence: 0.94,
        details: [
          { condition: 'Pulmonary Fibrosis', probability: 0.94 },
          { condition: 'COPD', probability: 0.03 },
          { condition: 'Pneumonia', probability: 0.02 },
          { condition: 'Healthy', probability: 0.01 },
        ],
        timestamp: new Date().toISOString(),
        inputType: uploadedFile ? 'file_upload' : 'breathing_pattern',
      }

      setPredictionResult(mockResult)
      setIsPredicting(false)
    }, 3000)
  }, [breathingData, uploadedFile, zoomLevel])

  const handleReset = useCallback(() => {
    animate(zoomLevel, 1, {
      duration: 2,
      ease: [0.6, 0.01, 0.05, 0.95],
    })
    setBreathingData([])
    setUploadedFile(null)
    setPredictionResult(null)
    setIsPredicting(false)
    setError(null)
  }, [zoomLevel])

  const handleClearBreathing = useCallback(() => {
    setBreathingData([])
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
    handleBreathingComplete,
    handleFileUpload,
    handlePredict,
    handleReset,
    handleClearBreathing,
  }
}
