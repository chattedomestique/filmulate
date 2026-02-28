#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_image;
uniform float u_grain;      // 0.0 to 1.0 (maps to ~ISO 100-3200)
uniform float u_time;       // per-capture randomization seed (not per-frame)

// ── Hash function — fast, decent quality for grain ──
float hash(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 19.19);
  return fract(p.x * p.y);
}

// ── Smooth noise (Fujifilm character: rounded grain clumps) ──
// Uses smoothstep interpolation → rounder, softer grain vs bilinear
float smoothNoise(vec2 uv, float scale, vec2 seed) {
  vec2 scaled = uv * scale;
  vec2 i = floor(scaled);
  vec2 f = fract(scaled);

  // Smoothstep for rounded appearance (Fuji's characteristic)
  f = f * f * (3.0 - 2.0 * f);

  float a = hash(i + seed);
  float b = hash(i + vec2(1.0, 0.0) + seed);
  float c = hash(i + vec2(0.0, 1.0) + seed);
  float d = hash(i + vec2(1.0, 1.0) + seed);

  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  vec4 texColor = texture(u_image, v_uv);
  vec3 col = texColor.rgb;

  if (u_grain < 0.001) {
    fragColor = texColor;
    return;
  }

  float lum = dot(col, vec3(0.299, 0.587, 0.114));

  // ── Luminance curve: peak at ~0.45 luminance (midtone-heavy grain) ──
  // Parabola 4*l*(1-l) peaks at 0.5, we shift it slightly shadward
  float lumCurve = 4.0 * lum * (1.0 - lum);
  lumCurve = pow(max(lumCurve, 0.0), 0.7); // shift peak toward ~0.4

  // ── Grain scale: Fujifilm character is fine-grained ──
  // u_grain 0→1 maps to finer→coarser (higher scale = smaller grain cells)
  float grainScale = mix(200.0, 75.0, u_grain);

  // Per-channel seeds — each channel grains independently
  // (different dye layer behavior)
  vec2 seedR = vec2(u_time * 17.3, u_time * 31.1);
  vec2 seedG = vec2(u_time * 43.7 + 5.3, u_time * 13.9 + 7.1);
  vec2 seedB = vec2(u_time * 61.1 + 2.7, u_time * 23.3 + 4.9);

  // Blue channel grains at slightly finer scale (Fujifilm characteristic)
  float gr = smoothNoise(v_uv, grainScale * 1.00, seedR);
  float gg = smoothNoise(v_uv, grainScale * 1.05, seedG); // slight offset
  float gb = smoothNoise(v_uv, grainScale * 0.95, seedB); // blue slightly finer

  // Center noise at 0 ([-1, +1] range)
  vec3 grain = vec3(gr, gg, gb) * 2.0 - 1.0;

  // Blue channel grains more — characteristic Fujifilm look
  grain.b *= 1.3;

  // ── Amplitude: u_grain 0→1 maps to 0→0.08 grain amplitude ──
  float amplitude = u_grain * 0.08 * lumCurve;

  col += grain * amplitude;
  texColor.rgb = clamp(col, 0.0, 1.0);
  fragColor = texColor;
}
