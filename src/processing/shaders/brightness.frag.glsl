#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_image;
uniform float u_exposure; // -2.0 to +2.0 EV

void main() {
  vec4 color = texture(u_image, v_uv);

  // Convert to linear light
  vec3 linear = pow(max(color.rgb, vec3(0.0001)), vec3(2.2));

  // Apply exposure in linear space (each stop = 2x)
  linear *= pow(2.0, u_exposure);

  // Convert back to gamma
  color.rgb = pow(clamp(linear, 0.0, 1.0), vec3(1.0 / 2.2));

  fragColor = color;
}
