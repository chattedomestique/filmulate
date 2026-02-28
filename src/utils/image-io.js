/**
 * Image I/O — import and export helpers
 */

/**
 * Decode an image file to ImageBitmap
 * Supports JPEG, PNG, HEIC (via iOS native decode), WebP
 *
 * @param {File} file
 * @param {function} onProgress — optional progress callback
 * @returns {Promise<ImageBitmap>}
 */
export async function importImage(file) {
  if (!file || !file.type.startsWith('image/')) {
    throw new Error('Invalid file: not an image');
  }

  // Create blob URL and decode
  const url = URL.createObjectURL(file);

  try {
    // createImageBitmap handles HEIC on iOS Safari natively
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('Image decode failed'));
      img.src = url;
    });

    // imageOrientation: 'none' — ignore EXIF rotation tags entirely.
    // The user controls orientation manually; auto-rotation causes random flips
    // across different browsers/images.
    const bitmap = await createImageBitmap(img, { imageOrientation: 'none' });
    return bitmap;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Get ImageData from an ImageBitmap at a given size
 * @param {ImageBitmap} bitmap
 * @param {number} [maxSize] — max dimension (maintains aspect ratio)
 * @returns {ImageData}
 */
export function bitmapToImageData(bitmap, maxSize = null) {
  let w = bitmap.width;
  let h = bitmap.height;

  if (maxSize && (w > maxSize || h > maxSize)) {
    const ratio = Math.min(maxSize / w, maxSize / h);
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
  }

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

/**
 * Trigger a file download in the browser
 * On iOS this opens in the share sheet (user can save to Photos)
 *
 * @param {Blob} blob
 * @param {string} filename
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;

  // Must be in DOM for iOS
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  setTimeout(() => URL.revokeObjectURL(url), 15000);
}

/**
 * Generate a filename for export
 * @param {string} stockId — active film stock ID or null
 * @returns {string}
 */
export function generateFilename(stockId = null) {
  const date = new Date();
  const dateStr = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('');

  const stockStr = stockId ? `-${stockId.toUpperCase()}` : '';
  return `grain${stockStr}-${dateStr}.jpg`;
}

/**
 * Convert ImageBitmap to a data URL for preview
 * @param {ImageBitmap} bitmap
 * @param {number} maxSize
 * @returns {Promise<string>}
 */
export async function bitmapToDataURL(bitmap, maxSize = 256) {
  let w = bitmap.width;
  let h = bitmap.height;
  if (w > maxSize || h > maxSize) {
    const ratio = Math.min(maxSize / w, maxSize / h);
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
  }

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, w, h);

  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}
