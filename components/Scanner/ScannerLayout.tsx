'use client'

import { motion } from 'framer-motion'
import PulmonaryWeb3D from '@/components/Canvas3D/PulmonaryWeb3D'
import Navigation from '@/components/Dashboard/Navigation'
import ScannerSidebar from './ScannerSidebar'
import PatientPicker from './PatientPicker'
import LungViewer from './LungViewer'
import AnalyzeButton from './AnalyzeButton'
import ScannerResults from './ScannerResults'
import { useScannerState } from './useScannerState'

export default function ScannerLayout() {
  const state = useScannerState()

  return (
    <div className="min-h-screen w-full bg-dark-base overflow-hidden relative">
      {/* 3D Background */}
      <div className="absolute inset-0 z-0">
        <PulmonaryWeb3D
          zoomLevel={state.zoomLevel}
          quoteOpacity={state.quoteOpacity}
        />
      </div>

      {/* Navigation */}
      <Navigation />

      {/* Scanner Grid — 3-6-3 layout */}
      <motion.div
        style={{ opacity: state.dashboardOpacity }}
        className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 pt-20 min-h-screen"
      >
        {/* Left Column — Model Info */}
        <div className="lg:col-span-3">
          <ScannerSidebar />
        </div>

        {/* Center Column — LungViewer + Patient Picker + Analyze */}
        <div className="lg:col-span-6 space-y-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="glass-red rounded-2xl p-6 border border-white/10 space-y-6"
          >
            <h3 className="text-xl font-sora font-semibold text-electric-blue">
              CT Scan Analysis
            </h3>

            {/* Lung Viewer */}
            <LungViewer
              isAnalyzing={state.isAnalyzing}
              processingMessage={state.processingMessage}
              hasResult={!!state.analysisResult}
            />

            {/* Patient Picker */}
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
              <div className="text-red-400 text-sm bg-red-900/20 border border-red-900/30 rounded-lg p-3">
                {state.analysisError}
              </div>
            )}

            {/* Analyze Button */}
            <AnalyzeButton
              onClick={state.handleAnalyze}
              isAnalyzing={state.isAnalyzing}
            />
          </motion.div>
        </div>

        {/* Right Column — Results */}
        <div className="lg:col-span-3">
          <ScannerResults
            analysisResult={state.analysisResult}
            selectedPatient={state.selectedPatient}
            analysisError={state.analysisError}
            onReset={state.handleReset}
          />
        </div>
      </motion.div>
    </div>
  )
}
