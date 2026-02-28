/**
 * Minimal EXIF writer — injects metadata into JPEG blobs
 *
 * Writes:
 * - Software: "Grain Film Emulation"
 * - ImageDescription: stock name + settings
 * - UserComment: JSON-encoded settings
 *
 * Pure JS, no external dependencies.
 * JPEG EXIF format: JFIF header → APP1 marker → EXIF IFD
 */

// JPEG markers
const SOI  = [0xFF, 0xD8];           // Start of image
const APP1 = [0xFF, 0xE1];           // Application marker (EXIF lives here)
const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"

// TIFF byte order: little-endian
const BYTE_ORDER = [0x49, 0x49]; // "II" = Intel = little-endian
const MAGIC = [0x2A, 0x00];      // TIFF magic: 42

/**
 * Inject EXIF metadata into a JPEG blob
 * @param {Blob} jpegBlob — original JPEG blob
 * @param {Object} meta — { stockName, settings, exposure, grain }
 * @returns {Promise<Blob>} new JPEG blob with EXIF
 */
export async function injectExif(jpegBlob, meta = {}) {
  try {
    const arrayBuffer = await jpegBlob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    // Verify JPEG SOI
    if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) {
      console.warn('Not a valid JPEG, skipping EXIF injection');
      return jpegBlob;
    }

    const exifSegment = buildExifSegment(meta);
    const result = mergeExif(bytes, exifSegment);

    return new Blob([result], { type: 'image/jpeg' });
  } catch (err) {
    // EXIF injection is best-effort — don't fail export over it
    console.warn('EXIF injection failed:', err);
    return jpegBlob;
  }
}

// ── EXIF segment builder ───────────────────────────────────

function buildExifSegment(meta) {
  const software = 'Grain Film Emulation';
  const description = meta.stockName
    ? `Film: ${meta.stockName}${meta.exposure ? ` | EV: ${meta.exposure}` : ''}`
    : 'Grain Film Emulation';
  const userComment = JSON.stringify({
    stock: meta.stockName || null,
    exposure: meta.exposure || 0,
    grain: meta.grain || 0,
    soften: meta.soften || 0,
    strength: meta.filmStrength || 1.0,
  });

  // Build IFD entries (tag, type, count, value/offset)
  // Types: 2=ASCII, 7=UNDEFINED
  const entries = [];
  const dataArea = [];
  let dataOffset = 0;

  function addAscii(tag, str) {
    const bytes = encodeAscii(str + '\0');
    if (bytes.length <= 4) {
      // Fits inline
      const padded = new Uint8Array(4);
      padded.set(bytes);
      entries.push({ tag, type: 2, count: bytes.length, value: padded });
    } else {
      // Offset to data area
      const pos = dataOffset;
      dataArea.push(...bytes);
      dataOffset += bytes.length;
      // Placeholder — offset filled in later
      entries.push({ tag, type: 2, count: bytes.length, valueOffset: pos });
    }
  }

  addAscii(0x010E, description);  // ImageDescription
  addAscii(0x0131, software);     // Software

  // IFD header size: 2 (count) + entries * 12 + 4 (next IFD offset)
  const ifdSize = 2 + entries.length * 12 + 4;
  // TIFF header: 8 bytes
  const tiffHeaderSize = 8;
  // IFD offset from start of TIFF data
  const ifdOffset = tiffHeaderSize;
  // Data area starts after IFD
  const dataAreaStart = tiffHeaderSize + ifdSize;

  const totalSize = tiffHeaderSize + ifdSize + dataArea.length;
  const buffer = new Uint8Array(totalSize);
  const view = new DataView(buffer.buffer);

  // TIFF header
  buffer[0] = 0x49; buffer[1] = 0x49; // LE
  view.setUint16(2, 42, true);         // magic
  view.setUint32(4, ifdOffset, true);  // IFD0 offset

  // IFD entry count
  view.setUint16(ifdOffset, entries.length, true);

  // Write entries
  let entryBase = ifdOffset + 2;
  for (const entry of entries) {
    view.setUint16(entryBase,      entry.tag,   true);
    view.setUint16(entryBase + 2,  entry.type,  true);
    view.setUint32(entryBase + 4,  entry.count, true);

    if (entry.value) {
      buffer.set(entry.value, entryBase + 8);
    } else if (entry.valueOffset !== undefined) {
      // Offset relative to start of TIFF data
      view.setUint32(entryBase + 8, dataAreaStart + entry.valueOffset, true);
    }

    entryBase += 12;
  }

  // Next IFD offset = 0 (no more IFDs)
  view.setUint32(entryBase, 0, true);

  // Write data area
  buffer.set(new Uint8Array(dataArea), dataAreaStart);

  // Wrap in EXIF header
  const exifData = new Uint8Array(EXIF_HEADER.length + buffer.length);
  exifData.set(EXIF_HEADER);
  exifData.set(buffer, EXIF_HEADER.length);

  return exifData;
}

// ── JPEG merger ────────────────────────────────────────────

function mergeExif(jpegBytes, exifData) {
  // APP1 segment: marker (2) + length (2) + data
  const segmentLength = 2 + exifData.length;
  const app1 = new Uint8Array(2 + 2 + exifData.length);
  app1[0] = 0xFF;
  app1[1] = 0xE1;
  app1[2] = (segmentLength >> 8) & 0xFF;
  app1[3] = segmentLength & 0xFF;
  app1.set(exifData, 4);

  // Insert after SOI (first 2 bytes)
  const result = new Uint8Array(jpegBytes.length + app1.length);
  result.set(jpegBytes.slice(0, 2));  // SOI
  result.set(app1, 2);                 // Our APP1
  result.set(jpegBytes.slice(2), 2 + app1.length); // Rest of JPEG

  return result;
}

// ── Helpers ────────────────────────────────────────────────

function encodeAscii(str) {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    bytes[i] = str.charCodeAt(i) & 0xFF;
  }
  return bytes;
}
