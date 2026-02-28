/**
 * Color Extraction — k-means clustering in Lab color space
 *
 * Returns k dominant colors from an image, sorted by visual weight.
 * Used by the Border tool to offer palette swatches.
 */

const K = 8;
const MAX_ITERATIONS = 20;
const DOWNSAMPLE_SIZE = 64;

/**
 * Extract dominant colors from an image source
 * @param {ImageBitmap|HTMLCanvasElement|ImageData} source
 * @param {number} k — number of colors to extract
 * @returns {Promise<string[]>} array of hex color strings, sorted by visual weight
 */
export async function extractColors(source, k = K) {
  const pixels = await getPixelData(source, DOWNSAMPLE_SIZE);
  const lab = convertToLab(pixels);
  const centers = kMeans(lab, k);
  return centersToHex(centers, pixels);
}

// ── Pixel extraction ───────────────────────────────────────

async function getPixelData(source, size) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');

  if (source instanceof ImageData) {
    const temp = new OffscreenCanvas(source.width, source.height);
    const tCtx = temp.getContext('2d');
    tCtx.putImageData(source, 0, 0);
    ctx.drawImage(temp, 0, 0, size, size);
  } else {
    ctx.drawImage(source, 0, 0, size, size);
  }

  return ctx.getImageData(0, 0, size, size).data;
}

// ── Color space conversion (RGB → Lab) ────────────────────

function rgbToLab(r, g, b) {
  // Linearize
  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;

  // RGB → XYZ (D65 illuminant)
  let x = r * 0.4124 + g * 0.3576 + b * 0.1805;
  let y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  let z = r * 0.0193 + g * 0.1192 + b * 0.9505;

  // XYZ → Lab
  x /= 0.95047;
  y /= 1.00000;
  z /= 1.08883;

  const f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16/116;

  const fx = f(x), fy = f(y), fz = f(z);

  return [
    116 * fy - 16,    // L
    500 * (fx - fy),  // a
    200 * (fy - fz),  // b
  ];
}

function convertToLab(pixelData) {
  const points = [];
  for (let i = 0; i < pixelData.length; i += 4) {
    const r = pixelData[i]     / 255;
    const g = pixelData[i + 1] / 255;
    const b = pixelData[i + 2] / 255;

    // Skip near-white and near-black (usually background/sky)
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum < 0.05 || lum > 0.97) continue;

    points.push(rgbToLab(r, g, b));
  }
  return points;
}

// ── K-means ────────────────────────────────────────────────

function kMeans(points, k) {
  if (points.length === 0) {
    // Fallback: neutral colors
    return Array.from({ length: k }, (_, i) => {
      const v = (i / k) * 100;
      return [v, 0, 0];
    });
  }

  // Initialize with k-means++ seeding (better spread than random)
  const centers = kMeansPlusPlus(points, k);

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    // Assignment step
    const clusters = Array.from({ length: k }, () => []);

    for (const point of points) {
      let minDist = Infinity;
      let nearest = 0;
      for (let j = 0; j < k; j++) {
        const d = labDistance(point, centers[j]);
        if (d < minDist) {
          minDist = d;
          nearest = j;
        }
      }
      clusters[nearest].push(point);
    }

    // Update step
    let moved = false;
    for (let j = 0; j < k; j++) {
      if (clusters[j].length === 0) continue;
      const newCenter = meanPoint(clusters[j]);
      if (labDistance(newCenter, centers[j]) > 0.01) moved = true;
      centers[j] = newCenter;
    }

    if (!moved) break;
  }

  return centers;
}

function kMeansPlusPlus(points, k) {
  const centers = [points[Math.floor(Math.random() * points.length)]];

  for (let i = 1; i < k; i++) {
    // Compute distances from nearest center
    const distances = points.map((p) => {
      let minDist = Infinity;
      for (const c of centers) {
        minDist = Math.min(minDist, labDistance(p, c));
      }
      return minDist * minDist; // squared for probability weighting
    });

    // Weighted random selection
    const total = distances.reduce((a, b) => a + b, 0);
    let rand = Math.random() * total;
    for (let j = 0; j < points.length; j++) {
      rand -= distances[j];
      if (rand <= 0) {
        centers.push(points[j]);
        break;
      }
    }
    if (centers.length <= i) centers.push(points[points.length - 1]);
  }

  return centers;
}

function labDistance(a, b) {
  const dl = a[0] - b[0], da = a[1] - b[1], db = a[2] - b[2];
  return Math.sqrt(dl * dl + da * da + db * db);
}

function meanPoint(points) {
  const sum = [0, 0, 0];
  for (const p of points) {
    sum[0] += p[0];
    sum[1] += p[1];
    sum[2] += p[2];
  }
  return sum.map(v => v / points.length);
}

// ── Convert centers back to hex ────────────────────────────

function centersToHex(labCenters, originalPixels) {
  return labCenters
    .map((lab) => labToHex(lab))
    .filter(Boolean)
    .sort((a, b) => colorWeight(b) - colorWeight(a));
}

function labToHex(lab) {
  const [L, a, b] = lab;

  // Lab → XYZ
  let fy = (L + 16) / 116;
  let fx = a / 500 + fy;
  let fz = fy - b / 200;

  const f3 = (t) => t > 0.206897 ? t * t * t : (t - 16/116) / 7.787;

  let x = f3(fx) * 0.95047;
  let y = f3(fy) * 1.00000;
  let z = f3(fz) * 1.08883;

  // XYZ → linear RGB
  let r =  x * 3.2406 + y * -1.5372 + z * -0.4986;
  let g = -x * 0.9689 + y *  1.8758 + z *  0.0415;
  let bv =  x * 0.0557 + y * -0.2040 + z *  1.0570;

  // Gamma encode
  const gamma = (c) => c > 0.0031308 ? 1.055 * Math.pow(c, 1/2.4) - 0.055 : 12.92 * c;
  r = Math.max(0, Math.min(1, gamma(r)));
  g = Math.max(0, Math.min(1, gamma(g)));
  bv = Math.max(0, Math.min(1, gamma(bv)));

  const toHex = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(bv)}`;
}

function colorWeight(hex) {
  // Weight by saturation (more saturated = more useful as border color option)
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return (max - min) / (max + 0.001); // approximate saturation
}
