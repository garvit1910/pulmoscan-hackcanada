/**
 * Rotation matrix transforms for 3D coordinate system.
 * Standard rotation matrices for X and Y axes using sin/cos.
 */

export interface Point3D {
  x: number
  y: number
  z: number
}

/**
 * Rotate a point around the X axis by angle (radians).
 * y' = y * cos(angle) - z * sin(angle)
 * z' = z * cos(angle) + y * sin(angle)
 */
export function rotateX(point: Point3D, angle: number): Point3D {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return {
    x: point.x,
    y: point.y * cos - point.z * sin,
    z: point.z * cos + point.y * sin,
  }
}

/**
 * Rotate a point around the Y axis by angle (radians).
 * z' = z * cos(angle) - x * sin(angle)
 * x' = x * cos(angle) + z * sin(angle)
 */
export function rotateY(point: Point3D, angle: number): Point3D {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return {
    x: point.x * cos + point.z * sin,
    y: point.y,
    z: point.z * cos - point.x * sin,
  }
}
