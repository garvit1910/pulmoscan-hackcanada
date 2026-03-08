'use client'

import Link from 'next/link'
import { motion, useMotionValue } from 'framer-motion'
import PulmonaryWeb3D from '@/components/Canvas3D/PulmonaryWeb3D'
import { Activity, BookOpen, FileText, Cpu, Shield, BarChart3 } from 'lucide-react'

const features = [
  {
    icon: Cpu,
    title: '3D-ResNet + LSTM',
    desc: 'Deep learning pipeline trained on thousands of CT volumes for fibrosis detection.',
  },
  {
    icon: Activity,
    title: 'Real-Time FVC Prediction',
    desc: 'Predicts forced vital capacity decline over time with high confidence.',
  },
  {
    icon: Shield,
    title: 'Clinical-Grade Accuracy',
    desc: 'Built on peer-reviewed datasets and validated against clinical guidelines.',
  },
  {
    icon: BarChart3,
    title: 'Severity Classification',
    desc: 'Classifies fibrosis severity from mild to critical with visual explanations.',
  },
]

export default function Home() {
  const zoomLevel = useMotionValue(1)
  const quoteOpacity = useMotionValue(0)

  return (
    <main className="min-h-[200vh] w-full bg-dark-base overflow-x-hidden relative">
      {/* 3D Background — fixed behind everything */}
      <div className="fixed inset-0 z-0">
        <PulmonaryWeb3D zoomLevel={zoomLevel} quoteOpacity={quoteOpacity} />
      </div>

      {/* ═══════════ HERO SECTION ═══════════ */}
      <section className="relative z-10 flex flex-col items-center justify-center min-h-screen text-center px-4">
        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.6, 0.01, 0.05, 0.95] }}
          className="font-pixel text-4xl md:text-6xl text-primary-coral glow-text-coral tracking-wider"
        >
          PulmoScan
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="font-mono text-lg md:text-2xl text-retro-cream/70 mt-4 max-w-xl"
        >
          Advanced Pulmonary Disease Detection using AI
        </motion.p>

        {/* ── Button Group ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.5 }}
          className="flex flex-wrap items-center justify-center gap-4 mt-10"
        >
          <Link href="/scanner" className="btn-retro px-6 py-3 font-pixel text-xs md:text-sm">
            Open Dashboard
          </Link>
          <Link href="/learn-more" className="btn-retro-outline px-6 py-3 font-pixel text-xs md:text-sm flex items-center gap-2">
            <BookOpen className="w-4 h-4" />
            Learn More
          </Link>
          <Link href="/citations" className="btn-retro-outline px-6 py-3 font-pixel text-xs md:text-sm flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Citations
          </Link>
        </motion.div>

        {/* Scroll hint */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.6 }}
          className="absolute bottom-8 left-0 right-0 text-center"
        >
          <p className="font-mono text-sm text-retro-cream/30 animate-pulse-slow">
            ▼&nbsp; scroll to explore &nbsp;▼
          </p>
        </motion.div>
      </section>

      {/* ═══════════ FEATURE CARDS ═══════════ */}
      <section className="relative z-10 px-4 py-24 max-w-5xl mx-auto">
        <motion.h2
          initial={{ scale: 0.8, opacity: 0 }}
          whileInView={{ scale: 1, opacity: 1 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.5, ease: [0.6, 0.01, 0.05, 0.95] }}
          className="font-pixel text-xl md:text-2xl text-primary-coral text-center mb-16 glow-text-coral"
        >
          What Powers PulmoScan
        </motion.h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {features.map((f, i) => {
            const Icon = f.icon
            return (
              <motion.div
                key={i}
                initial={{ scale: 0.8, opacity: 0 }}
                whileInView={{ scale: 1, opacity: 1 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{
                  delay: i * 0.1,
                  duration: 0.5,
                  ease: [0.6, 0.01, 0.05, 0.95],
                }}
                className="pixel-border p-6 hover:shadow-coral-glow transition-shadow"
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-10 h-10 pixel-border-sm flex items-center justify-center">
                    <Icon className="w-5 h-5 text-primary-coral" />
                  </div>
                  <div>
                    <h3 className="font-pixel text-xs text-primary-coral mb-2">
                      {f.title}
                    </h3>
                    <p className="font-mono text-sm text-retro-cream/70 leading-relaxed">
                      {f.desc}
                    </p>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      </section>

      {/* ═══════════ CTA ═══════════ */}
      <section className="relative z-10 text-center pb-24 px-4">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          whileInView={{ scale: 1, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <Link href="/scanner" className="btn-retro px-8 py-4 font-pixel text-xs md:text-sm inline-block">
            Start Scanning →
          </Link>
        </motion.div>
      </section>
    </main>
  )
}
