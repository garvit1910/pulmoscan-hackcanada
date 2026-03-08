import React, { useRef, useEffect, useState, useCallback } from 'react';

// ── VTK.js imports ──────────────────────────────────────────────────────────
import '@kitware/vtk.js/Rendering/Profiles/Geometry'; // WebGL geometry profile

import vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import vtkRenderWindow from '@kitware/vtk.js/Rendering/Core/RenderWindow';
import vtkOpenGLRenderWindow from '@kitware/vtk.js/Rendering/OpenGL/RenderWindow';
import vtkRenderWindowInteractor from '@kitware/vtk.js/Rendering/Core/RenderWindowInteractor';
import vtkInteractorStyleTrackballCamera from '@kitware/vtk.js/Interaction/Style/InteractorStyleTrackballCamera';

import vtkImageMarchingCubes from '@kitware/vtk.js/Filters/General/ImageMarchingCubes';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkLight from '@kitware/vtk.js/Rendering/Core/Light';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import vtkCellPicker from '@kitware/vtk.js/Rendering/Core/CellPicker';
import vtkCoordinate from '@kitware/vtk.js/Rendering/Core/Coordinate';

// ── Local utils ─────────────────────────────────────────────────────────────
import { generateMockData } from './utils/generateMockVolumes';
import { loadAllVolumes } from './utils/nrrdLoader';
import { flyTo, resetCamera } from './utils/cameraAnimation';

// ── Styles (inline) ─────────────────────────────────────────────────────────
const CONTAINER_STYLE = {
  position: 'relative',
  width: '100%',
  height: '100%',
  minHeight: 500,
  overflow: 'hidden',
  background: '#0a0a0a',
};

const OVERLAY_BASE = {
  position: 'absolute',
  pointerEvents: 'none',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  color: '#fff',
};

const LOADING_STYLE = {
  ...OVERLAY_BASE,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 18,
  background: 'rgba(10,13,20,0.85)',
  zIndex: 20,
  pointerEvents: 'auto',
};

const CONTROLS_STYLE = {
  position: 'absolute',
  bottom: 16,
  left: 16,
  zIndex: 10,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  pointerEvents: 'auto',
};

const BUTTON_STYLE = {
  padding: '6px 14px',
  border: '1px solid rgba(255,255,255,0.25)',
  borderRadius: 6,
  background: 'rgba(255,255,255,0.08)',
  color: '#e0e0e0',
  fontSize: 13,
  cursor: 'pointer',
  backdropFilter: 'blur(4px)',
};

const SLIDER_STYLE = {
  width: 160,
  accentColor: '#E8506A',
};

const BADGE_COLORS = {
  low: '#4ADE80',
  medium: '#F5A623',
  high: '#E8506A',
  critical: '#CC2233',
};

// ═══════════════════════════════════════════════════════════════════════════
// LungViewer Component
// ═══════════════════════════════════════════════════════════════════════════

