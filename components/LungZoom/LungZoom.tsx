'use client'

import LungSVG from './LungSVG'
import HiddenQuote from './HiddenQuote'
import { useLungZoom } from './useLungZoom'
import type { LungZoomProps } from './types'

export default function LungZoom({ className }: LungZoomProps) {
  const {
    zoomScale,
    viewBoxX,
    viewBoxY,
    viewBoxWidth,
    viewBoxHeight,
    isZoomed,
    toggleZoom,
    handleZoomOut,
  } = useLungZoom()

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      toggleZoom()
    } else if (e.key === 'Escape' && isZoomed) {
      handleZoomOut()
    }
  }

  return (
    <div className={`relative w-full h-screen bg-black mesh-bg-red overflow-hidden ${className || ''}`}>
      {/* Corner title */}
      <div className="absolute top-8 left-8 z-20">
        <h2 className="text-2xl font-bold glow-text-red text-red-500">LungZoom</h2>
      </div>

      {/* Main glassmorphism container */}
      <div
        className="absolute inset-8 glass-red rounded-3xl overflow-hidden cursor-pointer"
        onClick={toggleZoom}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-label={isZoomed ? 'Click to zoom out of the lung visualization' : 'Click to zoom into the lung core'}
      >
        <div className="relative w-full h-full flex items-center justify-center p-8">
          <LungSVG
            viewBoxX={viewBoxX}
            viewBoxY={viewBoxY}
            viewBoxWidth={viewBoxWidth}
            viewBoxHeight={viewBoxHeight}
            zoomScale={zoomScale}
          />
          <HiddenQuote zoomScale={zoomScale} />
        </div>

        {/* Instruction text */}
        <div
          className="absolute bottom-8 left-0 right-0 text-center transition-opacity duration-500"
          style={{ opacity: isZoomed ? 0 : 1 }}
        >
          <p className="text-zinc-500 text-sm">
            Click to <span className="text-crimson font-semibold">zoom into the lung core</span>
          </p>
        </div>
      </div>
    </div>
  )
}
