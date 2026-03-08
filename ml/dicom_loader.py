"""
Phase 2 — DICOM Volume Reconstruction

Loads a DICOM series from disk, calibrates to Hounsfield Units, and
optionally resamples to isotropic 1mm³ spacing.

Axis conventions (documented here, followed everywhere in the pipeline):
  - NumPy array shape: (Z, Y, X)  — volume[slice_idx, row, col]
  - spacing tuple:     (x, y, z)  — (col_spacing, row_spacing, slice_spacing)
  - origin tuple:      (x, y, z)  — from DICOM ImagePositionPatient [0,1,2]

These match the NRRD header "space directions" diagonal and "space origin".
"""

import glob
import logging
from collections import defaultdict
from typing import List, Tuple

import numpy as np
import pydicom
import scipy.ndimage

from ml.exceptions import DicomLoadError

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# DICOM loading & sorting
# ---------------------------------------------------------------------------

def load_scan(patient_dir: str) -> List[pydicom.Dataset]:
    """
    Load all DICOM slices from a patient directory (searches recursively).

    Args:
        patient_dir: path to a folder containing .dcm files (may be nested)

    Returns:
        Sorted list of pydicom.Dataset objects, ascending by z-position.

    Raises:
        DicomLoadError: if no valid CT slices are found.
    """
    dcm_paths = glob.glob(patient_dir + "/**/*.dcm", recursive=True)
    dcm_paths += glob.glob(patient_dir + "/*.dcm")          # flat layout fallback
    dcm_paths = list(set(dcm_paths))                        # deduplicate

    if not dcm_paths:
        raise DicomLoadError(f"No .dcm files found under: {patient_dir}")

    slices = []
    for path in dcm_paths:
        try:
            ds = pydicom.dcmread(path, stop_before_pixels=False)
            # Keep only slices with spatial position (skip dose reports, localizers, etc.)
            if not hasattr(ds, "ImagePositionPatient"):
                continue
            if not hasattr(ds, "pixel_array"):
                continue
            slices.append(ds)
        except Exception as exc:
            logger.debug("Skipping %s: %s", path, exc)

    if not slices:
        raise DicomLoadError(
            f"No valid CT slices with ImagePositionPatient found in: {patient_dir}"
        )

    # Sort ascending by z-position (patient superior direction)
    slices.sort(key=lambda ds: float(ds.ImagePositionPatient[2]))

    # Deduplicate: some OSIC patients have duplicate z-positions
    # (repeat acquisitions). Keep the slice with the higher InstanceNumber.
    seen_z = defaultdict(list)
    for ds in slices:
        z_key = round(float(ds.ImagePositionPatient[2]), 2)
        seen_z[z_key].append(ds)

    deduped = []
    for z_key in sorted(seen_z.keys()):
        group = seen_z[z_key]
        if len(group) == 1:
            deduped.append(group[0])
        else:
            # Keep the one with the largest InstanceNumber (latest acquisition)
            best = max(group, key=lambda ds: int(getattr(ds, "InstanceNumber", 0)))
            deduped.append(best)
            logger.debug("Deduplicated %d slices at z=%.2f", len(group), z_key)

    logger.info(
        "Loaded %d slices from %s (after dedup from %d)",
        len(deduped), patient_dir, len(slices)
    )
    return deduped


# ---------------------------------------------------------------------------
# HU calibration
# ---------------------------------------------------------------------------

def get_pixels_hu(slices: List[pydicom.Dataset]) -> np.ndarray:
    """
    Stack all slices into a 3D volume and convert to Hounsfield Units.

    Args:
        slices: sorted list from load_scan()

    Returns:
        volume: (Z, Y, X) int16 array in Hounsfield Units

    Notes:
        - Applies RescaleSlope and RescaleIntercept from each slice header.
        - Uses per-slice calibration in case values vary across the series.
        - Clips to [-2048, 3071] — the physically meaningful CT HU range.
    """
    # Determine spatial dimensions from first slice
    first = slices[0].pixel_array
    volume = np.zeros((len(slices), first.shape[0], first.shape[1]), dtype=np.int16)

    for i, ds in enumerate(slices):
        raw = ds.pixel_array.astype(np.float32)

        slope     = float(getattr(ds, "RescaleSlope",     1))
        intercept = float(getattr(ds, "RescaleIntercept", 0))

        hu = raw * slope + intercept
        hu = np.clip(hu, -2048, 3071)
        volume[i] = hu.astype(np.int16)

    logger.info("HU volume shape=%s, range=[%.0f, %.0f]",
                volume.shape, volume.min(), volume.max())
    return volume


# ---------------------------------------------------------------------------
# Spacing extraction
# ---------------------------------------------------------------------------

