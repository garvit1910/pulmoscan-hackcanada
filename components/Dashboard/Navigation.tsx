'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navLinks = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/scanner', label: 'Scanner' },
  { href: '/learn-more', label: 'Learn More' },
  { href: '/citations', label: 'Citations' },
]

export default function Navigation() {
  const pathname = usePathname()

  return (
    <nav className="fixed top-4 left-4 right-4 z-30 flex justify-between items-center px-5 py-2.5 pixel-border">
      <Link href="/" className="font-pixel text-xs text-primary-coral glow-text-coral hover:opacity-80 transition-opacity">
        PulmoScan
      </Link>

      <div className="flex items-center gap-1">
        {navLinks.map((link) => {
          const isActive = pathname === link.href
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`px-3 py-1.5 font-mono text-sm transition-all ${
                isActive
                  ? 'bg-primary-coral/20 text-primary-coral border-2 border-primary-coral shadow-pixel-sm'
                  : 'text-retro-cream/50 hover:text-primary-coral hover:bg-primary-coral/5'
              }`}
            >
              {link.label}
            </Link>
          )
        })}

        <div className="w-px h-5 bg-primary-coral/20 mx-2" />

        <Link
          href="/"
          className="px-3 py-1.5 text-primary-coral border-2 border-primary-coral font-mono text-sm hover:bg-primary-coral/10 transition-colors shadow-pixel-sm active:translate-x-[1px] active:translate-y-[1px]"
        >
          Home
        </Link>
      </div>
    </nav>
  )
}
