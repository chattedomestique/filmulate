#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_image;

// ── Image analysis uniforms (from analyze.js) ──
uniform float u_img_shadow;
uniform float u_img_mid;
uniform float u_img_highlight;
uniform float u_img_dr;
uniform float u_img_colortemp;
uniform float u_img_saturation;

// ── Film stock parameters ──
uniform float u_film_shadow_lift;
uniform float u_film_highlight_compression;  // knee point (0–1) where shoulder begins
uniform float u_film_toe_strength;
uniform float u_film_shoulder_strength;      // compression amount above the knee
uniform float u_film_mid_contrast;

// Spectral sensitivity matrix (3×3, row = output channel, columns = R,G,B input)
uniform vec3 u_film_spectral_r;
uniform vec3 u_film_spectral_g;
uniform vec3 u_film_spectral_b;

uniform float u_film_saturation_scale;
uniform vec3  u_film_color_bias;       // additive global emulsion tint
uniform float u_film_exposure_colorshift;
uniform vec3  u_film_shadow_color;    // additive shadow tint (signed, e.g. [-0.04, 0, 0.06])
uniform vec3  u_film_highlight_color; // additive highlight tint
uniform float u_film_crosscoupling;   // direct fraction (0.05–0.20), no extra scaling
uniform float u_film_strength;        // 0=original, 1=full emulation

// ── RGB ↔ HSL helpers ──
vec3 rgbToHsl(vec3 rgb) {
  float maxC = max(rgb.r, max(rgb.g, rgb.b));
  float minC = min(rgb.r, min(rgb.g, rgb.b));
  float delta = maxC - minC;
  float l = (maxC + minC) * 0.5;
  float s = 0.0, h = 0.0;
  if (delta > 0.0001) {
    s = delta / (1.0 - abs(2.0 * l - 1.0));
    if (maxC == rgb.r)      h = mod((rgb.g - rgb.b) / delta, 6.0);
    else if (maxC == rgb.g) h = (rgb.b - rgb.r) / delta + 2.0;
    else                    h = (rgb.r - rgb.g) / delta + 4.0;
    h /= 6.0;
    if (h < 0.0) h += 1.0;
  }
  return vec3(h, s, l);
}

