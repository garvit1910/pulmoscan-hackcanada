"""
Phase 6 — Integration Tests

Run:
    python -m unittest ml.test_pipeline -v
    RUN_E2E=1 python -m unittest ml.test_pipeline.TestE2E -v
"""

import json
import os
import shutil
import sys
import tempfile
import types
import unittest

import numpy as np


# ---------------------------------------------------------------------------
# TestMockGenerator
# ---------------------------------------------------------------------------

class TestMockGenerator(unittest.TestCase):
    """Phase 1: verify mock_generator produces correct outputs."""

    OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "output")
    EXPECTED_FILES = [
        "ct_volume.nrrd",
        "lung_segmentation.nrrd",
        "pathology_mask.nrrd",
        "scan_result.json",
    ]

    @classmethod
    def setUpClass(cls):
        # Run the mock generator fresh
        from ml.mock_generator import generate
        generate()

    def test_output_files_exist(self):
        for fname in self.EXPECTED_FILES:
            path = os.path.join(self.OUTPUT_DIR, fname)
            self.assertTrue(os.path.exists(path), f"Missing: {path}")
            self.assertGreater(os.path.getsize(path), 0, f"Empty file: {path}")

    def test_nrrd_shapes(self):
        import nrrd
        for fname in ["ct_volume.nrrd", "lung_segmentation.nrrd", "pathology_mask.nrrd"]:
            data, _ = nrrd.read(os.path.join(self.OUTPUT_DIR, fname))
            self.assertEqual(data.shape, (128, 128, 128), f"{fname} shape mismatch")

    def test_nrrd_headers(self):
        import nrrd
        data, header = nrrd.read(os.path.join(self.OUTPUT_DIR, "ct_volume.nrrd"))
        # space directions must be a 3x3 diagonal
        sd = np.array(header["space directions"])
        self.assertEqual(sd.shape, (3, 3), "space directions must be 3x3")
        # Off-diagonals should be zero
        off_diag = sd - np.diag(np.diag(sd))
        self.assertTrue(np.allclose(off_diag, 0), "space directions must be diagonal")
        # Diagonal values match SPACING_XYZ
        self.assertAlmostEqual(float(sd[0, 0]), 0.7, places=5)
        self.assertAlmostEqual(float(sd[1, 1]), 0.7, places=5)
        self.assertAlmostEqual(float(sd[2, 2]), 1.5, places=5)
        self.assertEqual(header["encoding"], "gzip")

    def test_ct_volume_dtype(self):
        import nrrd
        data, _ = nrrd.read(os.path.join(self.OUTPUT_DIR, "ct_volume.nrrd"))
        self.assertEqual(data.dtype, np.float32, "ct_volume must be float32")

    def test_ct_volume_hu_range(self):
        import nrrd
        data, _ = nrrd.read(os.path.join(self.OUTPUT_DIR, "ct_volume.nrrd"))
        self.assertGreaterEqual(float(data.min()), -1100.0)
        self.assertLessEqual(float(data.max()), 100.0)

    def test_lung_label_values(self):
        import nrrd
        data, _ = nrrd.read(os.path.join(self.OUTPUT_DIR, "lung_segmentation.nrrd"))
        self.assertEqual(data.dtype, np.int32, "lung_segmentation must be int32")
        unique = set(np.unique(data).tolist())
        self.assertTrue(unique.issubset({0, 1, 2}), f"Unexpected labels: {unique}")
        self.assertIn(1, unique, "Left lung label (1) missing")
        self.assertIn(2, unique, "Right lung label (2) missing")

    def test_pathology_label_values(self):
        import nrrd
        data, _ = nrrd.read(os.path.join(self.OUTPUT_DIR, "pathology_mask.nrrd"))
        self.assertEqual(data.dtype, np.int32)
        unique = set(np.unique(data).tolist())
        self.assertGreaterEqual(len(unique), 2, "Expected at least background + 1 finding")

    def test_json_required_keys(self):
        with open(os.path.join(self.OUTPUT_DIR, "scan_result.json")) as f:
            d = json.load(f)
        for key in ("scan_id", "patient", "scan_metadata", "volumes", "findings", "summary"):
            self.assertIn(key, d, f"Missing key: {key}")
        for key in ("id", "age", "sex"):
            self.assertIn(key, d["patient"])
        for key in ("modality", "slice_count", "voxel_spacing"):
            self.assertIn(key, d["scan_metadata"])
        for key in ("lung", "pathology_mask", "original_ct"):
            self.assertIn(key, d["volumes"])

    def test_json_findings_count(self):
        with open(os.path.join(self.OUTPUT_DIR, "scan_result.json")) as f:
            d = json.load(f)
        self.assertEqual(len(d["findings"]), 2)

    def test_json_finding_fields(self):
        with open(os.path.join(self.OUTPUT_DIR, "scan_result.json")) as f:
            d = json.load(f)
        required = ("id", "type", "label", "lobe", "confidence",
                    "size_mm", "center_ijk", "center_world", "severity", "description")
        for f in d["findings"]:
            for key in required:
                self.assertIn(key, f, f"Finding missing key: {key}")
            self.assertIn(f["severity"], ("low", "moderate", "high", "critical"))
            self.assertIn(f["type"], ("nodule", "mass", "ground_glass", "consolidation"))
            self.assertBetween(f["confidence"], 0.0, 1.0)
            self.assertEqual(len(f["center_world"]), 3)
            self.assertEqual(len(f["center_ijk"]), 3)

    def assertBetween(self, value, lo, hi):
        self.assertGreaterEqual(value, lo)
        self.assertLessEqual(value, hi)


