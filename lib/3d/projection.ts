/**
 * Perspective projection: 3D to 2D screen coordinates.
 * scale = focalLength / (z + depth)
 * screenX = vanishPoint.x + x * scale
 * screenY = vanishPoint.y + y * scale
 */

export interface VanishPoint {
  x: number
  y: number
}

export interface ProjectedPoint {
  x: number
  y: number
  scale: number
}

/**
 * Project a 3D point onto a 2D screen using perspective projection.
 * @param x - X coordinate after rotation
 * @param y - Y coordinate after rotation
 * @param z - Z coordinate after rotation
 * @param focalLength - Camera focal length (550)
 * @param depth - Z-axis depth offset (300)
 * @param vanishPoint - Center of projection on screen
 */
export function project3DTo2D(
  x: number,
  y: number,
  z: number,
  focalLength: number,
  depth: number,
  vanishPoint: VanishPoint
): ProjectedPoint {
  const zFinal = z + depth
  const scale = focalLength / zFinal
  return {
    x: vanishPoint.x + x * scale,
    y: vanishPoint.y + y * scale,
    scale,
  }
}
