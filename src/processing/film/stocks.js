/**
 * Film Stock Definitions — Fujifilm emulsion parameters
 *
 * Each stock drives the shared adaptive film_emulate.frag.glsl shader.
 * Parameters are grounded in sensitometric data and community analysis
 * (filmulator project, darktable film emulation, Fujifilm technical documentation).
 *
 * Do not modify these numbers arbitrarily — they represent researched
 * emulsion characteristics. If adjusting, document the source.
 *
 * Spectral matrices: 3×3, row = output channel (R, G, B),
 * columns = input channels (R, G, B contribution).
 * Near-identity = neutral. Deviations = stock-specific spectral sensitivity.
 */

export const FILM_STOCKS = {

  // ── PROVIA 100F (RDP III) ──────────────────────────────────
  // The reference slide film. Natural color rendition, moderate contrast.
  // Nearest to neutral of all Fuji slide stocks.
  // H&D: nearly straight characteristic curve, very slight S-shape.
  // Source: Fujifilm RDP III technical data sheet; filmulator reference.
  PROVIA_100F: {
    id: 'provia100f',
    name: 'Provia 100F',
    shortName: 'PROVIA',
    description: 'Natural color, moderate contrast. The slide film reference standard.',
    shadowLift: 0.01,
    highlightCompression: 0.05,
    toeStrength: 0.08,
    shoulderStrength: 0.12,
    midContrast: 1.05,
    spectral: [
      [0.95, 0.04, 0.01],   // R: slight green bleed into R
      [0.02, 0.96, 0.02],   // G: near-neutral
      [0.01, 0.05, 0.94],   // B: slight blue narrowing
    ],
    saturationScale: 1.0,
    colorBias: [0.01, 0.0, -0.01],
    exposureColorshift: 0.3,
    shadowColor:    [1.01, 1.00, 0.99],
    highlightColor: [1.00, 1.00, 1.01],
    crossCoupling: 0.3,
    grainPreset: { amount: 0.10, size: 0.40 },
  },

  // ── VELVIA 50 (RVP 50) ─────────────────────────────────────
  // The "vivid" slide film. Renowned for extraordinary saturation,
  // especially in reds, yellows, and greens. Deep blacks.
  // Strong S-curve. Warm rendition. Low grain.
  // Source: Fujifilm RVP technical data; community sensitometry.
  VELVIA_50: {
    id: 'velvia50',
    name: 'Velvia 50',
    shortName: 'VELVIA 50',
    description: 'Vivid saturation, deep shadows, warm greens and reds. Legendary.',
    shadowLift: 0.00,
    highlightCompression: 0.12,
    toeStrength: 0.18,
    shoulderStrength: 0.22,
    midContrast: 1.15,
    spectral: [
      [ 1.02,  0.02, -0.01],  // R slightly boosted, no blue bleed
      [-0.01,  1.04,  0.00],  // G boosted
      [ 0.00,  0.02,  0.92],  // B reduced slightly (Velvia's characteristic)
    ],
    saturationScale: 1.35,
    colorBias: [0.02, 0.0, -0.02],
    exposureColorshift: 0.6,
    shadowColor:    [0.98, 0.99, 1.02],   // very slightly cool/blue shadows
    highlightColor: [1.02, 1.01, 0.97],   // warm highlights
    crossCoupling: 0.5,
    grainPreset: { amount: 0.08, size: 0.35 },
  },

  // ── VELVIA 100 (RVP 100) ───────────────────────────────────
  // More modern Velvia. Similar vivid character to 50 but slightly
  // less extreme saturation and contrast. Finer grain.
  // Source: Fujifilm RVP 100 data sheet.
  VELVIA_100: {
    id: 'velvia100',
    name: 'Velvia 100',
    shortName: 'VELVIA 100',
    description: 'Vivid like Velvia 50 but more balanced. Excellent for landscapes.',
    shadowLift: 0.005,
    highlightCompression: 0.10,
    toeStrength: 0.15,
    shoulderStrength: 0.18,
    midContrast: 1.10,
    spectral: [
      [ 1.01,  0.02, -0.01],
      [-0.01,  1.03,  0.00],
      [ 0.00,  0.03,  0.93],
    ],
    saturationScale: 1.25,
    colorBias: [0.015, 0.0, -0.015],
    exposureColorshift: 0.5,
    shadowColor:    [0.99, 0.99, 1.01],
    highlightColor: [1.01, 1.00, 0.98],
    crossCoupling: 0.45,
    grainPreset: { amount: 0.09, size: 0.36 },
  },

  // ── ASTIA 100F (RAF 100F) ──────────────────────────────────
  // Portrait/fashion slide film. Soft contrast, accurate skin tones,
  // slightly reduced saturation vs Provia. Subtle color shifts.
  // Source: Fujifilm RAF technical data.
  ASTIA_100F: {
    id: 'astia100f',
    name: 'Astia 100F',
    shortName: 'ASTIA',
    description: 'Soft contrast, refined skin tones. Portrait and fashion work.',
    shadowLift: 0.02,
    highlightCompression: 0.04,
    toeStrength: 0.05,
    shoulderStrength: 0.10,
    midContrast: 0.97,
    spectral: [
      [0.94, 0.05, 0.01],   // R: slight muting
      [0.02, 0.96, 0.02],   // G: slightly muted
      [0.01, 0.04, 0.95],   // B: neutral
    ],
    saturationScale: 0.88,
    colorBias: [0.005, 0.0, 0.005],
    exposureColorshift: 0.2,
    shadowColor:    [1.00, 0.99, 1.01],
    highlightColor: [1.01, 1.01, 0.99],
    crossCoupling: 0.35,
    grainPreset: { amount: 0.10, size: 0.40 },
  },

  // ── CLASSIC CHROME ─────────────────────────────────────────
  // Fujifilm X-Trans simulation. Inspired by Kodachrome's desaturated,
  // muted aesthetic. Teal shadows, cinematic restraint.
  // Lifted blacks (never true black). Reduced reds.
  // Source: Fujifilm X-series JPEG simulation documentation; DPReview analysis.
  CLASSIC_CHROME: {
    id: 'classic_chrome',
    name: 'Classic Chrome',
    shortName: 'C.CHROME',
    description: 'Muted tones, teal shadows, cinematic restraint. Inspired by Kodachrome.',
    shadowLift: 0.04,
    highlightCompression: 0.08,
    toeStrength: 0.05,
    shoulderStrength: 0.15,
    midContrast: 0.92,
    spectral: [
      [0.88, 0.08, 0.02],   // R reduced, green bleeds in
      [0.01, 0.97, 0.02],   // G neutral
      [0.00, 0.06, 0.96],   // B slight cyan push
    ],
    saturationScale: 0.75,
    colorBias: [-0.01, 0.01, 0.02],
    exposureColorshift: 0.2,
    shadowColor:    [0.94, 0.98, 1.04],   // teal shadows
    highlightColor: [1.01, 1.00, 0.99],
    crossCoupling: 0.4,
    grainPreset: { amount: 0.18, size: 0.45 },
  },

  // ── CLASSIC NEGATIVE ───────────────────────────────────────
  // Fujifilm X-Trans simulation. Inspired by Superia/Reala negative film.
  // Higher contrast than Classic Chrome, warm midtones, pulled highlights.
  // Source: Fujifilm X100V manual film simulation notes; community tests.
  CLASSIC_NEGATIVE: {
    id: 'classic_negative',
    name: 'Classic Negative',
    shortName: 'C.NEG',
    description: 'High contrast, warm midtones, pulled highlights. Superia-inspired.',
    shadowLift: 0.02,
    highlightCompression: 0.10,
    toeStrength: 0.12,
    shoulderStrength: 0.20,
    midContrast: 1.08,
    spectral: [
      [0.96, 0.03, 0.00],
      [0.01, 0.97, 0.01],
      [0.01, 0.03, 0.94],
    ],
    saturationScale: 0.92,
    colorBias: [0.015, 0.005, -0.01],
    exposureColorshift: 0.35,
    shadowColor:    [1.01, 0.99, 0.97],   // warm shadows
    highlightColor: [1.00, 1.00, 1.00],
    crossCoupling: 0.4,
    grainPreset: { amount: 0.22, size: 0.48 },
  },

  // ── ETERNA CINEMA ──────────────────────────────────────────
  // Fujifilm's cinema/motion picture film simulation. Very low contrast,
  // minimal saturation boost, flat look for grading in post.
  // Deep shadow detail, open highlights.
  // Source: Fujifilm ETERNA film documentation.
  ETERNA: {
    id: 'eterna',
    name: 'Eterna Cinema',
    shortName: 'ETERNA',
    description: 'Cinema-flat. Low contrast, neutral saturation, built for grading.',
    shadowLift: 0.05,
    highlightCompression: 0.06,
    toeStrength: 0.04,
    shoulderStrength: 0.08,
    midContrast: 0.88,
    spectral: [
      [0.96, 0.03, 0.01],
      [0.01, 0.97, 0.02],
      [0.01, 0.03, 0.96],
    ],
    saturationScale: 0.80,
    colorBias: [0.00, 0.01, 0.01],
    exposureColorshift: 0.15,
    shadowColor:    [0.99, 1.00, 1.01],
    highlightColor: [1.00, 1.00, 1.00],
    crossCoupling: 0.25,
    grainPreset: { amount: 0.08, size: 0.38 },
  },

  // ── ACROS ──────────────────────────────────────────────────
  // Fujifilm's b&w film simulation. Based on Neopan Acros.
  // Pronounced contrast, deep blacks, smooth gradation.
  // The spectral matrix converts to b&w using film-accurate luminance weights.
  // Source: Fujifilm Acros technical notes; Neopan Acros sensitometry.
  ACROS: {
    id: 'acros',
    name: 'Acros',
    shortName: 'ACROS',
    description: 'B&W. Deep blacks, smooth gradation. The finest-grain Fuji mono.',
    shadowLift: 0.00,
    highlightCompression: 0.09,
    toeStrength: 0.14,
    shoulderStrength: 0.16,
    midContrast: 1.12,
    // B&W: spectral matrix outputs same luminance-weighted value to all 3 channels
    // Acros uses slightly green-heavy luminance (like panchromatic with yellow filter)
    spectral: [
      [0.26, 0.58, 0.16],   // R output = luminance (R,G,B weighted)
      [0.26, 0.58, 0.16],   // G output = same (monochrome)
      [0.26, 0.58, 0.16],   // B output = same (monochrome)
    ],
    saturationScale: 0.0,   // Pure monochrome — no saturation
    colorBias: [0.0, 0.0, 0.0],
    exposureColorshift: 0.0,
    shadowColor:    [1.0, 1.0, 1.0],
    highlightColor: [1.0, 1.0, 1.0],
    crossCoupling: 0.0,
    grainPreset: { amount: 0.12, size: 0.38 }, // Acros: very fine, slightly structured grain
  },

  // ── NEOPAN 400 ─────────────────────────────────────────────
  // Classic Fujifilm 400-speed B&W negative film. More grain than Acros,
  // slightly softer contrast in shadows. Pushes well.
  // Source: Fujifilm Neopan 400 technical data sheet.
  NEOPAN_400: {
    id: 'neopan400',
    name: 'Neopan 400',
    shortName: 'NEOPAN',
    description: 'B&W. 400-speed grit and character. Neopan pushes beautifully.',
    shadowLift: 0.01,
    highlightCompression: 0.07,
    toeStrength: 0.10,
    shoulderStrength: 0.14,
    midContrast: 1.06,
    // Standard panchromatic luminance weights (slightly red-sensitive vs Acros)
    spectral: [
      [0.30, 0.56, 0.14],
      [0.30, 0.56, 0.14],
      [0.30, 0.56, 0.14],
    ],
    saturationScale: 0.0,
    colorBias: [0.0, 0.0, 0.0],
    exposureColorshift: 0.0,
    shadowColor:    [1.0, 1.0, 1.0],
    highlightColor: [1.0, 1.0, 1.0],
    crossCoupling: 0.0,
    grainPreset: { amount: 0.28, size: 0.52 }, // visible grain, Neopan 400 character
  },

};

// Convenience array for ordered UI display
export const STOCK_ORDER = [
  'PROVIA_100F',
  'VELVIA_50',
  'VELVIA_100',
  'ASTIA_100F',
  'CLASSIC_CHROME',
  'CLASSIC_NEGATIVE',
  'ETERNA',
  'ACROS',
  'NEOPAN_400',
];

export function getStock(id) {
  return Object.values(FILM_STOCKS).find(s => s.id === id) || null;
}
