# PulmoScan 3D Viewer — Progress Report

**Author:** 3D Visualization Engineer (viewer/)
**Component:** `LungViewer` — browser-side interactive 3D lung renderer
**Stack:** React 18, VTK.js 30.x, @itk-wasm/image-io 1.5.x
**Status:** All 6 phases complete. Fully functional in mock mode (`useMockData=true`). Ready for real NRRD integration the moment your backend serves files.

---

## What Has Been Built

### Phase 1 — Mock Volume Generator (`viewer/utils/generateMockVolumes.js`)
A fully self-contained synthetic data generator that produces real `vtkImageData` volumes in JavaScript — no backend needed. Used for development and testing until Person A's pipeline is ready.

Generates:
- **Lung segmentation volume**: two ellipsoids (left lung = label 1, right lung = label 2) in a 64×64×64 grid
- **Pathology mask volume**: two spherical nodules (labels 1, 2) placed inside the lung ellipsoids
- **Mock scanData JSON**: a complete contract object with two findings, world-space coordinates, severity levels

Mock geometry constants (must match your `mock_generator.py` if you have one):
```
Dimensions : [64, 64, 64]
Spacing    : [0.7, 0.7, 1.5]  mm/voxel
Origin     : [0, 0, 0]        mm
Right lung : ellipsoid centre (22, 32, 32), semi-axes (14, 10, 18)
Left lung  : ellipsoid centre (42, 32, 32), semi-axes (13,  9, 17)
Nodule A   : sphere centre (22, 30, 34), radius 4 voxels  → world [15.4, 21.0, 51.0] mm
Nodule B   : sphere centre (44, 34, 30), radius 2 voxels  → world [30.8, 23.8, 45.0] mm
```

---

### Phase 2 — NRRD Loader (`viewer/utils/nrrdLoader.js`)
Fetches your NRRD files over HTTP and decodes them using `@itk-wasm/image-io` (WebAssembly NRRD reader running in the browser). Converts the decoded image into a `vtkImageData` object that the VTK rendering pipeline consumes.

Key behaviour:
- Reads `itkImage.size` → sets VTK dimensions
- Reads `itkImage.spacing` → sets VTK spacing (**critical for correct real-world scale**)
- Reads `itkImage.origin` → sets VTK origin (**critical for correct world position**)
- Reads `itkImage.direction` → sets VTK direction cosines (handles oblique acquisitions)
- Auto-detects scalar type from `itkImage.imageType.componentType` → maps to correct TypedArray (`Int32Array`, `Float32Array`, etc.)

---

### Phase 3 — Rendering Pipeline (`viewer/LungViewer.jsx`)
Two separate Marching Cubes pipelines extract surfaces from your label maps:

| Surface | Input | Contour value | Visual style |
|---------|-------|---------------|-------------|
| Lung shell | `lung_segmentation.nrrd` | **0.5** | Translucent "holographic glass" — opacity 0.18, ice-blue |
| Pathology | `pathology_mask.nrrd` | **0.5** | Opaque "lava" — red→amber, pulsing glow animation |

Lighting: warm key light (top-right) + cool fill light (bottom-left).

---

### Phase 4 — Cross-Section Tool + Camera FlyTo (`viewer/utils/cameraAnimation.js`)
- Slider clips the lung surface along the Z axis (clipping plane on lung mapper only — pathology markers stay visible when you cut through the lung)
- `flyTo(renderer, worldCoord)`: smooth 1-second camera animation to any world coordinate
- `resetCamera(renderer)`: animated return to overview

---

### Phase 5 — Hover Detection + Annotation Labels
- `vtkCellPicker` on mouse-move detects which pathology marker the user is hovering
- Closest finding to the picked world point is identified and reported via the `onFindingHover` callback
- Each finding renders an HTML badge label positioned in screen space using `vtkCoordinate` world→display projection, updated every frame as the camera moves

---