# ---------------------------------------------------------------------------
# TestDicomLoader
# ---------------------------------------------------------------------------

class TestDicomLoader(unittest.TestCase):
    """Phase 2: DICOM loader logic (no real DICOMs required)."""

    def test_resample_shape(self):
        from ml.dicom_loader import resample
        vol = np.zeros((50, 256, 256), dtype=np.int16)
        resampled, new_sp = resample(vol, (0.7, 0.7, 2.5), [1.0, 1.0, 1.0])
        self.assertEqual(new_sp, (1.0, 1.0, 1.0))
        # z: 50 * 2.5 = 125; y/x: 256 * 0.7 ≈ 179
        self.assertAlmostEqual(resampled.shape[0], 125, delta=2)
        self.assertAlmostEqual(resampled.shape[1], 179, delta=2)

    def test_resample_label_order0(self):
        """Label maps must use order=0 (nearest-neighbour) to avoid interpolation."""
        from ml.dicom_loader import resample
        labels = np.zeros((10, 64, 64), dtype=np.int32)
        labels[5, 32, 32] = 1
        resampled, _ = resample(labels, (1.0, 1.0, 1.0), [1.0, 1.0, 1.0], order=0)
        unique = np.unique(resampled)
        self.assertTrue(set(unique.tolist()).issubset({0, 1}),
                        f"Order-0 resample introduced fractional labels: {unique}")

    def test_hu_calibration(self):
        from ml.dicom_loader import get_pixels_hu
        ds = types.SimpleNamespace(
            pixel_array=np.array([[2048, 0]], dtype=np.uint16),
            RescaleSlope=1.0,
            RescaleIntercept=-1024.0,
            ImagePositionPatient=[0, 0, 0],
        )
        vol = get_pixels_hu([ds])
        self.assertEqual(vol[0, 0, 0], 1024)   # 2048 * 1 + (-1024)
        self.assertEqual(vol[0, 0, 1], -1024)   # 0 * 1 + (-1024)

    def test_hu_clip(self):
        """Values must be clipped to [-2048, 3071]."""
        from ml.dicom_loader import get_pixels_hu
        ds = types.SimpleNamespace(
            pixel_array=np.array([[65535]], dtype=np.uint16),
            RescaleSlope=1.0,
            RescaleIntercept=0.0,
            ImagePositionPatient=[0, 0, 0],
        )
        vol = get_pixels_hu([ds])
        self.assertLessEqual(int(vol[0, 0, 0]), 3071)

    def test_hu_missing_attrs(self):
        """Missing RescaleSlope/Intercept should default to 1/0."""
        from ml.dicom_loader import get_pixels_hu
        ds = types.SimpleNamespace(
            pixel_array=np.array([[500]], dtype=np.uint16),
            ImagePositionPatient=[0, 0, 0],
        )
        vol = get_pixels_hu([ds])
        self.assertEqual(vol[0, 0, 0], 500)


