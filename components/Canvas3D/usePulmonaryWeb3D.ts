'use client'

import { useEffect, useRef, useCallback } from 'react'
import { type MotionValue } from 'framer-motion'

/**
 * usePulmonaryWeb3D — The core 3D canvas hook.
 * Renders a recursive 3D network of connections and data particles
 * on a 2D canvas using manual 3D math (rotation matrices + perspective projection).
 * 
 * ~500 lines. All animation via requestAnimationFrame.
 */

// Configuration object — exact values from reference
const opts = {
  range: 250,
  baseConnections: 5,
  addedConnections: 5,
  baseSize: 9,
  minSize: 0.25,
  dataToConnectionSize: 0.33,
  sizeMultiplier: 0.7,
  allowedDist: 60,
  baseDist: 99,
  addedDist: 77,
  connectionAttempts: 100,
  dataToConnections: 0.5,
  baseSpeed: 0.001,
  addedSpeed: 0.099,
  baseGlowSpeed: 0.1,
  addedGlowSpeed: 0.4,
  rotVelX: 0.003,
  rotVelY: 0.002,
  repaintColor: '#120D0B',
  connectionColor: '#FF775E',
  dataColor: '#FFFFFF',
  wireframeWidth: 0.33,
  depth: 300,
  focalLength: 550,
  vanishPoint: { x: 0, y: 0 },
}

interface Screen {
  x: number
  y: number
  z: number
  scale: number
  lastX?: number
  lastY?: number
  color?: string
}

interface Connection {
  x: number
  y: number
  z: number
  size: number
  screen: Screen
  links: Connection[]
  isEnd: boolean
  glowSpeed: number
  link: () => void
  step: (tick: number, cosX: number, sinX: number, cosY: number, sinY: number) => void
  draw: (ctx: CanvasRenderingContext2D) => void
  setScreen: (tick: number, cosX: number, sinX: number, cosY: number, sinY: number) => void
}

interface DataParticle {
  x: number
  y: number
  z: number
  size: number
  screen: Screen
  connection: Connection | null
  nextConnection: Connection | null
  proportion: number
  speed: number
  ox: number
  oy: number
  oz: number
  os: number
  nx: number
  ny: number
  nz: number
  ns: number
  dx: number
  dy: number
  dz: number
  ds: number
  reset: () => void
  step: (tick: number, cosX: number, sinX: number, cosY: number, sinY: number) => void
  draw: (ctx: CanvasRenderingContext2D) => void
  setConnection: (c: Connection) => void
  setScreen: (tick: number, cosX: number, sinX: number, cosY: number, sinY: number) => void
}

type Item = Connection | DataParticle

function isDataParticle(item: Item): item is DataParticle {
  return 'proportion' in item
}

