"""
Lung segmentation and NRRD export.

Axis conventions (consistent with dicom_loader.py):
  - NumPy arrays:  (z, y, x)  — volume[slice_idx, row, col]
  - spacing/origin: (x, y, z)  — used in NRRD headers
"""

import logging
import os

import numpy as np
import nrrd
import scipy.ndimage

from ml.exceptions import SegmentationError

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# NRRD Export — shared utility used by mock_generator, segmentation, pathology
# ---------------------------------------------------------------------------

def export_nrrd(volume: np.ndarray, spacing_xyz: list, origin_xyz: list, filepath: str) -> None:
    """
    Write a numpy array to a gzip-compressed NRRD file with correct spatial headers.

    Args:
        volume:      numpy array, shape (Z, Y, X). dtype determines NRRD type:
                       float32  → "float"
                       int32    → "int"
                       others   → cast to float32 and warn
        spacing_xyz: [sx, sy, sz] voxel spacing in mm (x=col, y=row, z=slice)
        origin_xyz:  [ox, oy, oz] world origin in mm (LPS coordinates)
        filepath:    destination path, directory will be created if absent
    """
    os.makedirs(os.path.dirname(os.path.abspath(filepath)), exist_ok=True)

    sx, sy, sz = float(spacing_xyz[0]), float(spacing_xyz[1]), float(spacing_xyz[2])

    if volume.dtype == np.float32:
        nrrd_type = "float"
        data = volume
    elif volume.dtype == np.int32:
        nrrd_type = "int"
        data = volume
    else:
        logger.warning("export_nrrd: unexpected dtype %s, casting to float32", volume.dtype)
        nrrd_type = "float"
        data = volume.astype(np.float32)

    header = {
        "type": nrrd_type,
        "dimension": 3,
        "space": "left-posterior-superior",
        "sizes": list(volume.shape),
        # space directions: list-of-lists — never np.diag, pynrrd may mangle it
        "space directions": [
            [sx, 0.0, 0.0],
            [0.0, sy, 0.0],
            [0.0, 0.0, sz],
        ],
        "space origin": [float(origin_xyz[0]), float(origin_xyz[1]), float(origin_xyz[2])],
        "encoding": "raw",
        "endian": "little",
    }

    nrrd.write(filepath, data, header)
    logger.info("Wrote NRRD: %s  shape=%s  dtype=%s", filepath, data.shape, data.dtype)


# ---------------------------------------------------------------------------
# Lung Segmentation
# ---------------------------------------------------------------------------

def segment_lungs(volume_hu: np.ndarray) -> np.ndarray:
    """
    Segment lungs from a CT volume in Hounsfield Units.

    Algorithm:
      1. Threshold -900 to -400 HU (aerated lung parenchyma)
      2. Fill holes per axial slice (2D) to close peripheral airways
      3. 3D connected components; keep the two largest (≥1000 voxels)
      4. Assign labels: 1=left_lung, 2=right_lung by x-centroid
      5. Morphological closing (radius 4) to smooth boundaries

    Args:
        volume_hu: (Z, Y, X) int16 or float32 array in Hounsfield Units

    Returns:
        label_map: (Z, Y, X) int32 array, values {0=bg, 1=left_lung, 2=right_lung}

    Raises:
        SegmentationError: if no valid lung components are found
    """
    try:
        return _segment_lungs_impl(volume_hu)
    except SegmentationError:
        raise
    except Exception as exc:
        raise SegmentationError(f"Segmentation failed: {exc}") from exc


