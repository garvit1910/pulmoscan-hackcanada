'use client'

import { memo } from 'react'
import { motion, useTransform } from 'framer-motion'
import type { LungSVGProps, AlveolusData } from './types'

// Bronchial paths — 7 organic bezier curves representing bronchial tree branches
const bronchialPaths = [
  // Upper right bronchi
  'M 400 320 C 420 280, 480 250, 520 210',
  'M 400 320 C 440 290, 500 280, 560 260',
  'M 400 320 C 430 300, 490 310, 540 330',
  // Upper left bronchi
  'M 400 320 C 380 280, 320 250, 280 210',
  'M 400 320 C 360 290, 300 280, 240 260',
  // Lower bronchi
  'M 400 320 C 370 300, 310 310, 260 330',
  'M 400 400 C 400 440, 400 480, 400 530',
]

const bronchialWidths = [3, 2.6, 2.2, 3, 2.6, 2.2, 1.6]

// Alveoli at branch terminals — 9 pulsating circles
const alveoli: AlveolusData[] = [
  { x: 520, y: 210, delay: 0 },
  { x: 560, y: 260, delay: 0.3 },
  { x: 540, y: 330, delay: 0.6 },
  { x: 280, y: 210, delay: 0.9 },
  { x: 240, y: 260, delay: 1.2 },
  { x: 260, y: 330, delay: 1.5 },
  { x: 400, y: 530, delay: 0.2 },
  { x: 470, y: 290, delay: 0.7 },
  { x: 330, y: 290, delay: 1.0 },
]

// Trachea path — single vertical path from top into lung center
const tracheaPath = 'M 400 150 C 400 180, 400 250, 400 320'

const LungSVG = memo(function LungSVG({
  viewBoxX,
  viewBoxY,
  viewBoxWidth,
  viewBoxHeight,
  zoomScale,
}: LungSVGProps) {
  const viewBox = useTransform(
    [viewBoxX, viewBoxY, viewBoxWidth, viewBoxHeight],
    ([x, y, w, h]) => `${x} ${y} ${w} ${h}`
  )

  return (
    <motion.svg
      style={{
        willChange: 'transform',
        transform: 'translateZ(0)',
      }}
      // Framer Motion supports MotionValue for viewBox
      {...{ viewBox: viewBox }}
      preserveAspectRatio="xMidYMid meet"
      className="w-full h-full"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id="lungGradient" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FF775E" stopOpacity="0.8" />
          <stop offset="50%" stopColor="#CC5F4B" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#000000" stopOpacity="1" />
        </radialGradient>

        <radialGradient id="glowGradient" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FF775E" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#FF775E" stopOpacity="0" />
        </radialGradient>

        <linearGradient id="bronchiGradient">
          <stop offset="0%" stopColor="#FF775E" stopOpacity="1" />
          <stop offset="100%" stopColor="#FF775E" stopOpacity="0.3" />
        </linearGradient>

        <filter id="redGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Bronchial paths */}
      {bronchialPaths.map((d, i) => (
        <path
          key={`bronchi-${i}`}
          d={d}
          stroke="url(#bronchiGradient)"
          strokeWidth={bronchialWidths[i]}
          fill="none"
          strokeLinecap="round"
          opacity={0.7}
        />
      ))}

      {/* Trachea path */}
      <path
        d={tracheaPath}
        stroke="#CC5F4B"
        strokeWidth={4}
        fill="none"
        strokeLinecap="round"
        opacity={0.8}
      />

      {/* Alveoli — pulsating circles at branch terminals */}
      {alveoli.map((alv, i) => (
        <motion.circle
          key={`alveolus-${i}`}
          cx={alv.x}
          cy={alv.y}
          r={5}
          fill="#CC5F4B"
          filter="url(#redGlow)"
          animate={{
            opacity: [0.4, 1, 0.4],
            scale: [0.8, 1.2, 0.8],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            delay: alv.delay,
            ease: [0.4, 0, 0.2, 1],
          }}
        />
      ))}

      {/* Central lung body — pulsating glow */}
      <motion.g
        animate={{
          filter: [
            'drop-shadow(0 0 8px rgba(255,0,0,0.6))',
            'drop-shadow(0 0 16px rgba(255,0,0,0.9))',
            'drop-shadow(0 0 8px rgba(255,0,0,0.6))',
          ],
          scale: [1, 1.02, 1],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        style={{ transformOrigin: '400px 400px' }}
      >
        {/* Outer glow ring */}
        <circle cx={400} cy={400} r={110} fill="url(#glowGradient)" opacity={0.6} />

        {/* Main body */}
        <circle
          cx={400}
          cy={400}
          r={80}
          fill="url(#lungGradient)"
          stroke="#FF775E"
          strokeWidth={2}
          opacity={0.9}
        />

        {/* Inner core (zoom target) */}
        <circle
          cx={400}
          cy={400}
          r={25}
          fill="#000000"
          stroke="#FF775E"
          strokeWidth={1.5}
          opacity={0.8}
        />

        {/* Core detail */}
        <circle cx={400} cy={400} r={10} fill="#CC5F4B" opacity={0.9} />
      </motion.g>
    </motion.svg>
  )
})

export default LungSVG
