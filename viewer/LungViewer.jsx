import React, { useRef, useEffect, useState } from 'react';

// ── VTK.js imports ──────────────────────────────────────────────────────────
import '@kitware/vtk.js/Rendering/Profiles/Geometry';

import vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import vtkRenderWindow from '@kitware/vtk.js/Rendering/Core/RenderWindow';
import vtkOpenGLRenderWindow from '@kitware/vtk.js/Rendering/OpenGL/RenderWindow';
import vtkRenderWindowInteractor from '@kitware/vtk.js/Rendering/Core/RenderWindowInteractor';
import vtkInteractorStyleTrackballCamera from '@kitware/vtk.js/Interaction/Style/InteractorStyleTrackballCamera';

import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkImageMarchingCubes from '@kitware/vtk.js/Filters/General/ImageMarchingCubes';
import vtkSphereSource from '@kitware/vtk.js/Filters/Sources/SphereSource';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkLight from '@kitware/vtk.js/Rendering/Core/Light';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import vtkCellPicker from '@kitware/vtk.js/Rendering/Core/CellPicker';
import vtkCoordinate from '@kitware/vtk.js/Rendering/Core/Coordinate';

// ── Local utils ─────────────────────────────────────────────────────────────
import { generateMockData } from './utils/generateMockVolumes';
import { loadNrrdFromUrl } from './utils/nrrdLoader';
import { flyTo, resetCamera } from './utils/cameraAnimation';

// ── Constants ────────────────────────────────────────────────────────────────
const SEVERITY_RGB = {
  critical: [0.85, 0.1,  0.95],
  high:     [1.0,  0.35, 0.0 ],
  moderate: [1.0,  0.76, 0.0 ],
  low:      [0.18, 0.83, 0.3 ],
  medium:   [1.0,  0.76, 0.0 ],
};

const SEVERITY_HEX = {
  critical: '#9b30ff',
  high:     '#f97316',
  moderate: '#f5a623',
  low:      '#22c55e',
  medium:   '#f5a623',
};

// ── Styles ───────────────────────────────────────────────────────────────────
const CONTAINER_STYLE = {
  position: 'relative', width: '100%', height: '100%',
  minHeight: 500, overflow: 'hidden', background: '#0a0d14',
};

const OVERLAY_BASE = {
  position: 'absolute', pointerEvents: 'none',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  color: '#fff',
};

const LOADING_STYLE = {
  ...OVERLAY_BASE, top: 0, left: 0, right: 0, bottom: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 18, background: 'rgba(10,13,20,0.85)', zIndex: 20, pointerEvents: 'auto',
};

const CONTROLS_STYLE = {
  position: 'absolute', bottom: 16, left: 16, zIndex: 10,
  display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'auto',
};

const BUTTON_STYLE = {
  padding: '6px 14px', border: '1px solid rgba(255,255,255,0.25)',
  borderRadius: 6, background: 'rgba(255,255,255,0.08)', color: '#e0e0e0',
  fontSize: 13, cursor: 'pointer', backdropFilter: 'blur(4px)',
};

