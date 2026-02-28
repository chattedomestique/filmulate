/**
 * Image Analysis Pass — runs before film emulation
 *
 * Analyzes the image's luminance distribution, color balance,
 * and saturation to inform the adaptive emulation shader.
 *
 * This is a CPU-side JavaScript pass, run on a downsampled
 * 128×128 version of the image for speed.
 */

const DOWNSAMPLE_SIZE = 128;

/**
 * @param {ImageBitmap|HTMLCanvasElement|ImageData} source
 * @returns {Object} Analysis results (uniforms for emulation shader)
 */
export async function analyzeImage(source) {
  const pixels = await getPixelData(source, DOWNSAMPLE_SIZE);
  return analyze(pixels, DOWNSAMPLE_SIZE, DOWNSAMPLE_SIZE);
}

// ── Internal: Pixel extraction ─────────────────────────────

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

// ── Internal: Analysis logic ───────────────────────────────

function analyze(data, w, h) {
  const numPixels = w * h;

  // Luminance histogram (256 buckets)
  const histogram = new Float32Array(256);

  // Per-channel sums for color temperature
  let sumR = 0, sumG = 0, sumB = 0;

  // Saturation accumulator
  let sumSat = 0;

  // Hue distribution (12 buckets × 30°)
  const hueHist = new Float32Array(12);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]     / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;

    // Luminance (perceptual)
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    histogram[Math.min(255, Math.floor(lum * 255))]++;

    sumR += r;
    sumG += g;
    sumB += b;

    // HSL for saturation and hue
    const { h, s } = rgbToHsl(r, g, b);
    sumSat += s;

    if (s > 0.1) { // only count hues with meaningful saturation
      const bucket = Math.floor(h * 12) % 12;
      hueHist[bucket]++;
    }
  }

  // Normalize histogram to proportions
  for (let i = 0; i < 256; i++) histogram[i] /= numPixels;

  // Key tonal measurements using percentile of cumulative histogram
  const shadowPoint    = percentileLuminance(histogram, 0.05);   // 5th percentile
  const midpoint       = percentileLuminance(histogram, 0.50);   // median
  const highlightPoint = percentileLuminance(histogram, 0.95);   // 95th percentile
  const dynamicRange   = Math.max(highlightPoint - shadowPoint, 0.01);

  // Color temperature: compare R vs B channel means
  // Positive = warm (red bias), negative = cool (blue bias)
  const meanR = sumR / numPixels;
  const meanB = sumB / numPixels;
  const meanG = sumG / numPixels;
  const colorTemp = clamp((meanR - meanB) * 2.0, -1.0, 1.0);

  // Mean saturation
  const meanSaturation = clamp(sumSat / numPixels, 0, 1);

  // Normalize hue distribution
  const maxHue = Math.max(...hueHist, 1);
  const hueDistribution = Array.from(hueHist).map(v => v / maxHue);

  return {
    shadowPoint,
    midpoint,
    highlightPoint,
    dynamicRange,
    colorTemp,
    meanSaturation,
    hueDistribution,
  };
}

// ── Helpers ────────────────────────────────────────────────

function percentileLuminance(histogram, percentile) {
  let cumulative = 0;
  for (let i = 0; i < 256; i++) {
    cumulative += histogram[i];
    if (cumulative >= percentile) {
      return i / 255;
    }
  }
  return 1.0;
}

function rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;

  let s = 0;
  let h = 0;

  if (delta > 0.001) {
    s = delta / (1 - Math.abs(2 * l - 1));

    if (max === r) {
      h = ((g - b) / delta + 6) % 6;
    } else if (max === g) {
      h = (b - r) / delta + 2;
    } else {
      h = (r - g) / delta + 4;
    }
    h /= 6;
  }

  return { h, s, l };
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

/**
 * Convert analysis results to WebGL uniform format
 * @param {Object} analysis — result of analyzeImage()
 * @returns {Object} uniform key-value pairs for pipeline.setParams()
 */
export function analysisToUniforms(analysis) {
  return {
    img_shadow:     analysis.shadowPoint,
    img_mid:        analysis.midpoint,
    img_highlight:  analysis.highlightPoint,
    img_dr:         analysis.dynamicRange,
    img_colortemp:  analysis.colorTemp,
    img_saturation: analysis.meanSaturation,
  };
}
