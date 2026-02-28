#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_image;
uniform float u_grain;   // 0=off, 1=max (maps roughly ISO 100→3200)
uniform float u_time;    // per-image randomisation seed

// High-quality hash — good avalanche, no obvious patterns at pixel scale
float hash(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p.yx + 19.19);
  return fract(p.x * p.y);
}

void main() {
  vec4 texColor = texture(u_image, v_uv);
  vec3 col = texColor.rgb;

  if (u_grain < 0.001) {
    fragColor = texColor;
    return;
  }

  // ── Get actual pixel coordinates ──────────────────────────────────────────
  // textureSize gives the real texture dimensions so grain is pixel-accurate,
  // not UV-scaled. This is the critical fix — UV-scaled noise at any scale
  // just produces blurry blobs. Pixel-scale gives real silver-grain character.
  vec2 res = vec2(textureSize(u_image, 0));
  vec2 px  = v_uv * res;

  // ── Luminance curve ────────────────────────────────────────────────────────
  // Film grain is least visible in deep shadows and bright highlights (the
  // silver halide threshold and saturation limits). Peak in midtones ~0.4.
  float lum      = dot(col, vec3(0.299, 0.587, 0.114));
  float lumCurve = 4.0 * lum * (1.0 - lum);          // parabola, peak at 0.5
  lumCurve       = pow(max(lumCurve, 0.0), 0.65);     // shift peak toward ~0.4

  // ── Grain size ────────────────────────────────────────────────────────────
  // Low ISO: ~1 px cells (very fine).  High ISO: 2.5 px cells (coarser clumps).
  // These are in actual output pixels, so the look is resolution-independent.
  float grainSizeFine   = mix(1.0, 2.2, u_grain);
  float grainSizeCoarse = grainSizeFine * 2.0;

  // ── Per-channel seeds (independent dye layers) ───────────────────────────
  // Each channel develops its own grain pattern, as in real film.
  // The blue-sensitive layer (dye layer 3) is traditionally coarser / noisier.
  vec2 sR = floor(vec2(u_time * 13.7 + 1.3,  u_time * 29.1 + 5.7));
  vec2 sG = floor(vec2(u_time * 43.9 + 7.1,  u_time * 11.3 + 2.9));
  vec2 sB = floor(vec2(u_time * 67.3 + 3.9,  u_time * 53.7 + 8.1));

  // ── Fine grain (pixel-cell scale, no interpolation) ──────────────────────
  vec2 fine = floor(px / grainSizeFine);
  float fr  = hash(fine + sR) * 2.0 - 1.0;
  float fg  = hash(fine + sG) * 2.0 - 1.0;
  float fb  = hash(fine + sB) * 2.0 - 1.0;

  // ── Coarse grain (cluster scale, adds structure at high ISO) ─────────────
  vec2 coarse = floor(px / grainSizeCoarse);
  float cr    = hash(coarse + sR + 100.0) * 2.0 - 1.0;
  float cg    = hash(coarse + sG + 200.0) * 2.0 - 1.0;
  float cb    = hash(coarse + sB + 300.0) * 2.0 - 1.0;

  // Blend fine/coarse: at low ISO mostly fine; at high ISO more clustering
  float coarseMix = u_grain * u_grain * 0.45;
  vec3 grain = vec3(
    mix(fr, cr, coarseMix),
    mix(fg, cg, coarseMix),
    mix(fb, cb, coarseMix)
  );

  // Blue channel grains slightly more — Fujifilm's blue-sensitive layer is
  // the least efficient, historically showing more grain in that channel.
  grain.b *= 1.3;

  // ── Amplitude ─────────────────────────────────────────────────────────────
  // Quadratic ramp: grain is nearly invisible below ~0.3, rises steeply
  // toward 1.0. At u_grain=1.0 amplitude peaks at ~20% in midtones.
  float amplitude = u_grain * u_grain * 0.20 * lumCurve;

  col += grain * amplitude;
  fragColor = vec4(clamp(col, 0.0, 1.0), texColor.a);
}
