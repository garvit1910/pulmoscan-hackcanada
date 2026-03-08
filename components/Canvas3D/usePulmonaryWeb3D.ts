'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { type MotionValue } from 'framer-motion'

/**
 * usePulmonaryWeb3D — "Scroll-to-Dive Camera" Canvas Hook
 *
 * Architecture:
 *   Canvas + DiagnosticQuote are position:fixed. The page body is tall
 *   (min-h-[500vh]) to generate scrollY. scrollY drives cameraZ exclusively —
 *   the camera translates forward, not the page content.
 *
 * Projection:
 *   z_final = rotatedZ + baseDepth − (scrollY × sensitivity)
 *   As scrollY ↑ → cameraZ ↑ → z_final ↓ → nodes enlarge & fly past viewer.
 *
 * Two-layer anatomy:
 *   SHELL — Low-density lung-silhouette (0.06 opacity).
 *           Visible when cameraZ < 500. Fully faded out by cameraZ ≈ 600.
 *   CORE  — Dense alveolar sacs (dual-lobe). Scale up as camera dives.
 *
 * FINAL_SCROLL_POINT:
 *   When cameraZ > FINAL_THRESHOLD, the camera "clips into" the closest sac.
 *   An overdrive zoom is applied, interior sac-wall rings are drawn around the
 *   viewport edges, and the sac's fact is force-triggered.
 *
 * Fact trigger: sac avgScale ∈ (25, 80) and sac on-screen → show fact.
 *   At FINAL_SCROLL_POINT, fact is force-shown for the target sac.
 *
 * PROCESS REAPER: Full cleanup on unmount — rAF + scroll + resize removed.
 */

// ── Sac Facts ─────────────────────────────────────────────────
const SAC_FACTS: string[] = [
  'Gas exchange occurs across 300 million alveoli — 70 m² of surface area.',
  'Surfactant reduces surface tension, preventing alveolar collapse with each breath.',
  'Each alveolus is wrapped in capillaries just 0.5 μm thick.',
  'Type II pneumocytes produce surfactant and can regenerate damaged cells.',
  'Pulmonary fibrosis thickens alveolar walls, cutting O₂ transfer by up to 60 %.',
  'The lungs process roughly 10 000 litres of air daily through these sacs.',
  'Alveolar macrophages patrol each sac as frontline immune sentinels.',
  'Interstitial lung disease begins at the alveolar-capillary interface.',
  'Oxygen diffuses into blood in under 0.25 s at the alveolar membrane.',
  'Exhaled CO₂ travels blood → alveolus → bronchiole → out in a fraction of a second.',
  'Fibrotic scarring creates a "honeycomb" pattern visible on HRCT scans.',
  'Each lung lobe has its own bronchial tree and arterial supply.',
  'Premature infants lack surfactant — neonatal respiratory distress results.',
  'Cigarette smoke destroys alveolar walls, causing centrilobular emphysema.',
  'The right lung has 3 lobes; the left has 2 to accommodate the heart.',
  'Healthy alveoli expand like microscopic balloons with each inhalation.',
  'Pulmonary oedema fills alveoli with fluid, drowning gas exchange.',
  'The diaphragm creates negative pressure to inflate 500 million alveoli.',
  'Silicosis and asbestosis scar alveoli through chronic particle inhalation.',
  'AI can detect sub-clinical alveolar damage patterns invisible to radiologists.',
  'The blood-air barrier is only two cell layers thick — epithelium and endothelium.',
  'Collateral ventilation through pores of Kohn connects adjacent alveoli.',
  'Alveolar dead-space increases in pulmonary embolism, reducing CO₂ clearance.',
  'Idiopathic pulmonary fibrosis has a median survival of 3-5 years post-diagnosis.',
]

