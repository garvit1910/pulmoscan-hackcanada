'use client'

/**
 * LungVisualization3D — Post-scan 3D visualization that highlights
 * affected lung regions based on analysis results.
 *
 * Shows anatomical lung lobes with pulsing hotspots on affected areas,
 * severity-coded colors, and interactive rotation.
 */

import { useRef, useMemo, useState, useCallback } from 'react'
import { Canvas, useFrame, useThree, ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'

/* ═══════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════ */
const BREATH_PERIOD = 4.0
const BREATH_AMP = 0.04
const ROT_Y_SPEED = 0.12

const HEALTHY_COLOR = '#4ADE80'      // green for healthy tissue
const MILD_COLOR = '#FCD34D'         // yellow for mild
const MODERATE_COLOR = '#F97316'     // orange for moderate
const SEVERE_COLOR = '#EF4444'       // red for severe
const CRITICAL_COLOR = '#DC2626'     // deep red for critical
const LUNG_BASE = '#F48BA0'         // base pink lung color
const VESSEL_COLOR = '#CC2233'       // vessel/edge color

type Severity = 'Mild' | 'Moderate' | 'Severe' | 'Critical'

/** Five anatomical lobes: right has 3 (upper, middle, lower), left has 2 (upper, lower) */
const LOBE_CONFIG = [
  { name: 'Right Upper Lobe', pos: [0.65, 0.65, 0] as [number, number, number], rx: 0.42, ry: 0.38, rz: 0.3, side: 'right' as const, taper: 0.2 },
  { name: 'Right Middle Lobe', pos: [0.7, 0.1, 0] as [number, number, number], rx: 0.45, ry: 0.32, rz: 0.3, side: 'right' as const, taper: 0.15 },
  { name: 'Right Lower Lobe', pos: [0.6, -0.5, 0] as [number, number, number], rx: 0.5, ry: 0.45, rz: 0.35, side: 'right' as const, taper: 0.4 },
  { name: 'Left Upper Lobe', pos: [-0.6, 0.5, 0] as [number, number, number], rx: 0.45, ry: 0.45, rz: 0.3, side: 'left' as const, taper: 0.2 },
  { name: 'Left Lower Lobe', pos: [-0.55, -0.3, 0] as [number, number, number], rx: 0.5, ry: 0.5, rz: 0.35, side: 'left' as const, taper: 0.4 },
]

/**
 * Deterministic "affected regions" based on severity.
 * Returns which lobes are affected and how severely.
 */
function getAffectedLobes(severity: string, confidence: number): { lobeIdx: number; intensity: number }[] {
  const sev = severity.toLowerCase()
  // Use confidence to seed variation
  const seed = Math.round(confidence * 100) % 5

  if (sev === 'mild') {
    // 1-2 lobes mildly affected
    return [
      { lobeIdx: (seed + 2) % 5, intensity: 0.5 },
      { lobeIdx: (seed + 4) % 5, intensity: 0.3 },
    ]
  }
  if (sev === 'moderate') {
    // 2-3 lobes affected
    return [
      { lobeIdx: seed % 5, intensity: 0.8 },
      { lobeIdx: (seed + 2) % 5, intensity: 0.6 },
      { lobeIdx: (seed + 3) % 5, intensity: 0.4 },
    ]
  }
  if (sev === 'severe') {
    // 3-4 lobes heavily affected
    return [
      { lobeIdx: 0, intensity: 0.9 },
      { lobeIdx: 2, intensity: 0.85 },
      { lobeIdx: 3, intensity: 0.7 },
      { lobeIdx: 4, intensity: 0.5 },
    ]
  }
  // Critical — all 5 lobes
  return [
    { lobeIdx: 0, intensity: 1.0 },
    { lobeIdx: 1, intensity: 0.9 },
    { lobeIdx: 2, intensity: 0.95 },
    { lobeIdx: 3, intensity: 0.85 },
    { lobeIdx: 4, intensity: 0.9 },
  ]
}

function getSeverityColor(severity: string): string {
  switch (severity.toLowerCase()) {
    case 'mild': return MILD_COLOR
    case 'moderate': return MODERATE_COLOR
    case 'severe': return SEVERE_COLOR
    case 'critical': return CRITICAL_COLOR
    default: return MODERATE_COLOR
  }
}

/* ═══════════════════════════════════════════════════════════════
   LOBE GEOMETRY HELPER
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
    v.x *= rx; v.y *= ry; v.z *= rz

    if (flattenInner) {
      const innerDir = side === 'right' ? -1 : 1
      const medialX = v.x * innerDir
      if (medialX < 0) v.x += innerDir * Math.abs(medialX) * 0.35
    }

    if (taperBottom > 0 && v.y < 0) {
      const t = Math.abs(v.y) / ry
      const squeeze = 1 - taperBottom * t * t
      v.x *= squeeze; v.z *= squeeze
    }

    if (v.y > ry * 0.6) {
      const t = (v.y - ry * 0.6) / (ry * 0.4)
      v.x *= 1 - 0.3 * t * t; v.z *= 1 - 0.3 * t * t
    }

    const n = Math.sin(v.x * 5.1 + v.y * 3.7) * Math.cos(v.z * 4.3 + v.x * 2.1) * 0.015
    v.x += n * rx; v.y += n * ry; v.z += n * rz

    pos.setXYZ(i, v.x, v.y, v.z)
  }

  geo.computeVertexNormals()
  return geo
}

/* ═══════════════════════════════════════════════════════════════
   VISUALIZATION LOBE — Shows a single lung lobe with optional affected highlight
   ═══════════════════════════════════════════════════════════════ */
interface VisLobeProps {
  position: [number, number, number]
  rx: number; ry: number; rz: number
  side: 'left' | 'right'
  taper: number
  phaseOffset: number
  affected: boolean
  intensity: number
  severityColor: string
  lobeName: string
  onHover: (name: string | null) => void
}

function VisualizationLobe({
  position, rx, ry, rz, side, taper, phaseOffset,
  affected, intensity, severityColor, lobeName, onHover,
}: VisLobeProps) {
  const groupRef = useRef<THREE.Group>(null)
  const matRef = useRef<THREE.MeshPhysicalMaterial>(null)
  const hotspotRef = useRef<THREE.Mesh>(null)
  const geometry = useMemo(() => createLobeMesh(rx, ry, rz, true, side, taper), [rx, ry, rz, side, taper])
  const edgesGeo = useMemo(() => new THREE.EdgesGeometry(geometry, 20), [geometry])

  const baseColor = useMemo(() => new THREE.Color(affected ? severityColor : LUNG_BASE), [affected, severityColor])
  const emissiveColor = useMemo(() => new THREE.Color(affected ? severityColor : VESSEL_COLOR), [affected, severityColor])

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    const t = clock.elapsedTime
    const breath = 1 + BREATH_AMP * Math.sin((2 * Math.PI / BREATH_PERIOD) * t + phaseOffset)
    groupRef.current.scale.setScalar(breath)

    // Pulse emissive for affected lobes
    if (matRef.current && affected) {
      const pulse = 0.15 + 0.25 * intensity * Math.sin(t * 2.5 + phaseOffset)
      matRef.current.emissiveIntensity = pulse
    }

    // Pulse hotspot
    if (hotspotRef.current && affected) {
      const pulse = 0.8 + 0.4 * Math.sin(t * 3.0 + phaseOffset)
      hotspotRef.current.scale.setScalar(pulse)
      const mat = hotspotRef.current.material as THREE.MeshBasicMaterial
      mat.opacity = 0.15 + 0.2 * intensity * Math.sin(t * 2.0 + phaseOffset + 1)
    }
  })

  const handlePointerOver = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    onHover(lobeName)
  }, [lobeName, onHover])

  const handlePointerOut = useCallback(() => {
    onHover(null)
  }, [onHover])

  return (
    <group ref={groupRef} position={position}>
      {/* Main lobe surface */}
      <mesh
        geometry={geometry}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
      >
        <meshPhysicalMaterial
          ref={matRef}
          color={baseColor}
          transparent
          opacity={affected ? 0.5 + intensity * 0.2 : 0.35}
          side={THREE.DoubleSide}
          depthWrite={false}
          roughness={0.5}
          metalness={0.2}
          clearcoat={0.5}
          emissive={emissiveColor}
          emissiveIntensity={affected ? 0.4 * intensity : 0.18}
        />
      </mesh>

      {/* Edge lines */}
      <lineSegments geometry={edgesGeo}>
        <lineBasicMaterial
          color={affected ? severityColor : VESSEL_COLOR}
          transparent
          opacity={affected ? 0.65 : 0.4}
        />
      </lineSegments>

      {/* Inner glow */}
      <mesh geometry={geometry}>
        <meshBasicMaterial
          color={affected ? severityColor : LUNG_BASE}
          transparent
          opacity={affected ? 0.4 + intensity * 0.2 : 0.25}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>

      {/* Affected hotspot sphere — glowing pulsing region */}
      {affected && (
        <mesh ref={hotspotRef}>
          <sphereGeometry args={[Math.max(rx, ry, rz) * 0.6, 16, 16]} />
          <meshBasicMaterial
            color={severityColor}
            transparent
            opacity={0.2 * intensity}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  )
}

/* ═══════════════════════════════════════════════════════════════
   BRONCHIAL TREE (SIMPLIFIED)
   ═══════════════════════════════════════════════════════════════ */
function SimpleBronchi() {
  const groupRef = useRef<THREE.Group>(null)
  const p = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

  const tubeData = useMemo(() => {
    const branches: { path: THREE.Vector3[]; radius: number; opacity: number }[] = [
      { path: [p(0, 2.0, 0), p(0, 1.4, 0), p(0, 0.9, 0)], radius: 0.08, opacity: 0.6 },
      { path: [p(0, 0.9, 0), p(0.3, 0.65, 0.02), p(0.65, 0.45, 0)], radius: 0.05, opacity: 0.5 },
      { path: [p(0, 0.9, 0), p(-0.3, 0.6, -0.02), p(-0.6, 0.35, 0)], radius: 0.05, opacity: 0.5 },
      { path: [p(0.65, 0.45, 0), p(1.0, 0.85, 0.05)], radius: 0.03, opacity: 0.4 },
      { path: [p(0.65, 0.45, 0), p(1.1, 0.15, 0.05)], radius: 0.03, opacity: 0.4 },
      { path: [p(0.65, 0.45, 0), p(0.85, -0.25, 0)], radius: 0.03, opacity: 0.4 },
      { path: [p(-0.6, 0.35, 0), p(-0.95, 0.8, 0)], radius: 0.03, opacity: 0.4 },
      { path: [p(-0.6, 0.35, 0), p(-0.85, -0.3, 0)], radius: 0.03, opacity: 0.4 },
    ]
    return branches.map(br => {
      const curve = new THREE.CatmullRomCurve3(br.path)
      const geo = new THREE.TubeGeometry(curve, 10, br.radius, 6, false)
      return { geo, opacity: br.opacity }
    })
  }, [])

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    const t = clock.elapsedTime
    const breath = 1 + 0.02 * Math.sin((2 * Math.PI / BREATH_PERIOD) * t)
    groupRef.current.scale.set(breath, 1, breath)
  })

  return (
    <group ref={groupRef}>
      {tubeData.map((tube, i) => (
        <mesh key={i} geometry={tube.geo}>
          <meshBasicMaterial color={VESSEL_COLOR} transparent opacity={Math.min(1, tube.opacity * 1.4)} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {/* Trachea rings */}
      {[0, 0.18, 0.36, 0.54].map((dy, i) => (
        <mesh key={`ring-${i}`} position={[0, 1.95 - dy, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.085, 0.012, 6, 20]} />
          <meshBasicMaterial color={VESSEL_COLOR} transparent opacity={0.3} />
        </mesh>
      ))}
    </group>
  )
}

/* ═══════════════════════════════════════════════════════════════
   FIBROSIS MARKERS — Small scarred tissue patches on affected lobes
   ═══════════════════════════════════════════════════════════════ */
function FibrosisMarkers({ affectedLobes, severityColor }: { affectedLobes: { lobeIdx: number; intensity: number }[]; severityColor: string }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])

  const markers = useMemo(() => {
    const arr: { x: number; y: number; z: number; size: number; phase: number }[] = []
    for (const al of affectedLobes) {
      const lobe = LOBE_CONFIG[al.lobeIdx]
      const count = Math.floor(6 + al.intensity * 12)
      for (let i = 0; i < count; i++) {
        const theta = Math.random() * Math.PI * 2
        const phi = Math.acos(2 * Math.random() - 1)
        const r = 0.7 * Math.cbrt(Math.random())
        arr.push({
          x: lobe.pos[0] + lobe.rx * r * Math.sin(phi) * Math.cos(theta),
          y: lobe.pos[1] + lobe.ry * r * Math.sin(phi) * Math.sin(theta),
          z: lobe.pos[2] + lobe.rz * r * Math.cos(phi),
          size: 0.015 + al.intensity * 0.02 * Math.random(),
          phase: Math.random() * Math.PI * 2,
        })
      }
    }
    return arr
  }, [affectedLobes])

  useFrame(({ clock }) => {
    if (!meshRef.current) return
    const t = clock.elapsedTime
    for (let i = 0; i < markers.length; i++) {
      const m = markers[i]
      dummy.position.set(m.x, m.y, m.z)
      const pulse = 0.8 + 0.4 * Math.sin(t * 2.0 + m.phase)
      dummy.scale.setScalar(m.size * pulse)
      dummy.updateMatrix()
      meshRef.current.setMatrixAt(i, dummy.matrix)
    }
    meshRef.current.instanceMatrix.needsUpdate = true
  })

  if (markers.length === 0) return null

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, markers.length]}>
      <icosahedronGeometry args={[1, 1]} />
      <meshBasicMaterial color={severityColor} transparent opacity={0.7} />
    </instancedMesh>
  )
}

