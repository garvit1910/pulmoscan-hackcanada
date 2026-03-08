# PulmoScan — Integration Status for Handoff

> Last updated during a Claude Code session integrating three independently-built branches.
> **Next engineer**: read this fully before touching any code.

---

## 1. What This Project Is

PulmoScan is a full-stack lung CT scan analysis tool for a hackathon. It has three parts:

| Part | Tech | Purpose |
|------|------|---------|
| **Frontend** | Next.js 14 (App Router), TypeScript, Tailwind, Framer Motion | Scanner UI, Dashboard, Landing page |
| **Backend** | Python FastAPI, PyTorch, SimpleITK, pynrrd | DICOM loading → segmentation → pathology detection → NRRD output |
| **3D Viewer** | VTK.js (v30.4.1), React | Real-time 3D lung + finding spheres |

All three were built on separate git branches (`frontend`, `backend`, `3dlung`) and have now been merged into `main`.

---

## 2. Project Directory Structure (after merge)

```
pulmoscan-hackcanada/           ← repo root = Next.js project root
├── app/                        ← Next.js App Router pages
│   ├── page.tsx                   Landing page (3D alveolar animation)
│   ├── scanner/page.tsx           CT scan analysis page
│   ├── scanner/visualize/page.tsx  3D viewer page  ← KEY PAGE
│   ├── dashboard/page.tsx         Breathing pattern dashboard
│   ├── learn-more/page.tsx
│   └── citations/page.tsx
├── components/
│   ├── Scanner/
│   │   ├── useScannerState.ts     ← ALL API calls live here
│   │   ├── ScannerResults.tsx     ← Results display + "Visualize in 3D" button
│   │   ├── PatientPicker.tsx      ← Patient list + file upload tab
│   │   ├── LungViewer.tsx         ← Status placeholder (NOT the 3D viewer)
│   │   ├── AnalyzeButton.tsx
│   │   └── ScannerLayout.tsx
│   └── Dashboard/
│       ├── useDashboardState.ts
│       └── DashboardLayout.tsx
├── viewer/                     ← VTK.js 3D viewer (from backend/3dlung branch)
│   ├── LungViewer.jsx             ← The REAL 3D viewer component
│   ├── utils/
│   │   ├── nrrdLoader.js          Pure-JS NRRD parser (no WASM)
│   │   ├── cameraAnimation.js     flyTo() and resetCamera()
│   │   └── generateMockVolumes.js Mock data for testing
│   ├── index.js                   Exports LungViewer
│   └── package.json               Lists @kitware/vtk.js ^30.4.1 as dep
├── ml/                         ← Python FastAPI backend (from backend branch)
│   ├── server.py                  FastAPI app — run this!
│   ├── pipeline.py                Full analysis pipeline
│   ├── segmentation.py            Lung segmentation (SimpleITK/TotalSegmentator)
│   ├── pathology.py               Nodule/finding detection
│   ├── classifier.py              LungCancerClassifier (PyTorch ResNet)
│   ├── dicom_loader.py
│   ├── exceptions.py
│   ├── requirements.txt
│   ├── output/                    Where NRRDs and scan_result.json are written
│   └── checkpoints/best_model.pth Trained model weights
├── data/                       ← OSIC DICOM patient folders (local, not committed)
│   └── osic/train/
│       └── ID00007637202177411956430/   ← example patient folder
├── demo/                       ← OLD Vite demo app (ignore — superseded by Next.js)
├── next.config.mjs
├── package.json                ← Root Next.js project deps (includes @kitware/vtk.js)
├── tailwind.config.ts
└── tsconfig.json
```

---

## 3. How to Run

### Backend (Terminal 1)
```bash
cd /Users/garvit/pulmoscan-hackcanada
# Activate your venv if you have one
source .venv/bin/activate   # or conda activate ...

uvicorn ml.server:app --reload --host 0.0.0.0 --port 8000
```
Backend will be at `http://localhost:8000`. Check `http://localhost:8000/api/health`.

### Frontend (Terminal 2)
```bash
cd /Users/garvit/pulmoscan-hackcanada
npm run dev
```
Frontend at `http://localhost:3000`. Navigate to `/scanner`.

---

## 4. Integration Phases — What Has Been Done

### ✅ Phase 1 — Audit (complete, no code changes)
Audited all three branches for:
- API contract mismatches between backend `scan_result` shape and frontend `AnalysisResult` interface
- All mock data locations
- VTK.js integration risks with Next.js

### ✅ Phase 2 — API Wiring (complete)

**Files modified:**

**`components/Scanner/useScannerState.ts`**
- Added `ScanFinding`, `ScanResult` TypeScript interfaces matching the real backend response
- `AnalysisResult` interface updated: removed `fvc_prediction` and `details`, added `scan_result: ScanResult`
- Removed the 25-second `AbortController` timeout (pipeline takes 2–5+ minutes)
- Removed mock fallback block (no more fake data after API error)
- Removed demo patients seeding on error (now shows error message instead)
- Fixed response mapping:
  - `prediction` ← `scan_result.summary` (narrative string from backend)
  - `confidence` ← `findings[0].confidence` (highest-confidence finding, sorted descending)
  - `severity` ← most severe finding's severity (critical > high > moderate > low)
  - `scan_result` ← full raw response (passed to viewer)