const SLIDER_STYLE = { width: 160, accentColor: '#5ba3d9' };

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
  const containerRef    = useRef(null);
  const vtkContext      = useRef(null);
  const lungActorRef    = useRef(null);
  const clipPlaneRef    = useRef(null);
  const markerActorsRef = useRef(new Map()); // id → { actor, sphere, finding }
  const hoveredIdRef    = useRef(null);

  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [clipEnabled, setClipEnabled]   = useState(false);
  const [clipZ, setClipZ]               = useState(0);
  const [clipRange, setClipRange]       = useState([0, 1]);
  const [activeMarker, setActiveMarker] = useState(null); // { finding, screenX, screenY }
  const [resolvedScanData, setResolvedScanData] = useState(null);

  // ══════════════════════════════════════════════════════════════════════════
  // (a) INIT — create VTK render pipeline once on mount
  // ══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderWindow = vtkRenderWindow.newInstance();
    const renderer = vtkRenderer.newInstance();
    renderWindow.addRenderer(renderer);
    renderer.setBackground(0.04, 0.05, 0.08);

    const openGLRenderWindow = vtkOpenGLRenderWindow.newInstance();
    renderWindow.addView(openGLRenderWindow);
    openGLRenderWindow.setContainer(container);
    const { width, height } = container.getBoundingClientRect();
    openGLRenderWindow.setSize(width, height);

    const interactor = vtkRenderWindowInteractor.newInstance();
    interactor.setView(openGLRenderWindow);
    interactor.initialize();
    interactor.bindEvents(container);
    interactor.setInteractorStyle(vtkInteractorStyleTrackballCamera.newInstance());

    renderer.removeAllLights();
    const keyLight = vtkLight.newInstance({ color: [1.0, 0.95, 0.9], intensity: 1.2, positional: false });
    keyLight.setPosition(1, 1, 0.5);
    renderer.addLight(keyLight);
    const fillLight = vtkLight.newInstance({ color: [0.7, 0.8, 1.0], intensity: 0.5, positional: false });
    fillLight.setPosition(-1, -1, -0.3);
    renderer.addLight(fillLight);

    const clipPlane = vtkPlane.newInstance();
    clipPlane.setNormal(0, 0, 1);
    clipPlane.setOrigin(0, 0, 0);
    clipPlaneRef.current = clipPlane;

    const picker = vtkCellPicker.newInstance();
    picker.setTolerance(0.005);

    const resizeObserver = new ResizeObserver(() => {
      const { width: w, height: h } = container.getBoundingClientRect();
      openGLRenderWindow.setSize(w, h);
      renderWindow.render();
    });
    resizeObserver.observe(container);

    vtkContext.current = {
      renderWindow, renderer, openGLRenderWindow, interactor,
      picker, resizeObserver, disposed: false,
    };

    renderWindow.render();

    return () => {
      vtkContext.current.disposed = true;
      resizeObserver.disconnect();
      interactor.unbindEvents();
      renderer.getActors().forEach(a => { a.getMapper()?.delete(); a.delete(); });
      renderer.delete();
      openGLRenderWindow.delete();
      renderWindow.delete();
      interactor.delete();
    };
  }, []);

  // ══════════════════════════════════════════════════════════════════════════
  // (b) LOAD — when scanData or useMockData changes
  // ══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!vtkContext.current) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setActiveMarker(null);

      try {
        let lungVolume;
        let effectiveScanData = scanData;

        if (useMockData) {
          const mock = generateMockData();
          lungVolume = mock.lungVolume;
          effectiveScanData = mock.scanData;
        } else {
          // Only load the lung segmentation — pathology rendered as sphere markers
          lungVolume = await loadNrrdFromUrl(scanData.volumes.lung.url);
        }

        if (cancelled || vtkContext.current.disposed) return;

        setResolvedScanData(effectiveScanData);
        buildScene(lungVolume, effectiveScanData);
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
  // Nearest-neighbour volume downsample — shrinks 334³ → 112³ (27× fewer voxels)
  // Preserves world spacing & origin so sphere coordinates stay accurate.
  // ══════════════════════════════════════════════════════════════════════════
  function downsampleVolume(vol, factor) {
    const [dx, dy, dz] = vol.getDimensions();
    const nx = Math.ceil(dx / factor);
    const ny = Math.ceil(dy / factor);
    const nz = Math.ceil(dz / factor);
    const [spx, spy, spz] = vol.getSpacing();
    const [ox, oy, oz]    = vol.getOrigin();

    const src = vol.getPointData().getScalars().getData();
    const dst = new (src.constructor)(nx * ny * nz);

    for (let z = 0; z < nz; z++)
      for (let y = 0; y < ny; y++)
        for (let x = 0; x < nx; x++) {
          const sx = Math.min(x * factor, dx - 1);
          const sy = Math.min(y * factor, dy - 1);
          const sz = Math.min(z * factor, dz - 1);
          dst[z * nx * ny + y * nx + x] = src[sz * dx * dy + sy * dx + sx];
        }

    const out = vtkImageData.newInstance();
    out.setDimensions(nx, ny, nz);
    out.setSpacing(spx * factor, spy * factor, spz * factor);
    out.setOrigin(ox, oy, oz);
    out.getPointData().setScalars(
      vtkDataArray.newInstance({ name: 'Scalars', numberOfComponents: 1, values: dst })
    );
    return out;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Build the 3D scene
  // ══════════════════════════════════════════════════════════════════════════
  function buildScene(lungVolume, effectiveScanData) {
    const { renderer, renderWindow } = vtkContext.current;

    // Clear everything
    renderer.getActors().forEach(a => { a.getMapper()?.delete(); a.delete(); });
    renderer.removeAllActors();
    markerActorsRef.current.clear();
    hoveredIdRef.current = null;

    // ── Lung — translucent blue glass shell (downsampled for GPU performance)
    const lungMC = vtkImageMarchingCubes.newInstance();
    lungMC.setInputData(downsampleVolume(lungVolume, 3));
    lungMC.setContourValue(0.5);
    lungMC.setComputeNormals(true);
    lungMC.setMergePoints(true);

    const lungMapper = vtkMapper.newInstance();
    lungMapper.setInputConnection(lungMC.getOutputPort());

    const lungActor = vtkActor.newInstance();
    lungActor.setMapper(lungMapper);
    const lungProp = lungActor.getProperty();
    lungProp.setOpacity(0.25);
    lungProp.setColor(0.65, 0.82, 0.92);
    lungProp.setSpecular(0.9);
    lungProp.setSpecularPower(60);
    lungProp.setDiffuse(0.3);
    lungProp.setAmbient(0.2);
    lungProp.setBackfaceCulling(false);
    lungActorRef.current = lungActor;
    renderer.addActor(lungActor);

    // ── Sphere markers at each finding ─────────────────────────────────────
    const actorMap = buildMarkers(effectiveScanData?.findings ?? [], renderer);
    markerActorsRef.current = actorMap;

    // ── Clip z-range from lung bounds ──────────────────────────────────────
    const bounds = lungVolume.getBounds();
    setClipRange([bounds[4], bounds[5]]);
    setClipZ(bounds[5]);

    // ── Camera overview ────────────────────────────────────────────────────
    renderer.resetCamera();
    renderer.getActiveCamera().elevation(15);
    renderer.getActiveCamera().azimuth(25);
    renderWindow.render();

    // ── Interaction ────────────────────────────────────────────────────────
    setupInteraction(actorMap);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Build sphere marker actors (top 30 by confidence)
  // ══════════════════════════════════════════════════════════════════════════
  function buildMarkers(findings, renderer) {
    const actorMap = new Map();
    const top30 = [...findings]
      .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
      .slice(0, 30);

    for (const f of top30) {
      if (!f.center_world || f.center_world.length < 3) continue;
      const [cx, cy, cz] = f.center_world;
      const avgSize = f.size_mm
        ? f.size_mm.reduce((s, v) => s + v, 0) / f.size_mm.length
        : 10;
      const radius = Math.max(4, Math.min(avgSize * 0.6, 25));

      const sphere = vtkSphereSource.newInstance();
      sphere.setCenter(cx, cy, cz);
      sphere.setRadius(radius);
      sphere.setPhiResolution(20);
      sphere.setThetaResolution(20);

      const mapper = vtkMapper.newInstance();
      mapper.setInputConnection(sphere.getOutputPort());

      const actor = vtkActor.newInstance();
      actor.setMapper(mapper);
      const rgb = SEVERITY_RGB[f.severity] ?? [0.6, 0.6, 0.6];
      actor.getProperty().setColor(...rgb);
      actor.getProperty().setOpacity(0.85);
      actor.getProperty().setSpecular(0.6);
      actor.getProperty().setSpecularPower(30);

      renderer.addActor(actor);
      actorMap.set(f.id, { actor, sphere, finding: f });
    }
    return actorMap;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Clip plane (lung shell only)
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
  // Sidebar click → fly-to + popup
  // ══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!vtkContext.current || loading) return;
    if (!resolvedScanData) return;

    const { renderer, openGLRenderWindow } = vtkContext.current;

    if (activeFindingId == null) {
      resetCamera(renderer);
      setActiveMarker(null);
      return;
    }

    const finding = resolvedScanData.findings?.find(f => f.id === activeFindingId);
    if (finding) {
      flyTo(renderer, finding.center_world);
      const coord = vtkCoordinate.newInstance();
      coord.setCoordinateSystemToWorld();
      coord.setValue(...finding.center_world);
      const d = coord.getComputedDisplayValue(renderer);
      const sz = openGLRenderWindow.getSize();
      coord.delete();
      setActiveMarker({ finding, screenX: d[0], screenY: sz[1] - d[1] });
    }
  }, [activeFindingId, resolvedScanData, loading]);

  // ══════════════════════════════════════════════════════════════════════════
  // Interaction: left-click → fly + popup; mousemove → scale + cursor
  // ══════════════════════════════════════════════════════════════════════════
  function setupInteraction(actorMap) {
    const { interactor, picker, renderer, openGLRenderWindow } = vtkContext.current;

    interactor.onLeftButtonPress((callData) => {
      const { x, y } = callData.position;
      picker.pick([Math.round(x), Math.round(y), 0], renderer);

      for (const pickedActor of picker.getActors()) {
        for (const [id, entry] of actorMap) {
          if (entry.actor === pickedActor) {
            const f = entry.finding;
            flyTo(renderer, f.center_world);

            const coord = vtkCoordinate.newInstance();
            coord.setCoordinateSystemToWorld();
            coord.setValue(...f.center_world);
            const d = coord.getComputedDisplayValue(renderer);
            const sz = openGLRenderWindow.getSize();
            coord.delete();

            setActiveMarker({ finding: f, screenX: d[0], screenY: sz[1] - d[1] });
            if (onFindingHover) onFindingHover(id);
            return;
          }
        }
      }
      setActiveMarker(null);
    });

    // Track button state so we skip picking during rotation/pan
    let buttonDown = false;
    let lastPickTime = 0;
    interactor.onLeftButtonPress(()   => { buttonDown = true; });
    interactor.onLeftButtonRelease(() => { buttonDown = false; });
    interactor.onRightButtonPress(()   => { buttonDown = true; });
    interactor.onRightButtonRelease(() => { buttonDown = false; });
    interactor.onMiddleButtonPress(()   => { buttonDown = true; });
    interactor.onMiddleButtonRelease(() => { buttonDown = false; });

    interactor.onMouseMove((callData) => {
      if (buttonDown) {
        // During rotation/pan — show grabbing cursor, skip expensive pick
        if (containerRef.current) containerRef.current.style.cursor = 'grabbing';
        return;
      }

      // Throttle idle hover-picking to 80ms
      const now = Date.now();
      if (now - lastPickTime < 80) return;
      lastPickTime = now;

      const { x, y } = callData.position;
      picker.pick([Math.round(x), Math.round(y), 0], renderer);

      let newHoverId = null;
      outer: for (const pickedActor of picker.getActors()) {
        for (const [id, entry] of actorMap) {
          if (entry.actor === pickedActor) { newHoverId = id; break outer; }
        }
      }

      if (newHoverId !== hoveredIdRef.current) {
        if (hoveredIdRef.current) {
          const prev = actorMap.get(hoveredIdRef.current);
          if (prev) prev.actor.setScale(1, 1, 1);
        }
        if (newHoverId) {
          const cur = actorMap.get(newHoverId);
          if (cur) cur.actor.setScale(1.3, 1.3, 1.3);
        }
        hoveredIdRef.current = newHoverId;
        renderer.getRenderWindow().render();
      }

      if (containerRef.current) {
        containerRef.current.style.cursor = newHoverId ? 'pointer' : 'default';
      }
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div ref={containerRef} className={className} style={CONTAINER_STYLE}>

      {/* Loading */}
      {loading && (
        <div style={LOADING_STYLE}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 40, height: 40,
              border: '3px solid rgba(255,255,255,0.2)',
              borderTopColor: '#5ba3d9', borderRadius: '50%',
              margin: '0 auto 12px',
              animation: 'pulmospin 0.8s linear infinite',
            }} />
            <span>Loading lung volumes…</span>
            <style>{`@keyframes pulmospin { to { transform: rotate(360deg); } }`}</style>
          </div>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div style={{ ...LOADING_STYLE, background: 'rgba(60,10,10,0.9)' }}>
          <div style={{ textAlign: 'center', maxWidth: 400 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>⚠</div>
            <div>{error}</div>
          </div>
        </div>
      )}

      {/* Controls */}
      {!loading && !error && (
        <div style={CONTROLS_STYLE}>
          <button
            style={BUTTON_STYLE}
            onClick={() => resetCamera(vtkContext.current?.renderer)}
          >
            ↺ Reset View
          </button>
          <button
            style={{
              ...BUTTON_STYLE,
              background: clipEnabled ? 'rgba(91,163,217,0.3)' : 'rgba(255,255,255,0.08)',
            }}
            onClick={() => setClipEnabled(v => !v)}
          >
            {clipEnabled ? '✂ Clip ON' : '✂ Clip OFF'}
          </button>
          {clipEnabled && (
            <input
              type="range"
              min={clipRange[0]} max={clipRange[1]}
              step={(clipRange[1] - clipRange[0]) / 128}
              value={clipZ}
              onChange={e => setClipZ(Number(e.target.value))}
              style={SLIDER_STYLE}
            />
          )}
        </div>
      )}

      {/* Finding detail popup — appears on sphere click */}
      {activeMarker && !loading && (
        <div style={{
          ...OVERLAY_BASE,
          left: activeMarker.screenX,
          top: activeMarker.screenY,
          transform: 'translate(-50%, -110%)',
          zIndex: 15,
          background: 'rgba(10,14,24,0.93)',
          border: `1px solid ${SEVERITY_HEX[activeMarker.finding.severity] ?? '#334155'}`,
          borderRadius: 8,
          padding: '10px 14px',
          minWidth: 200,
          maxWidth: 280,
          pointerEvents: 'auto',
          backdropFilter: 'blur(8px)',
          boxShadow: `0 0 16px ${SEVERITY_HEX[activeMarker.finding.severity] ?? '#334155'}44`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
            <span style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 13, lineHeight: 1.3 }}>
              {activeMarker.finding.label}
            </span>
            <button
              onClick={() => setActiveMarker(null)}
              style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 18, lineHeight: 1, marginLeft: 8, flexShrink: 0 }}
            >×</button>
          </div>
          <div style={{ fontSize: 11, marginBottom: 5 }}>
            <span style={{ color: SEVERITY_HEX[activeMarker.finding.severity] ?? '#9ca3af' }}>
              ● {activeMarker.finding.severity}
            </span>
            <span style={{ color: '#475569', marginLeft: 8 }}>
              {((activeMarker.finding.confidence ?? 0) * 100).toFixed(0)}% confidence
            </span>
          </div>
          {activeMarker.finding.size_mm && (
            <div style={{ fontSize: 10, color: '#4b5563', marginBottom: 6 }}>
              {activeMarker.finding.size_mm.map(v => v.toFixed(1)).join(' × ')} mm
            </div>
          )}
          <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.5 }}>
            {activeMarker.finding.description}
          </div>
        </div>
      )}

    </div>
  );
}
