'use client'

/**
 * LungScene3D — Interactive 3D Lung with Zoom-to-Dive Experience
 *
 * Exterior : Large anatomical lungs breathing & rotating behind page content.
 * Zoom-dive: Scroll-wheel on the canvas zooms in; past a threshold the
 *            camera flies inside with a dramatic warp transition.
 * Interior : Immersive alveoli world orbiting around the viewer.
 * Surfacing: ESC / click reverses back out.
 */

import { useRef, useMemo, useEffect, useState, useCallback, Suspense } from 'react'
import { Canvas, useFrame, useThree, ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'

/* ═══════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════ */
const BREATH_PERIOD = 4.0        // faster, more visible cycle
const BREATH_AMP = 0.06          // much stronger breathing
const ROT_Y_SPEED = 0.22
const ROT_X_AMP = 0.06
const ROT_X_PERIOD = 10

const PEACH = '#F48BA0'       // richer pink — lung tissue
const PEACH_DIM = '#D97085'   // deeper muted pink
const NEON_ORANGE = '#CC2233' // deep red — vessels & edges

const DIVE_DURATION = 2.8        // seconds for fly-in animation
const EXTERIOR_SCALE = 2.2       // 2.2× larger — fills screen for wow factor

type Phase = 'exterior' | 'diving' | 'interior' | 'surfacing'

/* Lung facts shown on alveoli hover */
const ALVEOLI_FACTS = [
  'There are ~480 million alveoli in the average human lung.',
  'Alveoli are just 0.2mm in diameter — thinner than paper.',
  'Gas exchange occurs in under 0.3 seconds per breath.',
  'The total surface area of all alveoli is about 70 m².',
  'Alveolar walls are only one cell thick (0.1–0.5 µm).',
  'Type II alveolar cells produce surfactant to prevent collapse.',
  'Oxygen passes from alveoli into capillaries via diffusion.',
  'CO₂ travels the reverse path and is exhaled.',
  'Premature infants often lack surfactant, causing RDS.',
  'Emphysema destroys alveolar walls, reducing surface area.',
  'Each alveolus is wrapped in a fine mesh of capillaries.',
  'Alveoli inflate and deflate ~15–20 times per minute at rest.',
  'Pulmonary fibrosis thickens alveolar walls, impairing gas exchange.',
  'Macrophages patrol the alveoli, clearing debris and pathogens.',
  'The blood-air barrier is the thinnest membrane in the body.',
]

interface LungScene3DProps {
  phase?: string
  onPhaseChange?: (phase: string) => void
  /** Render as a small decorative background — no dive, no overlays */
  decorative?: boolean
  /** Custom scale for decorative mode (default 1.0) */
  decorativeScale?: number
}

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */

function createLobeMesh(
  rx: number, ry: number, rz: number,
  flattenInner: boolean,
  side: 'left' | 'right',
  taperBottom: number,
): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 48, 36)
  const pos = geo.attributes.position as THREE.BufferAttribute
  const v = new THREE.Vector3()

  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i))
    v.x *= rx
    v.y *= ry
    v.z *= rz

    if (flattenInner) {
      const innerDir = side === 'right' ? -1 : 1
      const medialX = v.x * innerDir
      if (medialX < 0) {
        v.x += innerDir * Math.abs(medialX) * 0.35
      }
    }

    if (taperBottom > 0 && v.y < 0) {
      const t = Math.abs(v.y) / ry
      const squeeze = 1 - taperBottom * t * t
      v.x *= squeeze
      v.z *= squeeze
    }

    if (v.y > ry * 0.6) {
      const t = (v.y - ry * 0.6) / (ry * 0.4)
      v.x *= 1 - 0.3 * t * t
      v.z *= 1 - 0.3 * t * t
    }

    const n = Math.sin(v.x * 5.1 + v.y * 3.7) * Math.cos(v.z * 4.3 + v.x * 2.1) * 0.015
    v.x += n * rx
    v.y += n * ry
    v.z += n * rz

    pos.setXYZ(i, v.x, v.y, v.z)
  }

  geo.computeVertexNormals()
  return geo
}

/* ═══════════════════════════════════════════════════════════════
   LUNG LOBE
   ═══════════════════════════════════════════════════════════════ */
interface LobeProps {
  position: [number, number, number]
  rx: number; ry: number; rz: number
  side: 'left' | 'right'
  taper: number
  phaseOffset: number
}

function LungLobe({ position, rx, ry, rz, side, taper, phaseOffset }: LobeProps) {
  const groupRef = useRef<THREE.Group>(null)
  const geometry = useMemo(() => createLobeMesh(rx, ry, rz, true, side, taper), [rx, ry, rz, side, taper])
  const edgesGeo = useMemo(() => new THREE.EdgesGeometry(geometry, 20), [geometry])

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    const t = clock.elapsedTime
    const breath = 1 + BREATH_AMP * Math.sin((2 * Math.PI / BREATH_PERIOD) * t + phaseOffset)
    groupRef.current.scale.setScalar(breath)
  })

  return (
    <group ref={groupRef} position={position}>
      <mesh geometry={geometry}>
        <meshPhysicalMaterial
          color={PEACH} transparent opacity={0.28}
          side={THREE.DoubleSide} depthWrite={false}
          roughness={0.6} metalness={0.15} clearcoat={0.4}
          emissive={NEON_ORANGE} emissiveIntensity={0.15}
        />
      </mesh>
      <lineSegments geometry={edgesGeo}>
        <lineBasicMaterial color={NEON_ORANGE} transparent opacity={0.35} />
      </lineSegments>
      <mesh geometry={geometry}>
        <meshBasicMaterial
          color={PEACH} transparent opacity={0.55}
          side={THREE.BackSide} depthWrite={false}
        />
      </mesh>
    </group>
  )
}

/* ═══════════════════════════════════════════════════════════════
   BRONCHIAL TREE — Dense recursive branching (7 generations)
   ═══════════════════════════════════════════════════════════════ */
interface BranchDef { path: THREE.Vector3[]; radius: number; opacity: number; gen: number }

