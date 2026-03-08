"""
Pulmoscan Backend — FastAPI Server

Endpoints:
    POST /api/analyze      — run full pipeline; accepts patient_id or DICOM zip upload
    GET  /api/patients     — list available OSIC patients
    GET  /api/health       — health check
    GET  /assets/*         — static NRRD files from ml/output/

Run (from project root):
    uvicorn backend.server:app --reload --host 0.0.0.0 --port 8000

Environment variables:
    OSIC_DATA_ROOT   — path to OSIC patient folders (default: ./data/osic)
    OUTPUT_DIR       — where to write NRRDs/JSON    (default: ml/output)
"""

import asyncio
import functools
import glob
import io
import json
import logging
import os
import shutil
import sys
import tempfile
import zipfile
from contextlib import asynccontextmanager
from typing import Optional

# Ensure the project root is on sys.path so `ml.*` imports work
_PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

import torch
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from ml.classifier import LungCancerClassifier, load_checkpoint
from ml.exceptions import DicomLoadError, PathologyError, PipelineError, SegmentationError
from ml.pathology import DEFAULT_CHECKPOINT
from ml.pipeline import run as run_pipeline

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration from environment
# ---------------------------------------------------------------------------

OSIC_DATA_ROOT = os.environ.get(
    "OSIC_DATA_ROOT",
    os.path.join(_PROJECT_ROOT, "data", "osic", "train"),
)
OUTPUT_DIR = os.environ.get(
    "OUTPUT_DIR",
    os.path.join(_PROJECT_ROOT, "ml", "output"),
)
os.makedirs(OUTPUT_DIR, exist_ok=True)


# ---------------------------------------------------------------------------
# Lifespan: load classifier once at startup
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    app.state.model        = None
    app.state.idx_to_class = None
    app.state.device       = torch.device("mps" if torch.backends.mps.is_available() else "cpu")

    if os.path.exists(DEFAULT_CHECKPOINT):
        try:
            model, idx_to_class = load_checkpoint(DEFAULT_CHECKPOINT, app.state.device)
            app.state.model        = model
            app.state.idx_to_class = idx_to_class
            logger.info("Classifier loaded from %s", DEFAULT_CHECKPOINT)
        except Exception as exc:
            logger.warning("Could not load classifier checkpoint: %s", exc)
    else:
        logger.info("No classifier checkpoint found — Track B disabled")

    yield
    # Shutdown: nothing to clean up


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Pulmoscan ML API",
    version="1.0.0",
    description="Lung CT analysis pipeline: DICOM → segmentation → pathology → NRRD + JSON",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3002", "http://localhost:5173", "http://127.0.0.1:3000", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve generated NRRDs as static files at /assets/
app.mount("/assets", StaticFiles(directory=OUTPUT_DIR), name="assets")


# ---------------------------------------------------------------------------
# Error mapping
# ---------------------------------------------------------------------------

def _pipeline_error_response(exc: Exception, phase: str) -> JSONResponse:
    logger.exception("Pipeline error in phase=%s: %s", phase, exc)
    return JSONResponse(
        status_code=500,
        content={"error": str(exc), "phase": phase},
    )


# ---------------------------------------------------------------------------
# GET /api/health
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health():
    """Health check — returns model load status and GPU availability."""
    return {
        "status":         "ok",
        "model_loaded":   app.state.model is not None,
        "mps_available":  torch.backends.mps.is_available(),
        "output_dir":     OUTPUT_DIR,
        "osic_root":      OSIC_DATA_ROOT,
    }


# ---------------------------------------------------------------------------
# GET /api/patients
# ---------------------------------------------------------------------------

@app.get("/api/patients")
def list_patients():
    """List available OSIC patient directories."""
    if not os.path.isdir(OSIC_DATA_ROOT):
        return {"patients": [], "message": f"OSIC_DATA_ROOT not found: {OSIC_DATA_ROOT}"}

    patients = []
    for entry in sorted(os.scandir(OSIC_DATA_ROOT), key=lambda e: e.name):
        if not entry.is_dir():
            continue
        dcm_count = len(glob.glob(entry.path + "/**/*.dcm", recursive=True))
        dcm_count += len(glob.glob(entry.path + "/*.dcm"))
        if dcm_count > 0:
            patients.append({"patient_id": entry.name, "slice_count": dcm_count})

    return {"patients": patients, "count": len(patients)}


# ---------------------------------------------------------------------------
# POST /api/analyze
# ---------------------------------------------------------------------------

@app.post("/api/analyze")
async def analyze(
    patient_id: Optional[str]        = Form(None),
    file:       Optional[UploadFile] = File(None),
):
    """
    Run the full analysis pipeline.

    Accepts one of:
      - patient_id (Form field): looks up OSIC patient folder by ID
      - file (multipart upload): a ZIP of DICOM files

    Returns the scan_result JSON matching the contract schema.
    """
    if patient_id is None and file is None:
        raise HTTPException(
            status_code=422,
            detail="Provide either 'patient_id' (form field) or 'file' (DICOM zip upload).",
        )

    tmp_dir = None
    try:
        # --- Resolve patient directory ---
        if file is not None:
            # Unzip uploaded DICOM archive into a temp directory
            tmp_dir = tempfile.mkdtemp(prefix="pulmoscan_")
            contents = await file.read()
            try:
                with zipfile.ZipFile(io.BytesIO(contents)) as zf:
                    zf.extractall(tmp_dir)
            except zipfile.BadZipFile:
                raise HTTPException(status_code=400, detail="Uploaded file is not a valid ZIP archive.")
            patient_dir = tmp_dir
            logger.info("Extracted DICOM zip to: %s", tmp_dir)

        else:
            # Look up patient by ID in OSIC root
            patient_dir = os.path.join(OSIC_DATA_ROOT, patient_id)
            # Some OSIC layouts have one extra sub-folder layer
            if not os.path.isdir(patient_dir):
                # Try scanning OSIC_DATA_ROOT recursively for a matching folder name
                matches = glob.glob(f"{OSIC_DATA_ROOT}/**/{patient_id}", recursive=True)
                if not matches:
                    raise HTTPException(
                        status_code=404,
                        detail=f"Patient '{patient_id}' not found under {OSIC_DATA_ROOT}",
                    )
                patient_dir = matches[0]
            logger.info("Analyzing OSIC patient: %s → %s", patient_id, patient_dir)

        # --- Run pipeline (in thread pool to avoid blocking the event loop) ---
        try:
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None,
                functools.partial(
                    run_pipeline,
                    patient_dir=patient_dir,
                    output_dir=OUTPUT_DIR,
                    checkpoint_path=DEFAULT_CHECKPOINT,
                ),
            )
        except DicomLoadError as exc:
            return _pipeline_error_response(exc, "dicom_load")
        except SegmentationError as exc:
            return _pipeline_error_response(exc, "segmentation")
        except PathologyError as exc:
            return _pipeline_error_response(exc, "pathology")
        except PipelineError as exc:
            return _pipeline_error_response(exc, "pipeline")

        return JSONResponse(content=result)

    finally:
        if tmp_dir and os.path.isdir(tmp_dir):
            shutil.rmtree(tmp_dir, ignore_errors=True)


# ---------------------------------------------------------------------------
# GET /api/scan-result  (convenience: return last written scan_result.json)
# ---------------------------------------------------------------------------

@app.get("/api/scan-result")
def get_last_scan_result():
    """Return the most recently generated scan_result.json."""
    path = os.path.join(OUTPUT_DIR, "scan_result.json")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="No scan result available. Run /api/analyze first.")
    with open(path) as f:
        return JSONResponse(content=json.load(f))
