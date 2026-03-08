# PulmoScan

> AI-powered lung CT scan analysis with interactive 3D visualization.  
> Built at **HackCanada 2025**.

![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)
![FastAPI](https://img.shields.io/badge/FastAPI-0.110-009688?logo=fastapi)
![PyTorch](https://img.shields.io/badge/PyTorch-2.x-ee4c2c?logo=pytorch)
![VTK.js](https://img.shields.io/badge/VTK.js-30.4-blue)

---

## What It Does

PulmoScan takes a chest CT scan (DICOM series), runs it through a machine-learning pipeline, and produces:

1. **3D lung segmentation** — isolates the lung volume from surrounding tissue  
2. **Pathology detection** — identifies and localises abnormal regions (nodules, ground-glass opacities, consolidations, etc.)  
3. **Interactive 3D viewer** — renders the segmented lung as a translucent volume with **clickable annotation dots** at each finding  
4. **Rich metrics dashboard** — severity score, confidence, affected lobes, finding breakdown  

---

## Project Structure

```
pulmoscan-hackcanada/
├── frontend/          ← Next.js 14 app (TypeScript, Tailwind, Framer Motion)
│   ├── app/           ← App Router pages (landing, scanner, dashboard, etc.)
│   ├── components/    ← React components (Scanner, Dashboard, Canvas3D, …)
│   ├── viewer/        ← VTK.js 3D lung viewer (LungViewer.jsx)
│   ├── lib/           ← 3D math helpers (particles, projection, rotation)
│   └── package.json
│
├── backend/           ← FastAPI server (API layer)
│   ├── server.py      ← /api/analyze, /api/patients, /api/health, /assets/*
│   └── requirements.txt
│
├── ml/                ← ML pipeline (Python)
│   ├── pipeline.py    ← Orchestrator: DICOM → segmentation → pathology → export
│   ├── segmentation.py← Lung segmentation + NRRD export
│   ├── pathology.py   ← Rule-based (Track A) + EfficientNet-B0 GradCAM (Track B)
│   ├── classifier.py  ← Cancer classifier (EfficientNet-B0)
│   ├── dicom_loader.py← DICOM series loading via SimpleITK
│   ├── train.py       ← Model training script
│   ├── checkpoints/   ← Saved model weights (.pth)
│   └── output/        ← Generated NRRDs + scan_result.json
│
└── data/              ← Datasets (not checked in)
    ├── osic/          ← OSIC Pulmonary Fibrosis DICOM series
    └── chest-ctscan-images/  ← Chest CT-Scan Images (PNG, for training)
```

---

## Quick Start

### Prerequisites

- **Node.js** ≥ 18  
- **Python** ≥ 3.10  
- **pip** (or a virtual environment manager)

### 1. Clone

```bash
git clone https://github.com/garvit1910/pulmoscan-hackcanada.git
cd pulmoscan-hackcanada
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev          # → http://localhost:3000
```

### 3. Backend + ML

```bash
# From project root
python -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt

uvicorn backend.server:app --reload --host 0.0.0.0 --port 8000
```

### 4. Data

Download the **OSIC Pulmonary Fibrosis Progression** dataset from [Kaggle](https://www.kaggle.com/c/osic-pulmonary-fibrosis-progression) and place the patient folders under:

```
data/osic/train/ID00007637202177411956430/  ← *.dcm files
```

For classifier training, download the **Chest CT-Scan Images** dataset and place under `data/chest-ctscan-images/`.

---

## How It Works

```
DICOM Series
     │
     ▼
┌──────────┐    ┌──────────────┐    ┌────────────────┐
│  Load &  │───▶│    Lung      │───▶│   Pathology    │
│ Resample │    │ Segmentation │    │   Detection    │
└──────────┘    └──────────────┘    └────────────────┘
                                           │
                      ┌────────────────────┼────────────────────┐
                      ▼                    ▼                    ▼
               ct_volume.nrrd    lung_segmentation.nrrd   pathology_mask.nrrd
                                                          + scan_result.json
                                           │
                                           ▼
                                    ┌─────────────┐
                                    │  VTK.js 3D  │
                                    │   Viewer    │
                                    └─────────────┘
```

| Stage | Detail |
|-------|--------|
| **Segmentation** | Otsu threshold → morphological cleanup → largest connected component extraction |
| **Track A** (rule-based) | Label connected components in `CT × ¬lung_mask`, filter by volume/density, classify by HU statistics |
| **Track B** (deep learning) | EfficientNet-B0 with GradCAM-based localisation, 60 s timeout |
| **3D Viewer** | Marching cubes isosurface, translucent lung glass, coral-pink pathology regions, clickable annotation dots with fly-to camera |

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/analyze` | Run pipeline on a patient (form field `patient_id`) or uploaded DICOM zip |
| `GET`  | `/api/patients` | List available OSIC patient IDs |
| `GET`  | `/api/health` | Health check |
| `GET`  | `/assets/*` | Serve generated NRRD / JSON files |

---

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | Next.js 14, TypeScript, Tailwind CSS, Framer Motion, VTK.js |
| **Backend** | FastAPI, Uvicorn, Python |
| **ML** | PyTorch, SimpleITK, scikit-image, pynrrd, EfficientNet-B0 |
| **Visualization** | VTK.js (marching cubes, vtkCoordinate world→display projection) |

---

## Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| Primary Coral | `#E8506A` | Buttons, accents, severity highlights |
| Dark Base | `#0a0a0a` | Backgrounds |
| Retro Cream | `#F5C6CC` | Text, subtle fills |
| Neon Alert | `#CC2233` | Critical severity |

---

## Team

Built with ❤️ at HackCanada 2025.

## License

MIT