function buildBranches(): BranchDef[] {
  const p = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
  const b: BranchDef[] = []

  /* Gen 0 — Trachea */
  b.push({ path: [p(0,2.0,0), p(0,1.4,0), p(0,0.9,0)], radius: 0.08, opacity: 0.7, gen: 0 })

  /* Gen 1 — Main bronchi L/R */
  b.push({ path: [p(0,0.9,0), p(0.3,0.65,0.02), p(0.65,0.45,0)], radius: 0.055, opacity: 0.6, gen: 1 })
  b.push({ path: [p(0,0.9,0), p(-0.3,0.6,-0.02), p(-0.6,0.35,0)], radius: 0.055, opacity: 0.6, gen: 1 })

  /* Gen 2 — Lobar bronchi (right 3 + left 2 + 4 extra for density = 9) */
  const gen2Defs: [THREE.Vector3, THREE.Vector3][] = [
    [p(0.65,0.45,0), p(1.0,0.85,0.05)],
    [p(0.65,0.45,0), p(1.1,0.15,0.05)],
    [p(0.65,0.45,0), p(0.85,-0.25,0)],
    [p(-0.6,0.35,0), p(-0.95,0.8,0)],
    [p(-0.6,0.35,0), p(-0.85,-0.3,0)],
    [p(0.65,0.45,0), p(0.95,0.55,0.18)],
    [p(0.65,0.45,0), p(0.92,-0.08,-0.12)],
    [p(-0.6,0.35,0), p(-0.88,0.58,0.12)],
    [p(-0.6,0.35,0), p(-0.78,0.02,-0.1)],
  ]
  for (const [s, e] of gen2Defs) {
    const mid = s.clone().lerp(e, 0.5)
    mid.z += (Math.random() - 0.5) * 0.04
    b.push({ path: [s.clone(), mid, e.clone()], radius: 0.038, opacity: 0.55, gen: 2 })
  }

  /* Gen 3 — Segmental bronchi: 3 per gen-2 branch = 27 */
  const gen3Terminals: { pos: THREE.Vector3; dir: THREE.Vector3 }[] = []
  for (const [s, e] of gen2Defs) {
    const baseDir = e.clone().sub(s).normalize()
    const up = Math.abs(baseDir.y) < 0.9 ? p(0,1,0) : p(1,0,0)
    const ax1 = baseDir.clone().cross(up).normalize()
    const ax2 = baseDir.clone().cross(ax1).normalize()
    for (let c = 0; c < 3; c++) {
      const a1 = (c === 0 ? 0.38 : c === 1 ? -0.38 : 0) + (Math.random() - 0.5) * 0.12
      const a2 = (c === 2 ? 0.32 : (Math.random() - 0.5) * 0.2)
      const childDir = baseDir.clone().applyAxisAngle(ax1, a1).applyAxisAngle(ax2, a2).normalize()
      const len = 0.14 + Math.random() * 0.09
      const end = e.clone().add(childDir.clone().multiplyScalar(len))
      const mid = e.clone().lerp(end, 0.5)
      b.push({ path: [e.clone(), mid, end], radius: 0.022, opacity: 0.42, gen: 3 })
      gen3Terminals.push({ pos: end, dir: childDir })
    }
  }

  /* Gen 4-6 — Recursive bronchioles from gen-3 terminals */
  function subBranch(
    start: THREE.Vector3, dir: THREE.Vector3,
    radius: number, opacity: number, gen: number,
  ) {
    if (gen > 6) return
    const nKids = gen < 5 ? (Math.random() > 0.3 ? 3 : 2) : 2
    for (let c = 0; c < nKids; c++) {
      const len = (0.06 + Math.random() * 0.045) / (1 + (gen - 4) * 0.35)
      const spread = (0.38 + Math.random() * 0.28) * (c % 2 === 0 ? 1 : -1)
      const twist = (Math.random() - 0.5) * 0.55
      const up = Math.abs(dir.y) < 0.9 ? p(0,1,0) : p(1,0,0)
      const a1 = dir.clone().cross(up).normalize()
      const a2 = dir.clone().cross(a1).normalize()
      const cDir = dir.clone().applyAxisAngle(a1, spread).applyAxisAngle(a2, twist).normalize()
      const end = start.clone().add(cDir.clone().multiplyScalar(len))
      const mid = start.clone().lerp(end, 0.5)
      b.push({ path: [start.clone(), mid, end], radius, opacity, gen })
      subBranch(end, cDir, radius * 0.55, opacity * 0.78, gen + 1)
    }
  }
  for (const t of gen3Terminals) {
    subBranch(t.pos, t.dir, 0.012, 0.3, 4)
  }

  return b
}

function BronchialTree() {
  const groupRef = useRef<THREE.Group>(null)
  const branches = useMemo(() => buildBranches(), [])

  const { tubes, fineLineGeo } = useMemo(() => {
    const thick = branches.filter(br => br.gen <= 3)
    const thin  = branches.filter(br => br.gen > 3)

    const tubeData = thick.map(br => {
      const curve = new THREE.CatmullRomCurve3(br.path)
      const segs = br.gen <= 1 ? 12 : 8
      const radSegs = br.gen <= 1 ? 8 : 6
      const geo = new THREE.TubeGeometry(curve, segs, br.radius, radSegs, false)
      return { geo, opacity: br.opacity }
    })

    const positions: number[] = []
    for (const br of thin) {
      for (let i = 0; i < br.path.length - 1; i++) {
        const a = br.path[i], c = br.path[i + 1]
        positions.push(a.x, a.y, a.z, c.x, c.y, c.z)
      }
    }
    const lineGeo = new THREE.BufferGeometry()
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))

    return { tubes: tubeData, fineLineGeo: lineGeo }
  }, [branches])

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    const t = clock.elapsedTime
    const breath = 1 + 0.03 * Math.sin((2 * Math.PI / BREATH_PERIOD) * t)
    groupRef.current.scale.set(breath, 1, breath)
  })

  return (
    <group ref={groupRef}>
      {tubes.map((tube, i) => (
        <mesh key={i} geometry={tube.geo}>
          <meshBasicMaterial color={NEON_ORANGE} transparent opacity={Math.min(1, tube.opacity * 1.2)} side={THREE.DoubleSide} />
        </mesh>
      ))}
      <lineSegments geometry={fineLineGeo}>
        <lineBasicMaterial color={NEON_ORANGE} transparent opacity={0.3} />
      </lineSegments>
      {[0, 0.18, 0.36, 0.54].map((dy, i) => (
        <mesh key={`ring-${i}`} position={[0, 1.95 - dy, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.085, 0.012, 6, 20]} />
          <meshBasicMaterial color={NEON_ORANGE} transparent opacity={0.4} />
        </mesh>
      ))}
    </group>
  )
}

/* ═══════════════════════════════════════════════════════════════
   ALVEOLAR CLUSTERS
   ═══════════════════════════════════════════════════════════════ */
interface ClusterDef { center: THREE.Vector3; count: number; spread: number; baseSize: number }

