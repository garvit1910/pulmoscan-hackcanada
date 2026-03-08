'use client'

import { motion } from 'framer-motion'
import type { PredictionResult, BreathingPoint } from './types'

interface RightPanelProps {
  predictionResult: PredictionResult | null
  breathingData: BreathingPoint[]
  onReset: () => void
}

export default function RightPanel({ predictionResult, breathingData, onReset }: RightPanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.6 }}
      className="glass-red rounded-2xl p-6 border border-white/10 space-y-6"
    >
      {/* Raw JSON Output */}
      <div>
        <h3 className="text-xl font-sora font-semibold text-electric-blue mb-4">
          Prediction Output
        </h3>
        {predictionResult ? (
          <div className="space-y-4">
            <div className="bg-black/40 rounded-lg p-4 border border-white/5">
              <pre className="text-xs text-zinc-400 overflow-auto max-h-64 font-mono">
                {JSON.stringify(predictionResult, null, 2)}
              </pre>
            </div>
            <button
              onClick={onReset}
              className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors"
            >
              Reset
            </button>
          </div>
        ) : (
          <div className="bg-black/40 rounded-lg p-4 border border-white/5">
            <p className="text-zinc-500 text-sm italic">
              No prediction yet. Draw a breathing pattern or upload a file and click &quot;Run Prediction&quot;.
            </p>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-white/5" />

      {/* Drawing Data Info */}
      <div>
        <h3 className="text-xl font-sora font-semibold text-electric-blue mb-4">
          Input Data
        </h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-zinc-400">Data Points</span>
            <span className="text-crimson font-semibold">{breathingData.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">Status</span>
            <span className={`font-semibold ${breathingData.length > 0 ? 'text-green-400' : 'text-zinc-500'}`}>
              {breathingData.length > 0 ? 'Ready' : 'Awaiting Input'}
            </span>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-white/5" />

      {/* Help */}
      <div>
        <h3 className="text-xl font-sora font-semibold text-electric-blue mb-4">
          Help
        </h3>
        <ul className="space-y-2 text-zinc-400 text-sm">
          <li className="flex items-start gap-2">
            <span className="text-crimson mt-0.5">1.</span>
            <span>Draw a breathing pattern on the canvas</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-crimson mt-0.5">2.</span>
            <span>Or upload a pulmonary CT scan / X-ray</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-crimson mt-0.5">3.</span>
            <span>Click &quot;Run Prediction&quot; to analyze</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-crimson mt-0.5">4.</span>
            <span>View results in the output panel above</span>
          </li>
        </ul>
      </div>
    </motion.div>
  )
}
