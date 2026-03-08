'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useMotionValue, useTransform, animate } from 'framer-motion'

// --- Types ---

export interface Patient {
  patient_id: string
  slice_count: number
  subset: string
}

export interface ScanFinding {
  id: string
  type: string
  severity: string
  confidence: number
  center_world: number[]
  size_mm: number
  description: string
}

export interface ScanResult {
  scan_id: string
  patient: { id: string; age: number | null; sex: string | null }
  scan_metadata: { modality: string; slice_count: number; voxel_spacing: number[] }
  volumes: {
    lung: { url: string; format: string }
    pathology_mask: { url: string; format: string }
    original_ct: { url: string; format: string }
  }
  findings: ScanFinding[]
  summary: string
}

export interface AnalysisResult {
  patient_id: string
  prediction: string
  confidence: number
  severity?: string
  scan_result: ScanResult
  timestamp: string
}

type ActiveTab = 'patients' | 'upload'

const PROCESSING_MESSAGES = [
  'Loading CT scan slices...',
  'Preprocessing DICOM data...',
  'Segmenting lung regions...',
  'Extracting radiological features...',
  'Running fibrosis detection model...',
  'Building 3D visualization...',
  'Computing FVC predictions...',
  'Generating analysis report...',
]

// --- Hook ---

export function useScannerState() {
  const zoomLevel = useMotionValue(1)
  const dashboardOpacity = useTransform(zoomLevel, [1, 10, 50], [1, 0.5, 0.2])
  const quoteOpacity = useTransform(zoomLevel, [1, 40, 45, 50], [0, 0, 0.8, 1])

  const [patients, setPatients] = useState<Patient[]>([])
  const [patientsLoading, setPatientsLoading] = useState(false)
  const [patientsError, setPatientsError] = useState<string | null>(null)

  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [activeTab, setActiveTab] = useState<ActiveTab>('patients')

  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [processingMessage, setProcessingMessage] = useState('')
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)

  // PROCESS REAPER — refs for all async handles
  const messageIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const analyzeTimersRef = useRef<NodeJS.Timeout[]>([])
  const abortControllerRef = useRef<AbortController | null>(null)

  // Immediately dismiss the fact/quote overlay
  const closeFact = useCallback(() => {
    animate(zoomLevel, 1, {
      duration: 1.5,
      ease: [0.6, 0.01, 0.05, 0.95],
    })
  }, [zoomLevel])

  // Fetch patients on mount
  useEffect(() => {
    fetchPatients()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Cycle processing messages during analysis
  useEffect(() => {
    if (isAnalyzing) {
      let idx = 0
      setProcessingMessage(PROCESSING_MESSAGES[0])
      messageIntervalRef.current = setInterval(() => {
        idx = (idx + 1) % PROCESSING_MESSAGES.length
        setProcessingMessage(PROCESSING_MESSAGES[idx])
      }, 4000)
    } else {
      if (messageIntervalRef.current) {
        clearInterval(messageIntervalRef.current)
        messageIntervalRef.current = null
      }
      setProcessingMessage('')
    }

    return () => {
      if (messageIntervalRef.current) {
        clearInterval(messageIntervalRef.current)
      }
    }
  }, [isAnalyzing])

  // PROCESS REAPER — cleanup ALL async handles on unmount
  useEffect(() => {
    return () => {
      if (messageIntervalRef.current) {
        clearInterval(messageIntervalRef.current)
        messageIntervalRef.current = null
      }
      for (const t of analyzeTimersRef.current) clearTimeout(t)
      analyzeTimersRef.current = []
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
    }
  }, [])

  // Helper: register a tracked timer
  const trackedTimeout = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      analyzeTimersRef.current = analyzeTimersRef.current.filter((t) => t !== id)
      fn()
    }, ms)
    analyzeTimersRef.current.push(id)
    return id
  }, [])

  // Helper: clear all tracked timers
  const clearTrackedTimers = useCallback(() => {
    for (const t of analyzeTimersRef.current) clearTimeout(t)
    analyzeTimersRef.current = []
  }, [])

  const fetchPatients = useCallback(async () => {
    setPatientsLoading(true)
    setPatientsError(null)
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/patients`)
      if (!res.ok) throw new Error(`Server responded ${res.status}`)
      const data = await res.json()
      setPatients(Array.isArray(data) ? data : data.patients || [])
    } catch (err) {
      setPatientsError(
        err instanceof Error ? err.message : 'Failed to fetch patients'
      )
    } finally {
      setPatientsLoading(false)
    }
  }, [])

  const handleSelectPatient = useCallback((patient: Patient) => {
    setSelectedPatient(patient)
    setAnalysisResult(null)
    setAnalysisError(null)
  }, [])

  const handleFileUpload = useCallback((file: File) => {
    setUploadedFile(file)
    setAnalysisResult(null)
    setAnalysisError(null)
  }, [])

  const handleAnalyze = useCallback(async () => {
    // Always dismiss fact first
    closeFact()

    if (activeTab === 'patients' && !selectedPatient) {
      setAnalysisError('Please select a patient first.')
      return
    }
    if (activeTab === 'upload' && !uploadedFile) {
      setAnalysisError('Please upload a file first.')
      return
    }

    // PROCESS REAPER — kill any in-flight analysis
    clearTrackedTimers()
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    setAnalysisError(null)
    setIsAnalyzing(true)
    setAnalysisResult(null)

    // Trigger zoom animation
    animate(zoomLevel, 50, {
      duration: 3,
      ease: [0.6, 0.01, 0.05, 0.95],
    })

    try {
      const formData = new FormData()
      if (activeTab === 'patients' && selectedPatient) {
        formData.append('patient_id', selectedPatient.patient_id)
      } else if (activeTab === 'upload' && uploadedFile) {
        formData.append('file', uploadedFile)
      }

      const controller = new AbortController()
      abortControllerRef.current = controller

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/analyze`, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      }).finally(() => {
        abortControllerRef.current = null
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Server error ${res.status}: ${text}`)
      }

      const data: ScanResult = await res.json()
      const findings = data.findings ?? []
      const sortedByConf = [...findings].sort((a, b) => b.confidence - a.confidence)
      const topConf = sortedByConf[0]?.confidence ?? 0
      const SEVERITY_ORDER = ['critical', 'high', 'moderate', 'low']
      const mostSevere = findings.reduce<ScanFinding | null>((worst, f) => {
        const wi = SEVERITY_ORDER.indexOf(worst?.severity ?? '')
        const fi = SEVERITY_ORDER.indexOf(f.severity)
        return fi !== -1 && (wi === -1 || fi < wi) ? f : worst
      }, null)

      setAnalysisResult({
        patient_id: selectedPatient?.patient_id || 'uploaded_file',
        prediction: data.summary || 'Analysis complete',
        confidence: topConf,
        severity: mostSevere?.severity,
        scan_result: data,
        timestamp: new Date().toISOString(),
      })
    } catch (err) {
      setAnalysisError(
        err instanceof Error ? err.message : 'Analysis failed'
      )
    } finally {
      setIsAnalyzing(false)
    }
  }, [activeTab, selectedPatient, uploadedFile, zoomLevel, closeFact, clearTrackedTimers])

  const handleReset = useCallback(() => {
    // PROCESS REAPER — kill in-flight analysis
    clearTrackedTimers()
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    closeFact()
    setSelectedPatient(null)
    setUploadedFile(null)
    setAnalysisResult(null)
    setAnalysisError(null)
    setIsAnalyzing(false)
  }, [closeFact, clearTrackedTimers])

  return {
    // Motion values
    zoomLevel,
    dashboardOpacity,
    quoteOpacity,
    // Patients
    patients,
    patientsLoading,
    patientsError,
    fetchPatients,
    // Selection
    selectedPatient,
    uploadedFile,
    activeTab,
    setActiveTab,
    handleSelectPatient,
    handleFileUpload,
    // Analysis
    isAnalyzing,
    processingMessage,
    analysisResult,
    analysisError,
    handleAnalyze,
    handleReset,
    closeFact,
  }
}
