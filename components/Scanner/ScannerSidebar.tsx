'use client'

import { motion } from 'framer-motion'
import { Brain, ShieldCheck, Gauge, TrendingDown, Info, Activity } from 'lucide-react'

export default function ScannerSidebar() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.6 }}
      className="glass-red rounded-2xl p-6 border border-white/10 space-y-6"
    >
      {/* Model Info */}
      <div>
        <h3 className="text-xl font-sora font-semibold text-electric-blue mb-4 flex items-center gap-2">
          <Brain size={18} />
          Model Info
        </h3>
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-zinc-400">Model</span>
            <span className="text-crimson font-semibold text-sm">PulmoScan v2.1</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">Architecture</span>
            <span className="text-crimson font-semibold text-sm">3D-ResNet + LSTM</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">Training Data</span>
            <span className="text-crimson font-semibold text-sm">OSIC + Chest CT</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">Input</span>
            <span className="text-crimson font-semibold text-sm">DICOM CT Slices</span>
          </div>
        </div>
      </div>

      <div className="border-t border-white/5" />

      {/* Capabilities */}
      <div>
        <h3 className="text-xl font-sora font-semibold text-electric-blue mb-4 flex items-center gap-2">
          <ShieldCheck size={18} />
          Detection Capabilities
        </h3>
        <ul className="space-y-2.5 text-sm">
          <li className="flex items-start gap-2 text-zinc-400">
            <Gauge size={14} className="text-crimson mt-0.5 shrink-0" />
            <span>Pulmonary fibrosis severity scoring</span>
          </li>
          <li className="flex items-start gap-2 text-zinc-400">
            <TrendingDown size={14} className="text-crimson mt-0.5 shrink-0" />
            <span>FVC decline rate prediction</span>
          </li>
          <li className="flex items-start gap-2 text-zinc-400">
            <Info size={14} className="text-crimson mt-0.5 shrink-0" />
            <span>COPD / Pneumonia differential</span>
          </li>
          <li className="flex items-start gap-2 text-zinc-400">
            <Activity size={14} className="text-crimson mt-0.5 shrink-0" />
            <span>3D lung volume reconstruction</span>
          </li>
        </ul>
      </div>
    </motion.div>
  )
}