# ---------------------------------------------------------------------------
# TestSegmentation
# ---------------------------------------------------------------------------

class TestSegmentation(unittest.TestCase):
    """Phase 3: lung segmentation on mock volume."""

    @classmethod
    def setUpClass(cls):
        from ml.mock_generator import build_ct_volume
        cls.ct = build_ct_volume()

    def test_output_dtype(self):
        from ml.segmentation import segment_lungs
        labels = segment_lungs(self.ct)
        self.assertEqual(labels.dtype, np.int32)

    def test_label_values(self):
        from ml.segmentation import segment_lungs
        labels = segment_lungs(self.ct)
        unique = set(np.unique(labels).tolist())
        self.assertTrue(unique.issubset({0, 1, 2}), f"Unexpected labels: {unique}")
        self.assertIn(1, unique)
        self.assertIn(2, unique)

    def test_lung_coverage(self):
        from ml.segmentation import segment_lungs
        labels = segment_lungs(self.ct)
        pct = 100 * (labels > 0).sum() / labels.size
        self.assertGreater(pct, 5.0,  f"Lung coverage too low: {pct:.1f}%")
        self.assertLess(pct,    40.0, f"Lung coverage too high: {pct:.1f}%")

    def test_left_right_separation(self):
        """Left lung (label 1) must have larger x-col centroid than right (label 2)."""
        import scipy.ndimage
        from ml.segmentation import segment_lungs
        labels = segment_lungs(self.ct)
        com1 = scipy.ndimage.center_of_mass(labels == 1)
        com2 = scipy.ndimage.center_of_mass(labels == 2)
        self.assertGreater(com1[2], com2[2],
            f"Left centroid x={com1[2]:.1f} should be > right centroid x={com2[2]:.1f}")

    def test_export_nrrd_roundtrip(self):
        import nrrd
        from ml.segmentation import export_nrrd
        arr = np.array([[[1, 2], [3, 4]]], dtype=np.int32)
        with tempfile.NamedTemporaryFile(suffix=".nrrd", delete=False) as f:
            path = f.name
        try:
            export_nrrd(arr, [0.7, 0.7, 1.5], [10.0, 20.0, 30.0], path)
            data, header = nrrd.read(path)
            self.assertTrue(np.array_equal(data, arr))
            self.assertEqual(header["encoding"], "gzip")
            origin = list(header["space origin"])
            self.assertAlmostEqual(origin[0], 10.0)
            self.assertAlmostEqual(origin[1], 20.0)
            self.assertAlmostEqual(origin[2], 30.0)
        finally:
            os.unlink(path)


# ---------------------------------------------------------------------------
# TestPathology
# ---------------------------------------------------------------------------

class TestPathology(unittest.TestCase):
    """Phase 4c: pathology detection on mock volume."""

    SPACING = [0.7, 0.7, 1.5]
    ORIGIN  = [0.0, 0.0, 0.0]

    @classmethod
    def setUpClass(cls):
        from ml.mock_generator import build_ct_volume, build_lung_segmentation
        cls.ct          = build_ct_volume()
        cls.lung_labels = build_lung_segmentation()

    def _run(self):
        from ml.pathology import detect_pathology
        return detect_pathology(
            self.ct, self.lung_labels,
            self.SPACING, self.ORIGIN,
            checkpoint_path="/nonexistent/no_checkpoint.pth",  # force Track A only
        )

    def test_findings_nonempty(self):
        _, findings = self._run()
        self.assertGreater(len(findings), 0, "Expected at least 1 finding on mock volume")

    def test_finding_schema(self):
        _, findings = self._run()
        valid_types     = {"nodule", "mass", "ground_glass", "consolidation"}
        valid_lobes     = {"right_upper", "right_middle", "right_lower",
                          "left_upper", "left_lower"}
        valid_severities = {"low", "moderate", "high", "critical"}
        for f in findings:
            self.assertIn(f["type"],     valid_types)
            self.assertIn(f["lobe"],     valid_lobes)
            self.assertIn(f["severity"], valid_severities)
            self.assertGreaterEqual(f["confidence"], 0.0)
            self.assertLessEqual(f["confidence"],    1.0)

    def test_center_world_in_bounds(self):
        """center_world must be within the volume's spatial extent."""
        _, findings = self._run()
        sx, sy, sz = self.SPACING
        ox, oy, oz = self.ORIGIN
        max_x = ox + 128 * sx
        max_y = oy + 128 * sy
        max_z = oz + 128 * sz
        for f in findings:
            cw = f["center_world"]
            self.assertGreaterEqual(cw[0], ox - sx)
            self.assertLessEqual(cw[0],    max_x + sx)
            self.assertGreaterEqual(cw[1], oy - sy)
            self.assertLessEqual(cw[1],    max_y + sy)
            self.assertGreaterEqual(cw[2], oz - sz)
            self.assertLessEqual(cw[2],    max_z + sz)

    def test_pathology_label_map_dtype(self):
        path_map, _ = self._run()
        self.assertEqual(path_map.dtype, np.int32)
        self.assertEqual(path_map.shape, self.ct.shape)

    def test_no_pathology_outside_lung(self):
        """All labelled pathology voxels must lie inside the lung mask."""
        path_map, _ = self._run()
        outside_lung  = self.lung_labels == 0
        path_outside  = (path_map > 0) & outside_lung
        # Allow a small fringe from morphological operations (~0.1% tolerance)
        fringe_limit  = int(0.001 * path_map.size)
        self.assertLessEqual(
            path_outside.sum(), fringe_limit,
            f"Too many pathology voxels outside lung: {path_outside.sum()}"
        )


