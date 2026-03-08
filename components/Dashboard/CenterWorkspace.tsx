'use client'

import { useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import BreathingCanvas from '@/components/BreathingCanvas/BreathingCanvas'
import PredictButton from './PredictButton'
import type { BreathingPoint } from './types'

interface CenterWorkspaceProps {
  uploadedFile: File | null
  breathingData: BreathingPoint[]
  onBreathingComplete: (points: BreathingPoint[]) => void
  onFileUpload: (file: File) => void
  onPredict: () => void
  onClearBreathing: () => void
  isPredicting: boolean
  error: string | null
}

export default function CenterWorkspace({
  uploadedFile,
  onBreathingComplete,
  onFileUpload,
  onPredict,
  onClearBreathing,
  isPredicting,
  error,
}: CenterWorkspaceProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      onFileUpload(file)
    }
  }, [onFileUpload])

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.6 }}
      className="glass-red rounded-2xl p-6 border border-white/10 space-y-6"
    >
      {/* Breathing Pattern Test */}
      <div>
        <h3 className="text-xl font-sora font-semibold text-electric-blue mb-4">
          Breathing Pattern Test
        </h3>
        <p className="text-zinc-400 text-sm mb-4">
          Draw a breathing pattern below, or upload a pulmonary scan file.
        </p>
        <BreathingCanvas
          onComplete={onBreathingComplete}
          onClear={onClearBreathing}
        />
      </div>

      {/* File Upload */}
      <div>
        <h3 className="text-xl font-sora font-semibold text-electric-blue mb-4">
          Upload Scan
        </h3>
        <input
          ref={fileInputRef}
          type="file"
          accept=".png,.jpg,.jpeg,.dicom,.nii,.nii.gz"
          onChange={handleFileChange}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full py-3 border border-dashed border-white/20 rounded-lg text-zinc-400 hover:text-zinc-300 hover:border-white/30 transition-colors text-sm"
        >
          {uploadedFile ? (
            <span className="text-crimson font-semibold">{uploadedFile.name}</span>
          ) : (
            'Click to upload CT scan or X-ray'
          )}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="text-red-400 text-sm bg-red-900/20 border border-red-900/30 rounded-lg p-3">
          {error}
        </div>
      )}

      {/* Predict Button */}
      <PredictButton onClick={onPredict} isPredicting={isPredicting} />
    </motion.div>
  )
}
