import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Signed distance from point (x,y,z) to the surface of an ellipsoid
 * centred at (cx,cy,cz) with semi-axes (rx,ry,rz).
 * Negative = inside.
 */
function ellipsoidSDF(x, y, z, cx, cy, cz, rx, ry, rz) {
  return (
    ((x - cx) / rx) ** 2 +
    ((y - cy) / ry) ** 2 +
    ((z - cz) / rz) ** 2 -
    1
  );
}

/** Distance² from point (x,y,z) to sphere centre (cx,cy,cz). */
function distSq(x, y, z, cx, cy, cz) {
  return (x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2;
}

// ---------------------------------------------------------------------------
// Volume dimensions & spacing (must match ML mock generator)
// ---------------------------------------------------------------------------
const DIMS = [64, 64, 64];
const SPACING = [0.7, 0.7, 1.5]; // mm per voxel — matches ML pipeline mock
const ORIGIN = [0, 0, 0];

// ---------------------------------------------------------------------------
// Lung geometry (in voxel coordinates)
// ---------------------------------------------------------------------------
const CENTER_X = 32;
const CENTER_Y = 32;
const CENTER_Z = 32;

// Right lung (label = 2) — slightly larger, on +x side
const RIGHT_LUNG = { cx: 22, cy: 32, cz: 32, rx: 14, ry: 10, rz: 18 };
// Left lung  (label = 1) — slightly smaller, on -x side  (mirrored)
const LEFT_LUNG  = { cx: 42, cy: 32, cz: 32, rx: 13, ry: 9,  rz: 17 };

// ---------------------------------------------------------------------------
// Pathology spheres (voxel coordinates)
// ---------------------------------------------------------------------------
const NODULE_1 = { cx: 22, cy: 30, cz: 34, r: 4, label: 1 }; // inside right lung
const NODULE_2 = { cx: 44, cy: 34, cz: 30, r: 2, label: 2 }; // inside left lung

// ---------------------------------------------------------------------------
// Convert voxel coords → world coords   world = ijk * spacing + origin
// ---------------------------------------------------------------------------
function voxelToWorld(ijk) {
  return [
    ijk[0] * SPACING[0] + ORIGIN[0],
    ijk[1] * SPACING[1] + ORIGIN[1],
    ijk[2] * SPACING[2] + ORIGIN[2],
  ];
}

// ---------------------------------------------------------------------------
// Build a vtkImageData from a typed array
// ---------------------------------------------------------------------------
function buildImageData(scalars, dataType, name) {
  const imageData = vtkImageData.newInstance();
  imageData.setDimensions(...DIMS);
  imageData.setSpacing(...SPACING);
  imageData.setOrigin(...ORIGIN);

  const da = vtkDataArray.newInstance({
    name: name || 'Scalars',
    numberOfComponents: 1,
    values: scalars,
  });
  imageData.getPointData().setScalars(da);
  return imageData;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate synthetic mock data entirely in JS.
 *
 * @returns {{ lungVolume: vtkImageData, pathologyVolume: vtkImageData, scanData: object }}
 */
export function generateMockData() {
  const numVoxels = DIMS[0] * DIMS[1] * DIMS[2];

  // ----- lung segmentation -----
  const lungScalars = new Uint8Array(numVoxels);

  for (let z = 0; z < DIMS[2]; z++) {
    for (let y = 0; y < DIMS[1]; y++) {
      for (let x = 0; x < DIMS[0]; x++) {
        const idx = x + y * DIMS[0] + z * DIMS[0] * DIMS[1];
        const inRight =
          ellipsoidSDF(
            x, y, z,
            RIGHT_LUNG.cx, RIGHT_LUNG.cy, RIGHT_LUNG.cz,
            RIGHT_LUNG.rx, RIGHT_LUNG.ry, RIGHT_LUNG.rz,
          ) <= 0;
        const inLeft =
          ellipsoidSDF(
            x, y, z,
            LEFT_LUNG.cx, LEFT_LUNG.cy, LEFT_LUNG.cz,
            LEFT_LUNG.rx, LEFT_LUNG.ry, LEFT_LUNG.rz,
          ) <= 0;

        if (inRight) lungScalars[idx] = 2;
        else if (inLeft) lungScalars[idx] = 1;
        // else 0 (background)
      }
    }
  }

  const lungVolume = buildImageData(lungScalars, 'Uint8Array', 'LungLabels');

  // ----- pathology mask -----
  const pathScalars = new Uint8Array(numVoxels);

  for (let z = 0; z < DIMS[2]; z++) {
    for (let y = 0; y < DIMS[1]; y++) {
      for (let x = 0; x < DIMS[0]; x++) {
        const idx = x + y * DIMS[0] + z * DIMS[0] * DIMS[1];
        if (distSq(x, y, z, NODULE_1.cx, NODULE_1.cy, NODULE_1.cz) <= NODULE_1.r ** 2) {
          pathScalars[idx] = NODULE_1.label;
        } else if (distSq(x, y, z, NODULE_2.cx, NODULE_2.cy, NODULE_2.cz) <= NODULE_2.r ** 2) {
          pathScalars[idx] = NODULE_2.label;
        }
      }
    }
  }

  const pathologyVolume = buildImageData(pathScalars, 'Uint8Array', 'PathologyLabels');

  // ----- contract JSON (scanData) -----
  const nodule1World = voxelToWorld([NODULE_1.cx, NODULE_1.cy, NODULE_1.cz]);
  const nodule2World = voxelToWorld([NODULE_2.cx, NODULE_2.cy, NODULE_2.cz]);

  const scanData = {
    scan_id: 'mock-scan-001',
    patient_id: 'mock-patient-001',
    series_uid: '1.3.6.1.4.1.14519.5.2.1.6279.6001.0000000000000000000000000',
    volumes: {
      lung: { url: 'mock://lung_segmentation.nrrd', format: 'nrrd' },
      pathology_mask: { url: 'mock://pathology_mask.nrrd', format: 'nrrd' },
      original_ct: { url: 'mock://ct_volume.nrrd', format: 'nrrd' },
    },
    findings: [
      {
        id: 'finding-1',
        label: 'Nodule A',
        center_world: nodule1World,
        radius_mm: NODULE_1.r * SPACING[0], // approximate in mm
        severity: 'high',
        description: 'Solid nodule in right lung, ~5.6 mm',
      },
      {
        id: 'finding-2',
        label: 'Nodule B',
        center_world: nodule2World,
        radius_mm: NODULE_2.r * SPACING[0],
        severity: 'medium',
        description: 'Small nodule in left lung, ~2.8 mm',
      },
    ],
    metadata: {
      pipeline_version: 'mock-0.0.1',
      processed_at: new Date().toISOString(),
      spacing_mm: [...SPACING],
      origin_mm: [...ORIGIN],
    },
  };

  return { lungVolume, pathologyVolume, scanData };
}

export default generateMockData;
