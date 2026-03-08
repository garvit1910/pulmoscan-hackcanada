'use client'

import { useCallback, useState } from 'react'
import { useMotionValue, useTransform, animate } from 'framer-motion'

export function useLungZoom() {
  const zoomScale = useMotionValue(1)
  const [isZoomed, setIsZoomed] = useState(false)

  /* Derive 4 viewBox parameters from the single zoomScale driver.
     At zoomScale=1:  viewBox = "0 0 800 800"   — full canvas
     At zoomScale=20: viewBox = "380 380 40 40"  — 40×40 window centered on (400,400) */
  const viewBoxWidth  = useTransform(zoomScale, [1, 20], [800, 40])
  const viewBoxHeight = useTransform(zoomScale, [1, 20], [800, 40])
  const viewBoxX      = useTransform(zoomScale, [1, 20], [0, 380])
  const viewBoxY      = useTransform(zoomScale, [1, 20], [0, 380])

  const handleZoomIn = useCallback(() => {
    setIsZoomed(true)
    animate(zoomScale, 20, {
      duration: 2.5,
      ease: [0.6, 0.01, 0.05, 0.95],
    })
  }, [zoomScale])

  const handleZoomOut = useCallback(() => {
    setIsZoomed(false)
    animate(zoomScale, 1, {
      duration: 2,
      ease: [0.6, 0.01, 0.05, 0.95],
    })
  }, [zoomScale])

  const toggleZoom = useCallback(() => {
    if (isZoomed) {
      handleZoomOut()
    } else {
      handleZoomIn()
    }
  }, [isZoomed, handleZoomIn, handleZoomOut])

  return {
    isZoomed,
    zoomScale,
    viewBoxX,
    viewBoxY,
    viewBoxWidth,
    viewBoxHeight,
    handleZoomIn,
    handleZoomOut,
    toggleZoom,
  }
}
