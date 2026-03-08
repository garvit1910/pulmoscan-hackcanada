import { MotionValue } from 'framer-motion'

export interface AlveolusData {
  x: number
  y: number
  delay: number
}

export interface LungZoomProps {
  className?: string
}

export interface LungSVGProps {
  viewBoxX: MotionValue<number>
  viewBoxY: MotionValue<number>
  viewBoxWidth: MotionValue<number>
  viewBoxHeight: MotionValue<number>
  zoomScale: MotionValue<number>
}

export interface HiddenQuoteProps {
  zoomScale: MotionValue<number>
}