# ---------------------------------------------------------------------------
# TestE2E — requires real OSIC data and RUN_E2E=1
# ---------------------------------------------------------------------------

@unittest.skipUnless(os.environ.get("RUN_E2E"), "Set RUN_E2E=1 to run end-to-end tests")
class TestE2E(unittest.TestCase):
    """End-to-end pipeline test on real OSIC DICOM patients."""

    OSIC_ROOT   = os.environ.get("OSIC_DATA_ROOT",
                    os.path.join(os.path.dirname(__file__), "..", "data", "osic"))
    MAX_PATIENTS = 3

    def _list_patients(self):
        if not os.path.isdir(self.OSIC_ROOT):
            self.skipTest(f"OSIC_DATA_ROOT not found: {self.OSIC_ROOT}")
        entries = [
            e.path for e in os.scandir(self.OSIC_ROOT)
            if e.is_dir() and len(os.listdir(e.path)) > 0
        ]
        return entries[:self.MAX_PATIENTS]

    def test_e2e_osic_patients(self):
        import nrrd
        from ml.pipeline import run as run_pipeline

        patients = self._list_patients()
        self.assertGreater(len(patients), 0, "No OSIC patient directories found")

        for patient_dir in patients:
            patient_id = os.path.basename(patient_dir)
            with self.subTest(patient_id=patient_id):
                tmp_out = tempfile.mkdtemp(prefix=f"pulmoscan_e2e_{patient_id}_")
                try:
                    result = run_pipeline(patient_dir=patient_dir, output_dir=tmp_out)

                    # JSON schema check
                    for key in ("scan_id", "patient", "scan_metadata", "volumes", "findings", "summary"):
                        self.assertIn(key, result)

                    # All 3 NRRDs loadable
                    for fname in ("ct_volume.nrrd", "lung_segmentation.nrrd", "pathology_mask.nrrd"):
                        path = os.path.join(tmp_out, fname)
                        self.assertTrue(os.path.exists(path), f"Missing {fname}")
                        data, header = nrrd.read(path)
                        self.assertGreater(data.size, 0)
                        self.assertIn("space directions", header)
                        self.assertEqual(header["encoding"], "gzip")

                    # HU range sanity
                    ct_data, _ = nrrd.read(os.path.join(tmp_out, "ct_volume.nrrd"))
                    self.assertGreater(float(ct_data.min()), -2100)
                    self.assertLess(float(ct_data.max()),     3200)

                    # Lung labels
                    seg_data, _ = nrrd.read(os.path.join(tmp_out, "lung_segmentation.nrrd"))
                    self.assertTrue(set(np.unique(seg_data).tolist()).issubset({0, 1, 2}))

                    print(f"  {patient_id}: {result['scan_metadata']['slice_count']} slices, "
                          f"{len(result['findings'])} findings")

                finally:
                    shutil.rmtree(tmp_out, ignore_errors=True)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    unittest.main(verbosity=2)