float hue2rgb(float p, float q, float t) {
  if (t < 0.0) t += 1.0;
  if (t > 1.0) t -= 1.0;
  if (t < 1.0/6.0) return p + (q - p) * 6.0 * t;
  if (t < 1.0/2.0) return q;
  if (t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0;
  return p;
}

vec3 hslToRgb(vec3 hsl) {
  float h = hsl.x, s = hsl.y, l = hsl.z;
  if (s < 0.0001) return vec3(l);
  float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
  float p = 2.0 * l - q;
  return vec3(hue2rgb(p, q, h + 1.0/3.0), hue2rgb(p, q, h), hue2rgb(p, q, h - 1.0/3.0));
}

// ── Toe: compress and darken shadows ──
// toeStr 0=linear, 0.4=heavy crush. Rational curve, 0 always maps to lift.
float toeOutput(float x, float lift, float toeStr) {
  float raised = lift + x * (1.0 - lift);
  if (toeStr < 0.001) return raised;
  // Darkens x relative to linear; stronger toeStr = more shadow crush
  float crushed = lift + (x * x) / (x + toeStr + 0.001);
  return crushed;
}

// ── Shoulder: soft-knee highlight compression ──
// knee: point where compression begins (0.5–0.9).
// strength: how hard it compresses above the knee (0=none, 3=heavy blocking).
// Always returns ≤ 1.0 and is continuous at the knee.
float shoulderOutput(float x, float knee, float strength) {
  if (x <= knee || strength < 0.001) return x;
  float above   = x - knee;
  float range   = max(1.0 - knee, 0.01);
  return knee + above / (1.0 + above * strength / range);
}

// ── Full characteristic curve ──
// Uses expanded blend zones so the curve has real impact across the tonal range.
float applyCurve(float x, float lift, float toeStr, float midContrast, float knee, float shoulderStr) {
  // Shadow zone extends to 0.5 — previously was 0–0.35 which made toe nearly invisible
  float shadowBlend    = 1.0 - smoothstep(0.0, 0.5, x);
  float highlightBlend = smoothstep(0.5, 1.0, x);
  float midBlend       = max(0.0, 1.0 - shadowBlend - highlightBlend);

  float toe      = toeOutput(x, lift, toeStr);
  float mid      = lift + x * (1.0 - lift) * midContrast;
  float shoulder = shoulderOutput(x, knee, shoulderStr);

  return clamp(toe * shadowBlend + mid * midBlend + shoulder * highlightBlend, 0.0, 1.0);
}

void main() {
  vec4 texColor = texture(u_image, v_uv);
  vec3 col = texColor.rgb;
  vec3 original = col;

  float lum = dot(col, vec3(0.299, 0.587, 0.114));

  // ── STEP 1: Spectral response matrix ──────────────────────────────────────
  // Each film's dye layers respond differently to RGB primaries.
  vec3 remapped;
  remapped.r = dot(col, u_film_spectral_r);
  remapped.g = dot(col, u_film_spectral_g);
  remapped.b = dot(col, u_film_spectral_b);
  col = clamp(remapped, 0.0, 1.0);

  // ── STEP 2: H&D characteristic curve ─────────────────────────────────────
  // Applied per channel with small inter-channel variations (real film
  // has slightly different response per dye layer).
  // u_film_highlight_compression is used as the KNEE POINT (0–1).
  float knee = u_film_highlight_compression;
  col.r = applyCurve(col.r, u_film_shadow_lift,        u_film_toe_strength * 1.00,
                     u_film_mid_contrast,        knee, u_film_shoulder_strength * 0.95);
  col.g = applyCurve(col.g, u_film_shadow_lift * 0.95, u_film_toe_strength * 0.98,
                     u_film_mid_contrast * 1.01, knee, u_film_shoulder_strength);
  col.b = applyCurve(col.b, u_film_shadow_lift * 1.05, u_film_toe_strength * 1.03,
                     u_film_mid_contrast * 0.99, knee, u_film_shoulder_strength * 1.05);

  // ── STEP 3: Exposure-adaptive hue/saturation shift ───────────────────────
  float exposureBias  = u_img_mid - 0.5;
  float colorShiftAmt = exposureBias * u_film_exposure_colorshift;
  vec3 hsl = rgbToHsl(col);
  hsl.x = fract(hsl.x + colorShiftAmt * 0.05);
  hsl.y = clamp(hsl.y * (1.0 - colorShiftAmt * 0.1), 0.0, 1.0);
  col = hslToRgb(hsl);

  // ── STEP 4: Additive shadow / highlight tinting ───────────────────────────
  // Previously multiplicative (col * tint) which barely registers in shadows
  // because col ≈ 0. Additive tints are directly visible in all regions.
  float shadowMask    = 1.0 - smoothstep(0.0, 0.45, lum);
  float highlightMask = smoothstep(0.55, 1.0, lum);

  col += u_film_shadow_color    * shadowMask;
  col += u_film_highlight_color * highlightMask;
  col  = clamp(col, 0.0, 1.0);

  // ── STEP 5: Cross-channel coupling ───────────────────────────────────────
  // u_film_crosscoupling is the direct mix fraction (e.g. 0.10 = 10%),
  // previously scaled by 0.04 which made it undetectable.
  float coupling = u_film_crosscoupling;
  vec3 coupled;
  coupled.r = col.r + (col.g - col.r) * coupling * 0.5;
  coupled.g = col.g + (col.r - col.g) * coupling * 0.3 + (col.b - col.g) * coupling * 0.2;
  coupled.b = col.b + (col.g - col.b) * coupling * 0.4;
  col = clamp(coupled, 0.0, 1.0);

  // ── STEP 6: Saturation and global color bias ──────────────────────────────
  vec3 hsl2 = rgbToHsl(col);
  hsl2.y *= u_film_saturation_scale;
  hsl2.y *= 1.0 - (u_img_saturation * 0.15); // already-vivid scenes get slightly less boost
  hsl2.y  = clamp(hsl2.y, 0.0, 1.0);
  col = hslToRgb(hsl2);

  // u_film_color_bias is a direct additive value (no extra 0.04 scale)
  col += u_film_color_bias;
  col  = clamp(col, 0.0, 1.0);

  // ── STEP 7: Blend with original ───────────────────────────────────────────
  col = mix(original, col, u_film_strength);

  fragColor = vec4(col, texColor.a);
}