/* ═══════════════════════════════════════════════════════════════
   SCENE — orchestrates camera and all lung parts
   ═══════════════════════════════════════════════════════════════ */
interface VisualizationSceneProps {
  severity: string
  confidence: number
  onHoverLobe: (name: string | null) => void
}

function VisualizationScene({ severity, confidence, onHoverLobe }: VisualizationSceneProps) {
  const groupRef = useRef<THREE.Group>(null)
  const { camera } = useThree()

  const affectedLobes = useMemo(() => getAffectedLobes(severity, confidence), [severity, confidence])
  const severityColor = useMemo(() => getSeverityColor(severity), [severity])
  const affectedMap = useMemo(() => {
    const map = new Map<number, number>()
    for (const al of affectedLobes) map.set(al.lobeIdx, al.intensity)
    return map
  }, [affectedLobes])

  // Auto-rotate and camera positioning
  useFrame(({ clock }) => {
    if (!groupRef.current) return
    const t = clock.elapsedTime
    groupRef.current.rotation.y = t * ROT_Y_SPEED

    // Gentle camera bob
    camera.position.y = 0.3 + Math.sin(t * 0.5) * 0.1
    camera.lookAt(0, 0, 0)
  })

  return (
    <>
      {/* Lighting — bright enough to clearly see the lung */}
      <ambientLight intensity={0.8} />
      <pointLight position={[3, 3, 3]} intensity={1.2} color="#FFCCD5" />
      <pointLight position={[-3, -1, 2]} intensity={0.7} color="#FFCCD5" />
      <pointLight position={[0, -2, -3]} intensity={0.5} color={severityColor} />
      <pointLight position={[0, 2, 2]} intensity={0.6} color="#ffffff" />

      <group ref={groupRef} scale={2.4}>
        {/* Lung lobes */}
        {LOBE_CONFIG.map((lobe, i) => (
          <VisualizationLobe
            key={lobe.name}
            position={lobe.pos}
            rx={lobe.rx}
            ry={lobe.ry}
            rz={lobe.rz}
            side={lobe.side}
            taper={lobe.taper}
            phaseOffset={i * 0.3}
            affected={affectedMap.has(i)}
            intensity={affectedMap.get(i) || 0}
            severityColor={severityColor}
            lobeName={lobe.name}
            onHover={onHoverLobe}
          />
        ))}

        {/* Bronchial tree */}
        <SimpleBronchi />

        {/* Fibrosis scar tissue markers */}
        <FibrosisMarkers affectedLobes={affectedLobes} severityColor={severityColor} />

        {/* Background glow sphere */}
        <mesh>
          <sphereGeometry args={[3, 32, 32]} />
          <meshBasicMaterial
            color={severityColor}
            transparent
            opacity={0.06}
            side={THREE.BackSide}
            depthWrite={false}
          />
        </mesh>
      </group>
    </>
  )
}