// ── Configuration ──────────────────────────────────────────────
const CFG = {
  // Camera
  baseDepth: 600,
  baseFocalLength: 600,
  vanishPoint: { x: 0, y: 0 },

  // Scroll → cameraZ mapping
  scrollSensitivity: 0.8,     // cameraZ = scrollY × sensitivity
  maxCameraZ: 1400,
  focalBoostPerZ: 0.7,        // fl += cameraZ × this
  lobeSeparationGain: 2.0,

  // Rotation (slow, continuous — decoupled from dive)
  rotVelX: 0.0008,
  rotVelY: 0.0005,

  // Colors
  bgColor: '#0a0a0a',
  pR: 255, pG: 119, pB: 94,

  // ─── Shell (Lung Envelope) ──────────────────────────────
  shellPointsPerLobe: 90,
  shellSpreadX: 210,
  shellSpreadY: 280,
  shellSpreadZ: 150,
  shellSize: 3,
  shellOpacity: 0.06,
  shellFadeStart: 200,        // cameraZ where shell begins fading
  shellFadeEnd: 600,          // cameraZ where shell is fully gone

  // ─── Lobes ─────────────────────────────────────────────
  lobeCount: 2,
  lobeOffsetX: 150,

  // ─── Sacs per lobe ─────────────────────────────────────
  sacsPerLobe: 12,
  sacJitter: 3,
  sacSpread: 110,

  // ─── Alveoli per sac ──────────────────────────────────
  alveoliPerSac: 40,
  alveoliJitter: 10,
  alveoliRadius: 32,
  alveoliBaseSize: 4,
  alveoliSizeJitter: 2,
  alveoliOpacity: 0.4,

  // ─── Intra-sac wiring ─────────────────────────────────
  intraSacRadius: 0.65,
  intraSacChance: 0.12,
  wireWidth: 0.3,
  wireOpacity: 0.10,

  // ─── Depth-based opacity ───────────────────────────────
  minOpacity: 0.04,
  maxOpacity: 0.55,
  nearZ: 30,
  farZ: 900,

  // ─── Data particles ───────────────────────────────────
  particleCount: 50,
  particleSpeed: 0.005,
  particleSize: 1.1,
  particleGlow: 5,

  // ─── Sac fact trigger ─────────────────────────────────
  sacTriggerScale: 25,
  sacDismissScale: 80,

  // ─── FINAL SCROLL POINT (inside-the-alveoli) ──────────
  finalThreshold: 1000,       // cameraZ value that triggers "inside" view
  overdriveGain: 3.0,         // extra zoom multiplier past threshold
  insideRingCount: 14,        // number of sac-wall rings drawn at edges
  insideRingOpacity: 0.18,
}

// ── Types ──────────────────────────────────────────────────────
interface ShellPoint {
  baseX: number; baseY: number; baseZ: number
  lobeIdx: number
  sx: number; sy: number; sz: number
  scale: number; opacity: number
}

interface Sac {
  lobeIdx: number
  baseCX: number; baseCY: number; baseCZ: number
  nodeStart: number; nodeEnd: number
  factText: string
  avgScale: number
}

interface Node3D {
  baseX: number; baseY: number; baseZ: number
  x: number; y: number; z: number
  size: number; sacIdx: number
  sx: number; sy: number; sz: number
  scale: number; opacity: number
}

interface Edge { a: number; b: number; sacIdx: number }

interface Particle {
  edgeIdx: number; progress: number; speed: number
  sx: number; sy: number; scale: number; opacity: number
}

