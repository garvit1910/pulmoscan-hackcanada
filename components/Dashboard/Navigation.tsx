'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { motion, useMotionValue, useTransform, animate } from 'framer-motion'

export default function Navigation() {
  const [hidden, setHidden] = useState(false)
  const lastScrollY = useRef(0)
  const scrollUpAccum = useRef(0)

  const navY = useMotionValue(0)
  const navOpacity = useTransform(navY, [-100, 0], [0, 1])

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY
      const delta = y - lastScrollY.current

      if (delta > 0) {
        scrollUpAccum.current = 0
        if (y > 100 && !hidden) {
          setHidden(true)
          animate(navY, -100, { duration: 0.35, ease: [0.4, 0, 0.2, 1] })
        }
      } else {
        scrollUpAccum.current += Math.abs(delta)
        if (scrollUpAccum.current > 50 && hidden) {
          setHidden(false)
          scrollUpAccum.current = 0
          animate(navY, 0, {
            type: 'spring',
            stiffness: 100,
            damping: 20,
          })
        }
      }

      lastScrollY.current = y
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [hidden, navY])

  return (
    <motion.nav
      style={{ y: navY, opacity: navOpacity }}
      className="fixed top-0 left-0 right-0 z-30 flex justify-between items-center px-6 py-4 backdrop-blur-md"
    >
      <Link
        href="/"
        className="font-pixel text-xs text-[#FF775E] glow-text-coral hover:opacity-80 transition-opacity"
      >
        PulmoScan
      </Link>

      <Link
        href="/"
        className="font-mono text-sm text-[#FF775E]/60 hover:text-[#FF775E] transition-colors"
      >
        ← Exit
      </Link>
    </motion.nav>
  )
}
