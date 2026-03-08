'use client'

import Link from 'next/link'
import { useMotionValue } from 'framer-motion'
import PulmonaryWeb3D from '@/components/Canvas3D/PulmonaryWeb3D'

export default function Home() {
  const zoomLevel = useMotionValue(1)
  const quoteOpacity = useMotionValue(0)

  return (
    <main className="min-h-screen w-full bg-black overflow-hidden relative">
      {/* 3D Background */}
      <div className="absolute inset-0 z-0">
        <PulmonaryWeb3D zoomLevel={zoomLevel} quoteOpacity={quoteOpacity} />
      </div>

      {/* Top-right nav */}
      <div className="absolute top-6 right-6 z-10">
        <Link
          href="/dashboard"
          className="px-6 py-3 bg-crimson/20 hover:bg-crimson/30 text-crimson border border-crimson/50 rounded-lg backdrop-blur-sm transition-colors"
        >
          Open Dashboard
        </Link>
      </div>

      {/* Content overlay */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen text-center px-4">
        <h1 className="text-6xl md:text-8xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-orange-500">
          PulmoScan
        </h1>
        <p className="text-xl md:text-2xl text-zinc-400 mt-4">
          Advanced Pulmonary Disease Detection using AI
        </p>

        {/* Bottom instruction */}
        <div className="absolute bottom-8 left-0 right-0 text-center">
          <p className="text-sm text-zinc-500">
            Navigate to the <span className="text-crimson font-semibold">dashboard</span> to begin analysis
          </p>
        </div>
      </div>
    </main>
  )
}