/* ═══════════════════════════════════════════════════════════════
   EXPORTED COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export interface LungVisualization3DProps {
  prediction: string
  confidence: number
  severity: string
  fvcPrediction?: number
  patientId: string
}

export default function LungVisualization3D({
  prediction, confidence, severity, fvcPrediction, patientId,
}: LungVisualization3DProps) {
  const [hoveredLobe, setHoveredLobe] = useState<string | null>(null)

  const affectedLobes = useMemo(() => getAffectedLobes(severity, confidence), [severity, confidence])
  const affectedNames = useMemo(
    () => affectedLobes.map(al => LOBE_CONFIG[al.lobeIdx].name),
    [affectedLobes],
  )
  const severityColor = getSeverityColor(severity)

  return (
    <div className="relative w-full h-full">
      {/* 3D Canvas */}
      <Canvas
        camera={{ position: [0, 0.3, 5.0], fov: 38, near: 0.1, far: 100 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <VisualizationScene
          severity={severity}
          confidence={confidence}
          onHoverLobe={setHoveredLobe}
        />
      </Canvas>

      {/* Top-left: Diagnosis badge */}
      <div className="absolute top-4 left-4 z-10 pointer-events-none">
        <div
          className="px-4 py-3 rounded-lg border"
          style={{
            background: 'rgba(10, 10, 10, 0.88)',
            backdropFilter: 'blur(12px)',
            borderColor: severityColor + '60',
            boxShadow: `0 0 20px ${severityColor}30`,
          }}
        >
          <p className="font-pixel text-xs tracking-wider mb-1" style={{ color: severityColor }}>
            DIAGNOSIS
          </p>
          <p className="font-mono text-sm text-white/90">{prediction}</p>
          <div className="flex gap-4 mt-2">
            <div>
              <p className="text-[10px] text-zinc-500 uppercase">Confidence</p>
              <p className="text-sm font-semibold" style={{ color: severityColor }}>
                {(confidence * 100).toFixed(1)}%
              </p>
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 uppercase">Severity</p>
              <p className="text-sm font-semibold" style={{ color: severityColor }}>
                {severity}
              </p>
            </div>
            {fvcPrediction && (
              <div>
                <p className="text-[10px] text-zinc-500 uppercase">FVC</p>
                <p className="text-sm font-semibold text-blue-400">
                  {fvcPrediction} mL
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom: Affected regions legend */}
      <div className="absolute bottom-4 left-4 right-4 z-10 pointer-events-none">
        <div
          className="px-4 py-3 rounded-lg border border-white/10"
          style={{
            background: 'rgba(10, 10, 10, 0.85)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <p className="font-pixel text-[10px] tracking-wider text-zinc-400 mb-2">
            AFFECTED REGIONS
          </p>
          <div className="flex flex-wrap gap-2">
            {LOBE_CONFIG.map((lobe, i) => {
              const affected = affectedNames.includes(lobe.name)
              const isHovered = hoveredLobe === lobe.name
              return (
                <span
                  key={lobe.name}
                  className="px-2 py-1 rounded text-[10px] font-mono border transition-all duration-200"
                  style={{
                    background: affected
                      ? `${severityColor}${isHovered ? '40' : '20'}`
                      : 'rgba(255,255,255,0.05)',
                    borderColor: affected
                      ? `${severityColor}${isHovered ? '80' : '40'}`
                      : 'rgba(255,255,255,0.1)',
                    color: affected ? severityColor : 'rgba(255,255,255,0.4)',
                    transform: isHovered ? 'scale(1.05)' : 'none',
                  }}
                >
                  {affected ? '●' : '○'} {lobe.name}
                </span>
              )
            })}
          </div>
        </div>
      </div>

      {/* Top-right: Patient ID */}
      <div className="absolute top-4 right-4 z-10 pointer-events-none">
        <div
          className="px-3 py-2 rounded-lg border border-white/10"
          style={{
            background: 'rgba(10, 10, 10, 0.85)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <p className="text-[10px] text-zinc-500 uppercase">Patient</p>
          <p className="font-mono text-xs text-white/70">
            {patientId.length > 16 ? patientId.slice(0, 16) + '...' : patientId}
          </p>
        </div>
      </div>

      {/* Hover indicator */}
      {hoveredLobe && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none">
          <div
            className="px-4 py-2 rounded-lg"
            style={{
              background: 'rgba(10, 10, 10, 0.9)',
              border: `1px solid ${affectedNames.includes(hoveredLobe) ? severityColor + '60' : 'rgba(255,255,255,0.2)'}`,
            }}
          >
            <p className="font-mono text-sm text-white">{hoveredLobe}</p>
            <p className="text-xs" style={{
              color: affectedNames.includes(hoveredLobe) ? severityColor : HEALTHY_COLOR,
            }}>
              {affectedNames.includes(hoveredLobe) ? `Fibrosis Detected — ${severity}` : 'No abnormalities detected'}
            </p>
          </div>
        </div>
      )}

      {/* Instruction text */}
      <div className="absolute top-1/2 right-4 -translate-y-1/2 z-10 pointer-events-none">
        <p className="font-mono text-[10px] text-white/20 writing-vertical tracking-widest"
           style={{ writingMode: 'vertical-rl' }}>
          AUTO-ROTATING · HOVER TO INSPECT
        </p>
      </div>
    </div>
  )
}
