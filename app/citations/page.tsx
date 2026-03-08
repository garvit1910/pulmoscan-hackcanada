'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { ArrowLeft, ExternalLink, Database, BookOpen } from 'lucide-react'
import PulmonaryWeb3D from '@/components/Canvas3D/PulmonaryWeb3D'
import Navigation from '@/components/Dashboard/Navigation'
import RetroLoadingBar from '@/components/ui/RetroLoadingBar'
import { useMotionValue } from 'framer-motion'

interface Citation {
  id: number
  title: string
  authors: string
  source: string
  year: number
  url: string
  description: string
  icon: typeof Database
}

const citations: Citation[] = [
  {
    id: 1,
    title: 'OSIC Pulmonary Fibrosis Progression',
    authors: 'Open Source Imaging Consortium (OSIC)',
    source: 'Kaggle Competition',
    year: 2020,
    url: 'https://www.kaggle.com/c/osic-pulmonary-fibrosis-progression',
    description:
      'A Kaggle competition dataset containing CT scans and clinical data from pulmonary fibrosis patients. The task involved predicting the decline in lung function (FVC) over time. This dataset forms the backbone of our FVC prediction model and severity classification.',
    icon: Database,
  },
  {
    id: 2,
    title: 'Chest CT-Scan Images Dataset',
    authors: 'Mohamed Hany',
    source: 'Kaggle Dataset',
    year: 2020,
    url: 'https://www.kaggle.com/datasets/mohamedhanyyy/chest-ctscan-images',
    description:
      'A curated collection of chest CT scan images organized by pathological findings. Used to supplement training data for our 3D-ResNet feature extractor, improving spatial pattern recognition across diverse scanner types and patient demographics.',
    icon: Database,
  },
  {
    id: 3,
    title: '3D ResNets for Action Recognition',
    authors: 'Hara, K., Kataoka, H., & Satoh, Y.',
    source: 'CVPR Workshop',
    year: 2018,
    url: 'https://arxiv.org/abs/1711.09577',
    description:
      'Foundational work on extending ResNet architectures to 3D volumetric data. Our model adapts this architecture for medical CT volume analysis, replacing temporal video features with spatial slice-based features for lung tissue classification.',
    icon: BookOpen,
  },
  {
    id: 4,
    title: 'Long Short-Term Memory (LSTM)',
    authors: 'Hochreiter, S. & Schmidhuber, J.',
    source: 'Neural Computation',
    year: 1997,
    url: 'https://doi.org/10.1162/neco.1997.9.8.1735',
    description:
      'The seminal paper on LSTM networks. Our pipeline uses LSTM layers after the 3D-ResNet feature extractor to model sequential relationships between CT slices, capturing progression patterns that static models miss.',
    icon: BookOpen,
  },
  {
    id: 5,
    title: 'Idiopathic Pulmonary Fibrosis Clinical Guidelines',
    authors: 'Raghu, G. et al.',
    source: 'American Journal of Respiratory and Critical Care Medicine',
    year: 2018,
    url: 'https://doi.org/10.1164/rccm.201807-1255ST',
    description:
      'Clinical practice guidelines for diagnosis of idiopathic pulmonary fibrosis. These guidelines informed our severity classification thresholds and the clinical relevance scoring used in PulmoScan predictions.',
    icon: BookOpen,
  },
]

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.12 },
  },
}

const cardVariants = {
  hidden: { opacity: 0, x: -30, scale: 0.97 },
  visible: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: { duration: 0.5, ease: [0.6, 0.01, 0.05, 0.95] },
  },
}

export default function CitationsPage() {
  const zoomLevel = useMotionValue(5)

  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const duration = 1500 // 1.5s
    const steps = 30
    const interval = duration / steps
    let step = 0

    const timer = setInterval(() => {
      step++
      setProgress((step / steps) * 100)
      if (step >= steps) {
        clearInterval(timer)
        setLoading(false)
      }
    }, interval)

    return () => clearInterval(timer)
  }, [])

  return (
    <div className="min-h-screen w-full bg-dark-base overflow-x-hidden relative">
      {/* 3D Background */}
      <div className="absolute inset-0 z-0 opacity-30">
        <PulmonaryWeb3D zoomLevel={zoomLevel} />
      </div>

      {/* Navigation */}
      <Navigation />

      {/* Loading State */}
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="loader"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative z-10 flex items-center justify-center min-h-screen"
          >
            <RetroLoadingBar
              progress={progress}
              label="SYSTEM INITIALIZATION"
              message="Loading citation database..."
            />
          </motion.div>
        ) : (
          <motion.div
            key="content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="relative z-10"
          >

      {/* Content */}
      <div className="pt-24 pb-16 px-4 max-w-4xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.6, 0.01, 0.05, 0.95] }}
          className="mb-12 text-center"
        >
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors mb-8"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
          <h1 className="font-pixel text-2xl md:text-4xl text-primary-coral glow-text-coral mb-4">
            Citations & References
          </h1>
          <p className="font-mono text-retro-cream/60 text-lg max-w-2xl mx-auto">
            Datasets, papers, and clinical guidelines that power PulmoScan&apos;s
            diagnostic capabilities.
          </p>
        </motion.div>

        {/* Citation Cards */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-5"
        >
          {citations.map((cite) => {
            const Icon = cite.icon
            return (
              <motion.a
                key={cite.id}
                href={cite.url}
                target="_blank"
                rel="noopener noreferrer"
                variants={cardVariants}
                whileHover={{ scale: 1.01, borderColor: 'rgba(255,255,255,0.2)' }}
                className="block pixel-border p-6 md:p-8 group cursor-pointer transition-all hover:shadow-coral-glow"
              >
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className="flex-shrink-0 w-10 h-10 pixel-border-sm flex items-center justify-center">
                    <Icon className="w-5 h-5 text-primary-coral" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="font-pixel text-[10px] md:text-xs text-primary-coral group-hover:glow-text-coral transition-all">
                        {cite.title}
                      </h2>
                      <ExternalLink className="w-4 h-4 text-retro-cream/30 group-hover:text-primary-coral transition-colors flex-shrink-0 mt-1" />
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mt-1 mb-3">
                      <span className="font-mono text-sm text-retro-cream/50">{cite.authors}</span>
                      <span className="text-retro-cream/20">•</span>
                      <span className="font-mono text-sm text-primary-coral">{cite.source}</span>
                      <span className="text-retro-cream/20">•</span>
                      <span className="font-mono text-sm text-retro-cream/40">{cite.year}</span>
                    </div>

                    <p className="font-mono text-retro-cream/60 text-sm leading-relaxed">
                      {cite.description}
                    </p>
                  </div>
                </div>
              </motion.a>
            )
          })}
        </motion.div>

        {/* Footer note */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.0, duration: 0.6 }}
          className="text-center font-mono text-retro-cream/30 text-sm mt-12"
        >
          PulmoScan is a research prototype and is not intended for clinical diagnosis.
        </motion.p>
      </div>

          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