def _segment_lungs_impl(volume_hu: np.ndarray) -> np.ndarray:
    logger.info("Segmenting lungs from volume shape=%s", volume_hu.shape)

    # Step 1: threshold for aerated lung
    mask = (volume_hu > -900) & (volume_hu < -400)

    # Step 2: fill holes per axial slice
    for i in range(mask.shape[0]):
        mask[i] = scipy.ndimage.binary_fill_holes(mask[i])

    # Step 3: 3D connected components
    labels_3d, n_components = scipy.ndimage.label(mask)
    if n_components == 0:
        raise SegmentationError("No components found after thresholding. Check HU calibration.")

    # Compute sizes and filter to components ≥ 1000 voxels
    component_ids = np.arange(1, n_components + 1)
    sizes = scipy.ndimage.sum(mask, labels_3d, component_ids)
    valid = [(cid, sz) for cid, sz in zip(component_ids, sizes) if sz >= 1000]

    if len(valid) == 0:
        raise SegmentationError("No lung-sized components found (all < 1000 voxels).")

    # Sort by size descending, keep at most 2
    valid.sort(key=lambda t: t[1], reverse=True)
    top_two = valid[:2]
    if len(top_two) == 1:
        logger.warning("Only one lung component found (single lung or collapsed lobe).")

    # Check for trachea contamination: component spanning >85% of x-width
    cleaned_top_two = []
    for cid, sz in top_two:
        comp_mask = labels_3d == cid
        x_extent = comp_mask.any(axis=(0, 1))  # shape (X,)
        x_fraction = x_extent.sum() / volume_hu.shape[2]
        if x_fraction > 0.85:
            logger.warning(
                "Component %d spans %.0f%% of x-axis — likely trachea contamination. "
                "Applying erosion to separate.", cid, x_fraction * 100
            )
            struct = scipy.ndimage.generate_binary_structure(3, 1)
            comp_mask = scipy.ndimage.binary_erosion(comp_mask, structure=struct, iterations=3)
            # Re-label eroded result
            sub_labels, sub_n = scipy.ndimage.label(comp_mask)
            if sub_n >= 2:
                sub_sizes = scipy.ndimage.sum(comp_mask, sub_labels, range(1, sub_n + 1))
                sub_top2 = np.argsort(sub_sizes)[-2:][::-1]
                for s_idx in sub_top2:
                    cleaned_top_two.append((cid, sub_labels == (s_idx + 1)))
                continue
        cleaned_top_two.append((cid, labels_3d == cid))

    # Step 4: assign left/right by x-centroid
    # In image space, column (x) index: patient's right side → lower column index
    # Convention: label 1 = left lung (larger col index), label 2 = right lung (smaller col index)
    lung_label_map = np.zeros(volume_hu.shape, dtype=np.int32)

    component_masks = []
    for entry in cleaned_top_two[:2]:
        if isinstance(entry[1], np.ndarray):
            component_masks.append(entry[1])
        else:
            component_masks.append(labels_3d == entry[0])

    if len(component_masks) == 1:
        # Single lung: determine which side and assign accordingly
        com = scipy.ndimage.center_of_mass(component_masks[0])
        x_centre = com[2]  # (z, y, x)
        mid_x = volume_hu.shape[2] / 2
        label_val = 1 if x_centre > mid_x else 2
        lung_label_map[component_masks[0]] = label_val
    else:
        coms = [scipy.ndimage.center_of_mass(m) for m in component_masks]
        x_centroids = [(i, com[2]) for i, com in enumerate(coms)]
        x_centroids.sort(key=lambda t: t[1])  # ascending x → right lung first (lower col idx)
        # Lower x-col index = right lung (label 2), higher x-col index = left lung (label 1)
        right_idx, left_idx = x_centroids[0][0], x_centroids[1][0]
        lung_label_map[component_masks[right_idx]] = 2
        lung_label_map[component_masks[left_idx]] = 1

    # Step 5: morphological closing per label
    struct = scipy.ndimage.generate_binary_structure(3, 1)
    closed_map = np.zeros_like(lung_label_map)
    for lv in [1, 2]:
        comp = lung_label_map == lv
        comp = scipy.ndimage.binary_closing(comp, structure=struct)
        closed_map[comp] = lv

    unique_vals = np.unique(closed_map)
    logger.info("Segmentation complete. Labels present: %s", unique_vals)
    return closed_map
