'use client'

import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { RotateCcw, Box, AlertTriangle } from 'lucide-react'
import PulmonaryWeb3D from '@/components/Canvas3D/PulmonaryWeb3D'
import DiagnosticQuote from '@/components/Canvas3D/DiagnosticQuote'
import Navigation from '@/components/Dashboard/Navigation'
import ScannerSidebar from './ScannerSidebar'
import PatientPicker from './PatientPicker'
import LungViewer from './LungViewer'
import AnalyzeButton from './AnalyzeButton'
import { useScannerState } from './useScannerState'

export default function ScannerLayout() {
  const state = useScannerState()
  const router = useRouter()

  const handleVisualize = () => {
    if (!state.analysisResult) return
    sessionStorage.setItem('scan_result', JSON.stringify(state.analysisResult.scan_result))
    const params = new URLSearchParams({
      prediction: state.analysisResult.prediction,
      confidence: String(state.analysisResult.confidence),
      severity: state.analysisResult.severity || '',
      patient: state.analysisResult.patient_id,
    })
    router.push(`/scanner/visualize?${params.toString()}`)
  }

  return (
    <div className="min-h-screen w-full bg-dark-base overflow-hidden relative">
      {/* 3D Background */}
      <div className="absolute inset-0 z-0">
        <PulmonaryWeb3D zoomLevel={state.zoomLevel} />
      </div>

      {/* Navigation */}
      <Navigation />

      {/* Fact toast — rendered outside z-0 parent so z-50 works */}
      <DiagnosticQuote
        quoteOpacity={state.quoteOpacity}
        closeFact={state.closeFact}
      />

      {/* Scanner Grid — 3-6-3 layout */}
      <motion.div
        style={{ opacity: state.dashboardOpacity }}
        className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 pt-20 min-h-screen"
      >
        {/* Left Column — Model Info */}
        <div className="lg:col-span-3">
          <ScannerSidebar />
        </div>

        {/* Center Column — CT Scan Analysis (scanner + results unified) */}
        <div className="lg:col-span-6 space-y-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="glass-red rounded-none p-6 border border-white/10 space-y-6"
          >
            <h3 className="text-xl font-sora font-semibold text-electric-blue">
              CT Scan Analysis
            </h3>

            {/* Lung Viewer — scanner / loading / results area */}
            <LungViewer
              isAnalyzing={state.isAnalyzing}
              processingMessage={state.processingMessage}
              hasResult={!!state.analysisResult}
              analysisResult={state.analysisResult}
            />

            {/* ── Action buttons when results available ── */}
            {state.analysisResult && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="space-y-3"
              >
                {/* Raw JSON (collapsible) */}
                <details className="group">
                  <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-300 transition-colors">
                    Raw JSON ▸
                  </summary>
                  <div className="mt-2 bg-black/40 rounded-lg p-3 border border-white/5">
                    <pre className="text-xs text-zinc-400 overflow-auto max-h-48 font-mono">
                      {JSON.stringify(state.analysisResult.scan_result, null, 2)}
                    </pre>
                  </div>
                </details>

                <div className="flex gap-2">
                  <button
                    onClick={handleVisualize}
                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#E8506A] hover:bg-[#d44460] text-[#0a0a0a] font-pixel text-xs rounded-lg transition-colors shadow-[0_0_15px_rgba(232,80,106,0.3)] hover:shadow-[0_0_25px_rgba(232,80,106,0.5)]"
                  >
                    <Box size={16} />
                    Visualize in 3D
                  </button>
                  <button
                    onClick={state.handleReset}
                    className="px-4 flex items-center justify-center gap-2 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors"
                  >
                    <RotateCcw size={14} />
                    Reset
                  </button>
                </div>
              </motion.div>
            )}

            {/* Patient Picker — hidden once results are showing */}
            {!state.analysisResult && (
              <>
                <PatientPicker
                  patients={state.patients}
                  patientsLoading={state.patientsLoading}
                  patientsError={state.patientsError}
                  selectedPatient={state.selectedPatient}
                  uploadedFile={state.uploadedFile}
                  activeTab={state.activeTab}
                  onTabChange={state.setActiveTab}
                  onSelectPatient={state.handleSelectPatient}
                  onFileUpload={state.handleFileUpload}
                  onRefresh={state.fetchPatients}
                />

                {/* Error */}
                {state.analysisError && (
                  <div className="flex items-start gap-2 text-red-400 text-sm bg-red-900/20 border border-red-900/30 rounded-lg p-3">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    {state.analysisError}
                  </div>
                )}

                {/* Analyze Button */}
                <AnalyzeButton
                  onClick={state.handleAnalyze}
                  isAnalyzing={state.isAnalyzing}
                />
              </>
            )}
          </motion.div>
        </div>

        {/* Right Column — Patient Info only */}
        <div className="lg:col-span-3">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="glass-red rounded-2xl p-6 border border-white/10"
          >
            <h3 className="text-xl font-sora font-semibold text-electric-blue mb-4">
              Selected Patient
            </h3>
            {state.selectedPatient ? (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Patient ID</span>
                  <span className="text-crimson font-semibold font-mono text-xs">
                    {state.selectedPatient.patient_id.slice(0, 14)}...
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Slices</span>
                  <span className="text-crimson font-semibold">
                    {state.selectedPatient.slice_count}
                  </span>
                </div>
                {state.selectedPatient.subset && (
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Subset</span>
                    <span className={`font-semibold ${
                      state.selectedPatient.subset === 'train' ? 'text-blue-400' : 'text-purple-400'
                    }`}>
                      {state.selectedPatient.subset}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-zinc-500 text-sm italic">None selected</p>
            )}
          </motion.div>
        </div>
      </motion.div>
    </div>
  )
}
