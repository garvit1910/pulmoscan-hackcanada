"""
Phase 4c — Pathology Detection

Two-track detection strategy:

  Track A — Rule-based (always runs, no model required):
    Segments anomalous-density regions inside the lung mask using HU thresholds
    and 3D connected components. Produces pathology_mask.nrrd and findings[].

  Track B — Classifier-guided (runs if a checkpoint exists):
    Runs LungCancerClassifier on each axial slice. Slices predicted non-normal
    boost confidence on overlapping Track-A components. GradCAM is used to
    weight which components were "seen" by the model.

Axis convention (same as rest of pipeline):
  numpy array: (Z, Y, X)
  spacing/origin: (x, y, z)
"""

import logging
import os
from typing import List, Optional, Tuple

import numpy as np
import scipy.ndimage

from ml.exceptions import PathologyError
from ml.segmentation import export_nrrd

logger = logging.getLogger(__name__)

# Default checkpoint path (relative to this file)
DEFAULT_CHECKPOINT = os.path.join(os.path.dirname(__file__), "checkpoints", "best_model.pth")

# HU ranges for type classification
HU_GROUND_GLASS  = (-400, -100)   # partial air-space filling
HU_CONSOLIDATION = (-100,  100)   # dense air-space disease
HU_NODULE        = (100,  3000)   # solid / calcified

# Severity thresholds by longest diameter in mm
SEVERITY_THRESHOLDS = [
    (6,   "low"),
    (30,  "moderate"),
    (50,  "high"),
]

# Cancer types that override the HU-based type with "mass"
MASS_CLASSES = {"adenocarcinoma", "large_cell_carcinoma"}


# ---------------------------------------------------------------------------
# Coordinate helpers
# ---------------------------------------------------------------------------

def _ijk_to_world(ijk_zyx: Tuple[float, float, float],
                  spacing_xyz: List[float],
                  origin_xyz: List[float]) -> List[float]:
    """Convert (z,y,x) voxel index to (x,y,z) world mm."""
    i, j, k = ijk_zyx
    ox, oy, oz = origin_xyz
    sx, sy, sz = spacing_xyz
    return [round(ox + k * sx, 2), round(oy + j * sy, 2), round(oz + i * sz, 2)]


def _bbox_size_mm(component_mask: np.ndarray, spacing_xyz: List[float]) -> List[float]:
    """Return [size_x_mm, size_y_mm, size_z_mm] from bounding box of a boolean mask."""
    coords = np.argwhere(component_mask)   # (N, 3) → (z, y, x)
    if len(coords) == 0:
        return [0.0, 0.0, 0.0]
    mins = coords.min(axis=0)
    maxs = coords.max(axis=0)
    span_zyx = (maxs - mins + 1).astype(float)
    # Convert (z, y, x) spans to mm using (x, y, z) spacing
    return [
        round(span_zyx[2] * spacing_xyz[0], 1),  # x-span (col)
        round(span_zyx[1] * spacing_xyz[1], 1),  # y-span (row)
        round(span_zyx[0] * spacing_xyz[2], 1),  # z-span (slice)
    ]


def _severity(size_mm: List[float]) -> str:
    longest = max(size_mm)
    for threshold, label in SEVERITY_THRESHOLDS:
        if longest < threshold:
            return label
    return "critical"


def _hu_type(mean_hu: float) -> str:
    if HU_GROUND_GLASS[0] <= mean_hu < HU_GROUND_GLASS[1]:
        return "ground_glass"
    if HU_CONSOLIDATION[0] <= mean_hu < HU_CONSOLIDATION[1]:
        return "consolidation"
    if mean_hu >= HU_NODULE[0]:
        return "nodule"
    return "ground_glass"   # default for ambiguous HU


def _lobe(centroid_zyx: Tuple[float, float, float],
          volume_shape: Tuple[int, int, int],
          lung_labels: np.ndarray) -> str:
    """
    Coarse lobe assignment: z-thirds × left/right side.
    Left lung (label 1) has larger x-col index.
    """
    z, y, x = centroid_zyx
    z_total = volume_shape[0]

    # Left or right side by lung label at centroid
    zi, yi, xi = int(round(z)), int(round(y)), int(round(x))
    zi = max(0, min(zi, volume_shape[0] - 1))
    yi = max(0, min(yi, volume_shape[1] - 1))
    xi = max(0, min(xi, volume_shape[2] - 1))
    label_at_centroid = int(lung_labels[zi, yi, xi])
    side = "left" if label_at_centroid == 1 else "right"

    # Lobe by z-position (superior=upper, inferior=lower)
    z_frac = z / z_total
    if z_frac < 0.33:
        lobe_pos = "upper"
    elif z_frac < 0.66:
        lobe_pos = "middle" if side == "right" else "upper"
    else:
        lobe_pos = "lower"

    return f"{side}_{lobe_pos}"