function AlveolarClusters() {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])

  const { totalCount, instances } = useMemo(() => {
    const clusters: ClusterDef[] = [
      /* Branch-tip clusters (boosted) */
      { center: new THREE.Vector3(1.15, 1.0, 0.12), count: 24, spread: 0.15, baseSize: 0.026 },
      { center: new THREE.Vector3(1.1, 0.95, -0.1), count: 20, spread: 0.13, baseSize: 0.024 },
      { center: new THREE.Vector3(1.25, 0.1, 0.12), count: 22, spread: 0.14, baseSize: 0.025 },
      { center: new THREE.Vector3(1.2, 0.25, -0.08), count: 18, spread: 0.12, baseSize: 0.024 },
      { center: new THREE.Vector3(0.95, -0.45, 0.08), count: 24, spread: 0.16, baseSize: 0.026 },
      { center: new THREE.Vector3(1.0, -0.2, -0.1), count: 18, spread: 0.12, baseSize: 0.024 },
      { center: new THREE.Vector3(-1.1, 0.95, 0.08), count: 24, spread: 0.15, baseSize: 0.026 },
      { center: new THREE.Vector3(-1.05, 0.85, -0.1), count: 20, spread: 0.13, baseSize: 0.024 },
      { center: new THREE.Vector3(-1.0, -0.5, 0.08), count: 24, spread: 0.16, baseSize: 0.026 },
      { center: new THREE.Vector3(-0.95, -0.25, -0.12), count: 18, spread: 0.12, baseSize: 0.024 },
      /* Lobe-fill clusters (denser) */
      { center: new THREE.Vector3(0.9, 0.6, 0), count: 32, spread: 0.28, baseSize: 0.02 },
      { center: new THREE.Vector3(0.95, 0.0, 0), count: 32, spread: 0.28, baseSize: 0.02 },
      { center: new THREE.Vector3(0.85, -0.5, 0), count: 32, spread: 0.32, baseSize: 0.02 },
      { center: new THREE.Vector3(-0.85, 0.5, 0), count: 32, spread: 0.28, baseSize: 0.02 },
      { center: new THREE.Vector3(-0.8, -0.2, 0), count: 32, spread: 0.32, baseSize: 0.02 },
      /* Extra clusters for new deep-branch endpoints */
      { center: new THREE.Vector3(1.05, 0.55, 0.18), count: 18, spread: 0.14, baseSize: 0.018 },
      { center: new THREE.Vector3(0.92, -0.08, -0.12), count: 16, spread: 0.12, baseSize: 0.018 },
      { center: new THREE.Vector3(0.95, 0.55, 0.15), count: 16, spread: 0.12, baseSize: 0.018 },
      { center: new THREE.Vector3(-0.88, 0.58, 0.12), count: 18, spread: 0.14, baseSize: 0.018 },
      { center: new THREE.Vector3(-0.78, 0.02, -0.1), count: 16, spread: 0.12, baseSize: 0.018 },
      { center: new THREE.Vector3(0.8, 0.3, -0.08), count: 14, spread: 0.1, baseSize: 0.016 },
      { center: new THREE.Vector3(0.75, -0.15, 0.1), count: 14, spread: 0.1, baseSize: 0.016 },
      { center: new THREE.Vector3(-0.9, 0.72, -0.06), count: 14, spread: 0.1, baseSize: 0.016 },
      { center: new THREE.Vector3(-0.72, 0.18, 0.08), count: 14, spread: 0.1, baseSize: 0.016 },
      { center: new THREE.Vector3(0.68, -0.62, 0.06), count: 16, spread: 0.14, baseSize: 0.016 },
    ]

    const insts: { x: number; y: number; z: number; size: number; speed: number; phase: number }[] = []
    for (const cl of clusters) {
      for (let j = 0; j < cl.count; j++) {
        const theta = Math.random() * Math.PI * 2
        const phi = Math.acos(2 * Math.random() - 1)
        const r = cl.spread * Math.cbrt(Math.random())
        insts.push({
          x: cl.center.x + r * Math.sin(phi) * Math.cos(theta),
          y: cl.center.y + r * Math.sin(phi) * Math.sin(theta),
          z: cl.center.z + r * Math.cos(phi),
          size: cl.baseSize * (0.7 + Math.random() * 0.6),
          speed: 0.4 + Math.random() * 0.8,
          phase: Math.random() * Math.PI * 2,
        })
      }
    }
    return { totalCount: insts.length, instances: insts }
  }, [])

  useFrame(({ clock }) => {
    if (!meshRef.current) return
    const t = clock.elapsedTime
    const breathScale = 1 + BREATH_AMP * Math.sin((2 * Math.PI / BREATH_PERIOD) * t)

    for (let i = 0; i < totalCount; i++) {
      const p = instances[i]
      dummy.position.set(
        p.x + Math.sin(t * p.speed + p.phase) * 0.008,
        p.y + Math.cos(t * p.speed * 0.8 + p.phase) * 0.008,
        p.z + Math.sin(t * p.speed * 0.5 + p.phase + 1) * 0.008,
      )
      const pulse = 1 + 0.15 * Math.sin(t * 2 + p.phase)
      dummy.scale.setScalar(p.size * breathScale * pulse)
      dummy.updateMatrix()
      meshRef.current.setMatrixAt(i, dummy.matrix)
    }
    meshRef.current.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, totalCount]}>
      <sphereGeometry args={[1, 8, 8]} />
      <meshPhysicalMaterial
        color={PEACH} transparent opacity={0.6}
        roughness={0.5} metalness={0.1} clearcoat={0.3}
        emissive={NEON_ORANGE} emissiveIntensity={0.12}
      />
    </instancedMesh>
  )
}

/* ═══════════════════════════════════════════════════════════════
   CAPILLARY NETWORK
   ═══════════════════════════════════════════════════════════════ */
function CapillaryNetwork({ count = 400 }: { count?: number }) {
  const geometry = useMemo(() => {
    const positions: number[] = []
    const lobeVolumes = [
      { cx: 0.9, cy: 0.6, cz: 0, rx: 0.45, ry: 0.45, rz: 0.3 },
      { cx: 0.95, cy: 0.0, cz: 0, rx: 0.5, ry: 0.4, rz: 0.3 },
      { cx: 0.85, cy: -0.55, cz: 0, rx: 0.55, ry: 0.5, rz: 0.35 },
      { cx: -0.85, cy: 0.45, cz: 0, rx: 0.5, ry: 0.5, rz: 0.3 },
      { cx: -0.8, cy: -0.25, cz: 0, rx: 0.55, ry: 0.55, rz: 0.35 },
    ]

    for (let i = 0; i < count; i++) {
      const lobe = lobeVolumes[Math.floor(Math.random() * lobeVolumes.length)]
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const r = 0.85 * Math.cbrt(Math.random())
      const x1 = lobe.cx + lobe.rx * r * Math.sin(phi) * Math.cos(theta)
      const y1 = lobe.cy + lobe.ry * r * Math.sin(phi) * Math.sin(theta)
      const z1 = lobe.cz + lobe.rz * r * Math.cos(phi)
      const len = 0.03 + Math.random() * 0.07
      const a1 = Math.random() * Math.PI * 2
      const a2 = Math.acos(2 * Math.random() - 1)
      positions.push(
        x1, y1, z1,
        x1 + len * Math.sin(a2) * Math.cos(a1),
        y1 + len * Math.sin(a2) * Math.sin(a1),
        z1 + len * Math.cos(a2),
      )
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    return geo
  }, [count])

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={NEON_ORANGE} transparent opacity={0.18} />
    </lineSegments>
  )
}

