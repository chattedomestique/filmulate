#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_image;
uniform sampler2D u_leak_texture; // pre-rendered leak texture
uniform float u_leak_intensity;   // 0.0 to 1.0
uniform int u_leak_blend;         // 0=screen, 1=overlay
uniform float u_leak_scale;       // texture scale (variation)
uniform vec2 u_leak_offset;       // texture offset (position variation)

// Screen blend: natural light addition
vec3 screenBlend(vec3 base, vec3 blend) {
  return 1.0 - (1.0 - base) * (1.0 - blend);
}

// Overlay blend
vec3 overlayBlend(vec3 base, vec3 blend) {
  vec3 result;
  result.r = base.r < 0.5 ? 2.0 * base.r * blend.r : 1.0 - 2.0 * (1.0 - base.r) * (1.0 - blend.r);
  result.g = base.g < 0.5 ? 2.0 * base.g * blend.g : 1.0 - 2.0 * (1.0 - base.g) * (1.0 - blend.g);
  result.b = base.b < 0.5 ? 2.0 * base.b * blend.b : 1.0 - 2.0 * (1.0 - base.b) * (1.0 - blend.b);
  return result;
}

void main() {
  vec4 texColor = texture(u_image, v_uv);
  vec3 col = texColor.rgb;

  if (u_leak_intensity < 0.001) {
    fragColor = texColor;
    return;
  }

  // Sample the leak texture
  vec2 leakUV = v_uv * u_leak_scale + u_leak_offset;
  vec3 leak = texture(u_leak_texture, leakUV).rgb;

  // Real light leaks: warm orange-red, enter from corner/edge
  // Tint the leak toward warm (in case texture isn't pre-tinted)
  leak *= vec3(1.4, 0.8, 0.3);
  leak = clamp(leak, 0.0, 1.0);

  vec3 blended;
  if (u_leak_blend == 0) {
    blended = screenBlend(col, leak);
  } else {
    blended = overlayBlend(col, leak);
  }

  col = mix(col, blended, u_leak_intensity * 0.6);
  col = clamp(col, 0.0, 1.0);

  fragColor = vec4(col, texColor.a);
}