def _description(finding_type: str, lobe: str, size_mm: List[float],
                 mean_hu: float, confidence: float) -> str:
    longest = max(size_mm)
    hu_str  = f"mean HU {mean_hu:.0f}"
    return (
        f"{finding_type.replace('_', ' ').title()} detected in the {lobe.replace('_', ' ')} lobe. "
        f"Longest diameter {longest:.1f} mm ({hu_str}). "
        f"Model confidence {confidence:.0%}."
    )


# ---------------------------------------------------------------------------
# Track A — Rule-based lesion detection
# ---------------------------------------------------------------------------

MIN_LESION_VOXELS = 14   # ~3mm sphere at 1mm isotropic spacing

def _track_a(
    volume_hu:   np.ndarray,
    lung_labels: np.ndarray,
    spacing_xyz: List[float],
    origin_xyz:  List[float],
    volume_shape: Tuple[int, int, int],
) -> Tuple[np.ndarray, List[dict]]:
    """
    Detect anomalous-density regions inside the lung mask.

    Anomalous = tissue denser than aerated lung (HU > -400) inside lung mask.
    Returns (pathology_label_map, raw_components_list).
    """
    # Mask: inside lung, denser than normal aerated parenchyma
    inside_lung   = lung_labels > 0
    denser_than_air = volume_hu > -400
    candidate_mask = inside_lung & denser_than_air

    labeled, n = scipy.ndimage.label(candidate_mask)
    if n == 0:
        logger.info("Track A: no anomalous components found inside lung mask")
        return np.zeros(volume_shape, dtype=np.int32), []

    path_label_map = np.zeros(volume_shape, dtype=np.int32)
    components = []
    label_counter = 1

    for cid in range(1, n + 1):
        comp_mask = labeled == cid
        voxel_count = comp_mask.sum()
        if voxel_count < MIN_LESION_VOXELS:
            continue

        centroid = scipy.ndimage.center_of_mass(comp_mask)   # (z, y, x)
        size_mm  = _bbox_size_mm(comp_mask, spacing_xyz)
        mean_hu  = float(volume_hu[comp_mask].mean())

        path_label_map[comp_mask] = label_counter
        components.append({
            "label_id":   label_counter,
            "centroid_zyx": centroid,
            "size_mm":    size_mm,
            "mean_hu":    mean_hu,
            "voxel_count": int(voxel_count),
            "comp_mask":  comp_mask,
        })
        label_counter += 1

    logger.info("Track A: %d lesion components (>=%d voxels)", len(components), MIN_LESION_VOXELS)
    return path_label_map, components


# ---------------------------------------------------------------------------
# Track B — Classifier-guided confidence boosting
# ---------------------------------------------------------------------------

def _track_b(
    volume_hu:   np.ndarray,
    components:  List[dict],
    checkpoint_path: str,
) -> dict:
    """
    Run classifier on axial slices and return a dict:
        {label_id → (boosted_confidence, class_name)}

    Only updates components whose centroid slice fires non-normal.
    """
    import torch
    from ml.classifier import (
        LungCancerClassifier, GradCAM,
        hu_slice_to_pil, load_checkpoint,
    )

    if not os.path.exists(checkpoint_path):
        logger.info("Track B: no checkpoint at %s — skipping", checkpoint_path)
        return {}

    device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    model, idx_to_class = load_checkpoint(checkpoint_path, device)
    gradcam = GradCAM(model, device)

    boost_map = {}

    for comp in components:
        z_idx = int(round(comp["centroid_zyx"][0]))
        z_idx = max(0, min(z_idx, volume_hu.shape[0] - 1))
        pil_slice = hu_slice_to_pil(volume_hu[z_idx])

        cam, pred_cls, conf = gradcam.compute(pil_slice, target_class=None)
        class_name = idx_to_class.get(pred_cls, "unknown")

        if class_name == "normal":
            continue   # classifier thinks this slice is normal — no boost

        logger.debug(
            "Track B: label %d → class=%s conf=%.3f",
            comp["label_id"], class_name, conf,
        )

        # Check if GradCAM activation overlaps this component's centroid slice
        y_idx = int(round(comp["centroid_zyx"][1]))
        x_idx = int(round(comp["centroid_zyx"][2]))
        # Map centroid (y, x) into the 224x224 CAM space
        cam_y = int(y_idx / volume_hu.shape[1] * 224)
        cam_x = int(x_idx / volume_hu.shape[2] * 224)
        cam_y = max(0, min(cam_y, 223))
        cam_x = max(0, min(cam_x, 223))
        cam_activation = float(cam[cam_y, cam_x])

        # Only boost if the CAM actually highlights this region
        if cam_activation > 0.3:
            boost_map[comp["label_id"]] = (conf, class_name)

    logger.info("Track B: boosted %d/%d components", len(boost_map), len(components))
    return boost_map


