import React, { useState, useEffect, lazy, Suspense } from 'react'

// Lazy-load the 3D viewer so a VTK.js crash doesn't blank the whole page
const LungViewer = lazy(() => import('../../viewer/LungViewer.jsx'))

const SEVERITY_COLOR = {
  critical: '#ef4444',
  high:     '#f97316',
  moderate: '#f59e0b',
  low:      '#22c55e',
}

// ── Error boundary: catches VTK/WebGL errors without killing the whole app ──
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(e) { return { error: e } }
  render() {
    if (this.state.error) return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: '#0a0d14', flexDirection: 'column', gap: 12 }}>
        <div style={{ color: '#ef4444', fontSize: 14, fontWeight: 600 }}>3D viewer failed to load</div>
        <div style={{ color: '#6b7280', fontSize: 12, maxWidth: 400, textAlign: 'center' }}>
          {this.state.error.message}
        </div>
        <div style={{ color: '#374151', fontSize: 11 }}>Check the browser console (F12) for details.</div>
      </div>
    )
    return this.props.children
  }
}

const ViewerFallback = (
  <div style={{ flex: 1, background: '#0a0d14', display: 'flex', alignItems: 'center',
                justifyContent: 'center', color: '#475569', fontSize: 13 }}>
    Loading 3D engine…
  </div>
)

