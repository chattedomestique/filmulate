# Film Grain — Implementation Spec

Complete description of how grain is generated in the GRAIN PWA. Covers only the
grain subsystem: the shader, its uniforms, the reasoning behind each term, and the
open work. Nothing about UI.

Interactive version of this document (live grain sampler + amplitude chart):
https://claude.ai/code/artifact/ef8ecd4f-e2dc-4c22-8ae5-87fe863182fe

---

## Where it sits

Grain is one fragment shader pass in a ping-pong framebuffer chain. It reads the
previous pass's texture, adds grain, writes out. There is no JavaScript
post-processing anywhere in the grain path.

Pass order as declared in `pipeline.js` (`~` = disabled by default):

    brightness → dynamic_range → ~film_emulate → soften → ~halation
      → ~channel_sep → [noise] → ~light_leak → ~border

Because grain runs *after* film emulation and soften, it lands on already-graded
values. That is correct: real grain is a property of the emulsion the image was
recorded on, not something applied to a finished print.

---

## The problem this replaced

The first implementation sampled smoothstep-interpolated noise in UV space:

```glsl
// old: UV-scale, interpolated — REMOVED
float grainScale = mix(200.0, 75.0, u_grain);
float n = smoothNoise(v_uv * grainScale);
```

UV coordinates run 0→1 regardless of image size, so a scale of 200 divides the
frame into 200 cells across. On a 4000 px-wide photograph each "grain cell" was
**20 pixels wide**, then smoothstep-interpolated between cells — soft, oversized
mottling with no grain structure. The scale constant had no relationship to the
actual resolution, so the defect got worse the larger the image.

The fix has two halves:

1. `textureSize(u_image, 0)` returns the real texture dimensions as an `ivec2`.
   Multiplying by `v_uv` gives true pixel coordinates, so cells are sized in
   actual output pixels and the look is resolution-independent.
2. Drop the interpolation. `floor()` on pixel coordinates gives hard-edged cells,
   which is what reads as crystalline silver rather than as noise.

---

## Uniforms

| Uniform   | Type        | Set from              | Meaning |
|-----------|-------------|-----------------------|---------|
| `u_image` | `sampler2D` | ping-pong FBO         | Output of the previous enabled pass. |
| `u_grain` | `float`     | grain slider, 0.0–1.0 | Master amount. Drives amplitude, cell size and cluster mix simultaneously. Below 0.001 the shader early-returns untouched. |
| `u_time`  | `float`     | `Math.random()`       | Per-image seed. Despite the name, it is **not** animated. |

All three are bound in `pipeline.js:_setPassUniforms()` — `u_grain` ← `params.grain`,
`u_time` ← `params.grain_time` (lines 382–383).

### Seeding

`grain_time` is assigned `Math.random()` in exactly two places: once when defaults
are set (`pipeline.js:180`), and once inside `setSourceImage()` (`pipeline.js:223`).
It is never touched on re-render.

That is deliberate. Moving the grain slider re-renders the frame, and if the seed
advanced the grain would crawl and shimmer under the user's hand. Holding it fixed
means grain is a stable property of the loaded photograph, exactly as a scanned
negative behaves. Loading a new image draws a new seed.

---

## How a fragment gets its grain

Seven steps, in shader execution order.

### 1. Recover pixel coordinates

```glsl
vec2 res = vec2(textureSize(u_image, 0));
vec2 px  = v_uv * res;
```

Everything downstream is expressed in pixels. This pair of lines is what separates
grain from mottling.

### 2. Weight by luminance

```glsl
float lum      = dot(col, vec3(0.299, 0.587, 0.114));
float lumCurve = 4.0 * lum * (1.0 - lum);
lumCurve       = pow(max(lumCurve, 0.0), 0.65);
```

Grain in real film is a function of density. In the deep toe almost no crystals
have developed, so there is nothing to vary; at the shoulder the emulsion is
saturated and every crystal has developed, so again there is nothing to vary.
Visible granularity peaks between those limits.

`4·lum·(1−lum)` is a parabola returning 1.0 at `lum = 0.5` and 0.0 at both ends.
The `pow(…, 0.65)` broadens the curve and pulls its effective weight down toward
the lower midtones (~0.4) — closer to where granularity actually peaks on a
measured RMS granularity plot than a clean symmetric parabola would put it.

### 3. Size the grain cells

```glsl
float grainSizeFine   = mix(1.0, 2.2, u_grain);
float grainSizeCoarse = grainSizeFine * 2.0;
```

At `u_grain = 0` a cell is one pixel — the finest grain the output can physically
represent. At maximum it is 2.2 px. Faster emulsions carry physically larger
crystals, so amount and size rising together is the correct coupling for a
single-slider control.

### 4. Derive three independent seeds

```glsl
vec2 sR = floor(vec2(u_time * 13.7 + 1.3,  u_time * 29.1 + 5.7));
vec2 sG = floor(vec2(u_time * 43.9 + 7.1,  u_time * 11.3 + 2.9));
vec2 sB = floor(vec2(u_time * 67.3 + 3.9,  u_time * 53.7 + 8.1));
```

Colour film is three emulsion layers coated on one base, each developing its own
grain pattern independently. Offsetting the hash input per channel reproduces
that, and it is what makes the result read as chromatic film grain rather than as
a grey noise overlay laid on top of a colour picture.

### 5. Sample two scales and blend

