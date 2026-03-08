'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Activity, AlertTriangle, Shield, Crosshair, Layers, HeartPulse, Microscope } from 'lucide-react'
import RetroLoadingBar from '@/components/ui/RetroLoadingBar'
import type { AnalysisResult } from './useScannerState'

interface LungViewerProps {
  isAnalyzing: boolean
  processingMessage: string
  hasResult: boolean
  analysisResult?: AnalysisResult | null
}

const SEVERITY_COLORS: Record<string, string> = {
  low: 'text-green-400',
  moderate: 'text-amber-400',
  high: 'text-orange-400',
  critical: 'text-red-400',
}

const SEVERITY_BG: Record<string, string> = {
  low: 'bg-green-500/10 border-green-500/20',
  moderate: 'bg-amber-500/10 border-amber-500/20',
  high: 'bg-orange-500/10 border-orange-500/20',
  critical: 'bg-red-500/10 border-red-500/20',
}

export default function LungViewer({
  isAnalyzing,
  processingMessage,
  hasResult,
  analysisResult,
}: LungViewerProps) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (!isAnalyzing) {
      setProgress(0)
      return
    }
    let step = 0
    const maxSteps = 120
    const timer = setInterval(() => {
      step++
      const pct = 90 * (1 - Math.pow(1 - step / maxSteps, 2))
      setProgress(Math.min(pct, 90))
      if (step >= maxSteps) clearInterval(timer)
    }, 100)
    return () => clearInterval(timer)
  }, [isAnalyzing])

  useEffect(() => {
    if (hasResult && !isAnalyzing) setProgress(100)
  }, [hasResult, isAnalyzing])

  // Derived metrics from scan_result
  const scanResult = analysisResult?.scan_result
  const findings = scanResult?.findings ?? []
  const findingCount = findings.length
  const criticalCount = findings.filter((f: any) => f.severity === 'critical').length
  const highCount = findings.filter((f: any) => f.severity === 'high').length
  const moderateCount = findings.filter((f: any) => f.severity === 'moderate').length
  const lowCount = findings.filter((f: any) => f.severity === 'low').length
  const avgConfidence = findingCount > 0
    ? findings.reduce((s: number, f: any) => s + f.confidence, 0) / findingCount
    : 0
  const lobesAffected = new Set(findings.map((f: any) => f.lobe)).size
  const uniqueTypes = [...new Set(findings.map((f: any) => f.type))] as string[]
  const largestFinding = findings.reduce((max: any, f: any) => (f.size_mm > (max?.size_mm ?? 0) ? f : max), null as any)

  return (
    <div className="relative w-full rounded-none pixel-border overflow-hidden">
      {/* ─── Empty state ─── */}
      {!isAnalyzing && !hasResult && (
        <div className="flex flex-col items-center justify-center gap-3 text-retro-cream/30 h-[200px]">
          <Activity size={48} strokeWidth={1} />
          <span className="font-mono text-sm">Awaiting CT Scan</span>
        </div>
      )}

      {/* ─── Scanning / loading ─── */}
      {isAnalyzing && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center bg-dark-base/80 py-16"
        >
          <RetroLoadingBar
            progress={progress}
            label="SCANNING"
            message={processingMessage}
          />
        </motion.div>
      )}

      {/* ─── Results dashboard (replaces the empty box) ─── */}
      <AnimatePresence>
        {hasResult && !isAnalyzing && analysisResult && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="p-4 space-y-4"
          >
            {/* Top row — headline metrics */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Microscope size={16} className="text-electric-blue" />
                <span className="text-sm font-sora font-semibold text-electric-blue">Analysis Results</span>
              </div>
              <span className="text-[10px] font-mono text-zinc-500">
                {new Date(analysisResult.timestamp).toLocaleTimeString()}
              </span>
            </div>

            {/* Severity banner */}
            {analysisResult.severity && (
              <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${SEVERITY_BG[analysisResult.severity] || 'bg-zinc-800/50 border-zinc-700'}`}>
                <Shield size={20} className={SEVERITY_COLORS[analysisResult.severity] || 'text-zinc-400'} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-zinc-500">Overall Severity</p>
                  <p className={`font-semibold text-lg capitalize ${SEVERITY_COLORS[analysisResult.severity] || 'text-zinc-300'}`}>
                    {analysisResult.severity}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-zinc-500">Confidence</p>
                  <p className="text-crimson font-mono font-bold text-lg">
                    {(analysisResult.confidence * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
            )}

            {/* Stat grid — 4 columns */}
            <div className="grid grid-cols-4 gap-2">
              <div className="bg-black/30 rounded-lg p-3 border border-white/5 text-center">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Findings</p>
                <p className="text-crimson font-bold text-xl mt-1">{findingCount}</p>
              </div>
              <div className="bg-black/30 rounded-lg p-3 border border-white/5 text-center">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Lobes Hit</p>
                <p className="text-crimson font-bold text-xl mt-1">{lobesAffected}<span className="text-xs text-zinc-500">/5</span></p>
              </div>
              <div className="bg-black/30 rounded-lg p-3 border border-white/5 text-center">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Avg Conf</p>
                <p className="text-crimson font-bold text-xl mt-1">{(avgConfidence * 100).toFixed(0)}%</p>
              </div>
              <div className="bg-black/30 rounded-lg p-3 border border-white/5 text-center">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Largest</p>
                <p className="text-crimson font-bold text-xl mt-1">{largestFinding ? `${largestFinding.size_mm.toFixed(0)}` : '—'}<span className="text-xs text-zinc-500">mm</span></p>
              </div>
            </div>

            {/* Severity breakdown bar */}
            <div className="space-y-1.5">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Severity Breakdown</p>
              <div className="flex gap-1 h-3 rounded-full overflow-hidden bg-black/30">
                {criticalCount > 0 && <div className="bg-red-500 transition-all" style={{ flex: criticalCount }} />}
                {highCount > 0 && <div className="bg-orange-500 transition-all" style={{ flex: highCount }} />}
                {moderateCount > 0 && <div className="bg-amber-400 transition-all" style={{ flex: moderateCount }} />}
                {lowCount > 0 && <div className="bg-green-400 transition-all" style={{ flex: lowCount }} />}
              </div>
              <div className="flex justify-between text-[10px] font-mono">
                <span className="text-red-400">{criticalCount} critical</span>
                <span className="text-orange-400">{highCount} high</span>
                <span className="text-amber-400">{moderateCount} moderate</span>
                <span className="text-green-400">{lowCount} low</span>
              </div>
            </div>

            {/* Finding types */}
            <div className="flex flex-wrap gap-1.5">
              {uniqueTypes.map((type) => (
                <span key={type} className="px-2 py-1 rounded bg-white/5 border border-white/10 text-[10px] font-mono text-zinc-400">
                  {type.replace(/_/g, ' ')}
                </span>
              ))}
            </div>

            {/* Scan metadata */}
            {scanResult && (
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-black/20 rounded-lg px-3 py-2 border border-white/5">
                  <p className="text-[10px] text-zinc-500">Modality</p>
                  <p className="text-zinc-300 font-mono text-xs mt-0.5">{scanResult.scan_metadata?.modality || 'CT'}</p>
                </div>
                <div className="bg-black/20 rounded-lg px-3 py-2 border border-white/5">
                  <p className="text-[10px] text-zinc-500">Slices</p>
                  <p className="text-zinc-300 font-mono text-xs mt-0.5">{scanResult.scan_metadata?.slice_count || '—'}</p>
                </div>
                <div className="bg-black/20 rounded-lg px-3 py-2 border border-white/5">
                  <p className="text-[10px] text-zinc-500">Spacing</p>
                  <p className="text-zinc-300 font-mono text-xs mt-0.5">{scanResult.scan_metadata?.voxel_spacing?.join(' × ') || '—'} mm</p>
                </div>
              </div>
            )}

            {/* Top findings list */}
            {findings.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                  <Crosshair size={10} /> Top Findings
                </p>
                <div className="space-y-1 max-h-[140px] overflow-y-auto pr-1">
                  {findings.slice(0, 6).map((f: any) => (
                    <div
                      key={f.id}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/20 border border-white/5 text-xs"
                    >
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          f.severity === 'critical' ? 'bg-red-500' :
                          f.severity === 'high' ? 'bg-orange-500' :
                          f.severity === 'moderate' ? 'bg-amber-400' : 'bg-green-400'
                        }`}
                      />
                      <span className="text-zinc-300 flex-1 truncate">{f.label || f.type.replace(/_/g, ' ')}</span>
                      <span className="text-zinc-500 font-mono">{f.size_mm?.toFixed(0)}mm</span>
                      <span className="text-zinc-500 font-mono">{(f.confidence * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Prediction summary */}
            <div className="bg-black/20 rounded-lg px-4 py-3 border border-white/5">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Summary</p>
              <p className="text-xs text-zinc-300 leading-relaxed">{analysisResult.prediction}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