def _extract_spacing(slices: List[pydicom.Dataset]) -> Tuple[float, float, float]:
    """
    Return (x_spacing, y_spacing, z_spacing) in mm.

    x = column spacing, y = row spacing (both from PixelSpacing),
    z = actual inter-slice distance computed from ImagePositionPatient.
    """
    first = slices[0]

    # PixelSpacing is [row_spacing, col_spacing] → (y, x)
    ps = getattr(first, "PixelSpacing", None)
    if ps is not None:
        y_spacing = float(ps[0])
        x_spacing = float(ps[1])
    else:
        # Fallback: some modalities store it differently
        x_spacing = y_spacing = 1.0
        logger.warning("PixelSpacing missing; assuming 1.0mm isotropic in-plane")

    # Actual z-spacing from consecutive slice positions
    if len(slices) > 1:
        z0 = float(slices[0].ImagePositionPatient[2])
        z1 = float(slices[1].ImagePositionPatient[2])
        z_spacing = abs(z1 - z0)
        if z_spacing < 1e-6:
            logger.warning("Computed z_spacing ~0; falling back to SliceThickness")
            z_spacing = float(getattr(first, "SliceThickness", 1.0))
    else:
        z_spacing = float(getattr(first, "SliceThickness", 1.0))
        logger.warning("Single slice — using SliceThickness=%.2fmm for z_spacing", z_spacing)

    return (x_spacing, y_spacing, z_spacing)


# ---------------------------------------------------------------------------
# Resampling
# ---------------------------------------------------------------------------

def resample(
    volume: np.ndarray,
    original_spacing_xyz: Tuple[float, float, float],
    target_spacing: List[float] = None,
    order: int = 1,
) -> Tuple[np.ndarray, Tuple[float, float, float]]:
    """
    Resample a volume to a target voxel spacing using scipy.ndimage.zoom.

    Args:
        volume:               (Z, Y, X) numpy array
        original_spacing_xyz: (x, y, z) spacing in mm
        target_spacing:       desired spacing [x, y, z], default [1, 1, 1]
        order:                interpolation order — 1 for CT, 0 for label maps

    Returns:
        (resampled_volume, new_spacing_xyz)
        new_spacing_xyz is always equal to target_spacing.
    """
    if target_spacing is None:
        target_spacing = [1.0, 1.0, 1.0]

    sx, sy, sz = original_spacing_xyz
    tx, ty, tz = target_spacing

    # zoom factors must match the numpy (Z, Y, X) axis order
    zoom_z = sz / tz
    zoom_y = sy / ty
    zoom_x = sx / tx
    zoom_factors = (zoom_z, zoom_y, zoom_x)

    resampled = scipy.ndimage.zoom(volume, zoom_factors, order=order)
    logger.info(
        "Resampled %s → %s  (spacing %s → %s mm)",
        volume.shape, resampled.shape,
        [round(v, 3) for v in original_spacing_xyz],
        target_spacing,
    )
    return resampled, tuple(target_spacing)


# ---------------------------------------------------------------------------
# Metadata extraction
# ---------------------------------------------------------------------------

def extract_metadata(slices: List[pydicom.Dataset]) -> dict:
    """
    Extract patient and acquisition metadata from DICOM headers.

    Returns a dict with keys:
        patient_id, age, sex, modality, slice_count,
        voxel_spacing (x, y, z),
        origin (x, y, z) — world position of slice[0] voxel (0,0)
    """
    first = slices[0]

    # Age: DICOM stores as "045Y", "006M", "010D"
    raw_age = str(getattr(first, "PatientAge", "000Y")).strip()
    try:
        if raw_age.endswith("Y"):
            age = int(raw_age[:-1])
        elif raw_age.endswith("M"):
            age = max(0, int(raw_age[:-1]) // 12)
        else:
            age = 0
    except (ValueError, IndexError):
        age = 0

    spacing_xyz = _extract_spacing(slices)

    # Origin: world coordinates of the first voxel of the first slice
    ipp = first.ImagePositionPatient
    origin_xyz = [float(ipp[0]), float(ipp[1]), float(ipp[2])]

    return {
        "patient_id":    str(getattr(first, "PatientID",   "UNKNOWN")),
        "age":           age,
        "sex":           str(getattr(first, "PatientSex",  "U")),
        "modality":      str(getattr(first, "Modality",    "CT")),
        "slice_count":   len(slices),
        "voxel_spacing": list(spacing_xyz),   # [x, y, z] in mm
        "origin":        origin_xyz,           # [x, y, z] in mm (LPS)
    }


# ---------------------------------------------------------------------------
# Convenience: load full patient pipeline in one call
# ---------------------------------------------------------------------------

def load_patient(
    patient_dir: str,
    resample_to: List[float] = None,
) -> Tuple[np.ndarray, dict]:
    """
    Full DICOM load pipeline for one patient.

    Args:
        patient_dir:  path to folder with .dcm files
        resample_to:  target spacing [x, y, z] mm. None = no resampling.

    Returns:
        (volume_hu, metadata)
        volume_hu: (Z, Y, X) int16 array in Hounsfield Units
        metadata:  dict from extract_metadata(), voxel_spacing updated if resampled
    """
    slices   = load_scan(patient_dir)
    volume   = get_pixels_hu(slices)
    metadata = extract_metadata(slices)

    if resample_to is not None:
        orig_spacing = tuple(metadata["voxel_spacing"])
        volume, new_spacing = resample(volume, orig_spacing, resample_to, order=1)
        metadata["voxel_spacing"] = list(new_spacing)
        metadata["slice_count"]   = volume.shape[0]

    return volume, metadata