// ── Hook ───────────────────────────────────────────────────────
export function usePulmonaryWeb3D(zoomLevel: MotionValue<number>) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animFrameRef = useRef<number>(0)
  const destroyedRef = useRef(false)
  const [activeSacFact, setActiveSacFact] = useState<string | null>(null)

  const initAndAnimate = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return () => {}
    const ctx = canvas.getContext('2d')
    if (!ctx) return () => {}

    destroyedRef.current = false

    // ── Canvas sizing ────────────────────────────────────────
    let cW = 0, cH = 0
    function resize() {
      if (!canvas || destroyedRef.current) return
      const dpr = window.devicePixelRatio || 1
      cW = window.innerWidth * dpr
      cH = window.innerHeight * dpr
      canvas.width = cW
      canvas.height = cH
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
      CFG.vanishPoint.x = cW / 2
      CFG.vanishPoint.y = cH / 2
    }
    resize()
    window.addEventListener('resize', resize)

    // ── cameraZ — driven by window.scrollY ───────────────────
    // The page has enough height to scroll. scrollY × sensitivity → cameraZ.
    // The scroll moves only the 3D math — canvas stays position:fixed.
    let cameraZ = 0
    function onScroll() {
      if (destroyedRef.current) return
      cameraZ = Math.min(window.scrollY * CFG.scrollSensitivity, CFG.maxCameraZ)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()  // initialise from current scrollY

    // ── Helpers ──────────────────────────────────────────────
    const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo)
    const { pR, pG, pB } = CFG
    const rgba = (r: number, g: number, b: number, a: number) =>
      `rgba(${r},${g},${b},${Math.max(0, a).toFixed(3)})`

    // ── 3D → 2D projection ──────────────────────────────────
    //  z_final = rotatedZ + depth
    //  where depth = baseDepth − cameraZ (passed as argument)
    //  As cameraZ ↑, depth ↓, z_final ↓, scale ↑ → nodes enlarge / fly past
    function project(
      x: number, y: number, z: number,
      cosX: number, sinX: number, cosY: number, sinY: number,
      depth: number, fl: number,
    ) {
      const y1 = y * cosX - z * sinX
      const z1 = z * cosX + y * sinX
      const z2 = z1 * cosY - x * sinY
      const x1 = x * cosY + z1 * sinY
      const zF = z2 + depth
      const sc = fl / Math.max(zF, 1)
      const dn = Math.max(0, Math.min(1, (zF - CFG.nearZ) / (CFG.farZ - CFG.nearZ)))
      return {
        sx: CFG.vanishPoint.x + x1 * sc,
        sy: CFG.vanishPoint.y + y1 * sc,
        sz: zF,
        scale: sc,
        opacity: CFG.maxOpacity - dn * (CFG.maxOpacity - CFG.minOpacity),
      }
    }

    // ═══════════════════════════════════════════════════════════
    // GENERATION — runs ONCE on mount, never again
    // ═══════════════════════════════════════════════════════════

    // ── 1. Shell (Lung Envelope) ─────────────────────────────
    const shellPoints: ShellPoint[] = []
    for (let lobe = 0; lobe < CFG.lobeCount; lobe++) {
      const sign = lobe === 0 ? -1 : 1
      for (let i = 0; i < CFG.shellPointsPerLobe; i++) {
        const theta = Math.random() * Math.PI * 2
        const phi = Math.acos(2 * Math.random() - 1)
        const rx = CFG.shellSpreadX * (0.7 + Math.random() * 0.3)
        const ry = CFG.shellSpreadY * (0.7 + Math.random() * 0.3)
        const rz = CFG.shellSpreadZ * (0.7 + Math.random() * 0.3)
        shellPoints.push({
          baseX: sign * rx * 0.5 + rx * 0.3 * Math.sin(phi) * Math.cos(theta),
          baseY: ry * 0.5 * Math.sin(phi) * Math.sin(theta),
          baseZ: rz * 0.4 * Math.cos(phi),
          lobeIdx: lobe,
          sx: 0, sy: 0, sz: 0, scale: 0, opacity: 0,
        })
      }
    }

    // ── 2. Core sacs + alveoli ───────────────────────────────
    const sacs: Sac[] = []
    const nodes: Node3D[] = []
    const edges: Edge[] = []
    const particles: Particle[] = []
    let factIdx = 0

    for (let lobe = 0; lobe < CFG.lobeCount; lobe++) {
      const lobeX = lobe === 0 ? -CFG.lobeOffsetX : CFG.lobeOffsetX
      const sacCount = CFG.sacsPerLobe + Math.floor(rand(-CFG.sacJitter, CFG.sacJitter))
      for (let s = 0; s < sacCount; s++) {
        const theta = Math.random() * Math.PI * 2
        const phi = Math.acos(2 * Math.random() - 1)
        const r = CFG.sacSpread * (0.3 + Math.random() * 0.7)
        const cx = lobeX + r * Math.sin(phi) * Math.cos(theta)
        const cy = r * Math.sin(phi) * Math.sin(theta) * 0.8
        const cz = r * Math.cos(phi) * 0.6

        const sacIdx = sacs.length
        const nodeStart = nodes.length
        const count = CFG.alveoliPerSac + Math.floor(rand(-CFG.alveoliJitter, CFG.alveoliJitter))
        for (let a = 0; a < count; a++) {
          const at = Math.random() * Math.PI * 2
          const ap = Math.acos(2 * Math.random() - 1)
          const ar = CFG.alveoliRadius * Math.pow(Math.random(), 0.6)
          nodes.push({
            baseX: cx + ar * Math.sin(ap) * Math.cos(at),
            baseY: cy + ar * Math.sin(ap) * Math.sin(at),
            baseZ: cz + ar * Math.cos(ap),
            x: 0, y: 0, z: 0,
            size: CFG.alveoliBaseSize + rand(-CFG.alveoliSizeJitter, CFG.alveoliSizeJitter),
            sacIdx,
            sx: 0, sy: 0, sz: 0, scale: 0, opacity: 0,
          })
        }
        const nodeEnd = nodes.length

        for (let i = nodeStart; i < nodeEnd; i++) {
          for (let j = i + 1; j < nodeEnd; j++) {
            const dx = nodes[i].baseX - nodes[j].baseX
            const dy = nodes[i].baseY - nodes[j].baseY
            const dz = nodes[i].baseZ - nodes[j].baseZ
            if (Math.sqrt(dx * dx + dy * dy + dz * dz) < CFG.alveoliRadius * CFG.intraSacRadius
                && Math.random() < CFG.intraSacChance) {
              edges.push({ a: i, b: j, sacIdx })
            }
          }
        }

        sacs.push({
          lobeIdx: lobe,
          baseCX: cx, baseCY: cy, baseCZ: cz,
          nodeStart, nodeEnd,
          factText: SAC_FACTS[factIdx % SAC_FACTS.length],
          avgScale: 0,
        })
        factIdx++
      }
    }

    // Spawn particles on edges
    for (let p = 0; p < CFG.particleCount && edges.length > 0; p++) {
      particles.push({
        edgeIdx: Math.floor(Math.random() * edges.length),
        progress: Math.random(),
        speed: CFG.particleSpeed * (0.5 + Math.random()),
        sx: 0, sy: 0, scale: 0, opacity: 0,
      })
    }

    // Pre-allocate sort buffer
    const sortBuf: number[] = []
    for (let i = 0; i < nodes.length; i++) sortBuf.push(i)

    // ═══════════════════════════════════════════════════════════
    // ANIMATION LOOP — reads cameraZ (from scrollY) each frame
    // ═══════════════════════════════════════════════════════════
    let tick = 0
    let lastFact: string | null = null
    const margin = 200

    function loop() {
      if (!ctx || !canvas || destroyedRef.current) return

      ctx.fillStyle = CFG.bgColor
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      tick++

      // ── Detect FINAL_SCROLL_POINT ──────────────────────────
      const pastFinal = cameraZ > CFG.finalThreshold
      const overdriveT = pastFinal
        ? Math.min((cameraZ - CFG.finalThreshold) / (CFG.maxCameraZ - CFG.finalThreshold), 1)
        : 0
      const overdriveMultiplier = 1 + overdriveT * CFG.overdriveGain

      // ── Camera from cameraZ ────────────────────────────────
      const depth = CFG.baseDepth - cameraZ * overdriveMultiplier
      const fl = CFG.baseFocalLength + cameraZ * CFG.focalBoostPerZ * overdriveMultiplier
      const diveFraction = Math.min(cameraZ / CFG.maxCameraZ, 1)
      const lobeMult = 1 + diveFraction * CFG.lobeSeparationGain

      // zoomLevel for dashboard/scanner (non-scrolling pages)
      const currentZoom = zoomLevel.get()
      const zoomExpand = 1 + (currentZoom - 1) * 0.02

      // Rotation — tick-based, decoupled from dive
      const rotX = tick * CFG.rotVelX
      const rotY = tick * CFG.rotVelY
      const cosX = Math.cos(rotX), sinX = Math.sin(rotX)
      const cosY = Math.cos(rotY), sinY = Math.sin(rotY)

      // ── Shell: fades to 0 when cameraZ ∈ [shellFadeStart, shellFadeEnd] ──
      const shellFade = Math.max(0, Math.min(1,
        (CFG.shellFadeEnd - cameraZ) / (CFG.shellFadeEnd - CFG.shellFadeStart)))
      const shellAlpha = CFG.shellOpacity * shellFade
      const shellExpand = 1 + diveFraction * 1.5

      // ── Draw Shell ─────────────────────────────────────────
      if (shellAlpha > 0.002) {
        for (const sp of shellPoints) {
          const sign = sp.lobeIdx === 0 ? -1 : 1
          const sx = sp.baseX + (lobeMult - 1) * sign * 40
          const sy = sp.baseY
          const sz = sp.baseZ

          const p = project(
            sx * shellExpand, sy * shellExpand, sz * shellExpand,
            cosX, sinX, cosY, sinY, depth, fl,
          )
          sp.sx = p.sx; sp.sy = p.sy; sp.sz = p.sz
          sp.scale = p.scale; sp.opacity = p.opacity

          const r = CFG.shellSize * p.scale
          if (r < 0.1) continue

          ctx.beginPath()
          ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2)
          ctx.fillStyle = rgba(pR, pG, pB, shellAlpha * Math.max(0.2, p.opacity))
          ctx.fill()
        }
      }

      // ── Project sac nodes ──────────────────────────────────
      for (const sac of sacs) {
        const sign = sac.baseCX < 0 ? -1 : 1
        const spreadX = sac.baseCX + (lobeMult - 1) * sign * Math.abs(sac.baseCX) * 0.5

        for (let i = sac.nodeStart; i < sac.nodeEnd; i++) {
          const nd = nodes[i]
          const relX = nd.baseX - sac.baseCX
          const relY = nd.baseY - sac.baseCY
          const relZ = nd.baseZ - sac.baseCZ
          nd.x = spreadX + relX * zoomExpand
          nd.y = sac.baseCY * zoomExpand + relY * zoomExpand
          nd.z = sac.baseCZ * zoomExpand + relZ * zoomExpand

          const p = project(nd.x, nd.y, nd.z, cosX, sinX, cosY, sinY, depth, fl)
          nd.sx = p.sx; nd.sy = p.sy; nd.sz = p.sz
          nd.scale = p.scale; nd.opacity = p.opacity
        }
      }

      // ── Sac fact logic ─────────────────────────────────────
      let closestFact: string | null = null
      let closestScale = 0

      // If past FINAL_SCROLL_POINT, force-select the sac with largest avgScale
      // (the one the camera clipped into). Otherwise use normal range check.
      for (const sac of sacs) {
        let total = 0
        let onScreen = false
        const n = sac.nodeEnd - sac.nodeStart
        for (let i = sac.nodeStart; i < sac.nodeEnd; i++) {
          total += nodes[i].scale
          if (!onScreen) {
            const nd = nodes[i]
            if (nd.sx > -margin && nd.sx < cW + margin &&
                nd.sy > -margin && nd.sy < cH + margin) {
              onScreen = true
            }
          }
        }
        sac.avgScale = n > 0 ? total / n : 0

        if (pastFinal) {
          // Inside mode — pick the dominant sac regardless of dismiss threshold
          if (sac.avgScale > closestScale) {
            closestScale = sac.avgScale
            closestFact = sac.factText
          }
        } else {
          // Normal dive — sweet-spot range + visibility
          if (sac.avgScale > CFG.sacTriggerScale &&
              sac.avgScale < CFG.sacDismissScale &&
              onScreen && sac.avgScale > closestScale) {
            closestScale = sac.avgScale
            closestFact = sac.factText
          }
        }
      }
      if (closestFact !== lastFact) {
        lastFact = closestFact
        setActiveSacFact(closestFact)
      }

      // ── Draw intra-sac connections ─────────────────────────
      ctx.lineWidth = CFG.wireWidth
      for (const e of edges) {
        const a = nodes[e.a], b = nodes[e.b]
        const o = (a.opacity + b.opacity) * 0.5 * (CFG.wireOpacity / CFG.maxOpacity)
        if (o < 0.008) continue
        ctx.beginPath()
        ctx.moveTo(a.sx, a.sy)
        ctx.lineTo(b.sx, b.sy)
        ctx.strokeStyle = rgba(pR, pG, pB, o)
        ctx.stroke()
      }

      // ── Draw alveoli — depth-sorted, volumetric fill ───────
      // When inside, alveoli get brighter
      const alvBrightness = pastFinal ? (1 + overdriveT * 0.6) : 1
      sortBuf.sort((a, b) => nodes[b].sz - nodes[a].sz)
      for (const i of sortBuf) {
        const nd = nodes[i]
        if (nd.scale <= 0) continue
        const r = nd.size * nd.scale
        if (r < 0.15) continue
        ctx.beginPath()
        ctx.arc(nd.sx, nd.sy, r, 0, Math.PI * 2)
        ctx.fillStyle = rgba(pR, pG, pB,
          Math.min(1, nd.opacity * CFG.alveoliOpacity * alvBrightness))
        ctx.fill()
      }

      // ── Data particles ─────────────────────────────────────
      for (const pt of particles) {
        pt.progress += pt.speed
        if (pt.progress >= 1) {
          pt.edgeIdx = Math.floor(Math.random() * edges.length)
          pt.progress = 0
        }
        const e = edges[pt.edgeIdx]
        if (!e) continue
        const f = nodes[e.a], t = nodes[e.b]
        const px = f.x + (t.x - f.x) * pt.progress
        const py = f.y + (t.y - f.y) * pt.progress
        const pz = f.z + (t.z - f.z) * pt.progress

        const pp = project(px, py, pz, cosX, sinX, cosY, sinY, depth, fl)
        pt.sx = pp.sx; pt.sy = pp.sy; pt.scale = pp.scale; pt.opacity = pp.opacity

        const pr = CFG.particleSize * pp.scale
        if (pr < 0.1) continue
        ctx.beginPath()
        ctx.arc(pt.sx, pt.sy, pr, 0, Math.PI * 2)
        ctx.fillStyle = rgba(255, 255, 255, pt.opacity * 0.7)
        ctx.shadowBlur = CFG.particleGlow
        ctx.shadowColor = rgba(pR, pG, pB, pt.opacity * 0.4)
        ctx.fill()
      }
      ctx.shadowBlur = 0
      ctx.shadowColor = 'transparent'

      // ── INSIDE THE ALVEOLI — sac-wall rings at viewport edge ──
      if (pastFinal && overdriveT > 0) {
        const cx = cW / 2
        const cy = cH / 2
        const maxR = Math.sqrt(cx * cx + cy * cy) * 1.1
        for (let i = 0; i < CFG.insideRingCount; i++) {
          const t = i / CFG.insideRingCount
          const rng = maxR * (0.6 + t * 0.4)
          const a = CFG.insideRingOpacity * overdriveT * (1 - t * 0.6)
          ctx.beginPath()
          ctx.arc(cx, cy, rng, 0, Math.PI * 2)
          ctx.lineWidth = 2 + t * 4
          ctx.strokeStyle = rgba(pR, pG, pB, a)
          ctx.stroke()
        }
        // Soft vignette darkening at extreme dive
        const vigAlpha = overdriveT * 0.3
        const grad = ctx.createRadialGradient(cx, cy, maxR * 0.2, cx, cy, maxR)
        grad.addColorStop(0, `rgba(10,10,10,0)`)
        grad.addColorStop(1, `rgba(10,10,10,${vigAlpha})`)
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, cW, cH)
      }

      // ── Fade overlay when zoomLevel > 30 (dashboard/scanner) ──
      if (currentZoom > 30) {
        const fadeAlpha = Math.min((currentZoom - 30) / 20, 0.8)
        ctx.fillStyle = `rgba(10,10,10,${fadeAlpha})`
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }

      animFrameRef.current = requestAnimationFrame(loop)
    }

    animFrameRef.current = requestAnimationFrame(loop)

    // ── PROCESS REAPER ───────────────────────────────────────
    return () => {
      destroyedRef.current = true
      cancelAnimationFrame(animFrameRef.current)
      window.removeEventListener('resize', resize)
      window.removeEventListener('scroll', onScroll)
      if (canvas) { canvas.width = 0; canvas.height = 0 }
      shellPoints.length = 0; sacs.length = 0
      nodes.length = 0; edges.length = 0; particles.length = 0
    }
  }, [zoomLevel])

  useEffect(() => {
    const cleanup = initAndAnimate()
    return cleanup
  }, [initAndAnimate])

  return { canvasRef, activeSacFact }
}
