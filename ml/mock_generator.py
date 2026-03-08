"""
Phase 1 — Mock Data Generator

Generates synthetic 128x128x128 CT volumes and matching NRRD/JSON outputs
so the 3D viewer and frontend teammates can start integration immediately.

Run:
    python -m ml.mock_generator
"""

import json
import logging
import os

import numpy as np

from ml.segmentation import export_nrrd

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

# Output directory (relative to repo root when running as python -m ml.mock_generator)
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "output")

SPACING_XYZ = [0.7, 0.7, 1.5]   # mm per voxel (x, y, z)
ORIGIN_XYZ  = [0.0, 0.0, 0.0]   # world origin mm (LPS)
SHAPE       = (128, 128, 128)    # (Z, Y, X)


# ---------------------------------------------------------------------------
# Volume construction
# ---------------------------------------------------------------------------

def _ellipsoid_mask(shape, centre_zyx, semi_axes_zyx):
    """Return boolean mask for an axis-aligned ellipsoid."""
    z, y, x = np.ogrid[
        :shape[0],
        :shape[1],
        :shape[2],
    ]
    cz, cy, cx = centre_zyx
    az, ay, ax_ = semi_axes_zyx
    return (
        ((z - cz) / az) ** 2 +
        ((y - cy) / ay) ** 2 +
        ((x - cx) / ax_) ** 2
    ) <= 1.0


def _sphere_mask(shape, centre_zyx, radius):
    """Return boolean mask for a sphere."""
    return _ellipsoid_mask(shape, centre_zyx, (radius, radius, radius))


def build_ct_volume() -> np.ndarray:
    """Build a synthetic 128x128x128 float32 CT volume in Hounsfield Units."""
    volume = np.full(SHAPE, -1000.0, dtype=np.float32)  # background = air

    # Body (soft tissue)
    body = _ellipsoid_mask(SHAPE, centre_zyx=(64, 64, 64), semi_axes_zyx=(55, 60, 50))
    volume[body] = 0.0

    # Left lung (patient left = higher column index in image space)
    # x range: 90 ± 18 = [72, 108] — clear gap from right lung
    left_lung = _ellipsoid_mask(SHAPE, centre_zyx=(64, 64, 90), semi_axes_zyx=(50, 26, 18))
    volume[left_lung] = -700.0

    # Right lung (patient right = lower column index)
    # x range: 38 ± 18 = [20, 56] — gap of 16 voxels to left lung
    right_lung = _ellipsoid_mask(SHAPE, centre_zyx=(64, 64, 38), semi_axes_zyx=(50, 26, 18))
    volume[right_lung] = -700.0

    # Pathology in left lung — offset from centre so it sits inside the lobe
    left_path = _sphere_mask(SHAPE, centre_zyx=(70, 60, 90), radius=7)
    volume[left_path] = -200.0   # ground glass opacity

    # Pathology in right lung — offset from centre
    right_path = _sphere_mask(SHAPE, centre_zyx=(58, 68, 38), radius=7)
    volume[right_path] = -50.0   # consolidation

    return volume


def build_lung_segmentation() -> np.ndarray:
    """Build int32 lung label map: 0=bg, 1=left_lung, 2=right_lung."""
    labels = np.zeros(SHAPE, dtype=np.int32)

    left_lung = _ellipsoid_mask(SHAPE, centre_zyx=(64, 64, 90), semi_axes_zyx=(50, 26, 18))
    right_lung = _ellipsoid_mask(SHAPE, centre_zyx=(64, 64, 38), semi_axes_zyx=(50, 26, 18))

    labels[left_lung] = 1
    labels[right_lung] = 2
    return labels


def build_pathology_mask() -> np.ndarray:
    """Build int32 pathology label map: 0=bg, 1=finding1 (left), 2=finding2 (right)."""
    labels = np.zeros(SHAPE, dtype=np.int32)

    left_path = _sphere_mask(SHAPE, centre_zyx=(70, 60, 90), radius=7)
    right_path = _sphere_mask(SHAPE, centre_zyx=(58, 68, 38), radius=7)

    labels[left_path] = 1
    labels[right_path] = 2
    return labels


# ---------------------------------------------------------------------------
# World-coordinate helpers
# ---------------------------------------------------------------------------

def ijk_to_world(ijk_zyx, spacing_xyz, origin_xyz):
    """Convert (z,y,x) voxel index to (x,y,z) world mm coordinates."""
    i, j, k = ijk_zyx          # z, y, x
    ox, oy, oz = origin_xyz
    sx, sy, sz = spacing_xyz
    # world_x = origin_x + col_x * sx, etc.
    wx = ox + k * sx
    wy = oy + j * sy
    wz = oz + i * sz
    return [round(wx, 2), round(wy, 2), round(wz, 2)]


