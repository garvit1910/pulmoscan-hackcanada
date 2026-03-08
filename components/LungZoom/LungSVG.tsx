'use client'

import { memo } from 'react'
import { motion, useTransform } from 'framer-motion'
import type { LungSVGProps, AlveolusData } from './types'

/* ═══ BRONCHIAL PATHS — 7 organic bezier curves radiating from center ═══ */
const BRONCHIAL_PATHS: string[] = [
  // Upper-right main
  'M 400 350 C 430 310, 470 270, 520 230 C 540 210, 555 195, 570 185',
  // Upper-right lateral
  'M 400 350 C 440 325, 490 305, 545 285 C 560 278, 578 265, 595 250',
  // Middle-right
  'M 400 350 C 440 345, 485 350, 535 360 C 555 365, 575 372, 595 380',
  // Upper-left main
  'M 400 350 C 370 310, 330 270, 280 230 C 260 210, 245 195, 230 185',
  // Upper-left lateral
  'M 400 350 C 360 325, 310 305, 255 285 C 240 278, 222 265, 205 250',
  // Lower-left
  'M 400 350 C 370 370, 330 400, 280 440 C 260 458, 240 480, 220 510',
  // Lower descending
  'M 400 400 C 400 440, 400 490, 400 540 C 400 555, 400 570, 400 585',
]

const BRONCHIAL_WIDTHS = [3, 2.8, 2.6, 2.4, 2.2, 2.0, 1.8]

/* ═══ TRACHEA — main airway from top into center ═══ */
const TRACHEA_PATH = 'M 400 120 C 400 170, 400 250, 400 350'

/* ═══ ALVEOLI — 9 pulsating circles at branch terminals ═══ */
const ALVEOLI: AlveolusData[] = [
  { x: 570, y: 185, delay: 0 },
  { x: 595, y: 250, delay: 0.2 },
  { x: 595, y: 380, delay: 0.4 },
  { x: 230, y: 185, delay: 0.6 },
  { x: 205, y: 250, delay: 0.8 },
  { x: 220, y: 510, delay: 1.0 },
  { x: 400, y: 585, delay: 1.2 },
  { x: 545, y: 310, delay: 1.4 },
  { x: 255, y: 310, delay: 1.6 },
]

const LungSVG = memo(function LungSVG({
  viewBoxX,
  viewBoxY,
  viewBoxWidth,
  viewBoxHeight,
}: LungSVGProps) {
  /* Combine 4 numeric MotionValues into a single string MotionValue.
     Framer Motion's <motion.svg viewBox={...}> updates the DOM attribute
     every animation frame without triggering React re-renders. */
  const viewBox = useTransform(
    [viewBoxX, viewBoxY, viewBoxWidth, viewBoxHeight],
    ([x, y, w, h]) => `${x} ${y} ${w} ${h}`
  )

  return (
    <motion.svg
      viewBox={viewBox as unknown as string}
      className="w-full h-full"
      style={{ willChange: 'transform', transform: 'translateZ(0)' }}
      preserveAspectRatio="xMidYMid meet"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Radial gradient for central lung body */}
        <radialGradient id="lungGradient" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#E8506A" stopOpacity={0.8} />
          <stop offset="50%" stopColor="#CC5F4B" stopOpacity={0.6} />
          <stop offset="100%" stopColor="#000000" stopOpacity={1} />
        </radialGradient>

        {/* Radial gradient for ambient glow ring */}
        <radialGradient id="glowGradient" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#E8506A" stopOpacity={0.4} />
          <stop offset="100%" stopColor="#E8506A" stopOpacity={0} />
        </radialGradient>

        {/* Linear gradient for bronchial branches */}
        <linearGradient id="bronchiGradient">
          <stop offset="0%" stopColor="#E8506A" stopOpacity={1} />
          <stop offset="100%" stopColor="#E8506A" stopOpacity={0.3} />
        </linearGradient>

        {/* Soft halo filter */}
        <filter id="redGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={4} result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* LAYER 1: Bronchial branches */}
      {BRONCHIAL_PATHS.map((d, i) => (
        <path
          key={`bronchi-${i}`}
          d={d}
          stroke="url(#bronchiGradient)"
          strokeWidth={BRONCHIAL_WIDTHS[i]}
          fill="none"
          strokeLinecap="round"
          opacity={0.7}
        />
      ))}

      {/* LAYER 2: Trachea */}
      <path
        d={TRACHEA_PATH}
        stroke="#CC5F4B"
        strokeWidth={4}
        fill="none"
        strokeLinecap="round"
        opacity={0.8}
      />

      {/* LAYER 3: Alveoli — pulsating circles at branch terminals */}
      {ALVEOLI.map((alv, i) => (
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

      {/* LAYER 4: Central lung body — continuously pulsating glow */}
      <motion.g
        animate={{
          filter: [
            'drop-shadow(0 0 8px rgba(232,80,106,0.6))',
            'drop-shadow(0 0 16px rgba(232,80,106,0.9))',
            'drop-shadow(0 0 8px rgba(232,80,106,0.6))',
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
          cx={400} cy={400} r={80}
          fill="url(#lungGradient)"
          stroke="#E8506A"
          strokeWidth={2}
          opacity={0.9}
        />

        {/* Inner core — the zoom target */}
        <circle
          cx={400} cy={400} r={25}
          fill="#000000"
          stroke="#E8506A"
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
