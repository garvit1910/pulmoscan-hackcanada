'use client'

import Link from 'next/link'

export default function Navigation() {
  return (
    <nav className="fixed top-4 left-4 right-4 z-30 flex justify-between items-center px-6 py-3 glass-red rounded-lg border border-white/10">
      <span className="text-electric-blue font-semibold text-lg">PulmoScan</span>
      <Link
        href="/"
        className="px-4 py-2 text-crimson border border-crimson/50 rounded-lg hover:bg-crimson/10 transition-colors text-sm backdrop-blur-sm"
      >
        Back to Demo
      </Link>
    </nav>
  )
}
