'use client'

import { motion } from 'framer-motion'
import PulmonaryWeb3D from '@/components/Canvas3D/PulmonaryWeb3D'
import DiagnosticQuote from '@/components/Canvas3D/DiagnosticQuote'
import Navigation from './Navigation'
import LeftSidebar from './LeftSidebar'
import CenterWorkspace from './CenterWorkspace'
import RightPanel from './RightPanel'
import { useDashboardState } from './useDashboardState'

export default function DashboardLayout() {
  const state = useDashboardState()

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

      {/* Dashboard Grid */}
      <motion.div
        style={{ opacity: state.dashboardOpacity }}
        className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 pt-20 min-h-screen"
      >
        {/* Left Column */}
        <div className="lg:col-span-3">
          <LeftSidebar />
        </div>

        {/* Center Column */}
        <div className="lg:col-span-6">
          <CenterWorkspace
            uploadedFile={state.uploadedFile}
            breathingData={state.breathingData}
            onBreathingComplete={state.handleBreathingComplete}
            onFileUpload={state.handleFileUpload}
            onPredict={state.handlePredict}
            onClearBreathing={state.handleClearBreathing}
            isPredicting={state.isPredicting}
            error={state.error}
          />
        </div>

        {/* Right Column */}
        <div className="lg:col-span-3">
          <RightPanel
            predictionResult={state.predictionResult}
            breathingData={state.breathingData}
            onReset={state.handleReset}
          />
        </div>
      </motion.div>
    </div>
  )
}
