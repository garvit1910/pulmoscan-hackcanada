/**
 * Types for the Canvas3D 3D neural web background system.
 */

export interface Node3D {
  x: number
  y: number
  z: number
}

export interface ProjectedNode {
  x: number
  y: number
  z: number
  scale: number
  lastX?: number
  lastY?: number
  color?: string
}

export interface ScreenData {
  x: number
  y: number
  z: number
  scale: number
  lastX?: number
  lastY?: number
  color?: string
}
