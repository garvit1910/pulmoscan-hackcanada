import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';

// ---------------------------------------------------------------------------
// Type map — covers every type pynrrd / SimpleITK may write
// ---------------------------------------------------------------------------
const TYPE_MAP = {
  float:   { ctor: Float32Array, bytes: 4 },
  float32: { ctor: Float32Array, bytes: 4 },
  double:  { ctor: Float64Array, bytes: 8 },
  float64: { ctor: Float64Array, bytes: 8 },
  int:     { ctor: Int32Array,   bytes: 4 },
  int32:   { ctor: Int32Array,   bytes: 4 },
  int16:   { ctor: Int16Array,   bytes: 2 },
  short:   { ctor: Int16Array,   bytes: 2 },
  uint16:  { ctor: Uint16Array,  bytes: 2 },
  ushort:  { ctor: Uint16Array,  bytes: 2 },
  uint8:   { ctor: Uint8Array,   bytes: 1 },
  uchar:   { ctor: Uint8Array,   bytes: 1 },
  uint:    { ctor: Uint32Array,  bytes: 4 },
  uint32:  { ctor: Uint32Array,  bytes: 4 },
};

// ---------------------------------------------------------------------------
// Pure-JS NRRD parser — no WASM, no web workers required.
// Handles gzip encoding via browser-native DecompressionStream API.
// ---------------------------------------------------------------------------
async function parseNrrd(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);

  // NRRD header ends at the first blank line (\n\n)
  let separatorIdx = -1;
  for (let i = 0; i < bytes.length - 1; i++) {
    if (bytes[i] === 10 && bytes[i + 1] === 10) {
      separatorIdx = i;
      break;
    }
  }
  if (separatorIdx === -1) throw new Error('NRRD: could not find header/data separator (\\n\\n)');

  // Parse header key-value pairs
  const headerText = new TextDecoder().decode(bytes.slice(0, separatorIdx));
  const header = {};
  for (const line of headerText.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    header[line.slice(0, colonIdx).trim()] = line.slice(colonIdx + 1).trim();
  }

  // sizes → [X, Y, Z]
  if (!header['sizes']) throw new Error('NRRD: missing "sizes" field');
  const sizes = header['sizes'].split(/\s+/).map(Number);

  // type → TypedArray constructor
  const typeKey = (header['type'] ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const typeInfo = TYPE_MAP[typeKey];
  if (!typeInfo) throw new Error(`NRRD: unsupported type "${header['type']}"`);

  // spacing — prefer "space directions" diagonal over "spacings"
  const spacing = [1, 1, 1];
  if (header['space directions']) {
    // e.g. "(0.78125,0,0) (0,0.78125,0) (0,0,1.5)"
    const matches = [...header['space directions'].matchAll(/\(([^)]+)\)/g)];
    if (matches.length >= 3) {
      spacing[0] = Math.abs(parseFloat(matches[0][1].split(',')[0]));
      spacing[1] = Math.abs(parseFloat(matches[1][1].split(',')[1]));
      spacing[2] = Math.abs(parseFloat(matches[2][1].split(',')[2]));
    }
  } else if (header['spacings']) {
    const sp = header['spacings'].split(/\s+/).map(Number);
    spacing[0] = sp[0]; spacing[1] = sp[1]; spacing[2] = sp[2];
  }

  // origin — "space origin: (ox,oy,oz)"
  const origin = [0, 0, 0];
  if (header['space origin']) {
    const m = header['space origin'].match(/\(([^)]+)\)/);
    if (m) {
      const parts = m[1].split(',').map(Number);
      origin[0] = parts[0]; origin[1] = parts[1]; origin[2] = parts[2];
    }
  }

  // raw bytes after the blank line
  const dataBytes = bytes.slice(separatorIdx + 2);

  // decompress if gzip
  let rawData;
  const encoding = (header['encoding'] ?? 'raw').toLowerCase();
  if (encoding === 'gzip' || encoding === 'gz') {
    rawData = await gunzip(dataBytes);
  } else {
    rawData = dataBytes;
  }

  // typed array view (handle potential byte-alignment issues)
  const { ctor, bytes: bpe } = typeInfo;
  let values;
  if (rawData.byteOffset % bpe === 0) {
    values = new ctor(rawData.buffer, rawData.byteOffset, rawData.byteLength / bpe);
  } else {
    const aligned = rawData.buffer.slice(rawData.byteOffset, rawData.byteOffset + rawData.byteLength);
    values = new ctor(aligned);
  }

  // build vtkImageData
  const imageData = vtkImageData.newInstance();
  imageData.setDimensions(sizes[0], sizes[1], sizes[2]);
  imageData.setSpacing(spacing[0], spacing[1], spacing[2]);
  imageData.setOrigin(origin[0], origin[1], origin[2]);
  imageData.getPointData().setScalars(
    vtkDataArray.newInstance({ name: 'Scalars', numberOfComponents: 1, values }),
  );

  return imageData;
}

// Gunzip via browser-native DecompressionStream (no WASM needed)
async function gunzip(data) {
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();

  writer.write(data);
  writer.close();

  const chunks = [];
  let totalLen = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLen += value.length;
  }

  const out = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
  return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function loadNrrdFromUrl(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch NRRD from ${url}: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return parseNrrd(arrayBuffer);
}

export async function loadAllVolumes(scanData) {
  if (!scanData?.volumes?.lung?.url || !scanData?.volumes?.pathology_mask?.url) {
    throw new Error('scanData.volumes.lung.url and pathology_mask.url are required');
  }

  const [lungVolume, pathologyVolume, ctVolume] = await Promise.all([
    loadNrrdFromUrl(scanData.volumes.lung.url),
    loadNrrdFromUrl(scanData.volumes.pathology_mask.url),
    scanData.volumes.original_ct?.url
      ? loadNrrdFromUrl(scanData.volumes.original_ct.url)
      : Promise.resolve(null),
  ]);

  return { lungVolume, pathologyVolume, ctVolume };
}

export default loadNrrdFromUrl;
