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
  background: '#0a0d14',
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
  accentColor: '#5ba3d9',
};

const BADGE_COLORS = {
  low: '#3ec95e',
  medium: '#f5a623',
  high: '#e53935',
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
    renderer.setBackground(0.04, 0.05, 0.08);

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
      color: [1.0, 0.95, 0.9],
      intensity: 1.2,
      positional: false,
    });
    keyLight.setPosition(1, 1, 0.5);
    renderer.addLight(keyLight);

    const fillLight = vtkLight.newInstance({
      color: [0.7, 0.8, 1.0],
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
  function buildScene(lungVolume, pathologyVolume, effectiveScanData) {
    const { renderer, renderWindow } = vtkContext.current;

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
    lungProp.setColor(0.65, 0.82, 0.92);
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
    pathProp.setColor(0.95, 0.22, 0.08);
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

      const spec = 0.5 + wave * 0.5; // 0.5–1.0
      const r = 0.95 - wave * 0.15;  // 0.95–0.80
      const g = 0.22 + wave * 0.35;  // 0.22–0.57 (towards amber)
      const b = 0.08 + wave * 0.02;  // 0.08–0.10

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
      flyTo(renderer, finding.center_world);
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
          if (!f.center_world || f.center_world.length < 3) continue;
          const dx = f.center_world[0] - worldPos[0];
          const dy = f.center_world[1] - worldPos[1];
          const dz = f.center_world[2] - worldPos[2];
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
        coord.setValue(...f.center_world);
        const display = coord.getComputedDisplayValue(renderer);
        return {
          id: f.id,
          label: f.label,
          severity: f.severity,
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
      ref={containerRef}
      className={className}
      style={CONTAINER_STYLE}
    >
      {/* ── Loading overlay ─────────────────────────────────────────────── */}
      {loading && (
        <div style={LOADING_STYLE}>
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                width: 40,
                height: 40,
                border: '3px solid rgba(255,255,255,0.2)',
                borderTopColor: '#5ba3d9',
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
                ? 'rgba(91,163,217,0.3)'
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

      {/* ── Finding annotation labels ───────────────────────────────────── */}
      {!loading &&
        annotations.map((a) => (
          <div
            key={a.id}
            style={{
              ...OVERLAY_BASE,
              left: a.x,
              top: a.y,
              transform: 'translate(-50%, -130%)',
              whiteSpace: 'nowrap',
              fontSize: 12,
              background: 'rgba(0,0,0,0.65)',
              padding: '3px 8px',
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              zIndex: 5,
            }}
          >
            <span>{a.label}</span>
            <span
              style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: BADGE_COLORS[a.severity] || '#888',
              }}
            />
          </div>
        ))}
    </div>
  );
}
