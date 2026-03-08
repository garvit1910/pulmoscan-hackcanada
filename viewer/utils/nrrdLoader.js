import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import { readImage } from '@itk-wasm/image-io';

// ---------------------------------------------------------------------------
// Map itk-wasm component types → JS typed arrays
// ---------------------------------------------------------------------------
const TYPED_ARRAY_MAP = {
  int8:    Int8Array,
  uint8:   Uint8Array,
  int16:   Int16Array,
  uint16:  Uint16Array,
  int32:   Int32Array,
  uint32:  Uint32Array,
  float32: Float32Array,
  float64: Float64Array,
};

/**
 * Pick the right TypedArray constructor for an itk‑wasm image.
 * itk-wasm ≥ 1.0 uses `image.imageType.componentType` which is a string like
 * "int16", "uint8", etc.  Older versions may use an enum integer – we handle
 * both.
 */
function resolveTypedArray(itkImage) {
  const ct =
    itkImage.imageType?.componentType ??
    itkImage.imageType?.componentType;

  if (typeof ct === 'string') {
    const lower = ct.toLowerCase().replace('_', '');
    if (TYPED_ARRAY_MAP[lower]) return TYPED_ARRAY_MAP[lower];
  }

  // Fallback: guess from the ArrayBuffer byte length
  const numPixels = itkImage.size.reduce((a, b) => a * b, 1);
  const bytesPerPixel = itkImage.data.byteLength / numPixels;
  if (bytesPerPixel === 1) return Uint8Array;
  if (bytesPerPixel === 2) return Int16Array;
  if (bytesPerPixel === 4) return Float32Array;
  return Float32Array;
}

// ---------------------------------------------------------------------------
// Convert an itk-wasm Image → vtkImageData
// ---------------------------------------------------------------------------
function itkImageToVtkImageData(itkImage) {
  const imageData = vtkImageData.newInstance();

  // Dimensions
  const dims = itkImage.size; // [x, y, z]
  imageData.setDimensions(dims[0], dims[1], dims[2]);

  // Spacing & origin — CRITICAL: preserve real-world NRRD metadata
  imageData.setSpacing(
    itkImage.spacing[0],
    itkImage.spacing[1],
    itkImage.spacing[2],
  );
  imageData.setOrigin(
    itkImage.origin[0],
    itkImage.origin[1],
    itkImage.origin[2],
  );

  // Direction cosines (3×3 → flattened to 9)
  if (itkImage.direction && itkImage.direction.data) {
    imageData.setDirection(Array.from(itkImage.direction.data));
  } else if (itkImage.direction) {
    imageData.setDirection(Array.from(itkImage.direction));
  }

  // Scalars — use typed array matching the source pixel type
  const TypedArrayCtor = resolveTypedArray(itkImage);
  const values =
    itkImage.data instanceof TypedArrayCtor
      ? itkImage.data
      : new TypedArrayCtor(itkImage.data.buffer, itkImage.data.byteOffset, itkImage.data.byteLength / TypedArrayCtor.BYTES_PER_ELEMENT);

  const scalars = vtkDataArray.newInstance({
    name: 'Scalars',
    numberOfComponents: 1,
    values,
  });
  imageData.getPointData().setScalars(scalars);

  return imageData;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch a single NRRD file from a URL and decode it into vtkImageData.
 *
 * @param {string} url  Absolute or relative URL to the .nrrd file.
 * @returns {Promise<vtkImageData>}
 */
export async function loadNrrdFromUrl(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch NRRD from ${url}: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();

  // @itk-wasm/image-io readImage expects a BinaryFile { path, data: Uint8Array }
  // The file name extension tells it which reader to use.
  const { image: itkImage } = await readImage({ path: 'volume.nrrd', data: new Uint8Array(arrayBuffer) });

  return itkImageToVtkImageData(itkImage);
}

/**
 * Load all three volumes referenced in the contract JSON.
 *
 * @param {object}  scanData  Object matching contract.schema.json
 * @returns {Promise<{ lungVolume: vtkImageData, pathologyVolume: vtkImageData, ctVolume: vtkImageData | null }>}
 */
export async function loadAllVolumes(scanData) {
  if (!scanData?.volumes?.lung?.url || !scanData?.volumes?.pathology_mask?.url) {
    throw new Error('scanData.volumes.lung.url and pathology_mask.url are required');
  }
  const promises = [];

  // lung segmentation (required)
  promises.push(loadNrrdFromUrl(scanData.volumes.lung.url));

  // pathology mask (required)
  promises.push(loadNrrdFromUrl(scanData.volumes.pathology_mask.url));

  // original CT (optional — may not exist yet)
  const ctUrl = scanData.volumes.original_ct?.url;
  if (ctUrl) {
    promises.push(loadNrrdFromUrl(ctUrl));
  } else {
    promises.push(Promise.resolve(null));
  }

  const [lungVolume, pathologyVolume, ctVolume] = await Promise.all(promises);
  return { lungVolume, pathologyVolume, ctVolume };
}

export default loadNrrdFromUrl;
