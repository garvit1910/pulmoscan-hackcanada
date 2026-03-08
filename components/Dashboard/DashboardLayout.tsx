'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import PulmonaryWeb3D from '@/components/Canvas3D/PulmonaryWeb3D'
import DiagnosticQuote from '@/components/Canvas3D/DiagnosticQuote'
import Navigation from './Navigation'
import LeftSidebar from './LeftSidebar'
import CenterWorkspace from './CenterWorkspace'
import RightPanel from './RightPanel'
import { useDashboardState } from './useDashboardState'
import { Activity, Cpu, Scan, BarChart3, Shield, Stethoscope, FileText, ArrowRight } from 'lucide-react'

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
        className="relative z-10 p-4 pt-20 min-h-screen space-y-4"
      >
        {/* Quick Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { icon: Cpu, label: 'Model Status', value: 'Online', color: '#4ADE80' },
            { icon: Activity, label: 'Scans Today', value: '24', color: '#E8506A' },
            { icon: Shield, label: 'Accuracy', value: '96.8%', color: '#E8506A' },
            { icon: BarChart3, label: 'Avg Confidence', value: '94.2%', color: '#E8506A' },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.05 }}
              className="glass-red rounded-lg p-4 border border-white/10"
            >
              <div className="flex items-center gap-2 mb-2">
                <stat.icon size={14} style={{ color: stat.color }} />
                <span className="text-xs text-zinc-500 uppercase tracking-wider">{stat.label}</span>
              </div>
              <p className="text-lg font-semibold font-mono" style={{ color: stat.color }}>
                {stat.value}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Main 3-col grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
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
        </div>

        {/* Quick Actions Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Link href="/scanner" className="block glass-red rounded-lg p-5 border border-white/10 hover:border-primary-coral/30 transition-all group">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Scan size={18} className="text-primary-coral" />
                  <h4 className="font-sora font-semibold text-white/90">CT Scan Analysis</h4>
                </div>
                <ArrowRight size={14} className="text-zinc-600 group-hover:text-primary-coral transition-colors" />
              </div>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Upload DICOM CT scans for AI-powered fibrosis detection with 3D visualization of affected regions.
              </p>
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
          >
            <Link href="/learn-more" className="block glass-red rounded-lg p-5 border border-white/10 hover:border-primary-coral/30 transition-all group">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Stethoscope size={18} className="text-primary-coral" />
                  <h4 className="font-sora font-semibold text-white/90">Learn More</h4>
                </div>
                <ArrowRight size={14} className="text-zinc-600 group-hover:text-primary-coral transition-colors" />
              </div>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Understand how PulmoScan&apos;s 3D-ResNet + LSTM pipeline detects pulmonary fibrosis patterns.
              </p>
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <Link href="/citations" className="block glass-red rounded-lg p-5 border border-white/10 hover:border-primary-coral/30 transition-all group">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <FileText size={18} className="text-primary-coral" />
                  <h4 className="font-sora font-semibold text-white/90">Citations</h4>
                </div>
                <ArrowRight size={14} className="text-zinc-600 group-hover:text-primary-coral transition-colors" />
              </div>
              <p className="text-xs text-zinc-500 leading-relaxed">
                View peer-reviewed research papers and clinical datasets behind PulmoScan&apos;s detection model.
              </p>
            </Link>
          </motion.div>
        </div>

        {/* System Activity / Recent Scans */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
          className="glass-red rounded-lg p-5 border border-white/10"
        >
          <h3 className="text-lg font-sora font-semibold text-electric-blue mb-4 flex items-center gap-2">
            <Activity size={16} />
            Recent System Activity
          </h3>
          <div className="space-y-3">
            {[
              { time: '2 min ago', event: 'CT scan analysis completed', status: 'Fibrosis Detected', statusColor: '#EF4444', confidence: '94.2%' },
              { time: '15 min ago', event: 'Breathing pattern analyzed', status: 'Normal', statusColor: '#4ADE80', confidence: '97.1%' },
              { time: '1 hr ago', event: 'Model recalibration', status: 'Complete', statusColor: '#4ADE80', confidence: '—' },
              { time: '2 hrs ago', event: 'CT scan analysis completed', status: 'COPD Indicators', statusColor: '#FCD34D', confidence: '88.5%' },
              { time: '3 hrs ago', event: 'Batch processing (12 scans)', status: 'Complete', statusColor: '#4ADE80', confidence: '—' },
            ].map((entry, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-2 border-b border-white/5 last:border-0"
              >
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-zinc-600 font-mono w-16 shrink-0">{entry.time}</span>
                  <span className="text-sm text-zinc-400">{entry.event}</span>
                </div>
                <div className="flex items-center gap-4">
                  {entry.confidence !== '—' && (
                    <span className="text-xs text-zinc-500 font-mono">{entry.confidence}</span>
                  )}
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded"
                    style={{
                      color: entry.statusColor,
                      background: entry.statusColor + '15',
                      border: `1px solid ${entry.statusColor}30`,
                    }}
                  >
                    {entry.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </div>
  )
}
