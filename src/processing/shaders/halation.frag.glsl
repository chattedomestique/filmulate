#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_image;
uniform float u_halation;       // 0.0 to 1.0
uniform float u_threshold;      // luminance threshold (default 0.75)
uniform vec2 u_texel;           // 1.0 / textureSize

void main() {
  vec4 texColor = texture(u_image, v_uv);
  vec3 col = texColor.rgb;

  if (u_halation < 0.001) {
    fragColor = texColor;
    return;
  }

  float lum = dot(col, vec3(0.299, 0.587, 0.114));

  // Sample neighbors in a non-uniform kernel — tight, color-shifted
  // Halation bleeds from the emulsion through the film base: tight exponential falloff
  // Red channel bleeds most (film base is red-sensitive at this level of exposure)
  const int SAMPLES = 8;
  vec2 offsets[8];
  offsets[0] = vec2(-1.2,  0.0);
  offsets[1] = vec2( 1.2,  0.0);
  offsets[2] = vec2( 0.0, -1.2);
  offsets[3] = vec2( 0.0,  1.2);
  offsets[4] = vec2(-0.9, -0.9);
  offsets[5] = vec2( 0.9, -0.9);
  offsets[6] = vec2(-0.9,  0.9);
  offsets[7] = vec2( 0.9,  0.9);

  // The halation bleed color: warm red-orange (film base sensitization)
  vec3 halationColor = vec3(1.0, 0.35, 0.1);

  vec3 bleed = vec3(0.0);
  float bleedRadius = mix(1.5, 3.5, u_halation);

  for (int i = 0; i < SAMPLES; i++) {
    vec2 sampleUV = v_uv + offsets[i] * u_texel * bleedRadius;
    sampleUV = clamp(sampleUV, vec2(0.0), vec2(1.0));
    vec3 samp = texture(u_image, sampleUV).rgb;
    float sampLum = dot(samp, vec3(0.299, 0.587, 0.114));

    // Only bright samples contribute to halation bleed
    if (sampLum > u_threshold) {
      float halo = (sampLum - u_threshold) / (1.0 - u_threshold);
      halo = halo * halo; // nonlinear: only the very brightest bleed hard

      float dist = length(offsets[i]);
      float weight = exp(-dist * 1.5) * halo;

      // Shift sample color toward halation red-orange
      vec3 colored = mix(samp, halationColor, 0.6);
      bleed += colored * weight;
    }
  }

  bleed /= float(SAMPLES);

  // Apply: bleed is additive, screen-blended for natural feel
  // Only the red channel gets maximum bleed (most realistic)
  bleed.r *= 1.4;
  bleed.g *= 0.6;
  bleed.b *= 0.2;

  col += bleed * u_halation * 0.5;
  col = clamp(col, 0.0, 1.0);

  fragColor = vec4(col, texColor.a);
}
