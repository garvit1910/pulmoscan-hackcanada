'use client'

import { useEffect, useRef, useCallback } from 'react'
import { type MotionValue } from 'framer-motion'

/**
 * usePulmonaryWeb3D — Anatomical Alveolar 3D Canvas Hook
 *
 * Renders an anatomically-inspired alveolar cluster mesh:
 *  - Hub Nodes (bronchiole endpoints): 6 large anchor points
 *  - Alveoli Nodes: 20-30 per hub, tight organic grape-like clusters
 *  - Nodule Nodes: 3 pathology markers with solid fill + flicker
 *  - Depth-based connection opacity (0.08 far → 0.5 near)
 *  - Parallax zoom: clusters expand outward as zoomLevel rises
 *  - Data particles flow along edges with peach glow
 *
 * PROCESS REAPER: Full cleanup on unmount — cancelAnimationFrame,
 * removeEventListener, zero canvas, clear all arrays.
 */

// ── Configuration ──────────────────────────────────────────────
const CFG = {
  // Camera
  depth: 350,
  focalLength: 600,
  vanishPoint: { x: 0, y: 0 },

  // Rotation
  rotVelX: 0.0015,
  rotVelY: 0.001,

  // Colors
  bgColor: '#0a0a0a',
  peachR: 255, peachG: 119, peachB: 94,   // #FF775E decomposed for rgba()

  // Hubs (bronchiole endpoints)
  hubCount: 6,
  hubSpread: 180,
  hubSize: 6,

  // Alveoli clusters
  alveoliPerHub: 25,
  alveoliJitter: 5,
  alveoliSpread: 65,
  alveoliMinSize: 1.5,
  alveoliMaxSize: 3.5,
  alveoliConnectRadius: 0.5,   // fraction of alveoliSpread
  alveoliConnectChance: 0.3,

  // Nodules (pathology markers)
  noduleCount: 3,
  noduleSize: 8,
  noduleFlickerSpeed: 0.05,

  // Wireframe
  wireframeWidth: 0.4,

  // Depth-based opacity
  minOpacity: 0.08,
  maxOpacity: 0.5,
  nearZ: 100,
  farZ: 600,

  // Data particles
  particleCount: 40,
  particleSpeed: 0.008,
  particleSize: 1.5,
  particleGlow: 8,
}

// ── Types ──────────────────────────────────────────────────────
interface Node3D {
  baseX: number; baseY: number; baseZ: number
  x: number; y: number; z: number
  size: number
  type: 'hub' | 'alveolus' | 'nodule'
  hubIndex: number
  connections: number[]
  sx: number; sy: number; sz: number
  scale: number; opacity: number
  flickerPhase: number
}

interface Particle {
  fromIdx: number; toIdx: number
  progress: number; speed: number
  sx: number; sy: number
  scale: number; opacity: number
}

