#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_image;
uniform vec3 u_border_color;    // border color (RGB 0-1)
uniform float u_border_size;    // 0.0 to 0.2 (fraction of shortest dimension)
uniform float u_aspect;         // output canvas aspect ratio (width/height)
uniform float u_image_aspect;   // original image aspect ratio

void main() {
  // Compute border region in UV space
  // Border size is a fraction of the shortest dimension
  float bx = u_border_size;
  float by = u_border_size;

  // Adjust for aspect ratio so border is visually equal on all sides
  if (u_aspect > 1.0) {
    by = bx * u_aspect; // wider canvas: bigger vertical border fraction
  } else {
    bx = by / u_aspect;
  }

  // Clamp to valid range
  bx = clamp(bx, 0.0, 0.4);
  by = clamp(by, 0.0, 0.4);

  // Is this pixel in the border region?
  bool inBorder = v_uv.x < bx || v_uv.x > (1.0 - bx)
               || v_uv.y < by || v_uv.y > (1.0 - by);

  if (inBorder) {
    fragColor = vec4(u_border_color, 1.0);
  } else {
    // Remap UV to image area (excluding border)
    vec2 imageUV = (v_uv - vec2(bx, by)) / vec2(1.0 - 2.0 * bx, 1.0 - 2.0 * by);
    fragColor = texture(u_image, imageUV);
  }
}