# ---------------------------------------------------------------------------
# JSON contract builder
# ---------------------------------------------------------------------------

def build_scan_result() -> dict:
    sx, sy, sz = SPACING_XYZ

    # Finding 1: left lung, ground glass opacity at centre of left pathology sphere
    f1_ijk_zyx = (70, 60, 90)
    f1_world = ijk_to_world(f1_ijk_zyx, SPACING_XYZ, ORIGIN_XYZ)
    diameter_mm_f1 = [round(7 * 2 * sx, 1), round(7 * 2 * sy, 1), round(7 * 2 * sz, 1)]

    # Finding 2: right lung, consolidation at centre of right pathology sphere
    f2_ijk_zyx = (58, 68, 38)
    f2_world = ijk_to_world(f2_ijk_zyx, SPACING_XYZ, ORIGIN_XYZ)
    diameter_mm_f2 = [round(7 * 2 * sx, 1), round(7 * 2 * sy, 1), round(7 * 2 * sz, 1)]

    return {
        "scan_id": "mock-scan-001",
        "patient": {
            "id": "MOCK-PATIENT-001",
            "age": 55,
            "sex": "M"
        },
        "scan_metadata": {
            "modality": "CT",
            "slice_count": SHAPE[0],
            "voxel_spacing": SPACING_XYZ
        },
        "volumes": {
            "lung": {
                "url": "/assets/lung_segmentation.nrrd",
                "format": "nrrd",
                "label_map": {"1": "left_lung", "2": "right_lung"}
            },
            "pathology_mask": {
                "url": "/assets/pathology_mask.nrrd",
                "format": "nrrd"
            },
            "original_ct": {
                "url": "/assets/ct_volume.nrrd",
                "format": "nrrd"
            }
        },
        "findings": [
            {
                "id": "path-001",
                "type": "ground_glass",
                "label": "Ground Glass Opacity — Left Lung",
                "lobe": "left_lower",
                "confidence": 0.87,
                "size_mm": diameter_mm_f1,
                "center_ijk": list(f1_ijk_zyx),
                "center_world": f1_world,
                "severity": "moderate",
                "description": (
                    "Synthetic ground glass opacity in the left lower lobe. "
                    "HU range -300 to -100 consistent with partial air-space filling."
                )
            },
            {
                "id": "path-002",
                "type": "consolidation",
                "label": "Consolidation — Right Lung",
                "lobe": "right_lower",
                "confidence": 0.91,
                "size_mm": diameter_mm_f2,
                "center_ijk": list(f2_ijk_zyx),
                "center_world": f2_world,
                "severity": "moderate",
                "description": (
                    "Synthetic consolidation in the right lower lobe. "
                    "HU range -100 to 0 consistent with dense air-space disease."
                )
            }
        ],
        "summary": (
            "Mock scan generated by Pulmoscan Phase 1 synthetic data pipeline. "
            "Two synthetic pathology findings detected: ground glass opacity (left) "
            "and consolidation (right). No clinical significance — for integration testing only."
        )
    }


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def generate():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    logger.info("Generating synthetic volumes (128x128x128) ...")

    ct_volume   = build_ct_volume()
    lung_labels = build_lung_segmentation()
    path_labels = build_pathology_mask()

    # Write NRRDs
    export_nrrd(ct_volume,   SPACING_XYZ, ORIGIN_XYZ, os.path.join(OUTPUT_DIR, "ct_volume.nrrd"))
    export_nrrd(lung_labels, SPACING_XYZ, ORIGIN_XYZ, os.path.join(OUTPUT_DIR, "lung_segmentation.nrrd"))
    export_nrrd(path_labels, SPACING_XYZ, ORIGIN_XYZ, os.path.join(OUTPUT_DIR, "pathology_mask.nrrd"))

    # Write JSON contract
    scan_result = build_scan_result()
    json_path = os.path.join(OUTPUT_DIR, "scan_result.json")
    with open(json_path, "w") as f:
        json.dump(scan_result, f, indent=2)
    logger.info("Wrote JSON: %s", json_path)

    logger.info("Phase 1 complete. Outputs in: %s", OUTPUT_DIR)
    logger.info("  ct_volume.nrrd          — %s float32", ct_volume.shape)
    logger.info("  lung_segmentation.nrrd  — %s int32, labels: %s", lung_labels.shape, np.unique(lung_labels))
    logger.info("  pathology_mask.nrrd     — %s int32, labels: %s", path_labels.shape, np.unique(path_labels))
    logger.info("  scan_result.json        — %d findings", len(scan_result["findings"]))


if __name__ == "__main__":
    generate()