export default function LungViewer({
  scanData,
  activeFindingId = null,
  onFindingHover,
  className,
  useMockData = false,
}) {
  // ── Refs ────────────────────────────────────────────────────────────────
  const containerRef = useRef(null);
  const vtkContext = useRef(null); // stores all VTK objects for cleanup
  const pathologyActorRef = useRef(null);
  const lungActorRef = useRef(null);
  const lungVolumeRef = useRef(null); // keep ref to compute indexToWorld
  const clipPlaneRef = useRef(null);
  const pulseFrameRef = useRef(null);
  const annotationFrameRef = useRef(null);

  // ── State ───────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [clipEnabled, setClipEnabled] = useState(false);
  const [clipZ, setClipZ] = useState(0);
  const [clipRange, setClipRange] = useState([0, 1]);
  const [annotations, setAnnotations] = useState([]); // [{id, label, severity, x, y}]
  const [resolvedScanData, setResolvedScanData] = useState(null);
  const [selectedFinding, setSelectedFinding] = useState(null); // full finding object when zoomed in

  // ══════════════════════════════════════════════════════════════════════════
  // (a) INITIALISATION — create VTK pipeline once on mount
  // ══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // --- Render window ---
    const renderWindow = vtkRenderWindow.newInstance();
    const renderer = vtkRenderer.newInstance();
    renderWindow.addRenderer(renderer);
    renderer.setBackground(0.04, 0.04, 0.04);

    // --- OpenGL backend ---
    const openGLRenderWindow = vtkOpenGLRenderWindow.newInstance();
    renderWindow.addView(openGLRenderWindow);
    openGLRenderWindow.setContainer(container);
    const { width, height } = container.getBoundingClientRect();
    openGLRenderWindow.setSize(width, height);

    // --- Interactor ---
    const interactor = vtkRenderWindowInteractor.newInstance();
    interactor.setView(openGLRenderWindow);
    interactor.initialize();
    interactor.bindEvents(container);
    interactor.setInteractorStyle(
      vtkInteractorStyleTrackballCamera.newInstance(),
    );

    // --- Lighting ---
    renderer.removeAllLights();
    const keyLight = vtkLight.newInstance({
      color: [1.0, 0.92, 0.94],
      intensity: 1.2,
      positional: false,
    });
    keyLight.setPosition(1, 1, 0.5);
    renderer.addLight(keyLight);

    const fillLight = vtkLight.newInstance({
      color: [0.9, 0.7, 0.8],
      intensity: 0.5,
      positional: false,
    });
    fillLight.setPosition(-1, -1, -0.3);
    renderer.addLight(fillLight);

    // --- Clip plane (inactive until enabled) ---
    const clipPlane = vtkPlane.newInstance();
    clipPlane.setNormal(0, 0, 1);
    clipPlane.setOrigin(0, 0, 0);
    clipPlaneRef.current = clipPlane;

    // --- Cell picker for hover ---
    const picker = vtkCellPicker.newInstance();
    picker.setTolerance(0.005);

    // --- ResizeObserver ---
    const resizeObserver = new ResizeObserver(() => {
      if (!container) return;
      const { width: w, height: h } = container.getBoundingClientRect();
      openGLRenderWindow.setSize(w, h);
      renderWindow.render();
    });
    resizeObserver.observe(container);

    // Store everything for later use
    vtkContext.current = {
      renderWindow,
      renderer,
      openGLRenderWindow,
      interactor,
      picker,
      resizeObserver,
      keyLight,
      fillLight,
      disposed: false,
    };

    renderWindow.render();

    // ── (j) CLEANUP ─────────────────────────────────────────────────────
    return () => {
      vtkContext.current.disposed = true;
      cancelAnimationFrame(pulseFrameRef.current);
      cancelAnimationFrame(annotationFrameRef.current);
      resizeObserver.disconnect();
      interactor.unbindEvents();

      // Dispose actors
      renderer.getActors().forEach((a) => {
        a.getMapper()?.delete();
        a.delete();
      });
      renderer.delete();
      openGLRenderWindow.delete();
      renderWindow.delete();
      interactor.delete();
    };
  }, []); // mount-only

  // ══════════════════════════════════════════════════════════════════════════
  // (b) VOLUME LOADING — when scanData or useMockData changes
  // ══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!vtkContext.current) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        let lungVolume, pathologyVolume;
        let effectiveScanData = scanData;

        if (useMockData) {
          const mock = generateMockData();
          lungVolume = mock.lungVolume;
          pathologyVolume = mock.pathologyVolume;
          effectiveScanData = mock.scanData;
        } else {
          const vols = await loadAllVolumes(scanData);
          lungVolume = vols.lungVolume;
          pathologyVolume = vols.pathologyVolume;
        }

        if (cancelled || vtkContext.current.disposed) return;

        setResolvedScanData(effectiveScanData);
        buildScene(lungVolume, pathologyVolume, effectiveScanData);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          console.error('[LungViewer] load error:', err);
          setError(err.message || 'Failed to load volumes');
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanData, useMockData]);

  // ══════════════════════════════════════════════════════════════════════════
  // Build the 3D scene from loaded volumes
  // ══════════════════════════════════════════════════════════════════════════
  // ══════════════════════════════════════════════════════════════════════════
  // Helper: convert backend center_ijk [z,y,x] to VTK world using the volume
  // ══════════════════════════════════════════════════════════════════════════
  function computeVtkWorldCoords(lungVolume, effectiveScanData) {
    if (!effectiveScanData?.findings?.length) return;

    const origin  = lungVolume.getOrigin();   // [ox, oy, oz]
    const spacing = lungVolume.getSpacing();  // [sx, sy, sz]
    const dir     = lungVolume.getDirection();// 9-element flat row-major
    const bounds  = lungVolume.getBounds();   // [xmin,xmax,ymin,ymax,zmin,zmax]

    // VTK world = origin + dir * diag(spacing) * [i,j,k]
    function toWorld(idx) {
      return [
        origin[0] + dir[0]*spacing[0]*idx[0] + dir[1]*spacing[1]*idx[1] + dir[2]*spacing[2]*idx[2],
        origin[1] + dir[3]*spacing[0]*idx[0] + dir[4]*spacing[1]*idx[1] + dir[5]*spacing[2]*idx[2],
        origin[2] + dir[6]*spacing[0]*idx[0] + dir[7]*spacing[1]*idx[1] + dir[8]*spacing[2]*idx[2],
      ];
    }

    const inBounds = (w) =>
      w[0] >= bounds[0] - 15 && w[0] <= bounds[1] + 15 &&
      w[1] >= bounds[2] - 15 && w[1] <= bounds[3] + 15 &&
      w[2] >= bounds[4] - 15 && w[2] <= bounds[5] + 15;

    // Detect axis ordering: after itk-wasm reads NRRD, VTK index may be
    // (x,y,z) [reversed from C-order] or (z,y,x) [preserved].  Test both.
    let useReversed = true;
    const first = effectiveScanData.findings[0];
    if (first?.center_ijk) {
      const [z, y, x] = first.center_ijk;
      const wA = toWorld([x, y, z]); // reversed: VTK (i,j,k) = (x,y,z)
      const wB = toWorld([z, y, x]); // direct:   VTK (i,j,k) = (z,y,x)
      useReversed = inBounds(wA) || !inBounds(wB);
      console.log('[LungViewer] bounds:', bounds);
      console.log('[LungViewer] worldA (reversed):', wA, 'inBounds:', inBounds(wA));
      console.log('[LungViewer] worldB (direct):', wB, 'inBounds:', inBounds(wB));
      console.log('[LungViewer] useReversed:', useReversed);
    }

    effectiveScanData.findings.forEach((f) => {
      if (f.center_ijk && f.center_ijk.length >= 3) {
        const [z, y, x] = f.center_ijk;
        const idx = useReversed ? [x, y, z] : [z, y, x];
        f._vtk_world = toWorld(idx);
      } else {
        f._vtk_world = f.center_world;
      }
    });
  }

  function buildScene(lungVolume, pathologyVolume, effectiveScanData) {
    const { renderer, renderWindow } = vtkContext.current;

    lungVolumeRef.current = lungVolume;

    // Compute VTK-correct world coordinates for each finding
    computeVtkWorldCoords(lungVolume, effectiveScanData);

    // Clear previous actors
    renderer.getActors().forEach((a) => {
      a.getMapper()?.delete();
      a.delete();
    });
    renderer.removeAllActors();

    // ── (c) LUNG RENDERING — "Holographic Glass" ────────────────────────
    const lungMC = vtkImageMarchingCubes.newInstance();
    lungMC.setInputData(lungVolume);
    lungMC.setContourValue(0.5);
    lungMC.setComputeNormals(true);
    lungMC.setMergePoints(true);

    const lungMapper = vtkMapper.newInstance();
    lungMapper.setInputConnection(lungMC.getOutputPort());

    const lungActor = vtkActor.newInstance();
    lungActor.setMapper(lungMapper);
    const lungProp = lungActor.getProperty();
    lungProp.setOpacity(0.18);
    lungProp.setColor(0.85, 0.60, 0.68);
    lungProp.setSpecular(0.9);
    lungProp.setSpecularPower(60);
    lungProp.setDiffuse(0.3);
    lungProp.setAmbient(0.2);
    lungProp.setBackfaceCulling(false);

    lungActorRef.current = lungActor;
    renderer.addActor(lungActor);

    // ── (d) PATHOLOGY RENDERING — "Lava" ────────────────────────────────
    const pathMC = vtkImageMarchingCubes.newInstance();
    pathMC.setInputData(pathologyVolume);
    pathMC.setContourValue(0.5);
    pathMC.setComputeNormals(true);
    pathMC.setMergePoints(true);

    const pathMapper = vtkMapper.newInstance();
    pathMapper.setInputConnection(pathMC.getOutputPort());

    const pathActor = vtkActor.newInstance();
    pathActor.setMapper(pathMapper);
    const pathProp = pathActor.getProperty();
    pathProp.setOpacity(1.0);
    pathProp.setColor(0.91, 0.31, 0.42);
    pathProp.setSpecular(0.7);
    pathProp.setSpecularPower(40);
    pathProp.setDiffuse(0.6);
    pathProp.setAmbient(0.15);

    pathologyActorRef.current = pathActor;
    renderer.addActor(pathActor);

    // ── Pathology pulsing animation ─────────────────────────────────────
    cancelAnimationFrame(pulseFrameRef.current);
    (function animatePulse() {
      if (vtkContext.current?.disposed) return;
      const t = (performance.now() % 2000) / 2000; // 0→1 over 2 sec
      const wave = 0.5 + 0.5 * Math.sin(t * Math.PI * 2); // 0→1→0

      const spec = 0.5 + wave * 0.5;
      const r = 0.91 - wave * 0.10;  // 0.91–0.81 (coral → rose)
      const g = 0.31 + wave * 0.20;  // 0.31–0.51
      const b = 0.42 + wave * 0.15;  // 0.42–0.57

      if (pathActor && !vtkContext.current?.disposed) {
        pathProp.setSpecular(spec);
        pathProp.setColor(r, g, b);
        renderWindow.render();
      }
      pulseFrameRef.current = requestAnimationFrame(animatePulse);
    })();

    // ── (e) CROSS-SECTION: compute z-range from lung volume ─────────────
    const bounds = lungVolume.getBounds(); // [xmin,xmax,ymin,ymax,zmin,zmax]
    setClipRange([bounds[4], bounds[5]]);
    setClipZ(bounds[5]); // start fully open

    // ── Camera overview ─────────────────────────────────────────────────
    renderer.resetCamera();
    renderer.getActiveCamera().elevation(15);
    renderer.getActiveCamera().azimuth(25);
    renderWindow.render();

    // ── (h) ANNOTATION LABELS — update positions every frame ────────────
    startAnnotationLoop(effectiveScanData);

    // ── (g) HOVER DETECTION ─────────────────────────────────────────────
    setupHoverPicker(pathActor, effectiveScanData);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // (e) CROSS-SECTION: apply clip plane to lung actor only
  // ══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const lungActor = lungActorRef.current;
    if (!lungActor) return;

    const mapper = lungActor.getMapper();
    if (clipEnabled) {
      const plane = clipPlaneRef.current;
      plane.setNormal(0, 0, -1);
      plane.setOrigin(0, 0, clipZ);
      mapper.addClippingPlane(plane);
    } else {
      mapper.removeAllClippingPlanes();
    }

    vtkContext.current?.renderWindow?.render();
  }, [clipEnabled, clipZ]);

  // ══════════════════════════════════════════════════════════════════════════
  // (f) CAMERA FLYTO — react to activeFindingId changes
  // ══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!vtkContext.current || loading) return;
    const data = resolvedScanData;
    if (!data) return;

    const { renderer } = vtkContext.current;

    if (activeFindingId == null) {
      resetCamera(renderer);
      return;
    }

    const finding = data.findings?.find((f) => f.id === activeFindingId);
    if (finding) {
      flyTo(renderer, finding._vtk_world || finding.center_world);
    }
  }, [activeFindingId, resolvedScanData, loading]);

  // ══════════════════════════════════════════════════════════════════════════
  // (g) HOVER DETECTION setup
  // ══════════════════════════════════════════════════════════════════════════
  function setupHoverPicker(pathActor, effectiveScanData) {
    const { interactor, picker, renderer } = vtkContext.current;

    const onMouseMove = (callData) => {
      if (!onFindingHover) return;
      const pos = callData.position;
      const x = Math.round(pos.x);
      const y = Math.round(pos.y);

      picker.pick([x, y, 0], renderer);
      const pickedActor = picker.getActors().length > 0 ? picker.getActors()[0] : null;

      if (pickedActor === pathActor) {
        const worldPos = picker.getPickPosition();
        // Find closest finding
        let closest = null;
        let minDist = Infinity;
        for (const f of effectiveScanData.findings || []) {
          const fw = f._vtk_world || f.center_world;
          if (!fw || fw.length < 3) continue;
          const dx = fw[0] - worldPos[0];
          const dy = fw[1] - worldPos[1];
          const dz = fw[2] - worldPos[2];
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist < minDist) {
            minDist = dist;
            closest = f;
          }
        }
        onFindingHover(closest ? closest.id : null);
      } else {
        onFindingHover(null);
      }
    };

    interactor.onMouseMove(onMouseMove);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // (h) ANNOTATION LABELS — re-project world → display each frame
  // ══════════════════════════════════════════════════════════════════════════
  function startAnnotationLoop(effectiveScanData) {
    cancelAnimationFrame(annotationFrameRef.current);

    function updateAnnotations() {
      if (vtkContext.current?.disposed) return;
      const { renderer, openGLRenderWindow } = vtkContext.current;
      if (!effectiveScanData?.findings?.length) {
        annotationFrameRef.current = requestAnimationFrame(updateAnnotations);
        return;
      }

      const size = openGLRenderWindow.getSize();
      const coord = vtkCoordinate.newInstance();
      coord.setCoordinateSystemToWorld();

      const newAnnotations = effectiveScanData.findings.map((f) => {
        const worldPos = f._vtk_world || f.center_world;
        coord.setValue(...worldPos);
        const display = coord.getComputedDisplayValue(renderer);
        return {
          id: f.id,
          label: f.label || f.type.replace(/_/g, ' '),
          type: f.type,
          severity: f.severity,
          description: f.description || '',
          size_mm: f.size_mm,
          confidence: f.confidence,
          lobe: f.lobe,
          x: display[0],
          y: size[1] - display[1], // VTK y is bottom-up
        };
      });

      coord.delete();
      setAnnotations(newAnnotations);
      annotationFrameRef.current = requestAnimationFrame(updateAnnotations);
    }

    annotationFrameRef.current = requestAnimationFrame(updateAnnotations);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div
      className={className}
      style={CONTAINER_STYLE}
    >
      {/* VTK canvas — isolated so overlay dots render & click above it */}
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      {/* UI overlay — pointer-events:none lets VTK handle rotation/zoom;
          individual children with pointer-events:auto capture clicks */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none', overflow: 'hidden' }}>

      {/* ── Loading overlay ─────────────────────────────────────────────── */}
      {loading && (
        <div style={LOADING_STYLE}>
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                width: 40,
                height: 40,
                border: '3px solid rgba(255,255,255,0.2)',
                borderTopColor: '#E8506A',
                borderRadius: '50%',
                margin: '0 auto 12px',
                animation: 'pulmospin 0.8s linear infinite',
              }}
            />
            <span>Loading lung volumes…</span>
            <style>{`@keyframes pulmospin { to { transform: rotate(360deg); } }`}</style>
          </div>
        </div>
      )}

      {/* ── Error overlay ───────────────────────────────────────────────── */}
      {error && !loading && (
        <div style={{ ...LOADING_STYLE, background: 'rgba(60,10,10,0.9)' }}>
          <div style={{ textAlign: 'center', maxWidth: 400 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>⚠</div>
            <div>{error}</div>
          </div>
        </div>
      )}

      {/* ── Cross-section controls ──────────────────────────────────────── */}
      {!loading && !error && (
        <div style={CONTROLS_STYLE}>
          <button
            style={{
              ...BUTTON_STYLE,
              background: clipEnabled
                ? 'rgba(232,80,106,0.3)'
                : 'rgba(255,255,255,0.08)',
            }}
            onClick={() => setClipEnabled((v) => !v)}
          >
            {clipEnabled ? '✂ Clip ON' : '✂ Clip OFF'}
          </button>
          {clipEnabled && (
            <input
              type="range"
              min={clipRange[0]}
              max={clipRange[1]}
              step={(clipRange[1] - clipRange[0]) / 128}
              value={clipZ}
              onChange={(e) => setClipZ(Number(e.target.value))}
              style={SLIDER_STYLE}
            />
          )}
        </div>
      )}

      {/* ── Finding dots — small clickable markers that fly into the lung ── */}
      {!loading &&
        annotations.map((a) => (
          <div
            key={a.id}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => {
              if (!vtkContext.current || !resolvedScanData) return;
              const finding = resolvedScanData.findings?.find((f) => f.id === a.id);
              if (!finding) return;
              // If clicking the already-selected dot, deselect and reset camera
              if (selectedFinding?.id === a.id) {
                setSelectedFinding(null);
                resetCamera(vtkContext.current.renderer);
                return;
              }
              setSelectedFinding(finding);
              flyTo(vtkContext.current.renderer, finding._vtk_world || finding.center_world, 1000);
            }}
            onMouseEnter={(e) => {
              const tooltip = e.currentTarget.querySelector('[data-tooltip]');
              if (tooltip) tooltip.style.opacity = '1';
            }}
            onMouseLeave={(e) => {
              const tooltip = e.currentTarget.querySelector('[data-tooltip]');
              if (tooltip) tooltip.style.opacity = '0';
            }}
            style={{
              position: 'absolute',
              left: a.x,
              top: a.y,
              transform: 'translate(-50%, -50%)',
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 5,
              cursor: 'pointer',
              pointerEvents: 'auto',
            }}
          >
            {/* Outer pulse ring */}
            <span
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: selectedFinding?.id === a.id ? 32 : 24,
                height: selectedFinding?.id === a.id ? 32 : 24,
                borderRadius: '50%',
                background: BADGE_COLORS[a.severity] || '#888',
                opacity: 0.25,
                animation: 'dotPulse 2s ease-in-out infinite',
                transition: 'width 0.3s, height 0.3s',
              }}
            />
            {/* Inner dot */}
            <span
              style={{
                display: 'block',
                width: selectedFinding?.id === a.id ? 14 : 10,
                height: selectedFinding?.id === a.id ? 14 : 10,
                borderRadius: '50%',
                background: BADGE_COLORS[a.severity] || '#888',
                boxShadow: `0 0 ${selectedFinding?.id === a.id ? 12 : 6}px ${BADGE_COLORS[a.severity] || '#888'}`,
                transition: 'all 0.3s ease',
                border: selectedFinding?.id === a.id ? '2px solid rgba(255,255,255,0.8)' : 'none',
              }}
            />
            {/* Tooltip on hover (hidden when info card is showing for this dot) */}
            {selectedFinding?.id !== a.id && (
              <div
                data-tooltip
                style={{
                  position: 'absolute',
                  bottom: 'calc(100% + 8px)',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  whiteSpace: 'nowrap',
                  fontSize: 11,
                  fontFamily: 'monospace',
                  background: 'rgba(0,0,0,0.8)',
                  color: '#e0e0e0',
                  padding: '3px 8px',
                  borderRadius: 4,
                  border: `1px solid ${BADGE_COLORS[a.severity] || '#555'}`,
                  opacity: 0,
                  transition: 'opacity 0.15s ease',
                  pointerEvents: 'none',
                }}
              >
                <div>{a.label}</div>
                <div style={{ fontSize: 10, color: '#888', marginTop: 1 }}>Click to inspect</div>
              </div>
            )}
          </div>
        ))}

      {/* ── Finding Info Card — shown when zoomed into a dot ── */}
      {selectedFinding && (() => {
        const ann = annotations.find((a) => a.id === selectedFinding.id);
        if (!ann) return null;
        const sevColor = BADGE_COLORS[selectedFinding.severity] || '#888';
        return (
          <div
            style={{
              position: 'absolute',
              left: Math.min(ann.x + 20, (containerRef.current?.clientWidth || 600) - 300),
              top: Math.max(ann.y - 40, 10),
              zIndex: 20,
              pointerEvents: 'auto',
              width: 280,
              background: 'rgba(8, 10, 18, 0.92)',
              backdropFilter: 'blur(12px)',
              border: `1px solid ${sevColor}44`,
              borderRadius: 8,
              padding: 16,
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              color: '#e0e0e0',
              boxShadow: `0 4px 30px rgba(0,0,0,0.5), 0 0 20px ${sevColor}22`,
              animation: 'cardFadeIn 0.3s ease-out',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: sevColor,
                  boxShadow: `0 0 8px ${sevColor}`,
                  display: 'inline-block',
                }} />
                <span style={{ fontWeight: 600, fontSize: 14 }}>
                  {(selectedFinding.label || selectedFinding.type.replace(/_/g, ' ')).replace(/\s*—\s*/, ' — ')}
                </span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedFinding(null);
                  if (vtkContext.current) resetCamera(vtkContext.current.renderer);
                }}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: 'none',
                  borderRadius: 4,
                  color: '#aaa',
                  cursor: 'pointer',
                  fontSize: 14,
                  padding: '2px 6px',
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>

            {/* Description */}
            <p style={{ fontSize: 12, color: '#b0b0b0', lineHeight: 1.5, margin: '0 0 12px 0' }}>
              {selectedFinding.description}
            </p>

            {/* Metrics grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 11 }}>
              <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '6px 8px' }}>
                <div style={{ color: '#666', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Severity</div>
                <div style={{ color: sevColor, fontWeight: 600, textTransform: 'capitalize', marginTop: 2 }}>{selectedFinding.severity}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '6px 8px' }}>
                <div style={{ color: '#666', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Confidence</div>
                <div style={{ color: '#e0e0e0', fontWeight: 600, marginTop: 2 }}>{(selectedFinding.confidence * 100).toFixed(1)}%</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '6px 8px' }}>
                <div style={{ color: '#666', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Size</div>
                <div style={{ color: '#e0e0e0', fontWeight: 600, marginTop: 2 }}>{selectedFinding.size_mm?.toFixed(1)} mm</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '6px 8px' }}>
                <div style={{ color: '#666', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Lobe</div>
                <div style={{ color: '#e0e0e0', fontWeight: 600, marginTop: 2, textTransform: 'capitalize' }}>{(selectedFinding.lobe || '').replace(/_/g, ' ')}</div>
              </div>
            </div>

            {/* World coordinates */}
            {selectedFinding.center_world && (
              <div style={{ marginTop: 8, padding: '4px 8px', background: 'rgba(255,255,255,0.02)', borderRadius: 4, fontSize: 10, color: '#555', fontFamily: 'monospace' }}>
                xyz: [{selectedFinding.center_world.map((v) => v.toFixed(1)).join(', ')}]
              </div>
            )}
          </div>
        );
      })()}

      </div>{/* end UI overlay */}

      <style>{`
        @keyframes dotPulse {
          0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.2; }
          50% { transform: translate(-50%, -50%) scale(1.8); opacity: 0; }
        }
        @keyframes cardFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
