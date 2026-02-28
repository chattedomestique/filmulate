#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_image;
uniform float u_separation;  // 0.0 to 1.0
uniform vec2 u_texel;        // 1.0 / textureSize

void main() {
  vec4 texColor = texture(u_image, v_uv);

  if (u_separation < 0.001) {
    fragColor = texColor;
    return;
  }

  // Maximum displacement in texels (1-3 pixels at full effect)
  float maxDisplace = mix(0.0, 3.0, u_separation);
  vec2 displace = u_texel * maxDisplace;

  // R channel shifts left+up (film layer misalignment)
  float r = texture(u_image, v_uv + vec2(-displace.x, -displace.y * 0.5)).r;

  // G stays centered
  float g = texColor.g;

  // B channel shifts right+down (opposite direction)
  float b = texture(u_image, v_uv + vec2(displace.x, displace.y * 0.5)).b;

  fragColor = vec4(r, g, b, texColor.a);
}