**`components/Scanner/ScannerResults.tsx`**
- Removed FVC prediction card (field doesn't exist in backend)
- Before routing to `/scanner/visualize`, writes full `scan_result` to `sessionStorage` key `'scan_result'`
- Raw JSON section now shows `scan_result` object, not old `details`

**`components/Dashboard/useDashboardState.ts`**
- Removed 3-second mock setTimeout
- Now shows error "Breathing pattern analysis is not yet connected to a backend endpoint."

**`components/Dashboard/DashboardLayout.tsx`**
- Removed 5 hardcoded activity log entries → shows "No recent activity"

### ⚠️ Phase 3 — 3D Viewer Integration (PARTIALLY COMPLETE — has active issues)

**What was done:**
- `@kitware/vtk.js` installed in root `package.json`
- `next.config.mjs` updated with:
  - `transpilePackages: ['@kitware/vtk.js']` — needed for VTK.js ES modules to work in webpack
  - `/assets/:path*` → `http://localhost:8000/assets/:path*` rewrite — proxies NRRD file requests to backend
- `app/scanner/visualize/page.tsx` rewritten:
  - Reads `scan_result` from `sessionStorage` on mount
  - Dynamically imports `viewer/LungViewer.jsx` with `{ ssr: false }` to prevent SSR crash
  - Passes `scanData={scanResult}` to LungViewer
  - Shows "No scan data — run an analysis first." if sessionStorage is empty

**Active issues in Phase 3:**

#### Issue A — "Loading stuck at 90%" (analyze never completes)
The scanner page shows a loading bar that gets to ~90% but analysis never returns. This is because **the ML pipeline takes 2–5 minutes** for real CT scans, and there are potential backend issues:
- Check if the backend server is running and healthy: `curl http://localhost:8000/api/health`
- Check if the OSIC data root is correct: `echo $OSIC_DATA_ROOT` (should point to `data/osic/train/`)
- The pipeline may error on patients without a trained model checkpoint at `ml/checkpoints/best_model.pth`
- Errors from the backend now surface in the frontend (no mock fallback), check browser console

#### Issue B — `finding.label` is undefined in popup
`viewer/LungViewer.jsx` line ~552 references `activeMarker.finding.label` — but the backend field is `type`, not `label`. Fix:
```js
// LungViewer.jsx popup:
{activeMarker.finding.type}   // ← was: finding.label
```

#### Issue C — `size_mm` treated as array in popup
`viewer/LungViewer.jsx` line ~569 does `f.size_mm.map(v => ...)` — but the backend returns `size_mm` as a **scalar float**, not an array. Fix:
```js
// LungViewer.jsx popup:
{activeMarker.finding.size_mm?.toFixed(1)} mm
// ← was: finding.size_mm.map(v => v.toFixed(1)).join(' × ')
```

#### Issue D — File upload doesn't send the file to backend
`useScannerState.ts` sends `{ patient_id: ... }` as JSON. The file upload tab collects a File object but never sends it. The backend `/api/analyze` accepts `multipart/form-data` with a `file` field. Fix requires changing the fetch to use `FormData`.

---

## 5. What File to Upload?

The backend's `/api/analyze` endpoint supports two modes:

**Mode 1 — Select from OSIC patient list (recommended for testing)**
- The patient picker shows OSIC patient IDs loaded from `data/osic/train/`
- Select a patient ID → click Analyze Scan
- No file upload needed

**Mode 2 — Upload a DICOM ZIP**
The file upload placeholder in the UI (`PatientPicker.tsx`) accepts:
- `.zip` — **a ZIP archive containing DICOM slices** (`.dcm` files) for ONE patient
- The ZIP should contain all CT slices for a single patient in one flat folder
- Example: `zip patient.zip /path/to/patient/*.dcm`
- Do NOT upload individual `.dcm` files, `.nii`, `.png`, or `.jpg` in the upload tab — the backend pipeline specifically handles DICOM ZIPs for the file upload path
- For `.nii` or NRRD files, a separate pipeline path would be needed (not currently implemented)

**Note**: The file upload currently has **Issue D** above — it doesn't actually send the file to the backend. Fix that first before testing file upload.

---

## 6. Backend API Contract

### `GET /api/health`
```json
{ "status": "ok", "model_loaded": true, "mps_available": true, "output_dir": "...", "osic_root": "..." }
```

### `GET /api/patients`
```json
{ "patients": [{ "patient_id": "ID00007...", "slice_count": 174, "subset": "train" }] }
```
Frontend handles both `data` (array) or `data.patients` (wrapped).

### `POST /api/analyze`
Request:
```json
{ "patient_id": "ID00007637202177411956430" }
```
Response (the full `scan_result`):
```json
{
  "scan_id": "uuid-string",
  "patient": { "id": "...", "age": null, "sex": null },
  "scan_metadata": { "modality": "CT", "slice_count": 174, "voxel_spacing": [1,1,1] },
  "volumes": {
    "lung":           { "url": "/assets/lung_segmentation.nrrd", "format": "nrrd" },
    "pathology_mask": { "url": "/assets/pathology_mask.nrrd",    "format": "nrrd" },
    "original_ct":   { "url": "/assets/ct_volume.nrrd",         "format": "nrrd" }
  },
  "findings": [
    {
      "id": "uuid", "type": "nodule", "severity": "high",
      "confidence": 0.87, "center_world": [x, y, z],
      "size_mm": 8.2, "description": "Spiculated nodule..."
    }
  ],
  "summary": "CT scan of patient ID00007... 3 finding(s) detected: 2 high, 1 moderate..."
}
```
NRRDs are served at `http://localhost:8000/assets/lung_segmentation.nrrd` etc. and proxied through Next.js at `/assets/...`.

---

## 7. Remaining Work

### Phase 3 (Fixes needed before Phase 4)
| # | File | Fix |
|---|------|-----|
| A | Debug backend | Ensure pipeline completes — check health endpoint, model checkpoint, OSIC data path |
| B | `viewer/LungViewer.jsx:552` | `finding.label` → `finding.type` |
| C | `viewer/LungViewer.jsx:569` | `size_mm.map(...)` → `size_mm?.toFixed(1) + ' mm'` |
| D | `components/Scanner/useScannerState.ts` | File upload: change JSON body → `FormData` when `uploadedFile` is set |

### Phase 4 — Bidirectional Sidebar ↔ Viewer
**File to modify: `app/scanner/visualize/page.tsx` only**

Current state: The visualize page shows the full LungViewer but no findings sidebar. LungViewer already accepts `activeFindingId` and `onFindingHover` props.

Implementation:
1. Read `scanResult.findings` from sessionStorage (already reading `scanResult`)
2. Add state: `const [activeFindingId, setActiveFindingId] = useState<string|null>(null)`
3. Add a fixed right-side panel (280px wide) listing top 30 findings:
   - Sort by confidence descending
   - Each row: severity colour dot + `finding.type` + `(confidence * 100).toFixed(0)%`
   - Clicking a row: `setActiveFindingId(finding.id)`
   - Active row: highlighted background
4. Pass to viewer: `<LungViewer scanData={scanResult} activeFindingId={activeFindingId} onFindingHover={setActiveFindingId} />`
5. Shrink viewer area to accommodate sidebar: e.g., right: 280px instead of right: 0

Severity colours (use inline style):
```
critical: #9b30ff
high:     #f97316
moderate: #f5a623
low:      #22c55e
```

### Phase 5 — E2E Cleanup
1. Run both servers: backend on :8000, frontend on :3000
2. Full flow: select patient → Analyze → wait → see scan_result → Visualize → 3D lung + sphere markers + sidebar
3. Click sidebar row → viewer flies to that finding
4. Click sphere in viewer → sidebar highlights matching row
5. Test file upload (after fixing Issue D)

---

## 8. Known Technical Risks

| Risk | Detail |
|------|--------|
| VTK.js version | Root has v35.3.1, viewer was written for v30.4.1. `viewer/node_modules/` may have v30. If APIs differ, viewer will crash — check browser console |
| Pipeline runtime | Real CT analysis takes 2–5+ minutes. Frontend shows progress messages but has no progress updates from backend |
| MPS GPU (M4 Mac) | Backend uses `torch.backends.mps.is_available()` for Apple Silicon. Segmentation uses SimpleITK/TotalSegmentator which may not use MPS |
| No `'use client'` in LungViewer | `viewer/LungViewer.jsx` lacks `'use client'` directive. Add it as line 1 if SSR-related errors appear |
| NRRD asset path | Backend writes to `ml/output/`. Server mounts this at `/assets/`. Next.js proxies `/assets/*` to `localhost:8000/assets/*`. All three must be consistent |

---

## 9. Key Configuration

### `next.config.mjs`
```js
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@kitware/vtk.js'],
  async rewrites() {
    return [
      { source: '/assets/:path*', destination: 'http://localhost:8000/assets/:path*' }
    ]
  },
}
```

### Backend env vars
```bash
OSIC_DATA_ROOT=/Users/garvit/pulmoscan-hackcanada/data/osic/train
OUTPUT_DIR=/Users/garvit/pulmoscan-hackcanada/ml/output
```

### Start backend command
```bash
OSIC_DATA_ROOT=/Users/garvit/pulmoscan-hackcanada/data/osic/train \
uvicorn ml.server:app --reload --port 8000
```

---

## 10. Files That Must NOT Be Changed

These files are design-locked (no styling changes):
- `app/globals.css` — all colour tokens and custom utilities
- `tailwind.config.ts` — design system
- `components/Canvas3D/*` — 3D background animations
- `app/page.tsx` — landing page layout
- `components/Scanner/ScannerLayout.tsx` — scanner layout structure
