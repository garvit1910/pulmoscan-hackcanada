'use client'

import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { FileJson, RotateCcw, AlertTriangle, Box } from 'lucide-react'
import type { AnalysisResult, Patient } from './useScannerState'

interface ScannerResultsProps {
  analysisResult: AnalysisResult | null
  selectedPatient: Patient | null
  analysisError: string | null
  onReset: () => void
}

export default function ScannerResults({
  analysisResult,
  selectedPatient,
  analysisError,
  onReset,
}: ScannerResultsProps) {
  const router = useRouter()

  const handleVisualize = () => {
    if (!analysisResult) return
    sessionStorage.setItem('scan_result', JSON.stringify(analysisResult.scan_result))
    const params = new URLSearchParams({
      prediction: analysisResult.prediction,
      confidence: String(analysisResult.confidence),
      severity: analysisResult.severity || '',
      patient: analysisResult.patient_id,
    })
    router.push(`/scanner/visualize?${params.toString()}`)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.6 }}
      className="glass-red rounded-2xl p-6 border border-white/10 space-y-6"
    >
      {/* Analysis Output */}
      <div>
        <h3 className="text-xl font-sora font-semibold text-electric-blue mb-4 flex items-center gap-2">
          <FileJson size={18} />
          Analysis Output
        </h3>

        {analysisError && (
          <div className="flex items-start gap-2 mb-4 text-sm text-red-400 bg-red-900/20 border border-red-900/30 rounded-lg p-3">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            {analysisError}
          </div>
        )}

        {analysisResult ? (
          <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-black/30 rounded-lg p-3 border border-white/5">
                <p className="text-xs text-zinc-500">Prediction</p>
                <p className="text-crimson font-semibold text-sm mt-1">
                  {analysisResult.prediction}
                </p>
              </div>
              <div className="bg-black/30 rounded-lg p-3 border border-white/5">
                <p className="text-xs text-zinc-500">Confidence</p>
                <p className="text-crimson font-semibold text-sm mt-1">
                  {(analysisResult.confidence * 100).toFixed(1)}%
                </p>
              </div>
              {analysisResult.severity && (
                <div className="bg-black/30 rounded-lg p-3 border border-white/5">
                  <p className="text-xs text-zinc-500">Severity</p>
                  <p className="text-amber-400 font-semibold text-sm mt-1">
                    {analysisResult.severity}
                  </p>
                </div>
              )}

            </div>

            {/* Raw JSON */}
            <div className="bg-black/40 rounded-lg p-3 border border-white/5">
              <pre className="text-xs text-zinc-400 overflow-auto max-h-48 font-mono">
                {JSON.stringify(analysisResult.scan_result, null, 2)}
              </pre>
            </div>

            <button
              onClick={handleVisualize}
              className="w-full flex items-center justify-center gap-2 py-3 bg-[#E8506A] hover:bg-[#d44460] text-[#0a0a0a] font-pixel text-xs rounded-lg transition-colors shadow-[0_0_15px_rgba(232,80,106,0.3)] hover:shadow-[0_0_25px_rgba(232,80,106,0.5)]"
            >
              <Box size={16} />
              Visualize in 3D
            </button>

            <button
              onClick={onReset}
              className="w-full flex items-center justify-center gap-2 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors"
            >
              <RotateCcw size={14} />
              Reset
            </button>
          </div>
        ) : (
          <div className="bg-black/40 rounded-lg p-4 border border-white/5">
            <p className="text-zinc-500 text-sm italic">
              No analysis yet. Select a patient and click &quot;Analyze Scan&quot;.
            </p>
          </div>
        )}
      </div>

      <div className="border-t border-white/5" />

      {/* Selected Patient Info */}
      <div>
        <h3 className="text-xl font-sora font-semibold text-electric-blue mb-4">
          Selected Patient
        </h3>
        {selectedPatient ? (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-400">Patient ID</span>
              <span className="text-crimson font-semibold font-mono text-xs">
                {selectedPatient.patient_id.slice(0, 14)}...
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Slices</span>
              <span className="text-crimson font-semibold">
                {selectedPatient.slice_count}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Subset</span>
              <span className={`font-semibold ${
                selectedPatient.subset === 'train' ? 'text-blue-400' : 'text-purple-400'
              }`}>
                {selectedPatient.subset}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-zinc-500 text-sm italic">None selected</p>
        )}
      </div>
    </motion.div>
  )
}
