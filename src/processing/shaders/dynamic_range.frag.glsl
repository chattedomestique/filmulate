#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_image;
uniform float u_dr_amount;      // 0.0 (off) to 1.0 (full point-and-shoot)
uniform bool u_clip_highlights; // hard clip highlights (disposable camera look)

// Highlight rolloff: exponential shoulder
float rolloffHighlight(float x, float rolloffStart) {
  if (x <= rolloffStart) return x;
  float excess = x - rolloffStart;
  float range = 1.0 - rolloffStart;
  // Exponential approach to 1.0
  return rolloffStart + range * (1.0 - exp(-excess * 3.0 / range));
}

// Shadow lift: raises blacks off zero
float liftShadow(float x, float floor_val) {
  return floor_val + x * (1.0 - floor_val);
}

// Mid S-curve boost (compensate for DR compression)
float midBoost(float x, float amount) {
  // Subtle S-curve centered at 0.5
  float pivot = 0.5;
  float deviation = x - pivot;
  return x + deviation * amount * 0.15;
}

void main() {
  vec4 color = texture(u_image, v_uv);
  vec3 col = color.rgb;

  // Highlight rolloff: starts clipping at ~85% when amount=1.0
  float rolloffStart = mix(1.0, 0.82, u_dr_amount);

  if (u_clip_highlights) {
    // Hard clip at rolloff point (disposable camera)
    col = clamp(col, vec3(0.0), vec3(rolloffStart));
    col /= rolloffStart; // normalize back to 0-1
  } else {
    // Soft rolloff
    col.r = rolloffHighlight(col.r, rolloffStart);
    col.g = rolloffHighlight(col.g, rolloffStart);
    col.b = rolloffHighlight(col.b, rolloffStart);
  }

  // Shadow lift: minimum luminance (like slightly fogged film base)
  float shadowFloor = mix(0.0, 0.04, u_dr_amount);
  col = max(col, vec3(shadowFloor));

  // Mid contrast boost to compensate
  col.r = midBoost(col.r, u_dr_amount);
  col.g = midBoost(col.g, u_dr_amount);
  col.b = midBoost(col.b, u_dr_amount);

  color.rgb = clamp(col, 0.0, 1.0);
  fragColor = color;
}