/* ═══════════════════════════════════════════════════════════════
   OXYGEN PARTICLES
   ═══════════════════════════════════════════════════════════════ */
function OxygenParticles({ count = 80 }: { count?: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])

  const particles = useMemo(() => {
    const lobeVolumes = [
      { cx: 0.9, cy: 0.6, cz: 0, rx: 0.45, ry: 0.45, rz: 0.3 },
      { cx: 0.95, cy: 0.0, cz: 0, rx: 0.5, ry: 0.4, rz: 0.3 },
      { cx: 0.85, cy: -0.55, cz: 0, rx: 0.55, ry: 0.5, rz: 0.35 },
      { cx: -0.85, cy: 0.45, cz: 0, rx: 0.5, ry: 0.5, rz: 0.3 },
      { cx: -0.8, cy: -0.25, cz: 0, rx: 0.55, ry: 0.55, rz: 0.35 },
    ]

    const arr: { sx: number; sy: number; sz: number; ex: number; ey: number; ez: number; speed: number; phase: number }[] = []
    for (let i = 0; i < count; i++) {
      const lv = lobeVolumes[Math.floor(Math.random() * lobeVolumes.length)]
      const rndPt = () => {
        const th = Math.random() * Math.PI * 2
        const ph = Math.acos(2 * Math.random() - 1)
        const rv = 0.8 * Math.cbrt(Math.random())
        return [
          lv.cx + lv.rx * rv * Math.sin(ph) * Math.cos(th),
          lv.cy + lv.ry * rv * Math.sin(ph) * Math.sin(th),
          lv.cz + lv.rz * rv * Math.cos(ph),
        ] as [number, number, number]
      }
      const [sx, sy, sz] = rndPt()
      const [ex, ey, ez] = rndPt()
      arr.push({ sx, sy, sz, ex, ey, ez, speed: 0.1 + Math.random() * 0.25, phase: Math.random() })
    }
    return arr
  }, [count])

  useFrame(({ clock }) => {
    if (!meshRef.current) return
    const t = clock.elapsedTime
    for (let i = 0; i < count; i++) {
      const p = particles[i]
      const prog = (t * p.speed + p.phase) % 1
      dummy.position.set(
        p.sx + (p.ex - p.sx) * prog,
        p.sy + (p.ey - p.sy) * prog,
        p.sz + (p.ez - p.sz) * prog,
      )
      dummy.scale.setScalar(0.006)
      dummy.updateMatrix()
      meshRef.current.setMatrixAt(i, dummy.matrix)
    }
    meshRef.current.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <sphereGeometry args={[1, 4, 4]} />
      <meshBasicMaterial color="#FF8888" transparent opacity={0.4} />
    </instancedMesh>
  )
}

/* ═══════════════════════════════════════════════════════════════
   AMBIENT GLOW
   ═══════════════════════════════════════════════════════════════ */
function AmbientGlow() {
  const matRef = useRef<THREE.MeshBasicMaterial>(null)

  useFrame(({ clock }) => {
    if (!matRef.current) return
    matRef.current.opacity = 0.05 + 0.03 * Math.sin((2 * Math.PI / BREATH_PERIOD) * clock.elapsedTime)
  })

  return (
    <mesh>
      <sphereGeometry args={[3, 32, 32]} />
      <meshBasicMaterial
        ref={matRef} color={NEON_ORANGE} transparent opacity={0.05}
        side={THREE.BackSide} depthWrite={false}
      />
    </mesh>
  )
}

/* ═══════════════════════════════════════════════════════════════
   INTERIOR COMPONENTS — Inside the lung
   ═══════════════════════════════════════════════════════════════ */

/** Creates merged geometry for a grape-like alveolus cluster of thin-walled sacs */
function createAlveolusClusterGeo(numSacs: number): { solid: THREE.BufferGeometry; edges: THREE.BufferGeometry } {
  const solidPositions: number[] = []
  const solidNormals: number[] = []
  const edgePositions: number[] = []

  for (let i = 0; i < numSacs; i++) {
    // Fibonacci-sphere packing
    const golden = Math.PI * (3 - Math.sqrt(5))
    const theta = golden * i + (Math.random() - 0.5) * 0.4
    const y = 1 - (i / Math.max(numSacs - 1, 1)) * 2
    const rAtY = Math.sqrt(Math.max(0, 1 - y * y))
    const packR = 0.3 + Math.random() * 0.08
    const sacR = 0.22 + Math.random() * 0.1

    const ox = rAtY * Math.cos(theta) * packR
    const oy = y * packR
    const oz = rAtY * Math.sin(theta) * packR

    // Organic icosahedron
    const geo = new THREE.IcosahedronGeometry(sacR, 1)
    const pos = geo.attributes.position as THREE.BufferAttribute
    for (let j = 0; j < pos.count; j++) {
      const vx = pos.getX(j) * (1 + (Math.random() - 0.5) * 0.15) + ox
      const vy = pos.getY(j) * (1 + (Math.random() - 0.5) * 0.15) + oy
      const vz = pos.getZ(j) * (1 + (Math.random() - 0.5) * 0.15) + oz
      pos.setXYZ(j, vx, vy, vz)
    }
    geo.computeVertexNormals()

    // Flatten and merge into solid
    const flat = geo.toNonIndexed()
    const fp = flat.attributes.position as THREE.BufferAttribute
    const fn = flat.attributes.normal as THREE.BufferAttribute
    for (let j = 0; j < fp.count; j++) {
      solidPositions.push(fp.getX(j), fp.getY(j), fp.getZ(j))
      solidNormals.push(fn.getX(j), fn.getY(j), fn.getZ(j))
    }

    // Edges (cell walls)
    const eg = new THREE.EdgesGeometry(geo, 15)
    const ep = eg.attributes.position as THREE.BufferAttribute
    for (let j = 0; j < ep.count; j++) {
      edgePositions.push(ep.getX(j), ep.getY(j), ep.getZ(j))
    }

    geo.dispose(); flat.dispose(); eg.dispose()
  }

  const solidGeo = new THREE.BufferGeometry()
  solidGeo.setAttribute('position', new THREE.Float32BufferAttribute(solidPositions, 3))
  solidGeo.setAttribute('normal', new THREE.Float32BufferAttribute(solidNormals, 3))

  const edgesGeo = new THREE.BufferGeometry()
  edgesGeo.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3))

  return { solid: solidGeo, edges: edgesGeo }
}

