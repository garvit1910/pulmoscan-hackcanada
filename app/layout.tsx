import type { Metadata } from 'next'
import { Sora } from 'next/font/google'
import './globals.css'

const sora = Sora({
  subsets: ['latin'],
  weight: ['300', '400', '600', '700'],
  variable: '--font-sora',
})

export const metadata: Metadata = {
  title: 'PulmoScan',
  description: 'Interactive Pulmonary Visualization',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={sora.variable}>
      <body className="font-sora">{children}</body>
    </html>
  )
}
