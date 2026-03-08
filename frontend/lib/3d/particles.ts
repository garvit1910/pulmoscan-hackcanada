/**
 * ParticleSystem class: spawn, interpolate along connection paths, draw glowing particles.
 * Used by the Canvas3D 3D background for the orange data pulse visual.
 */

import { project3DTo2D, type VanishPoint } from './projection'
import { rotateX, rotateY } from './rotation'

export interface ParticleConnection {
  x: number
  y: number
  z: number
  links: ParticleConnection[]
  isEnd: boolean
}

export interface Particle {
  x: number
  y: number
  z: number
  screenX: number
  screenY: number
  screenScale: number
  connection: ParticleConnection | null
  nextConnection: ParticleConnection | null
  proportion: number
  speed: number
  ox: number
  oy: number
  oz: number
  nx: number
  ny: number
  nz: number
  dx: number
  dy: number
  dz: number
  lastScreenX: number
  lastScreenY: number
}

export class ParticleSystem {
  particles: Particle[] = []
  private maxParticles: number
  private spawnChance: number

  constructor(maxParticles: number = 100, spawnChance: number = 0.02) {
    this.maxParticles = maxParticles
    this.spawnChance = spawnChance
  }

  /**
   * Conditionally spawn a new particle at the root connection.
   */
  trySpawn(root: ParticleConnection): void {
    if (this.particles.length >= this.maxParticles) return
    if (Math.random() > this.spawnChance) return
    if (!root.links || root.links.length === 0) return

    const nextConn = root.links[Math.floor(Math.random() * root.links.length)]
    const speed = 0.001 + Math.random() * 0.099

    const particle: Particle = {
      x: root.x,
      y: root.y,
      z: root.z,
      screenX: 0,
      screenY: 0,
      screenScale: 1,
      lastScreenX: 0,
      lastScreenY: 0,
      connection: root,
      nextConnection: nextConn,
      proportion: 0,
      speed,
      ox: root.x,
      oy: root.y,
      oz: root.z,
      nx: nextConn.x,
      ny: nextConn.y,
      nz: nextConn.z,
      dx: nextConn.x - root.x,
      dy: nextConn.y - root.y,
      dz: nextConn.z - root.z,
    }

    this.particles.push(particle)
  }

  /**
   * Step all particles: advance proportion, interpolate position, handle segment transitions.
   */
  step(root: ParticleConnection): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]
      p.proportion += p.speed

      if (p.proportion >= 1) {
        // Move to next segment
        if (p.nextConnection && !p.nextConnection.isEnd && p.nextConnection.links.length > 0) {
          const prev = p.nextConnection
          const next = prev.links[Math.floor(Math.random() * prev.links.length)]
          p.connection = prev
          p.nextConnection = next
          p.proportion = 0
          p.ox = prev.x
          p.oy = prev.y
          p.oz = prev.z
          p.nx = next.x
          p.ny = next.y
          p.nz = next.z
          p.dx = next.x - prev.x
          p.dy = next.y - prev.y
          p.dz = next.z - prev.z
        } else {
          // Reset to root
          if (root.links.length === 0) {
            this.particles.splice(i, 1)
            continue
          }
          const nextConn = root.links[Math.floor(Math.random() * root.links.length)]
          p.connection = root
          p.nextConnection = nextConn
          p.proportion = 0
          p.ox = root.x
          p.oy = root.y
          p.oz = root.z
          p.nx = nextConn.x
          p.ny = nextConn.y
          p.nz = nextConn.z
          p.dx = nextConn.x - root.x
          p.dy = nextConn.y - root.y
          p.dz = nextConn.z - root.z
        }
      }

      // Interpolate position
      p.x = p.ox + p.dx * p.proportion
      p.y = p.oy + p.dy * p.proportion
      p.z = p.oz + p.dz * p.proportion
    }
  }

  /**
   * Project all particles to screen coordinates.
   */
  projectAll(
    rotXAngle: number,
    rotYAngle: number,
    focalLength: number,
    depth: number,
    vanishPoint: VanishPoint
  ): void {
    for (const p of this.particles) {
      p.lastScreenX = p.screenX
      p.lastScreenY = p.screenY

      const rotated1 = rotateX({ x: p.x, y: p.y, z: p.z }, rotXAngle)
      const rotated2 = rotateY(rotated1, rotYAngle)
      const projected = project3DTo2D(rotated2.x, rotated2.y, rotated2.z, focalLength, depth, vanishPoint)

      p.screenX = projected.x
      p.screenY = projected.y
      p.screenScale = projected.scale
    }
  }

  /**
   * Draw all particles as glowing trailing lines onto a 2D canvas context.
   * Rendered as lines from lastXY to XY with glow effect.
   */
  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      if (p.lastScreenX === 0 && p.lastScreenY === 0) continue

      ctx.beginPath()
      ctx.moveTo(p.lastScreenX, p.lastScreenY)
      ctx.lineTo(p.screenX, p.screenY)
      ctx.lineWidth = Math.max(0.5, 2 * p.screenScale)
      ctx.strokeStyle = '#ff9933'
      ctx.shadowBlur = 15
      ctx.shadowColor = '#ff6600'
      ctx.stroke()
    }
    // Reset shadow after drawing particles
    ctx.shadowBlur = 0
    ctx.shadowColor = 'transparent'
  }
}