export function usePulmonaryWeb3D(
  zoomLevel: MotionValue<number>,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animFrameRef = useRef<number>(0)

  const initAndAnimate = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // --- Canvas sizing ---
    function resize() {
      if (!canvas) return
      const dpr = window.devicePixelRatio || 1
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
      opts.vanishPoint.x = canvas.width / 2
      opts.vanishPoint.y = canvas.height / 2
    }

    resize()
    window.addEventListener('resize', resize)

    // --- All connections and data particles ---
    const allConnections: Connection[] = []
    const allData: DataParticle[] = []
    const allItems: Item[] = []

    let tick = 0

    // --- Projection helper ---
    function projectToScreen(
      x: number, y: number, z: number,
      cosX: number, sinX: number, cosY: number, sinY: number
    ): { sx: number; sy: number; sz: number; scale: number } {
      // Rotate X
      const y1 = y * cosX - z * sinX
      const z1 = z * cosX + y * sinX
      // Rotate Y
      const z2 = z1 * cosY - x * sinY
      const x1 = x * cosY + z1 * sinY

      const zFinal = z2 + opts.depth
      const scale = opts.focalLength / zFinal
      return {
        sx: opts.vanishPoint.x + x1 * scale,
        sy: opts.vanishPoint.y + y1 * scale,
        sz: zFinal,
        scale,
      }
    }

    // --- Connection factory ---
    function createConnection(x: number, y: number, z: number, size: number): Connection {
      const conn: Connection = {
        x,
        y,
        z,
        size,
        screen: { x: 0, y: 0, z: 0, scale: 0 },
        links: [],
        isEnd: false,
        glowSpeed: opts.baseGlowSpeed + Math.random() * opts.addedGlowSpeed,

        link() {
          if (this.size < opts.minSize) {
            this.isEnd = true
            return
          }

          const connectionsNum = Math.floor(opts.baseConnections + Math.random() * opts.addedConnections)
          const candidates: { x: number; y: number; z: number }[] = []

          for (let i = 0; i < connectionsNum; i++) {
            let placed = false

            for (let attempt = 0; attempt < opts.connectionAttempts; attempt++) {
              const alpha = Math.random() * Math.PI
              const beta = Math.random() * Math.PI * 2
              const len = opts.baseDist + Math.random() * opts.addedDist

              const cx = this.x + len * Math.cos(alpha) * Math.sin(beta)
              const cy = this.y + len * Math.sin(alpha) * Math.sin(beta)
              const cz = this.z + len * Math.cos(beta)

              // Constraint 1: within range of origin
              if (cx * cx + cy * cy + cz * cz > opts.range * opts.range) continue

              // Constraint 2: far enough from all existing connections
              let tooClose = false
              for (let j = 0; j < allConnections.length; j++) {
                const ec = allConnections[j]
                const ddx = cx - ec.x
                const ddy = cy - ec.y
                const ddz = cz - ec.z
                if (ddx * ddx + ddy * ddy + ddz * ddz < opts.allowedDist * opts.allowedDist) {
                  tooClose = true
                  break
                }
              }
              if (tooClose) continue

              // Constraint 3: far enough from other candidates in this batch
              let tooCloseCandidate = false
              for (let j = 0; j < candidates.length; j++) {
                const cc = candidates[j]
                const ddx = cx - cc.x
                const ddy = cy - cc.y
                const ddz = cz - cc.z
                if (ddx * ddx + ddy * ddy + ddz * ddz < opts.allowedDist * opts.allowedDist) {
                  tooCloseCandidate = true
                  break
                }
              }
              if (tooCloseCandidate) continue

              candidates.push({ x: cx, y: cy, z: cz })
              placed = true
              break
            }

            if (!placed) continue
          }

          if (candidates.length === 0) {
            this.isEnd = true
            return
          }

          for (const pos of candidates) {
            const child = createConnection(pos.x, pos.y, pos.z, this.size * opts.sizeMultiplier)
            this.links.push(child)
            allConnections.push(child)
            allItems.push(child)
          }

          for (const child of this.links) {
            child.link()
          }
        },

        step(t: number, cosX: number, sinX: number, cosY: number, sinY: number) {
          this.setScreen(t, cosX, sinX, cosY, sinY)
        },

        draw(ctx: CanvasRenderingContext2D) {
          if (this.screen.scale <= 0) return
          const r = this.size * this.screen.scale
          if (r < 0.1) return

          ctx.beginPath()
          ctx.arc(this.screen.x, this.screen.y, r, 0, Math.PI * 2)
          ctx.fillStyle = this.screen.color || opts.connectionColor
          ctx.fill()
        },

        setScreen(t: number, cosX: number, sinX: number, cosY: number, sinY: number) {
          const proj = projectToScreen(this.x, this.y, this.z, cosX, sinX, cosY, sinY)
          this.screen.lastX = this.screen.x
          this.screen.lastY = this.screen.y
          this.screen.x = proj.sx
          this.screen.y = proj.sy
          this.screen.z = proj.sz
          this.screen.scale = proj.scale
        },
      }

      return conn
    }

    // --- DataParticle factory ---
    function createDataParticle(rootConnection: Connection): DataParticle {
      const dp: DataParticle = {
        x: 0, y: 0, z: 0,
        size: 0,
        screen: { x: 0, y: 0, z: 0, scale: 0 },
        connection: null,
        nextConnection: null,
        proportion: 0,
        speed: opts.baseSpeed + Math.random() * opts.addedSpeed,
        ox: 0, oy: 0, oz: 0, os: 0,
        nx: 0, ny: 0, nz: 0, ns: 0,
        dx: 0, dy: 0, dz: 0, ds: 0,

        reset() {
          this.setConnection(rootConnection)
        },

        step(t: number, cosX: number, sinX: number, cosY: number, sinY: number) {
          this.proportion += this.speed

          if (this.proportion >= 1) {
            if (this.nextConnection && !this.nextConnection.isEnd && this.nextConnection.links.length > 0) {
              this.setConnection(this.nextConnection)
            } else {
              this.reset()
            }
          }

          this.x = this.ox + this.dx * this.proportion
          this.y = this.oy + this.dy * this.proportion
          this.z = this.oz + this.dz * this.proportion
          this.size = this.os + this.ds * this.proportion

          this.setScreen(t, cosX, sinX, cosY, sinY)
        },

        draw(ctx: CanvasRenderingContext2D) {
          if (!this.screen.lastX && !this.screen.lastY) return
          const lw = this.size * this.screen.scale
          if (lw < 0.1) return

          ctx.beginPath()
          ctx.moveTo(this.screen.lastX || this.screen.x, this.screen.lastY || this.screen.y)
          ctx.lineTo(this.screen.x, this.screen.y)
          ctx.lineWidth = lw
          ctx.strokeStyle = '#ff9933'
          ctx.shadowBlur = 15
          ctx.shadowColor = '#ff6600'
          ctx.stroke()
          ctx.shadowBlur = 0
          ctx.shadowColor = 'transparent'
        },

        setConnection(c: Connection) {
          this.connection = c
          if (c.links.length > 0) {
            this.nextConnection = c.links[Math.floor(Math.random() * c.links.length)]
          } else {
            this.nextConnection = null
          }

          this.ox = c.x
          this.oy = c.y
          this.oz = c.z
          this.os = c.size * opts.dataToConnectionSize

          if (this.nextConnection) {
            this.nx = this.nextConnection.x
            this.ny = this.nextConnection.y
            this.nz = this.nextConnection.z
            this.ns = this.nextConnection.size * opts.dataToConnectionSize
          } else {
            this.nx = c.x
            this.ny = c.y
            this.nz = c.z
            this.ns = c.size * opts.dataToConnectionSize
          }

          this.dx = this.nx - this.ox
          this.dy = this.ny - this.oy
          this.dz = this.nz - this.oz
          this.ds = this.ns - this.os

          this.proportion = 0
        },

        setScreen(t: number, cosX: number, sinX: number, cosY: number, sinY: number) {
          const proj = projectToScreen(this.x, this.y, this.z, cosX, sinX, cosY, sinY)
          this.screen.lastX = this.screen.x
          this.screen.lastY = this.screen.y
          this.screen.x = proj.sx
          this.screen.y = proj.sy
          this.screen.z = proj.sz
          this.screen.scale = proj.scale
        },
      }

      dp.reset()
      return dp
    }

    // --- Build the recursive network ---
    const rootConnection = createConnection(0, 0, 0, opts.baseSize)
    allConnections.push(rootConnection)
    allItems.push(rootConnection)
    rootConnection.link()

    // --- Target data particle count ---
    const targetDataCount = Math.floor(allConnections.length * opts.dataToConnections)

    // --- Animation loop ---
    function loop() {
      if (!ctx || !canvas) return

      // 1. Clear canvas
      ctx.fillStyle = opts.repaintColor
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // 2. Increment tick
      tick++

      // 3. Recompute sin/cos for rotation
      const rotX = tick * opts.rotVelX
      const rotY = tick * opts.rotVelY
      const cosX = Math.cos(rotX)
      const sinX = Math.sin(rotX)
      const cosY = Math.cos(rotY)
      const sinY = Math.sin(rotY)

      // 4. Conditionally spawn new particles (10% chance, up to target)
      if (Math.random() < 0.1 && allData.length < targetDataCount) {
        const dp = createDataParticle(rootConnection)
        allData.push(dp)
        allItems.push(dp)
      }

      // 5. Begin wireframe path
      ctx.lineWidth = opts.wireframeWidth
      ctx.strokeStyle = opts.connectionColor

      // 6. Step all items, draw wireframe connections
      ctx.beginPath()
      for (const item of allItems) {
        item.step(tick, cosX, sinX, cosY, sinY)

        // Draw wireframe lines between connections
        if (!isDataParticle(item)) {
          const conn = item as Connection
          for (const child of conn.links) {
            ctx.moveTo(conn.screen.x, conn.screen.y)
            ctx.lineTo(child.screen.x, child.screen.y)
          }
        }
      }

      // 7. Stroke the wireframe batch
      ctx.stroke()

      // 8. Sort all items by screen.z (depth sort — painter's algorithm)
      allItems.sort((a, b) => b.screen.z - a.screen.z)

      // 9. Draw all items
      for (const item of allItems) {
        item.draw(ctx)
      }

      // 10. Fade overlay when zoomLevel > 30
      const currentZoom = zoomLevel.get()
      if (currentZoom > 30) {
        const fadeAlpha = Math.min((currentZoom - 30) / 20, 0.8)
        ctx.fillStyle = `rgba(0, 0, 0, ${fadeAlpha})`
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }

      // 11. Next frame
      animFrameRef.current = requestAnimationFrame(loop)
    }

    animFrameRef.current = requestAnimationFrame(loop)

    // Cleanup
    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(animFrameRef.current)
    }
  }, [zoomLevel])

  useEffect(() => {
    const cleanup = initAndAnimate()
    return cleanup
  }, [initAndAnimate])

  return canvasRef
}