### Phase 6 — Component Assembly + Cleanup
Single React component `<LungViewer />` with full lifecycle management: VTK objects created on mount, properly disposed on unmount (no GPU memory leaks), animation frames cancelled, ResizeObserver disconnected.

---

## What You (Person A) Must Provide

### 1. Three NRRD Files

Serve these at stable URLs your JSON contract references:

#### `lung_segmentation.nrrd` — **Required**
```
Type      : int32 (or uint8/int16 — any integer label map works)
Values    : 0 = background, 1 = left lung, 2 = right lung
Headers   : MUST include correct "space directions" and "space origin"
            (i.e. preserve the original CT voxel spacing and world origin)
```

> **Why spacing matters:** We run Marching Cubes at contour value 0.5. If spacing is wrong (e.g. all 1.0 instead of [0.7, 0.7, 1.5]), the lung mesh will be squashed or stretched. The viewer reads spacing directly from the NRRD header — do not strip it.

#### `pathology_mask.nrrd` — **Required**
```
Type      : int32 (or uint8/int16)
Values    : 0 = background, 1 = first finding, 2 = second finding, etc.
            Each non-zero integer = one distinct pathology region
Headers   : MUST match the same spacing and origin as lung_segmentation.nrrd
            (they must be in the same coordinate space)
```

#### `ct_volume.nrrd` — **Optional** (viewer loads it but does not render it yet)
```
Type      : float32, Hounsfield Units
Values    : typical CT range, e.g. -1000 to +3000 HU
Headers   : same spacing + origin as above
```
If you don't have this yet, omit the `original_ct` key from the JSON — the viewer handles `null` gracefully.

---

### 2. The JSON Contract (scanData)

Your FastAPI endpoint must return a JSON object matching this shape. Every field the viewer actively uses is marked **[REQUIRED]**.

```jsonc
{
  "scan_id": "uuid-string",          // any unique identifier

  "patient": {                       // optional — not rendered
    "id": "patient-123",
    "age": 65,
    "sex": "M"
  },

  "scan_metadata": {                 // optional — not rendered
    "modality": "CT",
    "slice_count": 512,
    "voxel_spacing": [0.7, 0.7, 1.5]
  },

  "volumes": {                       // [REQUIRED]
    "lung": {
      "url": "/assets/lung_segmentation.nrrd",   // [REQUIRED] HTTP URL the browser can fetch
      "format": "nrrd"
    },
    "pathology_mask": {
      "url": "/assets/pathology_mask.nrrd",       // [REQUIRED]
      "format": "nrrd"
    },
    "original_ct": {                              // optional — omit if not ready
      "url": "/assets/ct_volume.nrrd",
      "format": "nrrd"
    }
  },

  "findings": [                      // [REQUIRED] — array, may be empty []
    {
      "id": "path-001",              // [REQUIRED] unique string — used for camera flyTo and hover callbacks
      "type": "nodule",             // optional — not rendered
      "label": "Pulmonary Nodule",   // [REQUIRED] shown in annotation badge
      "lobe": "right_upper",         // optional
      "confidence": 0.94,            // optional
      "size_mm": [12, 8, 10],        // optional
      "center_ijk": [128, 200, 85],  // optional — for your reference
      "center_world": [45.2, -30.1, 120.5],  // [REQUIRED] world-space mm coordinates
                                              // MUST be: center_ijk * spacing + origin
                                              // MUST be in the same space as the NRRD origin
      "severity": "moderate",        // [REQUIRED] one of: "low", "medium", "high"
                                     // controls annotation badge colour (green/amber/red)
      "description": "12mm solid nodule, right upper lobe."  // optional
    }
  ],

  "summary": "..."                   // optional — not rendered by viewer
}
```

#### `center_world` — the most important field

The camera `flyTo` animation and hover detection both depend entirely on `center_world`. It must be computed as:

```python
center_world = [
    center_ijk[0] * spacing[0] + origin[0],
    center_ijk[1] * spacing[1] + origin[1],
    center_ijk[2] * spacing[2] + origin[2],
]
```

