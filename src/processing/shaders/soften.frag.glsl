#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_image;
uniform float u_soften;         // 0.0 to 1.0
uniform vec2 u_texel;           // 1.0 / textureSize

void main() {
  vec3 center = texture(u_image, v_uv).rgb;
  float centerLum = dot(center, vec3(0.299, 0.587, 0.114));

  // Irregular spatial kernel — avoids digital regularity of perfect gaussian
  // Offsets are slightly perturbed from a regular grid
  const int SAMPLES = 12;
  vec2 offsets[12];
  offsets[0]  = vec2(-1.1, -0.9);
  offsets[1]  = vec2(0.9, -1.1);
  offsets[2]  = vec2(1.05, 0.95);
  offsets[3]  = vec2(-0.95, 1.05);
  offsets[4]  = vec2(-1.5, 0.1);
  offsets[5]  = vec2(1.4, -0.2);
  offsets[6]  = vec2(0.1, 1.6);
  offsets[7]  = vec2(-0.2, -1.5);
  offsets[8]  = vec2(-2.1, -0.6);
  offsets[9]  = vec2(2.0, 0.7);
  offsets[10] = vec2(0.5, -2.1);
  offsets[11] = vec2(-0.4, 2.0);

  vec3 accumulated = vec3(0.0);
  float totalWeight = 0.0;

  for (int i = 0; i < SAMPLES; i++) {
    vec2 sampleUV = v_uv + offsets[i] * u_soften * u_texel * 2.5;
    sampleUV = clamp(sampleUV, vec2(0.0), vec2(1.0));
    vec3 samp = texture(u_image, sampleUV).rgb;
    float sampLum = dot(samp, vec3(0.299, 0.587, 0.114));

    // Luminance similarity weight: similar-brightness pixels blend more
    // (bilateral / edge-aware behavior)
    float lumDiff = abs(centerLum - sampLum);
    float weight = exp(-lumDiff * 8.0);

    // Halation-like effect: bright samples bleed into darker areas more
    // than dark samples bleed into bright areas
    if (sampLum > centerLum) {
      float excess = sampLum - centerLum;
      weight *= 1.0 + excess * 2.0 * u_soften;
    }

    accumulated += samp * weight;
    totalWeight += weight;
  }

  vec3 blurred = accumulated / max(totalWeight, 0.001);

  // Frequency selectivity: mix based on soften amount
  // Edge areas resist blending (high local variance → less blend)
  // We approximate local variance from luminance difference vs center
  float edgeStrength = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 sampleUV = v_uv + offsets[i] * u_texel;
    float s = dot(texture(u_image, sampleUV).rgb, vec3(0.299, 0.587, 0.114));
    edgeStrength += abs(s - centerLum);
  }
  edgeStrength *= 0.25; // average

  // High edge strength → less blending (preserve fine detail at edges)
  float blendFactor = u_soften * 0.7 * (1.0 - smoothstep(0.0, 0.12, edgeStrength));

  vec4 color = texture(u_image, v_uv);
  color.rgb = mix(center, blurred, blendFactor);
  fragColor = color;
}
