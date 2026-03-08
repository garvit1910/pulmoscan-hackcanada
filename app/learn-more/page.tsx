'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { ArrowLeft, Stethoscope, Brain, Activity, Wind, Heart, Microscope } from 'lucide-react'
import dynamic from 'next/dynamic'
import Navigation from '@/components/Dashboard/Navigation'

const LungScene3D = dynamic(
  () => import('@/components/Canvas3D/LungScene3D'),
  { ssr: false, loading: () => null },
)

const sections = [
  {
    icon: Stethoscope,
    title: 'What is Pulmonary Fibrosis?',
    body: `Pulmonary fibrosis is a chronic, progressive lung disease where scarring (fibrosis) 
    thickens the tissue around and between the air sacs (alveoli) in the lungs. This makes it 
    harder for oxygen to pass into the bloodstream, leading to shortness of breath and reduced 
    lung function over time.`,
    accent: 'from-blood-red to-crimson',
  },
  {
    icon: Wind,
    title: 'How Does It Progress?',
    body: `The disease typically worsens over months to years, with a decline in lung capacity 
    measured by Forced Vital Capacity (FVC). The rate of decline varies widely between patients, 
    making accurate prognosis difficult. Early detection and monitoring are critical for guiding 
    treatment and improving quality of life.`,
    accent: 'from-crimson to-dark-red',
  },
  {
    icon: Activity,
    title: 'Role of CT Imaging',
    body: `High-resolution computed tomography (HRCT) scans of the chest are essential for 
    diagnosing pulmonary fibrosis. They reveal characteristic patterns such as honeycombing, 
    ground-glass opacities, and traction bronchiectasis. These patterns help clinicians 
    determine the type and severity of fibrosis.`,
    accent: 'from-dark-red to-blood-red',
  },
  {
    icon: Brain,
    title: 'AI-Powered Detection',
    body: `PulmoScan leverages a 3D-ResNet + LSTM deep learning pipeline trained on thousands 
    of CT volumes. The 3D-ResNet captures spatial features across slices, while the LSTM models 
    temporal and sequential relationships. This architecture achieves state-of-the-art performance 
    in predicting FVC decline and classifying fibrosis severity.`,
    accent: 'from-electric-blue to-crimson',
  },
  {
    icon: Heart,
    title: 'Why Early Detection Matters',
    body: `Early identification of pulmonary fibrosis allows for timely intervention with 
    antifibrotic therapies that can slow progression. Without treatment, the disease can advance 
    to respiratory failure. AI-assisted screening can flag subtle changes in CT scans that may 
    be missed in routine readings.`,
    accent: 'from-blood-red to-electric-blue',
  },
  {
    icon: Microscope,
    title: 'Our Research Foundation',
    body: `PulmoScan was developed using the OSIC Pulmonary Fibrosis Progression dataset 
    (Kaggle 2020) and the Chest CT-Scan Images Dataset by Mohamed Hany. These datasets 
    provide diverse training data covering various demographics, scanner types, and disease 
    stages — enabling robust and generalizable AI predictions.`,
    accent: 'from-crimson to-electric-blue',
  },
]

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
    },
  },
}

const cardVariants = {
  hidden: { opacity: 0, y: 40, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.6,
      ease: [0.6, 0.01, 0.05, 0.95],
    },
  },
}

export default function LearnMorePage() {

  return (
    <div className="min-h-screen w-full bg-dark-base overflow-x-hidden relative">
      {/* 3D Lung Background */}
      <div className="fixed inset-0 z-0 opacity-20">
        <LungScene3D decorative decorativeScale={1.2} />
      </div>

      {/* Navigation */}
      <Navigation />

      {/* Content */}
      <div className="relative z-10 pt-24 pb-16 px-4 max-w-4xl mx-auto">
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
            Understanding PulmoScan
          </h1>
          <p className="font-mono text-retro-cream/60 text-lg max-w-2xl mx-auto">
            Learn about pulmonary fibrosis, how AI is transforming lung disease
            detection, and the science behind our diagnostic engine.
          </p>
        </motion.div>

        {/* Cards */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-6"
        >
          {sections.map((section, i) => {
            const Icon = section.icon
            return (
              <motion.div
                key={i}
                variants={cardVariants}
                className="pixel-border p-6 md:p-8 hover:shadow-coral-glow transition-shadow group"
              >
                <div className="flex items-start gap-4">
                  <div
                    className="flex-shrink-0 w-12 h-12 pixel-border-sm flex items-center justify-center">
                    <Icon className="w-6 h-6 text-primary-coral" />
                  </div>
                  <div>
                    <h2 className="font-pixel text-xs md:text-sm text-primary-coral mb-3 group-hover:glow-text-coral transition-all">
                      {section.title}
                    </h2>
                    <p className="font-mono text-retro-cream/70 leading-relaxed text-sm md:text-base">
                      {section.body}
                    </p>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2, duration: 0.6 }}
          className="mt-16 text-center"
        >
          <Link
            href="/scanner"
            className="btn-retro px-8 py-4 font-pixel text-xs md:text-sm inline-flex items-center gap-2"
          >
            Try the Scanner
            <ArrowLeft className="w-5 h-5 rotate-180" />
          </Link>
        </motion.div>
      </div>
    </div>
  )
}
