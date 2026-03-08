'use client'

import { Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import Navigation from '@/components/Dashboard/Navigation'

/**
 * ─── ML INTEGRATION GUIDE ───────────────────────────────────
 * This page receives analysis results via URL search params.
 * The ScannerResults component routes here after ML inference.
 *
 * URL params consumed:
 *   prediction  — string  (e.g. "Pulmonary Fibrosis Detected")
 *   confidence  — float   (0-1, e.g. 0.94)
 *   severity    — string  ("Mild" | "Moderate" | "Severe" | "Critical")
 *   fvc         — int?    (FVC prediction in mL, optional)
 *   patient     — string  (patient ID)
 *
 * To integrate your ML model:
 *   1. After inference, build URLSearchParams with keys above
 *   2. router.push(`/scanner/visualize?${params.toString()}`)
 *   3. Read the params below and render your own 3D visualization
 *      component in the empty viewport area.
 * ────────────────────────────────────────────────────────────
 */
function VisualizeContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  /* ── Extract ML results from URL params ── */
  const prediction = searchParams.get('prediction') || 'Pulmonary Fibrosis Detected'
  const confidence = parseFloat(searchParams.get('confidence') || '0.94')
  const severity = searchParams.get('severity') || 'Moderate'
  const fvcPrediction = searchParams.get('fvc') ? parseInt(searchParams.get('fvc')!) : undefined
  const patientId = searchParams.get('patient') || 'Unknown'

  return (
    <div className="min-h-screen w-full bg-dark-base overflow-hidden relative">
      <Navigation />

      {/* Top bar — back button + title */}
      <div className="fixed top-16 left-0 right-0 z-30 px-4 py-3">
        <div className="flex items-center justify-between max-w-7xl mx-auto px-4 py-3">
          {/* Back button */}
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

          {/* Title — centered */}
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
              Real-time fibrosis mapping
            </p>
          </motion.div>

          {/* Spacer to balance the row */}
          <div className="w-[72px] shrink-0" />
        </div>
      </div>

      {/*
       * ── VISUALIZATION VIEWPORT ──────────────────────────────
       * This is the empty viewport where the ML-backed 3D lung
       * visualization should be rendered.
       *
       * Available data from URL params:
       *   prediction   = "{prediction}"
       *   confidence   = {confidence}
       *   severity     = "{severity}"
       *   fvcPrediction = {fvcPrediction ?? 'N/A'}
       *   patientId    = "{patientId}"
       *
       * Replace the placeholder below with your 3D component.
       * ────────────────────────────────────────────────────────
       */}
      <div className="absolute inset-0 z-10 pt-28 flex items-center justify-center">
        <p className="font-mono text-sm text-retro-cream/20">
          3D visualization will render here
        </p>
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
