'use client'

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import dynamic from 'next/dynamic'
import Navigation from '@/components/Dashboard/Navigation'
import type { ScanResult } from '@/components/Scanner/useScannerState'

const LungViewer = dynamic(() => import('../../../viewer/LungViewer'), { ssr: false })

function VisualizeContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const prediction = searchParams.get('prediction') || ''
  const confidence = parseFloat(searchParams.get('confidence') || '0')
  const severity = searchParams.get('severity') || ''
  const patientId = searchParams.get('patient') || 'Unknown'

  const [scanResult, setScanResult] = useState<ScanResult | null>(null)

  useEffect(() => {
    const raw = sessionStorage.getItem('scan_result')
    if (raw) {
      try {
        setScanResult(JSON.parse(raw))
      } catch {
        // corrupt or missing
      }
    }
  }, [])

  return (
    <div className="min-h-screen w-full bg-dark-base overflow-hidden relative">
      <Navigation />

      {/* Top bar — back button + title */}
      <div className="fixed top-16 left-0 right-0 z-30 px-4 py-3">
        <div className="flex items-center justify-between max-w-7xl mx-auto px-4 py-3">
          <motion.button
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            onClick={() => router.push('/scanner')}
            className="flex items-center gap-2 px-3 py-1.5 border border-white/10 rounded-md
                       text-retro-cream/70 hover:text-white hover:border-primary-coral/40 transition-all
                       text-sm font-mono shrink-0"
          >
            <ArrowLeft size={14} />
            Back
          </motion.button>

          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-center"
          >
            <h1 className="font-pixel text-sm md:text-lg text-primary-coral glow-text-coral tracking-wider">
              3D Lung Visualization
            </h1>
            <p className="font-mono text-[10px] text-retro-cream/40 mt-0.5">
              {patientId !== 'Unknown' ? `Patient ${patientId.slice(0, 14)}…` : 'Real-time fibrosis mapping'}
            </p>
          </motion.div>

          <div className="w-[72px] shrink-0" />
        </div>
      </div>

      {/* 3D Viewer — fills below the top bar */}
      <div className="absolute inset-0 z-10 pt-28">
        {scanResult ? (
          <LungViewer scanData={scanResult} />
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="font-mono text-sm text-retro-cream/30">
              No scan data — run an analysis first.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default function VisualizePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen w-full bg-dark-base flex items-center justify-center">
        <p className="font-pixel text-sm text-primary-coral/50 animate-pulse">Loading...</p>
      </div>
    }>
      <VisualizeContent />
    </Suspense>
  )
}
