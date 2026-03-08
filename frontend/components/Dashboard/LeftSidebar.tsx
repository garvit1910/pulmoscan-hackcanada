'use client'

import { motion } from 'framer-motion'

export default function LeftSidebar() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.6 }}
      className="glass-red rounded-2xl p-6 border border-white/10 space-y-6"
    >
      {/* Model Metrics */}
      <div>
        <h3 className="text-xl font-sora font-semibold text-electric-blue mb-4">
          Model Metrics
        </h3>
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-zinc-400">Accuracy</span>
            <span className="text-crimson font-semibold">96.8%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">Sensitivity</span>
            <span className="text-crimson font-semibold">94.2%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">Specificity</span>
            <span className="text-crimson font-semibold">97.1%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">F1-Score</span>
            <span className="text-crimson font-semibold">95.5%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">AUC-ROC</span>
            <span className="text-crimson font-semibold">0.982</span>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-white/5" />

      {/* Tips */}
      <div>
        <h3 className="text-xl font-sora font-semibold text-electric-blue mb-4">
          Breathing Pattern Tips
        </h3>
        <ul className="space-y-2 text-zinc-400 text-sm">
          <li className="flex items-start gap-2">
            <span className="text-crimson mt-0.5">•</span>
            <span>Draw a smooth, continuous breathing pattern</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-crimson mt-0.5">•</span>
            <span>Trace the inhale/exhale cycle steadily</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-crimson mt-0.5">•</span>
            <span>Maintain consistent pressure while drawing</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-crimson mt-0.5">•</span>
            <span>Irregular patterns may indicate pulmonary issues</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-crimson mt-0.5">•</span>
            <span>Upload a CT scan for more accurate results</span>
          </li>
        </ul>
      </div>
    </motion.div>
  )
}
