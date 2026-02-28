#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_image;

// ── Image analysis uniforms (from analyze.js) ──
uniform float u_img_shadow;       // scene shadow point (0-1)
uniform float u_img_mid;          // scene midpoint/median luminance (0-1)
uniform float u_img_highlight;    // scene highlight point (0-1)
uniform float u_img_dr;           // scene dynamic range (highlight - shadow)
uniform float u_img_colortemp;    // scene color temperature bias: -1 warm, +1 cool
uniform float u_img_saturation;   // scene mean saturation (0-1)

// ── Film stock parameters ──
uniform float u_film_shadow_lift;
uniform float u_film_highlight_compression;
uniform float u_film_toe_strength;
uniform float u_film_shoulder_strength;
uniform float u_film_mid_contrast;

// Spectral sensitivity matrix (3x3 as 3 vec3 rows)
uniform vec3 u_film_spectral_r;    // R output from [R,G,B] input
uniform vec3 u_film_spectral_g;    // G output
uniform vec3 u_film_spectral_b;    // B output

uniform float u_film_saturation_scale;
uniform vec3  u_film_color_bias;
uniform float u_film_exposure_colorshift;
uniform vec3  u_film_shadow_color;
uniform vec3  u_film_highlight_color;
uniform float u_film_crosscoupling;
uniform float u_film_strength;     // blend: 0=original, 1=full emulation

// ── RGB ↔ HSL helpers ──
vec3 rgbToHsl(vec3 rgb) {
  float maxC = max(rgb.r, max(rgb.g, rgb.b));
  float minC = min(rgb.r, min(rgb.g, rgb.b));
  float delta = maxC - minC;
  float l = (maxC + minC) * 0.5;
  float s = 0.0;
  float h = 0.0;

  if (delta > 0.0001) {
    s = delta / (1.0 - abs(2.0 * l - 1.0));
    if (maxC == rgb.r) {
      h = mod((rgb.g - rgb.b) / delta, 6.0);
    } else if (maxC == rgb.g) {
      h = (rgb.b - rgb.r) / delta + 2.0;
    } else {
      h = (rgb.r - rgb.g) / delta + 4.0;
    }
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
  if (s < 0.0001) {
    return vec3(l);
  }
  float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
  float p = 2.0 * l - q;
  return vec3(
    hue2rgb(p, q, h + 1.0/3.0),
    hue2rgb(p, q, h),
    hue2rgb(p, q, h - 1.0/3.0)
  );
}

// ── H&D curve: toe region ──
// Smooth toe: low input produces output lifted and compressed
float toeOutput(float x, float lift, float toeStr) {
  return lift + (x * x) / (x + toeStr + 0.001);
}

// ── H&D curve: shoulder region ──
float shoulderOutput(float x, float compression, float shoulderStr) {
  return 1.0 - pow(1.0 - x, 1.0 + shoulderStr) * (1.0 - compression);
}

// ── Apply H&D curve to one channel ──
float applyCurve(float x, float lift, float toeStr, float midContrast, float compression, float shoulderStr) {
  float shadowBlend    = 1.0 - smoothstep(0.0, 0.35, x);
  float highlightBlend = smoothstep(0.55, 1.0, x);
  float midBlend       = max(0.0, 1.0 - shadowBlend - highlightBlend);

  float toe      = toeOutput(x, lift, toeStr);
  float mid      = x * midContrast;
  float shoulder = shoulderOutput(x, compression, shoulderStr);

  return toe * shadowBlend + mid * midBlend + shoulder * highlightBlend;
}

void main() {
  vec4 texColor = texture(u_image, v_uv);
  vec3 col = texColor.rgb;
  vec3 original = col;

  // ── STEP 1: Determine scene-relative position of this pixel ──
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  float dr = max(u_img_dr, 0.05);
  float scenePos = clamp((lum - u_img_shadow) / dr, 0.0, 1.0);

  // ── STEP 2: Spectral response matrix ──
  // Film sees colors differently than a digital sensor
  vec3 remapped;
  remapped.r = dot(col, u_film_spectral_r);
  remapped.g = dot(col, u_film_spectral_g);
  remapped.b = dot(col, u_film_spectral_b);
  col = clamp(remapped, 0.0, 1.0);

  // ── STEP 3: H&D characteristic curve (toe-straight-shoulder) ──
  // Applied per channel — each channel's response differs slightly
  col.r = applyCurve(col.r,
    u_film_shadow_lift,
    u_film_toe_strength * 1.00,
    u_film_mid_contrast,
    u_film_highlight_compression,
    u_film_shoulder_strength * 0.95
  );
  col.g = applyCurve(col.g,
    u_film_shadow_lift * 0.95,
    u_film_toe_strength * 0.98,
    u_film_mid_contrast * 1.01,
    u_film_highlight_compression * 0.98,
    u_film_shoulder_strength
  );
  col.b = applyCurve(col.b,
    u_film_shadow_lift * 1.05,
    u_film_toe_strength * 1.03,
    u_film_mid_contrast * 0.99,
    u_film_highlight_compression * 1.02,
    u_film_shoulder_strength * 1.05
  );

  // ── STEP 4: Exposure-adaptive color shift ──
  // Infer exposure from scene analysis.
  // Underexposed scenes go cooler + more saturated; overexposed go warmer + less saturated
  float exposureBias = u_img_mid - 0.5; // negative = underexposed, positive = over
  float colorShiftAmount = exposureBias * u_film_exposure_colorshift;

  vec3 hsl = rgbToHsl(col);
  hsl.x = fract(hsl.x + colorShiftAmount * 0.05); // hue nudge
  hsl.y = clamp(hsl.y * (1.0 - colorShiftAmount * 0.1), 0.0, 1.0);
  col = hslToRgb(hsl);

  // ── STEP 5: Shadow and highlight color tinting ──
  // Film base and dye characteristics tint the extremes
  float shadowMask    = 1.0 - smoothstep(0.0, 0.35, lum);
  float highlightMask = smoothstep(0.65, 1.0, lum);

  col = mix(col, col * u_film_shadow_color,    shadowMask * 0.4);
  col = mix(col, col * u_film_highlight_color, highlightMask * 0.3);

  // ── STEP 6: Cross-channel coupling ──
  // Dye layers in film interact — source of unique color "crosstalk"
  float coupling = u_film_crosscoupling * 0.04;
  vec3 coupled;
  coupled.r = col.r + (col.g - col.r) * coupling * 0.5;
  coupled.g = col.g + (col.r - col.g) * coupling * 0.3 + (col.b - col.g) * coupling * 0.2;
  coupled.b = col.b + (col.g - col.b) * coupling * 0.4;
  col = coupled;

  // ── STEP 7: Saturation and color bias ──
  vec3 hsl2 = rgbToHsl(col);
  hsl2.y *= u_film_saturation_scale;
  // Already-saturated scenes get slightly less boost (film compresses extreme saturation)
  hsl2.y *= 1.0 - (u_img_saturation * 0.2);
  hsl2.y = clamp(hsl2.y, 0.0, 1.0);
  col = hslToRgb(hsl2);

  col += u_film_color_bias * 0.04; // subtle global emulsion tint
  col = clamp(col, 0.0, 1.0);

  // ── STEP 8: Blend with original based on strength ──
  col = mix(original, col, u_film_strength);

  fragColor = vec4(col, texColor.a);
}
