"""
Pipeline Orchestrator

Wires DICOM load → segmentation → pathology detection → JSON contract output.
Called by server.py; can also be run standalone for testing.

Usage:
    from ml.pipeline import run
    result = run(patient_dir="/data/osic/ID00007...", output_dir="ml/output")
"""

import json
import logging
import os
import uuid
from typing import Optional

import numpy as np

from ml.dicom_loader import load_patient
from ml.exceptions import PipelineError
from ml.pathology import detect_pathology, DEFAULT_CHECKPOINT
from ml.segmentation import export_nrrd, segment_lungs

logger = logging.getLogger(__name__)

DEFAULT_OUTPUT_DIR  = os.path.join(os.path.dirname(__file__), "output")
TARGET_SPACING      = [1.0, 1.0, 1.0]   # isotropic mm — segment + pathology work in this space


# ---------------------------------------------------------------------------
# JSON contract builder
# ---------------------------------------------------------------------------

def _build_scan_result(
    scan_id:  str,
    metadata: dict,
    findings: list,
) -> dict:
    return {
        "scan_id": scan_id,
        "patient": {
            "id":  metadata["patient_id"],
            "age": metadata["age"],
            "sex": metadata["sex"],
        },
        "scan_metadata": {
            "modality":     metadata["modality"],
            "slice_count":  metadata["slice_count"],
            "voxel_spacing": metadata["voxel_spacing"],
        },
        "volumes": {
            "lung": {
                "url":       "/assets/lung_segmentation.nrrd",
                "format":    "nrrd",
                "label_map": {"1": "left_lung", "2": "right_lung"},
            },
            "pathology_mask": {
                "url":    "/assets/pathology_mask.nrrd",
                "format": "nrrd",
            },
            "original_ct": {
                "url":    "/assets/ct_volume.nrrd",
                "format": "nrrd",
            },
        },
        "findings": findings,
        "summary": _summarise(findings, metadata),
    }


def _summarise(findings: list, metadata: dict) -> str:
    if not findings:
        return (
            f"CT scan of patient {metadata['patient_id']} reviewed. "
            "No significant pulmonary findings detected."
        )
    severity_counts = {}
    for f in findings:
        severity_counts[f["severity"]] = severity_counts.get(f["severity"], 0) + 1

    parts = [f"{v} {k}" for k, v in severity_counts.items()]
    types = list({f["type"] for f in findings})
    return (
        f"CT scan of patient {metadata['patient_id']}. "
        f"{len(findings)} finding(s) detected: {', '.join(parts)}. "
        f"Finding types: {', '.join(t.replace('_', ' ') for t in types)}. "
        "Clinical correlation recommended."
    )


# ---------------------------------------------------------------------------
# Main pipeline entry point
# ---------------------------------------------------------------------------

def run(
    patient_dir:     str,
    output_dir:      str = DEFAULT_OUTPUT_DIR,
    scan_id:         Optional[str] = None,
    checkpoint_path: str = DEFAULT_CHECKPOINT,
    resample:        bool = True,
) -> dict:
    """
    Run the full analysis pipeline for one patient.

    Args:
        patient_dir:     path to folder containing .dcm files
        output_dir:      where to write ct_volume.nrrd, lung_segmentation.nrrd,
                         pathology_mask.nrrd, scan_result.json
        scan_id:         UUID string; auto-generated if None
        checkpoint_path: path to classifier .pth checkpoint
        resample:        if True, resample to 1mm isotropic before processing

    Returns:
        scan_result dict matching the contract schema

    Raises:
        DicomLoadError, SegmentationError, PathologyError, PipelineError
    """
    if scan_id is None:
        scan_id = str(uuid.uuid4())

    os.makedirs(output_dir, exist_ok=True)
    logger.info("Pipeline start: patient_dir=%s  scan_id=%s", patient_dir, scan_id)

    # --- Phase 2: Load DICOM ---
    logger.info("[1/4] Loading DICOM series...")
    volume_hu, metadata = load_patient(
        patient_dir,
        resample_to=TARGET_SPACING if resample else None,
    )
    spacing_xyz = metadata["voxel_spacing"]   # [x, y, z]
    origin_xyz  = metadata["origin"]          # [x, y, z]

    # --- Phase 3: Lung segmentation ---
    logger.info("[2/4] Segmenting lungs...")
    lung_labels = segment_lungs(volume_hu)

    # --- Phase 4: Pathology detection ---
    logger.info("[3/4] Detecting pathology...")
    path_labels, findings = detect_pathology(
        volume_hu,
        lung_labels,
        spacing_xyz,
        origin_xyz,
        output_nrrd=os.path.join(output_dir, "pathology_mask.nrrd"),
        checkpoint_path=checkpoint_path,
    )

    # --- Export NRRDs ---
    logger.info("[4/4] Exporting NRRDs...")
    export_nrrd(
        volume_hu.astype(np.float32),
        spacing_xyz, origin_xyz,
        os.path.join(output_dir, "ct_volume.nrrd"),
    )
    export_nrrd(
        lung_labels,
        spacing_xyz, origin_xyz,
        os.path.join(output_dir, "lung_segmentation.nrrd"),
    )
    # pathology_mask already written by detect_pathology

    # --- Build and write JSON ---
    scan_result = _build_scan_result(scan_id, metadata, findings)
    json_path = os.path.join(output_dir, "scan_result.json")
    with open(json_path, "w") as f:
        json.dump(scan_result, f, indent=2)
    logger.info("Wrote scan_result.json: %d findings", len(findings))

    logger.info("Pipeline complete: scan_id=%s", scan_id)
    return scan_result