Where `spacing` and `origin` are the values stored in the NRRD header. If this is wrong, the camera will fly to the wrong location and hover detection will misidentify findings.

---

### 3. CORS Headers

The browser fetches your NRRD files directly using `fetch()`. If your FastAPI server runs on a different port or domain than the frontend (e.g. backend on `:8000`, frontend on `:3000`), you **must** add CORS headers to your NRRD file responses:

```python
# FastAPI example
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # or ["*"] during development
    allow_methods=["GET"],
    allow_headers=["*"],
)
```

Without this the browser will silently block the fetch and the viewer will show an error overlay.

---

## What The Viewer Outputs (to Person C / Frontend)

The viewer is a single React component with this exact interface:

```jsx
<LungViewer
  scanData={contractJSON}           // the JSON object above
  activeFindingId={string | null}   // set to a finding id to fly camera there; null to reset
  onFindingHover={(id | null) => void}  // called when user hovers a pathology marker in 3D
  useMockData={boolean}             // true = ignore scanData, use synthetic mock volumes
  className={string}               // CSS class applied to the container div
/>
```

### Events emitted:

| Callback | When | Value |
|----------|------|-------|
| `onFindingHover(id)` | User moves mouse over a pathology marker in 3D | `string` — the `finding.id` of the closest finding |
| `onFindingHover(null)` | Mouse leaves the pathology surface | `null` |

Person C uses these to highlight the corresponding sidebar card.

### Reacts to:

| Prop change | Viewer response |
|-------------|----------------|
| `activeFindingId` set to a finding id | Camera smoothly flies (1 second, smooth-step easing) to `finding.center_world` and zooms in |
| `activeFindingId` set to `null` | Camera smoothly resets to full lung overview |
| `scanData` changes | Reloads all three NRRD volumes, rebuilds the scene |
| `useMockData` toggles | Switches between real and synthetic data |

---

## How To Test Your Integration Without Person C

You can test your NRRD files directly by mounting the component with a temporary host page:

```jsx
// TestPage.jsx (temporary, not committed)
import { LungViewer } from '@pulmoscan/viewer';  // or relative path: '../viewer'

const SCAN_DATA = {
  volumes: {
    lung:            { url: 'http://localhost:8000/assets/lung_segmentation.nrrd', format: 'nrrd' },
    pathology_mask:  { url: 'http://localhost:8000/assets/pathology_mask.nrrd',    format: 'nrrd' },
  },
  findings: [
    {
      id: 'f1',
      label: 'Test Nodule',
      severity: 'high',
      center_world: [45.2, -30.1, 120.5],  // replace with your actual computed value
    }
  ],
};

export default function TestPage() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <LungViewer
        scanData={SCAN_DATA}
        useMockData={false}
        onFindingHover={id => console.log('Hovered:', id)}
      />
    </div>
  );
}
```

**Expected result when working correctly:**
- Dark background, translucent ice-blue lung shell rendered from your NRRD
- Red pulsing nodule markers at each pathology location
- Floating annotation badges ("Test Nodule" with red dot)
- Drag to rotate, scroll to zoom
- Clip slider (bottom-left) cuts through the lung
- Hovering a nodule logs its id to console

**If you see the error overlay:** open browser DevTools → Console. The error message will tell you exactly which NRRD URL failed, the HTTP status, or the CORS issue.

---

## File Summary

```
viewer/
├── LungViewer.jsx              ← Main React component (the one Person C imports)
├── index.js                    ← export { default as LungViewer } from './LungViewer'
├── package.json                ← @kitware/vtk.js ^30.4.1, @itk-wasm/image-io ^1.5.0
└── utils/
    ├── generateMockVolumes.js  ← Synthetic data (no backend needed)
    ├── nrrdLoader.js           ← Fetches + decodes your NRRD files
    └── cameraAnimation.js      ← flyTo / resetCamera animations
```