# ---------------------------------------------------------------------------
# Build findings[] from components
# ---------------------------------------------------------------------------

def _build_findings(
    components:  List[dict],
    boost_map:   dict,
    lung_labels: np.ndarray,
    spacing_xyz: List[float],
    origin_xyz:  List[float],
    volume_shape: Tuple[int, int, int],
) -> List[dict]:
    findings = []

    for i, comp in enumerate(components):
        lid      = comp["label_id"]
        centroid = comp["centroid_zyx"]
        size_mm  = comp["size_mm"]
        mean_hu  = comp["mean_hu"]

        # Confidence and class from Track B if available, else rule-based default
        if lid in boost_map:
            confidence, class_name = boost_map[lid]
        else:
            confidence = 0.5    # rule-based detection, no classifier evidence
            class_name = None

        # Finding type
        finding_type = _hu_type(mean_hu)
        if class_name in MASS_CLASSES:
            finding_type = "mass"

        lobe     = _lobe(centroid, volume_shape, lung_labels)
        severity = _severity(size_mm)
        cw       = _ijk_to_world(centroid, spacing_xyz, origin_xyz)

        finding = {
            "id":          f"path-{i+1:03d}",
            "type":        finding_type,
            "label":       f"{finding_type.replace('_', ' ').title()} — {lobe.replace('_', ' ').title()}",
            "lobe":        lobe,
            "confidence":  round(confidence, 3),
            "size_mm":     size_mm,
            "center_ijk":  [round(centroid[0], 1), round(centroid[1], 1), round(centroid[2], 1)],
            "center_world": cw,
            "severity":    severity,
            "description": _description(finding_type, lobe, size_mm, mean_hu, confidence),
        }
        findings.append(finding)

    # Sort by severity (critical → high → moderate → low) then confidence desc
    severity_order = {"critical": 0, "high": 1, "moderate": 2, "low": 3}
    findings.sort(key=lambda f: (severity_order.get(f["severity"], 4), -f["confidence"]))
    return findings


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def detect_pathology(
    volume_hu:       np.ndarray,
    lung_labels:     np.ndarray,
    spacing_xyz:     List[float],
    origin_xyz:      List[float],
    output_nrrd:     Optional[str] = None,
    checkpoint_path: str = DEFAULT_CHECKPOINT,
) -> Tuple[np.ndarray, List[dict]]:
    """
    Detect pathological findings in the CT volume within the lung mask.

    Args:
        volume_hu:       (Z, Y, X) int16/float32 array in HU
        lung_labels:     (Z, Y, X) int32 label map from segment_lungs()
        spacing_xyz:     [sx, sy, sz] voxel spacing in mm
        origin_xyz:      [ox, oy, oz] world origin in mm
        output_nrrd:     if set, write pathology_mask.nrrd to this path
        checkpoint_path: path to classifier checkpoint (.pth)

    Returns:
        (pathology_label_map, findings)
        pathology_label_map: (Z, Y, X) int32, 0=bg, 1..N = finding labels
        findings: list of dicts matching the contract schema
    """
    try:
        return _detect_impl(
            volume_hu, lung_labels, spacing_xyz, origin_xyz,
            output_nrrd, checkpoint_path,
        )
    except PathologyError:
        raise
    except Exception as exc:
        raise PathologyError(f"Pathology detection failed: {exc}") from exc


def _detect_impl(
    volume_hu, lung_labels, spacing_xyz, origin_xyz,
    output_nrrd, checkpoint_path,
):
    volume_shape = volume_hu.shape

    # Track A — always runs
    path_label_map, components = _track_a(
        volume_hu, lung_labels, spacing_xyz, origin_xyz, volume_shape
    )

    if not components:
        logger.info("No pathology detected by Track A.")
        if output_nrrd:
            export_nrrd(path_label_map, spacing_xyz, origin_xyz, output_nrrd)
        return path_label_map, []

    # Track B — classifier boost (skips gracefully if no checkpoint)
    boost_map = _track_b(volume_hu, components, checkpoint_path)

    # Build findings list
    findings = _build_findings(
        components, boost_map, lung_labels,
        spacing_xyz, origin_xyz, volume_shape,
    )

    # Write NRRD
    if output_nrrd:
        export_nrrd(path_label_map, spacing_xyz, origin_xyz, output_nrrd)

    logger.info("Pathology detection complete: %d findings", len(findings))
    return path_label_map, findings