function InteriorAlveoli({ count = 25, onHover, scrollRotRef }: { count?: number; onHover?: (fact: string | null, x: number, y: number) => void; scrollRotRef?: { current: number } }) {
  const groupRef = useRef<THREE.Group>(null)

  const alveoli = useMemo(() => {
    const arr: { x: number; y: number; z: number; size: number; phase: number; pulseSpeed: number; factIdx: number }[] = []
    // Close clusters (8)
    for (let i = 0; i < 8; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const r = 1.0 + Math.random() * 1.5
      arr.push({
        x: r * Math.sin(phi) * Math.cos(theta),
        y: r * Math.sin(phi) * Math.sin(theta),
        z: r * Math.cos(phi),
        size: 0.8 + Math.random() * 0.5,
        phase: Math.random() * Math.PI * 2,
        pulseSpeed: 0.3 + Math.random() * 0.4,
        factIdx: i % ALVEOLI_FACTS.length,
      })
    }
    // Farther clusters
    const remaining = count - 8
    for (let i = 0; i < remaining; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const r = 2.5 + Math.random() * 4.0
      arr.push({
        x: r * Math.sin(phi) * Math.cos(theta),
        y: r * Math.sin(phi) * Math.sin(theta),
        z: r * Math.cos(phi),
        size: 0.6 + Math.random() * 0.8,
        phase: Math.random() * Math.PI * 2,
        pulseSpeed: 0.3 + Math.random() * 0.5,
        factIdx: (8 + i) % ALVEOLI_FACTS.length,
      })
    }
    return arr
  }, [count])

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    const t = clock.elapsedTime
    groupRef.current.rotation.y = t * 0.04 + (scrollRotRef?.current ?? 0)
    groupRef.current.rotation.x = Math.sin(t * 0.025) * 0.08
  })

  /* Build connecting tube geometry between nearby clusters */
  const connectionGeo = useMemo(() => {
    const positions: number[] = []
    const CONNECT_DIST = 4.5
    for (let i = 0; i < alveoli.length; i++) {
      for (let j = i + 1; j < alveoli.length; j++) {
        const a = alveoli[i], b = alveoli[j]
        const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (dist < CONNECT_DIST) {
          // Straight segment from cluster center to cluster center
          positions.push(a.x, a.y, a.z, b.x, b.y, b.z)
          // Add a second parallel line offset slightly for thickness illusion
          const nx = (Math.random() - 0.5) * 0.04
          const ny = (Math.random() - 0.5) * 0.04
          positions.push(a.x + nx, a.y + ny, a.z, b.x + nx, b.y + ny, b.z)
        }
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    return geo
  }, [alveoli])

  return (
    <group ref={groupRef}>
      {/* Connecting bronchiole tubes between clusters */}
      <lineSegments geometry={connectionGeo}>
        <lineBasicMaterial color={NEON_ORANGE} transparent opacity={0.25} />
      </lineSegments>
      {alveoli.map((a, i) => (
        <AlveolusCluster key={i} data={a} onHover={onHover} />
      ))}
    </group>
  )
}

/** Single alveolus cluster — grape-like group of thin-walled sacs with hover */
function AlveolusCluster({ data, onHover }: {
  data: { x: number; y: number; z: number; size: number; phase: number; pulseSpeed: number; factIdx: number }
  onHover?: (fact: string | null, x: number, y: number) => void
}) {
  const groupRef = useRef<THREE.Group>(null)
  const [hovered, setHovered] = useState(false)

  const numSacs = useMemo(() => 5 + Math.floor(Math.random() * 3), [])
  const { solid, edges } = useMemo(() => createAlveolusClusterGeo(numSacs), [numSacs])

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    const t = clock.elapsedTime
    const pulse = 1 + 0.08 * Math.sin(t * data.pulseSpeed * 2 + data.phase)
    const breath = 1 + 0.04 * Math.sin((2 * Math.PI / BREATH_PERIOD) * t)
    groupRef.current.position.set(
      data.x + Math.sin(t * 0.2 + data.phase) * 0.08,
      data.y + Math.cos(t * 0.15 + data.phase * 2) * 0.08,
      data.z + Math.sin(t * 0.18 + data.phase * 0.5) * 0.08,
    )
    const s = data.size * pulse * breath * (hovered ? 1.15 : 1)
    groupRef.current.scale.setScalar(s)
  })

  const handlePointerOver = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    setHovered(true)
    onHover?.(ALVEOLI_FACTS[data.factIdx], e.clientX ?? e.nativeEvent.clientX, e.clientY ?? e.nativeEvent.clientY)
  }, [data.factIdx, onHover])

  const handlePointerOut = useCallback(() => {
    setHovered(false)
    onHover?.(null, 0, 0)
  }, [onHover])

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!hovered) return
    onHover?.(ALVEOLI_FACTS[data.factIdx], e.clientX ?? e.nativeEvent.clientX, e.clientY ?? e.nativeEvent.clientY)
  }, [hovered, data.factIdx, onHover])

  return (
    <group ref={groupRef}>
      {/* Thin transparent membrane fill */}
      <mesh geometry={solid}>
        <meshPhysicalMaterial
          color={hovered ? '#FFCCD5' : '#FFB6C1'}
          transparent opacity={hovered ? 0.22 : 0.12}
          side={THREE.DoubleSide} depthWrite={false}
          roughness={0.5} clearcoat={0.4}
          emissive={NEON_ORANGE} emissiveIntensity={hovered ? 0.2 : 0.08}
        />
      </mesh>
      {/* Cell-wall edges — the defining visual */}
      <lineSegments geometry={edges}>
        <lineBasicMaterial
          color={NEON_ORANGE}
          transparent opacity={hovered ? 0.6 : 0.35}
        />
      </lineSegments>
      {/* Invisible hit sphere for pointer events */}
      <mesh
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onPointerMove={handlePointerMove}
      >
        <sphereGeometry args={[0.5, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}

function InteriorWall() {
  const matRef = useRef<THREE.MeshBasicMaterial>(null)
  useFrame(({ clock }) => {
    if (!matRef.current) return
    matRef.current.opacity = 0.05 + 0.02 * Math.sin(clock.elapsedTime * 0.4)
  })

  return (
    <mesh>
      <sphereGeometry args={[9, 32, 32]} />
      <meshBasicMaterial
        ref={matRef} color={PEACH} transparent opacity={0.05}
        side={THREE.BackSide} depthWrite={false}
      />
    </mesh>
  )
}

function InteriorParticles({ count = 120 }: { count?: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const particles = useMemo(() => {
    const arr: { x: number; y: number; z: number; speed: number; phase: number; size: number }[] = []
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const r = 0.5 + Math.random() * 6
      arr.push({
        x: r * Math.sin(phi) * Math.cos(theta),
        y: r * Math.sin(phi) * Math.sin(theta),
        z: r * Math.cos(phi),
        speed: 0.04 + Math.random() * 0.12,
        phase: Math.random() * Math.PI * 2,
        size: 0.004 + Math.random() * 0.012,
      })
    }
    return arr
  }, [count])

  useFrame(({ clock }) => {
    if (!meshRef.current) return
    const t = clock.elapsedTime
    for (let i = 0; i < count; i++) {
      const p = particles[i]
      dummy.position.set(
        p.x + Math.sin(t * p.speed + p.phase) * 0.4,
        p.y + Math.cos(t * p.speed * 0.7 + p.phase) * 0.4,
        p.z + Math.sin(t * p.speed * 0.5 + p.phase + 1) * 0.4,
      )
      dummy.scale.setScalar(p.size)
      dummy.updateMatrix()
      meshRef.current.setMatrixAt(i, dummy.matrix)
    }
    meshRef.current.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <sphereGeometry args={[1, 4, 4]} />
      <meshBasicMaterial color="#FF8888" transparent opacity={0.3} />
    </instancedMesh>
  )
}

function InteriorCapillaries() {
  const groupRef = useRef<THREE.Group>(null)
  const geometry = useMemo(() => {
    const positions: number[] = []
    for (let i = 0; i < 250; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const r = 1.5 + Math.random() * 5
      const x = r * Math.sin(phi) * Math.cos(theta)
      const y = r * Math.sin(phi) * Math.sin(theta)
      const z = r * Math.cos(phi)
      const len = 0.1 + Math.random() * 0.5
      const a1 = Math.random() * Math.PI * 2
      const a2 = Math.acos(2 * Math.random() - 1)
      positions.push(x, y, z, x + len * Math.sin(a2) * Math.cos(a1), y + len * Math.sin(a2) * Math.sin(a1), z + len * Math.cos(a2))
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    return geo
  }, [])

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    groupRef.current.rotation.y = clock.elapsedTime * 0.02
  })

  return (
    <group ref={groupRef}>
      <lineSegments geometry={geometry}>
        <lineBasicMaterial color={NEON_ORANGE} transparent opacity={0.2} />
      </lineSegments>
    </group>
  )
}

/* ═══════════════════════════════════════════════════════════════
   SCENE MANAGER — Camera + transitions with zoom feedback
   ═══════════════════════════════════════════════════════════════ */
function SceneManager({
  phase,
  onPhaseChange,
  onAlveolusHover,
  scrollRotRef,
  mouseLookRef,
}: {
  phase: string
  onPhaseChange?: (p: string) => void
  onAlveolusHover?: (fact: string | null, x: number, y: number) => void
  scrollRotRef?: { current: number }
  mouseLookRef?: { current: { x: number; y: number } }
}) {
  const progressRef = useRef(0)
  const notifiedRef = useRef<string | null>(null)
  const exteriorRef = useRef<THREE.Group>(null)
  const exteriorRotRef = useRef<THREE.Group>(null)
  const interiorRef = useRef<THREE.Group>(null)
  const { camera } = useThree()

  useEffect(() => { notifiedRef.current = null }, [phase])

  useFrame((state, delta) => {
    const goingIn = phase === 'diving' || phase === 'interior'
    const target = goingIn ? 1 : 0
    const speed = 1 / DIVE_DURATION
    const prev = progressRef.current

    if (Math.abs(prev - target) > 0.001) {
      progressRef.current = prev < target
        ? Math.min(target, prev + delta * speed)
        : Math.max(target, prev - delta * speed)
    } else {
      progressRef.current = target
    }

    if (phase === 'diving' && progressRef.current >= 0.999 && notifiedRef.current !== 'interior') {
      progressRef.current = 1
      notifiedRef.current = 'interior'
      setTimeout(() => onPhaseChange?.('interior'), 0)
    }
    if (phase === 'surfacing' && progressRef.current <= 0.001 && notifiedRef.current !== 'exterior') {
      progressRef.current = 0
      notifiedRef.current = 'exterior'
      setTimeout(() => onPhaseChange?.('exterior'), 0)
    }

    const p = progressRef.current
    const eased = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2

    camera.position.y = THREE.MathUtils.lerp(0.2, 0, eased)
    camera.position.z = THREE.MathUtils.lerp(4.5, 0.1, eased)

    // Interior mouse look: offset camera lookAt based on mouse position
    if (phase === 'interior' && mouseLookRef) {
      const lookX = mouseLookRef.current.x * 3.0
      const lookY = mouseLookRef.current.y * 2.0
      camera.lookAt(lookX, lookY, -2)
    } else {
      camera.lookAt(0, 0, 0)
    }

    const perspCam = camera as THREE.PerspectiveCamera
    perspCam.fov = THREE.MathUtils.lerp(45, 75, eased)
    perspCam.updateProjectionMatrix()

    // Exterior scale: base 1.6×, then flies into dive
    if (exteriorRef.current) {
      exteriorRef.current.scale.setScalar(EXTERIOR_SCALE + eased * 3)
      exteriorRef.current.visible = p < 0.85
    }
    if (exteriorRotRef.current) {
      const t = state.clock.elapsedTime
      exteriorRotRef.current.rotation.y = t * (ROT_Y_SPEED + eased * 0.35)
      exteriorRotRef.current.rotation.x = ROT_X_AMP * Math.sin((2 * Math.PI / ROT_X_PERIOD) * t)
    }

    if (interiorRef.current) {
      interiorRef.current.visible = p > 0.4
    }
  })

  return (
    <>
      <ambientLight intensity={0.6} />
      <pointLight position={[3, 3, 5]} intensity={0.8} color="#FFCCD5" />
      <pointLight position={[-3, -2, 4]} intensity={0.3} color={NEON_ORANGE} />
      <pointLight position={[0, 0, 3]} intensity={0.4} color={PEACH} />

      {/* ── Exterior lung ── */}
      <group ref={exteriorRef}>
        <group ref={exteriorRotRef}>
          <LungLobe position={[0.85, 0.6, 0]} rx={0.5} ry={0.5} rz={0.35} side="right" taper={0.2} phaseOffset={0} />
          <LungLobe position={[0.9, 0.0, 0.05]} rx={0.5} ry={0.38} rz={0.32} side="right" taper={0.15} phaseOffset={0.3} />
          <LungLobe position={[0.8, -0.55, 0]} rx={0.6} ry={0.55} rz={0.4} side="right" taper={0.4} phaseOffset={0.6} />
          <LungLobe position={[-0.85, 0.5, 0]} rx={0.55} ry={0.55} rz={0.35} side="left" taper={0.2} phaseOffset={0.15} />
          <LungLobe position={[-0.8, -0.3, 0]} rx={0.6} ry={0.6} rz={0.4} side="left" taper={0.4} phaseOffset={0.45} />
          <BronchialTree />
          <AlveolarClusters />
          <CapillaryNetwork count={800} />
          <OxygenParticles count={140} />
          <AmbientGlow />
        </group>
      </group>

      {/* ── Interior alveoli world ── */}
      <group ref={interiorRef} visible={false}>
        <pointLight position={[0, 0, 0]} intensity={0.5} color="#FFCCD5" distance={15} />
        <pointLight position={[3, 2, 3]} intensity={0.25} color={NEON_ORANGE} />
        <pointLight position={[-3, -1, -3]} intensity={0.2} color={PEACH} />
        <pointLight position={[0, 3, 0]} intensity={0.15} color={NEON_ORANGE} />
        <InteriorAlveoli count={25} onHover={onAlveolusHover} scrollRotRef={scrollRotRef} />
        <InteriorWall />
        <InteriorParticles count={120} />
        <InteriorCapillaries />
      </group>
    </>
  )
}

/* ═══════════════════════════════════════════════════════════════
   DECORATIVE SCENE — exterior lung only, rotating & breathing
   ═══════════════════════════════════════════════════════════════ */
function DecorativeScene({ scale = 1.0 }: { scale?: number }) {
  const groupRef = useRef<THREE.Group>(null)

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    const t = clock.elapsedTime
    groupRef.current.rotation.y = t * ROT_Y_SPEED
    groupRef.current.rotation.x = ROT_X_AMP * Math.sin((2 * Math.PI / ROT_X_PERIOD) * t)
  })

  return (
    <>
      <ambientLight intensity={0.4} />
      <pointLight position={[3, 3, 5]} intensity={0.5} color="#FFCCD5" />
      <pointLight position={[-3, -2, 4]} intensity={0.2} color={NEON_ORANGE} />
      <group scale={scale}>
        <group ref={groupRef}>
          <LungLobe position={[0.85, 0.6, 0]} rx={0.5} ry={0.5} rz={0.35} side="right" taper={0.2} phaseOffset={0} />
          <LungLobe position={[0.9, 0.0, 0.05]} rx={0.5} ry={0.38} rz={0.32} side="right" taper={0.15} phaseOffset={0.3} />
          <LungLobe position={[0.8, -0.55, 0]} rx={0.6} ry={0.55} rz={0.4} side="right" taper={0.4} phaseOffset={0.6} />
          <LungLobe position={[-0.85, 0.5, 0]} rx={0.55} ry={0.55} rz={0.35} side="left" taper={0.2} phaseOffset={0.15} />
          <LungLobe position={[-0.8, -0.3, 0]} rx={0.6} ry={0.6} rz={0.4} side="left" taper={0.4} phaseOffset={0.45} />
          <BronchialTree />
          <AlveolarClusters />
          <CapillaryNetwork count={400} />
          <OxygenParticles count={60} />
          <AmbientGlow />
        </group>
      </group>
    </>
  )
}

