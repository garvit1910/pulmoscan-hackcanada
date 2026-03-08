import type { BreathingPoint } from '@/components/BreathingCanvas/types'

export type { BreathingPoint }

export interface PredictionResult {
  prediction: string
  confidence: number
  details: {
    condition: string
    probability: number
  }[]
  timestamp: string
  inputType: 'breathing_pattern' | 'file_upload'
}