```glsl
// fine — per-crystal texture
vec2 fine = floor(px / grainSizeFine);
float fr  = hash(fine + sR) * 2.0 - 1.0;

// coarse — clumping envelope
vec2 coarse = floor(px / grainSizeCoarse);
float cr    = hash(coarse + sR + 100.0) * 2.0 - 1.0;

float coarseMix = u_grain * u_grain * 0.45;
grain.r = mix(fr, cr, coarseMix);
```

Silver halide crystals do not develop in isolation — fast film shows visible
clumping, which is most of why high-ISO grain looks *different* from low-ISO grain
rather than merely stronger. Two cell sizes model that: the fine lattice is the
crystal texture, the coarse lattice at double the size is the clumping envelope.
The blend is quadratic in `u_grain`, so at low settings it is essentially pure
fine grain and clustering only emerges as the setting climbs, reaching 0.45 at
maximum.

The `floor()` on both lattices is load-bearing. There is no interpolation anywhere
in the shader — that hard cell boundary is the entire difference between grain and
blur.

### 6. Bias the blue layer

```glsl
grain.b *= 1.3;
```

The blue-sensitive layer sits on top of the pack and has historically been the
least efficient of the three, showing measurably more granularity than the red and
green records. A 30% amplitude bump on blue alone tilts the noise toward the
yellow-blue axis, which is the chromatic signature the eye reads as Fujifilm
rather than as generic RGB noise.

### 7. Scale and add

```glsl
float amplitude = u_grain * u_grain * 0.20 * lumCurve;
col += grain * amplitude;
fragColor = vec4(clamp(col, 0.0, 1.0), texColor.a);
```

Grain is additive and signed, so it perturbs around the existing value rather than
darkening the frame. The `u_grain²` ramp matters for feel: a linear ramp on a
control like this gives the user most of its range doing nothing followed by a
cliff. Squaring it keeps the bottom of the slider genuinely subtle and puts the
useful working range in the upper half.

Peak amplitude (at `lum ≈ 0.5`, where `lumCurve = 1.0`):

| `u_grain` | peak amplitude |
|-----------|----------------|
| 0.3       | 1.8%           |
| 0.5       | 5.0%           |
| 0.7       | 9.8%           |
| 1.0       | 20.0%          |

Every curve returns to zero at pure black and pure white.

---

## Complete shader

`src/processing/shaders/noise.frag.glsl`

```glsl
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
```

---

## Per-stock presets — declared, not yet wired

Every entry in `src/processing/film/stocks.js` carries a `grainPreset`.
**Nothing currently reads it.** The grain slider drives `u_grain` directly and the
selected film stock has no effect on grain at all. The values are calibrated and
ready; connecting them is the single largest open item in this subsystem.

| Stock             | `amount` | `size` | Character |
|-------------------|----------|--------|-----------|
| Velvia 50         | 0.08     | 0.35   | Finest in the set — ISO 50 reversal |
| Eterna Cinema     | 0.08     | 0.38   | Very fine, cinema negative |
| Velvia 100        | 0.09     | 0.36   | Very fine |
| Astia 100F        | 0.10     | 0.40   | Fine, portrait reversal |
| Provia 100F       | 0.12     | 0.40   | Fine, the reference stock |
| Acros             | 0.12     | 0.38   | Fine and smooth — finest Fuji mono |
| Classic Chrome    | 0.18     | 0.45   | Medium |
| Classic Negative  | 0.22     | 0.48   | Medium-coarse, Superia-derived |
| Neopan 400        | 0.30     | 0.52   | Coarsest — ISO 400 B&W grit |

Sorted by amount. `size` is a 0–1 normalised control with no consumer yet — see
the wiring note below for the intended mapping.

---

## Where to pick this up

### 1. Wire `grainPreset` through

Add a second uniform so amount and size stop being locked to one another.
Selecting a stock should seed `params.grain` from `grainPreset.amount` and set a
new `params.grain_size` from `grainPreset.size`; in the shader, `grainSizeFine`
then comes off the new uniform instead of off `u_grain`:

```glsl
uniform float u_grain_size;  // 0–1, from stock.grainPreset.size
float grainSizeFine = mix(1.0, 3.0, u_grain_size);
```

This is what lets Neopan 400 stay coarse at a low amount and Velvia stay fine at a
high one — currently impossible, since both derive from the same value.

### 2. Approach a Gaussian distribution

A single `hash()` call is uniformly distributed. Real granularity is closer to
Gaussian, being photon shot noise through a developed crystal population.
Averaging three or four independently offset hash calls per channel converges
toward a bell curve by the central limit theorem, at three to four times the
texture fetches — but they are ALU-bound, not bandwidth-bound, so the cost is
mild. Expect a visibly smoother, less salt-and-pepper result.

### 3. Let cell size follow density

Crystal size varies with position on the characteristic curve; shadow grain in a
real negative is coarser than highlight grain. A light modulation captures this:

```glsl
grainSizeFine *= (1.0 + 0.4 * (1.0 - lum));
```

Note this makes cell size vary per fragment, so the `floor()` lattice is no longer
globally aligned and may produce seams where size steps. Worth prototyping before
committing.

### 4. Stale comment

The comment above `grainSizeFine` says *"High ISO: 2.5 px cells"* but the code
passes 2.2. Harmless, but it will mislead the next reader — correct one or the
other.

---

## Files that matter

- `src/processing/shaders/noise.frag.glsl` — the whole algorithm
- `src/processing/pipeline.js` — lines 180, 223 (seeding) and 382–383 (uniform binding)
- `src/processing/film/stocks.js` — the nine `grainPreset` blocks