/* ═══════════════════════════════════════════════════════════════
   EXPORTED COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export default function LungScene3D({ phase = 'exterior', onPhaseChange, decorative, decorativeScale = 1.0 }: LungScene3DProps) {
  if (decorative) {
    return (
      <div className="absolute inset-0">
        <Canvas
          gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
          camera={{ position: [0, 0.2, 4.5], fov: 45 }}
          style={{ background: 'transparent' }}
          dpr={[1, 1.5]}
        >
          <Suspense fallback={null}>
            <DecorativeScene scale={decorativeScale} />
          </Suspense>
        </Canvas>
      </div>
    )
  }
  return <InteractiveLungScene phase={phase} onPhaseChange={onPhaseChange} />
}

function InteractiveLungScene({ phase = 'exterior', onPhaseChange }: { phase?: string; onPhaseChange?: (phase: string) => void }) {
  const [overlayKey, setOverlayKey] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  /* Hover tooltip state */
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null)

  const handleAlveolusHover = useCallback((fact: string | null, x: number, y: number) => {
    if (fact) {
      setTooltip({ text: fact, x, y })
    } else {
      setTooltip(null)
    }
  }, [])

  // Clear tooltip when leaving interior
  useEffect(() => {
    if (phase !== 'interior') setTooltip(null)
  }, [phase])

  // Restart transition overlay on each transition
  useEffect(() => {
    if (phase === 'diving' || phase === 'surfacing') {
      setOverlayKey((k) => k + 1)
    }
  }, [phase])

  // Scroll-to-rotate alveoli in interior
  const scrollRotRef = useRef(0)
  useEffect(() => {
    if (phase !== 'interior') {
      scrollRotRef.current = 0
      return
    }
    const onWheel = (e: WheelEvent) => {
      scrollRotRef.current += e.deltaY * 0.003
    }
    window.addEventListener('wheel', onWheel, { passive: true })
    return () => window.removeEventListener('wheel', onWheel)
  }, [phase])

  // Mouse look for interior — move mouse to look around
  const mouseLookRef = useRef({ x: 0, y: 0 })
  useEffect(() => {
    if (phase !== 'interior') {
      mouseLookRef.current = { x: 0, y: 0 }
      return
    }
    const onMouseMove = (e: MouseEvent) => {
      // Normalize to -1..1 from center of viewport
      mouseLookRef.current = {
        x: (e.clientX / window.innerWidth - 0.5) * 2,
        y: -(e.clientY / window.innerHeight - 0.5) * 2,
      }
    }
    window.addEventListener('mousemove', onMouseMove, { passive: true })
    return () => window.removeEventListener('mousemove', onMouseMove)
  }, [phase])

  // ESC to return from interior
  useEffect(() => {
    if (phase !== 'interior') return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onPhaseChange?.('surfacing')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [phase, onPhaseChange])

  const isTransitioning = phase === 'diving' || phase === 'surfacing'

  return (
    <div className="absolute inset-0" ref={containerRef}>
      {/* Keyframes for the warp transition */}
      <style>{`
        @keyframes lung-warp-in {
          0%   { opacity: 0; transform: scale(3) rotate(0deg); filter: blur(30px) brightness(2); }
          25%  { opacity: 1; transform: scale(1.5) rotate(5deg); filter: blur(12px) brightness(1.8); }
          55%  { opacity: 1; transform: scale(0.95) rotate(-2deg); filter: blur(4px) brightness(1.2); }
          80%  { opacity: 0.6; transform: scale(1) rotate(0deg); filter: blur(0px) brightness(1); }
          100% { opacity: 0; transform: scale(1) rotate(0deg); filter: blur(0px) brightness(1); }
        }
        @keyframes lung-warp-out {
          0%   { opacity: 0; transform: scale(1); filter: blur(0px) brightness(1); }
          20%  { opacity: 0.8; transform: scale(0.9); filter: blur(6px) brightness(1.5); }
          50%  { opacity: 1; transform: scale(1.2) rotate(-3deg); filter: blur(15px) brightness(2); }
          75%  { opacity: 0.8; transform: scale(2); filter: blur(25px) brightness(1.8); }
          100% { opacity: 0; transform: scale(3); filter: blur(30px) brightness(1); }
        }
        @keyframes speed-lines {
          0%   { opacity: 0; transform: scaleY(0.3); }
          15%  { opacity: 0.8; transform: scaleY(1); }
          60%  { opacity: 0.6; transform: scaleY(1.2); }
          100% { opacity: 0; transform: scaleY(0.3); }
        }
        @keyframes radial-flash {
          0%   { opacity: 0; transform: scale(0.2); }
          30%  { opacity: 0.7; transform: scale(1.4); }
          60%  { opacity: 0.3; transform: scale(1); }
          100% { opacity: 0; transform: scale(2); }
        }
        @keyframes ring-expand {
          0%   { opacity: 0.8; transform: scale(0.1); }
          50%  { opacity: 0.5; transform: scale(0.8); }
          100% { opacity: 0; transform: scale(1.5); }
        }
      `}</style>

      <div
        className="absolute inset-0"
        onClick={() => { if (phase === 'interior') onPhaseChange?.('surfacing') }}
        style={{ cursor: phase === 'interior' ? 'pointer' : 'default' }}
      >
        <Canvas
          gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
          camera={{ position: [0, 0.2, 4.5], fov: 45 }}
          style={{ background: 'transparent' }}
          dpr={[1, 2]}
        >
          <Suspense fallback={null}>
            <SceneManager phase={phase} onPhaseChange={onPhaseChange} onAlveolusHover={handleAlveolusHover} scrollRotRef={scrollRotRef} mouseLookRef={mouseLookRef} />
          </Suspense>
        </Canvas>
      </div>

      {/* ═══ EPIC TRANSITION OVERLAY — Warp + Speed Lines + Flash ═══ */}
      {isTransitioning && (
        <div key={overlayKey} className="absolute inset-0 pointer-events-none overflow-hidden">
          {/* Radial warp burst */}
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(ellipse at center, rgba(204,34,51,0.6) 0%, rgba(232,80,106,0.3) 30%, rgba(10,10,10,0.9) 70%, rgba(10,10,10,1) 100%)`,
              animation: `${phase === 'diving' ? 'lung-warp-in' : 'lung-warp-out'} ${DIVE_DURATION}s ease-in-out forwards`,
              transformOrigin: 'center center',
            }}
          />

          {/* Speed lines — vertical streaks */}
          <div
            className="absolute inset-0 flex justify-center items-center"
            style={{
              animation: `speed-lines ${DIVE_DURATION}s ease-in-out forwards`,
            }}
          >
            {Array.from({ length: 24 }).map((_, i) => {
              const angle = (i / 24) * 360
              const dist = 30 + Math.random() * 20
              return (
                <div
                  key={i}
                  className="absolute"
                  style={{
                    width: '2px',
                    height: `${40 + Math.random() * 60}%`,
                    background: `linear-gradient(to bottom, transparent, rgba(232,80,106,${0.3 + Math.random() * 0.4}), transparent)`,
                    transform: `rotate(${angle}deg) translateY(-${dist}%)`,
                    transformOrigin: 'center center',
                  }}
                />
              )
            })}
          </div>

          {/* Central radial flash */}
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{
              animation: `radial-flash ${DIVE_DURATION * 0.6}s ease-out forwards`,
            }}
          >
            <div
              className="w-64 h-64 rounded-full"
              style={{
                background: 'radial-gradient(circle, rgba(255,212,204,0.8) 0%, rgba(204,34,51,0.4) 40%, transparent 70%)',
              }}
            />
          </div>

          {/* Expanding ring */}
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{
              animation: `ring-expand ${DIVE_DURATION * 0.7}s ease-out ${DIVE_DURATION * 0.15}s forwards`,
              opacity: 0,
            }}
          >
            <div
              className="w-[80vmin] h-[80vmin] rounded-full"
              style={{
                border: '3px solid rgba(204,34,51,0.5)',
                boxShadow: '0 0 30px rgba(204,34,51,0.3), 0 0 60px rgba(232,80,106,0.15)',
              }}
            />
          </div>
        </div>
      )}

      {/* ═══ Alveolus hover fact tooltip (viewport-clamped) ═══ */}
      {phase === 'interior' && tooltip && (() => {
        const TW = 280
        const TH = 90 // approximate tooltip height
        const pad = 12
        // Clamp so tooltip never leaves viewport
        let tx = tooltip.x + 16
        let ty = tooltip.y - 12
        let above = true
        // Horizontal clamp
        if (tx + TW > window.innerWidth - pad) tx = window.innerWidth - pad - TW
        if (tx < pad) tx = pad
        // Vertical: prefer above cursor, flip below if not enough room
        if (ty - TH < pad) {
          above = false
          ty = tooltip.y + 24
        }
        return (
          <div
            className="fixed pointer-events-none z-50"
            style={{
              left: tx,
              top: ty,
              maxWidth: TW,
              transform: above ? 'translateY(-100%)' : 'none',
            }}
          >
            <div
              className="px-4 py-3 rounded-lg border border-primary-coral/40"
              style={{
                background: 'rgba(10, 10, 10, 0.92)',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 0 20px rgba(204,34,51,0.2), 0 4px 16px rgba(0,0,0,0.6)',
              }}
            >
              <p className="font-mono text-xs text-primary-coral/80 mb-1 tracking-wider uppercase">
                Alveolus Fact
              </p>
              <p className="font-mono text-sm text-retro-cream/90 leading-relaxed">
                {tooltip.text}
              </p>
            </div>
          </div>
        )
      })()}

      {/* ═══ Interior UI overlay ═══ */}
      {phase === 'interior' && (
        <>
          <div className="absolute top-6 left-0 right-0 text-center pointer-events-none">
            <p className="font-mono text-xs text-retro-cream/40 tracking-wider animate-pulse">
              press ESC or click to return · scroll to rotate · move mouse to look around
            </p>
          </div>
          <div className="absolute bottom-12 left-0 right-0 text-center pointer-events-none">
            <p className="font-pixel text-lg text-primary-coral/30 glow-text-coral tracking-widest">
              INSIDE THE ALVEOLI
            </p>
          </div>
        </>
      )}
    </div>
  )
}
