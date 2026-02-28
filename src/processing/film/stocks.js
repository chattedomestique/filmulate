/**
 * Film Stock Definitions — Fujifilm emulsion parameters
 *
 * Parameter notes (match film_emulate.frag.glsl uniforms):
 *
 * highlightCompression  — knee POINT where shoulder begins (0.0–1.0).
 *                         Lower = compression starts earlier (blocks up quickly, like Velvia).
 *                         Higher = very gentle rolloff (negative/cinema film).
 *
 * shoulderStrength      — compression AMOUNT above the knee (0.0 = linear, 3.0 = hard block).
 *
 * shadowColor / highlightColor — ADDITIVE tints applied to shadow/highlight zones.
 *                                Values like [-0.04, 0, 0.06] push toward teal in shadows.
 *                                Previously these were near-1 multipliers which were invisible.
 *
 * colorBias             — ADDITIVE global emulsion tint (no hidden scaling in shader).
 *
 * crossCoupling         — direct dye-layer coupling fraction (0.05–0.18).
 *                         Previously scaled by 0.04 in the shader, making it undetectable.
 *
 * Spectral matrices: row = output channel (R,G,B), columns = input contribution.
 * Near-identity = neutral. Deviations encode stock's sensitometric character.
 */

export const FILM_STOCKS = {

  // ── PROVIA 100F (RDP III) ──────────────────────────────────────────────────
  // Reference daylight reversal film. Moderate S-curve, natural rendition.
  // Closest to neutral of all Fuji stocks. Slight warmth in highlights.
  PROVIA_100F: {
    id: 'provia100f',
    name: 'Provia 100F',
    shortName: 'PROVIA',
    description: 'Natural color, moderate contrast. The slide film reference standard.',
    shadowLift: 0.01,
    highlightCompression: 0.75,   // knee at 75%
    toeStrength: 0.15,
    shoulderStrength: 1.2,
    midContrast: 1.10,
    spectral: [
      [0.93, 0.06, 0.01],   // R: slight green contribution (natural warmth)
      [0.02, 0.96, 0.02],   // G: near-neutral
      [0.01, 0.04, 0.95],   // B: slight narrowing
    ],
    saturationScale: 1.05,
    colorBias:      [ 0.008,  0.0,   -0.008],  // very slight warm cast
    exposureColorshift: 0.3,
    shadowColor:    [ 0.000,  0.000,  0.000],  // neutral shadows
    highlightColor: [ 0.010,  0.005, -0.008],  // barely warm highlights
    crossCoupling: 0.05,
    grainPreset: { amount: 0.12, size: 0.40 },
  },

  // ── VELVIA 50 (RVP 50) ────────────────────────────────────────────────────
  // Legendary vivid reversal. Extreme saturation — especially reds, yellows,
  // greens. Deep blacks (zero shadow lift). Highlights block up early (knee at
  // 62%). Very fine grain. The most distinctive Fuji film look.
  VELVIA_50: {
    id: 'velvia50',
    name: 'Velvia 50',
    shortName: 'VELVIA 50',
    description: 'Vivid saturation, deep shadows, blocked highlights. Legendary.',
    shadowLift: 0.00,
    highlightCompression: 0.62,   // early knee — highlights block up fast
    toeStrength: 0.38,            // strong shadow crush
    shoulderStrength: 2.8,        // hard shoulder blocking
    midContrast: 1.28,
    spectral: [
      [ 0.88,  0.14, -0.02],  // R: green contributes heavily (boosts warm yellows)
      [-0.02,  1.05,  0.00],  // G: boosted green
      [ 0.00,  0.05,  0.88],  // B: muted blue (Velvia's hallmark)
    ],
    saturationScale: 1.60,
    colorBias:      [ 0.018,  0.0,  -0.018],  // warm overall
    exposureColorshift: 0.6,
    shadowColor:    [-0.02,  0.00,  0.03],   // very slightly cool-blue shadows
    highlightColor: [ 0.035, 0.015, -0.030], // warm highlights
    crossCoupling: 0.14,
    grainPreset: { amount: 0.08, size: 0.35 },
  },

  // ── VELVIA 100 (RVP 100) ──────────────────────────────────────────────────
  // Modern Velvia. Same vivid character but slightly less extreme. More
  // balanced for varied subjects, still excels at landscapes and nature.
  VELVIA_100: {
    id: 'velvia100',
    name: 'Velvia 100',
    shortName: 'VELVIA 100',
    description: 'Vivid like 50 but more balanced. Excellent for landscapes.',
    shadowLift: 0.005,
    highlightCompression: 0.68,
    toeStrength: 0.28,
    shoulderStrength: 2.2,
    midContrast: 1.20,
    spectral: [
      [ 0.90,  0.12, -0.01],
      [-0.01,  1.03,  0.00],
      [ 0.00,  0.04,  0.91],
    ],
    saturationScale: 1.42,
    colorBias:      [ 0.012,  0.0,  -0.012],
    exposureColorshift: 0.5,
    shadowColor:    [-0.015, 0.000,  0.022],
    highlightColor: [ 0.025, 0.010, -0.022],
    crossCoupling: 0.11,
    grainPreset: { amount: 0.09, size: 0.36 },
  },

  // ── ASTIA 100F (RAF 100F) ─────────────────────────────────────────────────
  // Portrait/fashion slide film. Lower contrast, accurate skin tones, reduced
  // saturation. Very gentle shoulder — preserves highlight gradation superbly.
  ASTIA_100F: {
    id: 'astia100f',
    name: 'Astia 100F',
    shortName: 'ASTIA',
    description: 'Soft contrast, refined skin tones. Portrait and fashion work.',
    shadowLift: 0.025,
    highlightCompression: 0.82,   // gentle, late knee
    toeStrength: 0.06,
    shoulderStrength: 0.55,
    midContrast: 0.95,
    spectral: [
      [0.93, 0.06, 0.01],
      [0.02, 0.96, 0.02],
      [0.01, 0.04, 0.95],
    ],
    saturationScale: 0.82,
    colorBias:      [ 0.004,  0.001, 0.002],
    exposureColorshift: 0.2,
    shadowColor:    [ 0.000,  0.000, 0.000],
    highlightColor: [ 0.008,  0.005, -0.005],
    crossCoupling: 0.04,
    grainPreset: { amount: 0.10, size: 0.40 },
  },

  // ── CLASSIC CHROME ────────────────────────────────────────────────────────
  // Fujifilm X-Trans simulation. Inspired by Kodachrome's restrained, desaturated
  // aesthetic. Lifted blacks (never true black). Signature teal shadows. Muted reds.
  CLASSIC_CHROME: {
    id: 'classic_chrome',
    name: 'Classic Chrome',
    shortName: 'C.CHROME',
    description: 'Muted tones, teal shadows, cinematic restraint. Kodachrome-inspired.',
    shadowLift: 0.05,
    highlightCompression: 0.73,
    toeStrength: 0.08,
    shoulderStrength: 1.6,
    midContrast: 0.92,
    spectral: [
      [0.82, 0.14, 0.04],   // R muted heavily — reds go slightly orange
      [0.02, 0.96, 0.02],   // G neutral
      [0.00, 0.07, 0.97],   // B slight cyan boost
    ],
    saturationScale: 0.52,
    colorBias:      [-0.006, 0.005,  0.010],  // cool cyan cast
    exposureColorshift: 0.25,
    shadowColor:    [-0.04,  -0.01,  0.06],   // TEAL shadows — the signature look
    highlightColor: [ 0.010,  0.000, -0.008],
    crossCoupling: 0.09,
    grainPreset: { amount: 0.18, size: 0.45 },
  },

  // ── CLASSIC NEGATIVE ──────────────────────────────────────────────────────
  // Fujifilm X-Trans simulation inspired by Superia/Reala negative film.
  // Higher contrast, warm midtones and shadows, pulled highlights. Has that
  // "found photo" warmth that slide films lack.
  CLASSIC_NEGATIVE: {
    id: 'classic_negative',
    name: 'Classic Negative',
    shortName: 'C.NEG',
    description: 'High contrast, warm midtones, pulled highlights. Superia-inspired.',
    shadowLift: 0.02,
    highlightCompression: 0.70,
    toeStrength: 0.18,
    shoulderStrength: 1.9,
    midContrast: 1.14,
    spectral: [
      [0.96, 0.03, 0.00],
      [0.01, 0.97, 0.01],
      [0.01, 0.03, 0.94],
    ],
    saturationScale: 0.90,
    colorBias:      [ 0.012,  0.004, -0.010],  // warm
    exposureColorshift: 0.35,
    shadowColor:    [ 0.030,  0.010, -0.020],  // warm shadows
    highlightColor: [ 0.000,  0.000,  0.000],
    crossCoupling: 0.08,
    grainPreset: { amount: 0.22, size: 0.48 },
  },

  // ── ETERNA CINEMA ─────────────────────────────────────────────────────────
  // Fujifilm's cinema/motion picture simulation. Very flat, very low contrast.
  // Maximum shadow detail, open highlights. Designed as a log-like starting
  // point for colour grading — the most "neutral" looking stock.
  ETERNA: {
    id: 'eterna',
    name: 'Eterna Cinema',
    shortName: 'ETERNA',
    description: 'Cinema-flat. Low contrast, neutral saturation, built for grading.',
    shadowLift: 0.07,
    highlightCompression: 0.82,
    toeStrength: 0.04,
    shoulderStrength: 0.45,
    midContrast: 0.80,
    spectral: [
      [0.95, 0.04, 0.01],
      [0.02, 0.96, 0.02],
      [0.01, 0.03, 0.96],
    ],
    saturationScale: 0.62,
    colorBias:      [ 0.000,  0.003,  0.006],  // slight cool-blue
    exposureColorshift: 0.15,
    shadowColor:    [ 0.000,  0.005,  0.010],  // cool shadows
    highlightColor: [ 0.000,  0.000,  0.000],
    crossCoupling: 0.03,
    grainPreset: { amount: 0.08, size: 0.38 },
  },

  // ── ACROS ────────────────────────────────────────────────────────────────
  // Fujifilm's B&W simulation based on Neopan Acros. Strong contrast, deep
  // blacks, smooth gradation. Spectral matrix uses a yellow-green filter
  // curve — the classic panchromatic film "with yellow filter" look.
  ACROS: {
    id: 'acros',
    name: 'Acros',
    shortName: 'ACROS',
    description: 'B&W. Deep blacks, smooth gradation. The finest-grain Fuji mono.',
    shadowLift: 0.00,
    highlightCompression: 0.72,
    toeStrength: 0.26,
    shoulderStrength: 1.9,
    midContrast: 1.18,
    // Panchromatic with yellow-green filter weighting (green heavy, blue light)
    spectral: [
      [0.26, 0.58, 0.16],
      [0.26, 0.58, 0.16],
      [0.26, 0.58, 0.16],
    ],
    saturationScale: 0.0,
    colorBias:      [0.0, 0.0, 0.0],
    exposureColorshift: 0.0,
    shadowColor:    [0.0, 0.0, 0.0],
    highlightColor: [0.0, 0.0, 0.0],
    crossCoupling: 0.0,
    grainPreset: { amount: 0.12, size: 0.38 },
  },

  // ── NEOPAN 400 ────────────────────────────────────────────────────────────
  // Classic 400-speed B&W negative. More grain than Acros, slightly softer
  // shadows. The 400-speed grit that looks great when pushed.
  NEOPAN_400: {
    id: 'neopan400',
    name: 'Neopan 400',
    shortName: 'NEOPAN',
    description: 'B&W. 400-speed grit and character. Neopan pushes beautifully.',
    shadowLift: 0.01,
    highlightCompression: 0.75,
    toeStrength: 0.18,
    shoulderStrength: 1.5,
    midContrast: 1.08,
    // Standard panchromatic — slightly more red-sensitive than Acros
    spectral: [
      [0.30, 0.56, 0.14],
      [0.30, 0.56, 0.14],
      [0.30, 0.56, 0.14],
    ],
    saturationScale: 0.0,
    colorBias:      [0.0, 0.0, 0.0],
    exposureColorshift: 0.0,
    shadowColor:    [0.0, 0.0, 0.0],
    highlightColor: [0.0, 0.0, 0.0],
    crossCoupling: 0.0,
    grainPreset: { amount: 0.30, size: 0.52 },
  },

};

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