// ── Hook ───────────────────────────────────────────────────────
export function usePulmonaryWeb3D(zoomLevel: MotionValue<number>) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animFrameRef = useRef<number>(0)
  const destroyedRef = useRef(false)

  const initAndAnimate = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return () => {}

    const ctx = canvas.getContext('2d')
    if (!ctx) return () => {}

    destroyedRef.current = false

    // ── Canvas sizing ────────────────────────────────────────
    function resize() {
      if (!canvas || destroyedRef.current) return
      const dpr = window.devicePixelRatio || 1
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
      CFG.vanishPoint.x = canvas.width / 2
      CFG.vanishPoint.y = canvas.height / 2
    }

    resize()
    window.addEventListener('resize', resize)

    // ── Helpers ──────────────────────────────────────────────
    const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo)

    const { peachR: pR, peachG: pG, peachB: pB } = CFG

    function rgba(r: number, g: number, b: number, a: number) {
      return `rgba(${r},${g},${b},${a.toFixed(3)})`
    }

    // ── 3D → 2D projection with depth-opacity ───────────────
    function project(
      x: number, y: number, z: number,
      cosX: number, sinX: number, cosY: number, sinY: number,
    ) {
      const y1 = y * cosX - z * sinX
      const z1 = z * cosX + y * sinX
      const z2 = z1 * cosY - x * sinY
      const x1 = x * cosY + z1 * sinY
      const zF = z2 + CFG.depth
      const sc = CFG.focalLength / Math.max(zF, 1)
      const depthNorm = Math.max(0, Math.min(1,
        (zF - CFG.nearZ) / (CFG.farZ - CFG.nearZ),
      ))
      return {
        sx: CFG.vanishPoint.x + x1 * sc,
        sy: CFG.vanishPoint.y + y1 * sc,
        sz: zF,
        scale: sc,
        opacity: CFG.maxOpacity - depthNorm * (CFG.maxOpacity - CFG.minOpacity),
      }
    }

    // ── Build anatomical mesh ────────────────────────────────
    const nodes: Node3D[] = []
    const edges: [number, number][] = []
    const particles: Particle[] = []

    // 1. Hub nodes — bronchiole endpoints in a ring
    for (let h = 0; h < CFG.hubCount; h++) {
      const angle = (h / CFG.hubCount) * Math.PI * 2 + rand(-0.3, 0.3)
      const r = CFG.hubSpread * rand(0.6, 1.0)
      const x = r * Math.cos(angle)
      const y = rand(-CFG.hubSpread * 0.5, CFG.hubSpread * 0.5)
      const z = r * Math.sin(angle) * 0.6

      nodes.push({
        baseX: x, baseY: y, baseZ: z,
        x, y, z,
        size: CFG.hubSize,
        type: 'hub',
        hubIndex: h,
        connections: [],
        sx: 0, sy: 0, sz: 0,
        scale: 0, opacity: 0,
        flickerPhase: 0,
      })
    }

    // 2. Connect hubs — nearest-2 backbone
    for (let h = 0; h < CFG.hubCount; h++) {
      const hub = nodes[h]
      const ranked: { idx: number; d: number }[] = []
      for (let j = 0; j < CFG.hubCount; j++) {
        if (j === h) continue
        const dx = hub.baseX - nodes[j].baseX
        const dy = hub.baseY - nodes[j].baseY
        const dz = hub.baseZ - nodes[j].baseZ
        ranked.push({ idx: j, d: dx * dx + dy * dy + dz * dz })
      }
      ranked.sort((a, b) => a.d - b.d)
      for (let c = 0; c < Math.min(2, ranked.length); c++) {
        const j = ranked[c].idx
        if (!hub.connections.includes(j)) hub.connections.push(j)
        if (!nodes[j].connections.includes(h)) nodes[j].connections.push(h)
      }
    }

    // 3. Alveoli clusters — grape-like spherical clouds per hub
    const hubEnd = nodes.length
    for (let h = 0; h < hubEnd; h++) {
      const hub = nodes[h]
      const count = CFG.alveoliPerHub + Math.floor(rand(-CFG.alveoliJitter, CFG.alveoliJitter))

      for (let a = 0; a < count; a++) {
        const theta = Math.random() * Math.PI * 2
        const phi = Math.acos(2 * Math.random() - 1)
        const r = CFG.alveoliSpread * (0.3 + Math.random() * 0.7)

        const x = hub.baseX + r * Math.sin(phi) * Math.cos(theta)
        const y = hub.baseY + r * Math.sin(phi) * Math.sin(theta)
        const z = hub.baseZ + r * Math.cos(phi)

        const idx = nodes.length
        nodes.push({
          baseX: x, baseY: y, baseZ: z,
          x, y, z,
          size: rand(CFG.alveoliMinSize, CFG.alveoliMaxSize),
          type: 'alveolus',
          hubIndex: h,
          connections: [h],
          sx: 0, sy: 0, sz: 0,
          scale: 0, opacity: 0,
          flickerPhase: 0,
        })
        hub.connections.push(idx)
      }
    }

    // 4. Intra-cluster alveoli connections (sparse)
    for (let i = hubEnd; i < nodes.length; i++) {
      const ni = nodes[i]
      if (ni.type !== 'alveolus') continue
      for (let j = i + 1; j < nodes.length; j++) {
        const nj = nodes[j]
        if (nj.type !== 'alveolus' || nj.hubIndex !== ni.hubIndex) continue
        const dx = ni.baseX - nj.baseX
        const dy = ni.baseY - nj.baseY
        const dz = ni.baseZ - nj.baseZ
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (dist < CFG.alveoliSpread * CFG.alveoliConnectRadius && Math.random() < CFG.alveoliConnectChance) {
          if (!ni.connections.includes(j)) ni.connections.push(j)
          if (!nj.connections.includes(i)) nj.connections.push(i)
        }
      }
    }

    // 5. Nodule nodes — pathology markers near random hubs
    for (let n = 0; n < CFG.noduleCount; n++) {
      const hIdx = Math.floor(Math.random() * hubEnd)
      const hub = nodes[hIdx]
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const r = CFG.alveoliSpread * 0.4

      const x = hub.baseX + r * Math.sin(phi) * Math.cos(theta)
      const y = hub.baseY + r * Math.sin(phi) * Math.sin(theta)
      const z = hub.baseZ + r * Math.cos(phi)

      const idx = nodes.length
      nodes.push({
        baseX: x, baseY: y, baseZ: z,
        x, y, z,
        size: CFG.noduleSize,
        type: 'nodule',
        hubIndex: hIdx,
        connections: [hIdx],
        sx: 0, sy: 0, sz: 0,
        scale: 0, opacity: 0,
        flickerPhase: Math.random() * Math.PI * 2,
      })
      hub.connections.push(idx)
    }

    // 6. Collect unique edges
    for (let i = 0; i < nodes.length; i++) {
      for (const j of nodes[i].connections) {
        if (j > i) edges.push([i, j])
      }
    }

    // 7. Spawn data particles on random edges
    for (let p = 0; p < CFG.particleCount; p++) {
      const e = edges[Math.floor(Math.random() * edges.length)]
      particles.push({
        fromIdx: e[0], toIdx: e[1],
        progress: Math.random(),
        speed: CFG.particleSpeed * (0.5 + Math.random()),
        sx: 0, sy: 0, scale: 0, opacity: 0,
      })
    }

    // ── Animation loop ───────────────────────────────────────
    let tick = 0

    function loop() {
      if (!ctx || !canvas || destroyedRef.current) return

      ctx.fillStyle = CFG.bgColor
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      tick++
      const currentZoom = zoomLevel.get()
      const zoomExpand = 1 + (currentZoom - 1) * 0.02

      const rotX = tick * CFG.rotVelX
      const rotY = tick * CFG.rotVelY
      const cosX = Math.cos(rotX)
      const sinX = Math.sin(rotX)
      const cosY = Math.cos(rotY)
      const sinY = Math.sin(rotY)

      // ── Project all nodes with parallax ────────────────────
      for (const nd of nodes) {
        nd.x = nd.baseX * zoomExpand
        nd.y = nd.baseY * zoomExpand
        nd.z = nd.baseZ * zoomExpand

        const p = project(nd.x, nd.y, nd.z, cosX, sinX, cosY, sinY)
        nd.sx = p.sx; nd.sy = p.sy; nd.sz = p.sz
        nd.scale = p.scale; nd.opacity = p.opacity
      }

      // ── Draw connections — depth-based opacity ─────────────
      ctx.lineWidth = CFG.wireframeWidth
      for (const [i, j] of edges) {
        const a = nodes[i], b = nodes[j]
        const avgO = (a.opacity + b.opacity) / 2
        ctx.beginPath()
        ctx.moveTo(a.sx, a.sy)
        ctx.lineTo(b.sx, b.sy)
        ctx.strokeStyle = rgba(pR, pG, pB, avgO)
        ctx.stroke()
      }

      // ── Draw nodes — depth-sorted (painter's algorithm) ────
      const sorted = nodes
        .map((_, i) => i)
        .sort((a, b) => nodes[b].sz - nodes[a].sz)

      for (const i of sorted) {
        const nd = nodes[i]
        if (nd.scale <= 0) continue
        const r = nd.size * nd.scale
        if (r < 0.1) continue

        if (nd.type === 'nodule') {
          // Solid fill + flicker
          const fl = 0.6 + 0.4 * Math.sin(tick * CFG.noduleFlickerSpeed + nd.flickerPhase)
          ctx.beginPath()
          ctx.arc(nd.sx, nd.sy, r, 0, Math.PI * 2)
          ctx.fillStyle = rgba(pR, pG, pB, nd.opacity * fl)
          ctx.fill()
          // Outer glow ring
          ctx.beginPath()
          ctx.arc(nd.sx, nd.sy, r * 1.5, 0, Math.PI * 2)
          ctx.strokeStyle = rgba(pR, pG, pB, nd.opacity * fl * 0.3)
          ctx.lineWidth = 1
          ctx.stroke()
          ctx.lineWidth = CFG.wireframeWidth
        } else if (nd.type === 'hub') {
          ctx.beginPath()
          ctx.arc(nd.sx, nd.sy, r, 0, Math.PI * 2)
          ctx.fillStyle = rgba(pR, pG, pB, nd.opacity * 0.8)
          ctx.fill()
        } else {
          ctx.beginPath()
          ctx.arc(nd.sx, nd.sy, r, 0, Math.PI * 2)
          ctx.fillStyle = rgba(pR, pG, pB, nd.opacity * 0.6)
          ctx.fill()
        }
      }

      // ── Data particles ─────────────────────────────────────
      for (const pt of particles) {
        pt.progress += pt.speed
        if (pt.progress >= 1) {
          const fromNd = nodes[pt.toIdx]
          if (fromNd.connections.length > 0) {
            pt.fromIdx = pt.toIdx
            pt.toIdx = fromNd.connections[Math.floor(Math.random() * fromNd.connections.length)]
          } else {
            const e = edges[Math.floor(Math.random() * edges.length)]
            pt.fromIdx = e[0]; pt.toIdx = e[1]
          }
          pt.progress = 0
        }

        const f = nodes[pt.fromIdx], t = nodes[pt.toIdx]
        const px = f.x + (t.x - f.x) * pt.progress
        const py = f.y + (t.y - f.y) * pt.progress
        const pz = f.z + (t.z - f.z) * pt.progress

        const pp = project(px, py, pz, cosX, sinX, cosY, sinY)
        pt.sx = pp.sx; pt.sy = pp.sy
        pt.scale = pp.scale; pt.opacity = pp.opacity

        const pr = CFG.particleSize * pp.scale
        if (pr < 0.1) continue

        ctx.beginPath()
        ctx.arc(pt.sx, pt.sy, pr, 0, Math.PI * 2)
        ctx.fillStyle = rgba(255, 255, 255, pt.opacity * 0.8)
        ctx.shadowBlur = CFG.particleGlow
        ctx.shadowColor = rgba(pR, pG, pB, pt.opacity * 0.5)
        ctx.fill()
      }

      // Reset shadow state
      ctx.shadowBlur = 0
      ctx.shadowColor = 'transparent'

      // ── Fade overlay when zoomLevel > 30 ───────────────────
      if (currentZoom > 30) {
        const fadeAlpha = Math.min((currentZoom - 30) / 20, 0.8)
        ctx.fillStyle = `rgba(10,10,10,${fadeAlpha})`
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }

      animFrameRef.current = requestAnimationFrame(loop)
    }

    animFrameRef.current = requestAnimationFrame(loop)

    // ── PROCESS REAPER — strict cleanup ──────────────────────
    return () => {
      destroyedRef.current = true
      cancelAnimationFrame(animFrameRef.current)
      window.removeEventListener('resize', resize)

      // Zero out canvas to free GPU memory
      if (canvas) {
        canvas.width = 0
        canvas.height = 0
      }

      // Purge arrays
      nodes.length = 0
      edges.length = 0
      particles.length = 0
    }
  }, [zoomLevel])

  useEffect(() => {
    const cleanup = initAndAnimate()
    return cleanup
  }, [initAndAnimate])

  return canvasRef
}
