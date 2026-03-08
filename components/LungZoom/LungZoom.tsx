'use client'

import { useCallback, KeyboardEvent } from 'react'
import LungSVG from './LungSVG'
import HiddenQuote from './HiddenQuote'
import { useLungZoom } from './useLungZoom'
import type { LungZoomProps } from './types'

export default function LungZoom({ className }: LungZoomProps) {
  const {
    isZoomed,
    zoomScale,
    viewBoxX,
    viewBoxY,
    viewBoxWidth,
    viewBoxHeight,
    handleZoomOut,
    toggleZoom,
  } = useLungZoom()

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        toggleZoom()
      } else if (e.key === 'Escape' && isZoomed) {
        e.preventDefault()
        handleZoomOut()
      }
    },
    [toggleZoom, isZoomed, handleZoomOut]
  )

  return (
    <div className={`relative w-full h-screen bg-dark-base mesh-bg-red overflow-hidden ${className || ''}`}>
      {/* Glassmorphism container — click to dive */}
      <div
        className="absolute inset-8 glass-red rounded-3xl overflow-hidden cursor-pointer hover:shadow-coral-glow-lg transition-all duration-300"
        onClick={toggleZoom}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-label={isZoomed ? 'Click to zoom out of the lung' : 'Click to zoom into the lung core'}
      >
        <div className="relative w-full h-full flex items-center justify-center p-8">
          <div className="w-full h-full max-w-4xl">
            <LungSVG
              viewBoxX={viewBoxX}
              viewBoxY={viewBoxY}
              viewBoxWidth={viewBoxWidth}
              viewBoxHeight={viewBoxHeight}
              zoomScale={zoomScale}
            />
          </div>
          <HiddenQuote zoomScale={zoomScale} />
        </div>

        {/* Instruction text — fades out during zoom */}
        <div
          className="absolute bottom-8 left-0 right-0 text-center transition-opacity duration-500"
          style={{ opacity: isZoomed ? 0 : 1 }}
        >
          <p className="text-retro-cream/30 text-sm font-mono">
            Click or press Enter to <span className="text-primary-coral font-semibold">explore</span>
          </p>
        </div>
      </div>

      {/* Corner title */}
      <div className="absolute top-12 left-12 z-20 pointer-events-none">
        <h1 className="font-pixel text-xl text-primary-coral glow-text-coral">
          LungZoom
        </h1>
        <p className="font-mono text-xs text-zinc-500 mt-1">
          Click to dive inside
        </p>
      </div>
    </div>
  )
}
