# Pulmoscan ML Backend

Lung CT analysis pipeline: DICOM series → 3D reconstruction → lung segmentation → pathology detection → NRRD + JSON outputs.

## Setup

```bash
pip install -r ml/requirements.txt
```

## Datasets

### 1. OSIC Pulmonary Fibrosis (DICOM — for the real pipeline)

Download from Kaggle and place at `data/osic/`:
```
data/osic/
    ID00007637202177411956430/
        *.dcm
    ID00009637202177434472278/
        *.dcm
    ...
```

### 2. Chest CT-Scan Images (PNGs — for classifier training)

Download from Kaggle and place at `data/chest-ctscan-images/`:
```
data/chest-ctscan-images/
    train/
        adenocarcinoma/     *.png
        large_cell_carcinoma/
        normal/
        squamous_cell_carcinoma/
    valid/                  (optional — auto 80/20 split if absent)
```

---

## Phase 1 — Mock Data (run this first, unblocks viewer/frontend)

Generates synthetic NRRD files and `scan_result.json` in `ml/output/` without needing any datasets.

```bash
python -m ml.mock_generator
```

Outputs:
- `ml/output/ct_volume.nrrd`
- `ml/output/lung_segmentation.nrrd`
- `ml/output/pathology_mask.nrrd`
- `ml/output/scan_result.json`

---

## Phase 4 — Train Classifier

Requires the chest CT-scan PNG dataset at `data/chest-ctscan-images/`.

```bash
python -m ml.train

# With options:
python -m ml.train --data data/chest-ctscan-images --epochs 20 --lr 1e-4 --batch 32
```

Best checkpoint saved to `ml/checkpoints/best_model.pth`. Training takes ~15 min on GPU, ~2 h on CPU.

---

## Phase 5 — Start API Server

```bash
uvicorn ml.server:app --reload --host 0.0.0.0 --port 8000
```

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `OSIC_DATA_ROOT` | `./data/osic` | Path to OSIC patient folders |
| `OUTPUT_DIR` | `./ml/output` | Where NRRDs/JSON are written |

### Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Status, model loaded, CUDA |
| `GET` | `/api/patients` | List OSIC patients |
| `POST` | `/api/analyze` | Run pipeline (see below) |
| `GET` | `/api/scan-result` | Last generated scan_result.json |
| `GET` | `/assets/*.nrrd` | Static NRRD files |

### POST /api/analyze

**Option A — by patient ID (OSIC):**
```bash
curl -X POST http://localhost:8000/api/analyze \
     -F "patient_id=ID00007637202177411956430"
```

**Option B — upload a DICOM ZIP:**
```bash
curl -X POST http://localhost:8000/api/analyze \
     -F "file=@patient_dicoms.zip"
```

Response: full `scan_result.json` matching the contract schema.

---

## Phase 6 — Tests

```bash
# Unit + integration tests (no datasets needed)
python -m unittest ml.test_pipeline -v

# End-to-end tests on real OSIC patients
OSIC_DATA_ROOT=data/osic RUN_E2E=1 python -m unittest ml.test_pipeline.TestE2E -v
```

---

## Output Contract

All outputs match `contract.schema.json` in the repo root.

### NRRD Headers (critical for VTK.js viewer)

Every NRRD file has:
- `space directions`: diagonal matrix from voxel spacing `[[sx,0,0],[0,sy,0],[0,0,sz]]`
- `space origin`: world coordinates of voxel (0,0,0) in LPS mm
- `encoding`: `gzip`
- `space`: `left-posterior-superior`

### Axis Convention

| Context | Order | Example |
|---|---|---|
| NumPy array | `(Z, Y, X)` | `volume[slice, row, col]` |
| Spacing / origin | `(X, Y, Z)` | used in NRRD headers |
| `center_world` in JSON | `[X, Y, Z]` mm | LPS coordinates |

---

## Module Structure

```
ml/
├── mock_generator.py   # Phase 1 — synthetic data
├── dicom_loader.py     # Phase 2 — DICOM → HU numpy volume
├── segmentation.py     # Phase 3 — lung segmentation + export_nrrd()
├── classifier.py       # Phase 4 — EfficientNet-B0 + GradCAM
├── train.py            # Phase 4 — training loop
├── pathology.py        # Phase 4 — lesion detection (Track A + B)
├── pipeline.py         # Orchestrator wiring phases 2-4
├── server.py           # Phase 5 — FastAPI server
├── test_pipeline.py    # Phase 6 — integration tests
├── exceptions.py       # Typed pipeline exceptions
├── requirements.txt
├── checkpoints/        # Saved model weights (git-ignored)
└── output/             # Generated NRRDs + JSON (git-ignored)
```