export default function App() {
  const [patients, setPatients]           = useState([])
  const [patientId, setPatientId]         = useState('')
  const [scanData, setScanData]           = useState(null)
  const [loading, setLoading]             = useState(false)
  const [error, setError]                 = useState(null)
  const [activeFinding, setActiveFinding] = useState(null)
  const [useMock, setUseMock]             = useState(false)

  // Load patient list on mount
  useEffect(() => {
    fetch('/api/patients')
      .then(r => r.json())
      .then(data => {
        const list = data.patients || []
        setPatients(list)
        if (list.length > 0) setPatientId(list[0].patient_id)
      })
      .catch(() => setError('Cannot reach backend — start the server first.'))
  }, [])

  // Clear results when patient changes
  useEffect(() => {
    setScanData(null)
    setActiveFinding(null)
    setError(null)
  }, [patientId])

  const patientIdx = patients.findIndex(p => p.patient_id === patientId)
  const prevPatient = () => {
    if (patientIdx > 0) setPatientId(patients[patientIdx - 1].patient_id)
  }
  const nextPatient = () => {
    if (patientIdx < patients.length - 1) setPatientId(patients[patientIdx + 1].patient_id)
  }

  const analyze = async () => {
    if (!patientId) return
    setLoading(true)
    setError(null)
    setScanData(null)
    setActiveFinding(null)
    const form = new FormData()
    form.append('patient_id', patientId)
    try {
      const res = await fetch('/api/analyze', { method: 'POST', body: form })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || body.error || `HTTP ${res.status}`)
      }
      setScanData(await res.json())
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const loadLastResult = async () => {
    setLoading(true)
    setError(null)
    setScanData(null)
    setActiveFinding(null)
    try {
      const res = await fetch('/api/scan-result')
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || 'No cached result — run Analyze first.')
      }
      setScanData(await res.json())
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const allFindings = scanData?.findings ?? []
  // Show top 30 by confidence — prevents sidebar and annotation overload
  const findings = [...allFindings]
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    .slice(0, 30)
  const hiddenCount = allFindings.length - findings.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>

      {/* ── Top bar ── */}
      <div style={{
        padding: '10px 18px', background: '#0f1117',
        borderBottom: '1px solid #1e293b',
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
      }}>
        <span style={{ color: '#60a5fa', fontWeight: 700, fontSize: 16, marginRight: 4 }}>
          Pulmoscan
        </span>

        <button
          onClick={prevPatient}
          disabled={loading || patientIdx <= 0}
          style={{
            padding: '5px 10px', background: 'transparent',
            color: patientIdx > 0 ? '#94a3b8' : '#1e293b',
            border: '1px solid #1e293b', borderRadius: 6,
            cursor: patientIdx > 0 ? 'pointer' : 'not-allowed', fontSize: 14,
          }}
        >◀</button>

        <select
          value={patientId}
          onChange={e => setPatientId(e.target.value)}
          disabled={loading}
          style={{
            background: '#1e1e2e', color: '#e0e0e0',
            border: '1px solid #334155', padding: '5px 8px',
            borderRadius: 6, minWidth: 280, fontSize: 13,
          }}
        >
          {patients.length === 0 && <option value="">— connecting to backend… —</option>}
          {patients.map(p => (
            <option key={p.patient_id} value={p.patient_id}>
              {p.patient_id}  ({p.slice_count} slices)
            </option>
          ))}
        </select>

        <button
          onClick={nextPatient}
          disabled={loading || patientIdx >= patients.length - 1}
          style={{
            padding: '5px 10px', background: 'transparent',
            color: patientIdx < patients.length - 1 ? '#94a3b8' : '#1e293b',
            border: '1px solid #1e293b', borderRadius: 6,
            cursor: patientIdx < patients.length - 1 ? 'pointer' : 'not-allowed', fontSize: 14,
          }}
        >▶</button>

        <button
          onClick={analyze}
          disabled={loading || !patientId}
          style={{
            padding: '6px 20px', background: loading ? '#1e3a5f' : '#2563eb',
            color: '#fff', border: 'none', borderRadius: 6,
            cursor: loading ? 'not-allowed' : 'pointer', fontSize: 13,
          }}
        >
          {loading ? 'Analyzing…' : 'Analyze'}
        </button>

        <button
          onClick={loadLastResult}
          disabled={loading}
          style={{
            padding: '6px 14px', background: 'transparent',
            color: loading ? '#374151' : '#22c55e',
            border: `1px solid ${loading ? '#1e293b' : '#166534'}`,
            borderRadius: 6, cursor: loading ? 'not-allowed' : 'pointer', fontSize: 13,
          }}
        >
          Load Last Result
        </button>

        <label style={{ fontSize: 12, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={useMock}
            onChange={e => { setUseMock(e.target.checked); if (e.target.checked) setScanData(null) }}
          />
          Mock data
        </label>

        {loading && (
          <span style={{ color: '#f59e0b', fontSize: 12 }}>
            Pipeline running — this takes 2–5 minutes…
          </span>
        )}
        {error && (
          <span style={{ color: '#ef4444', fontSize: 12 }}>⚠ {error}</span>
        )}
        {scanData && !loading && (
          <span style={{ color: '#22c55e', fontSize: 12 }}>
            ✓ {findings.length} finding{findings.length !== 1 ? 's' : ''} — {scanData.patient?.id}
          </span>
        )}
      </div>

      {/* ── Main area ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Findings sidebar */}
        {findings.length > 0 && (
          <div style={{
            width: 270, background: '#0f1117', overflowY: 'auto',
            borderRight: '1px solid #1e293b', padding: '10px 8px', flexShrink: 0,
          }}>
            <div style={{ fontSize: 11, color: '#475569', marginBottom: 8, paddingLeft: 4 }}>
              FINDINGS
            </div>
            {findings.map(f => (
              <div
                key={f.id}
                onClick={() => setActiveFinding(prev => prev === f.id ? null : f.id)}
                style={{
                  padding: '9px 10px', marginBottom: 5, borderRadius: 7, cursor: 'pointer',
                  background: activeFinding === f.id ? '#0f2a4a' : '#141922',
                  border: `1px solid ${activeFinding === f.id ? '#2563eb' : '#1e293b'}`,
                  transition: 'background 0.15s, border-color 0.15s',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 13, color: '#e2e8f0' }}>{f.label}</div>
                <div style={{ fontSize: 11, marginTop: 2 }}>
                  <span style={{ color: SEVERITY_COLOR[f.severity] ?? '#9ca3af' }}>
                    ● {f.severity}
                  </span>
                  <span style={{ color: '#475569', marginLeft: 8 }}>
                    {(f.confidence * 100).toFixed(0)}% confidence
                  </span>
                </div>
                {f.size_mm && (
                  <div style={{ fontSize: 10, color: '#374151', marginTop: 3 }}>
                    {f.size_mm.map(v => v.toFixed(1)).join(' × ')} mm
                  </div>
                )}
                {activeFinding === f.id && (
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6, lineHeight: 1.4 }}>
                    {f.description}
                  </div>
                )}
              </div>
            ))}

            {hiddenCount > 0 && (
              <div style={{ fontSize: 11, color: '#4b5563', textAlign: 'center', padding: '6px 4px' }}>
                +{hiddenCount} more findings (showing top 30 by confidence)
              </div>
            )}

            {scanData?.scan_metadata && (
              <div style={{ marginTop: 12, padding: '8px 10px', background: '#0d1117',
                            borderRadius: 6, border: '1px solid #1e293b' }}>
                <div style={{ fontSize: 10, color: '#374151', marginBottom: 4 }}>SCAN INFO</div>
                <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.6 }}>
                  <div>Slices: {scanData.scan_metadata.slice_count}</div>
                  <div>Spacing: {scanData.scan_metadata.voxel_spacing?.map(v => v.toFixed(2)).join(' × ')} mm</div>
                  {scanData.patient?.age > 0 && <div>Age: {scanData.patient.age}y {scanData.patient.sex}</div>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 3D Viewer — only mount when we have data or mock mode is on */}
        {(scanData || useMock) ? (
          <ErrorBoundary>
            <Suspense fallback={ViewerFallback}>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <LungViewer
                  scanData={scanData}
                  useMockData={useMock && !scanData}
                  activeFindingId={activeFinding}
                  onFindingHover={id => setActiveFinding(id)}
                  style={{ width: '100%', height: '100%' }}
                />
              </div>
            </Suspense>
          </ErrorBoundary>
        ) : (
          <div style={{
            flex: 1, background: '#0a0d14', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 16,
          }}>
            <div style={{ fontSize: 48 }}>🫁</div>
            <div style={{ fontSize: 15, color: '#4b5563' }}>Select a patient and click Analyze</div>
            <div style={{ fontSize: 12, color: '#1f2937' }}>or enable Mock data to preview the 3D viewer</div>
          </div>
        )}

      </div>
    </div>
  )
}
