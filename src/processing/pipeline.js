/**
 * GrainPipeline — WebGL2 multi-pass image processing pipeline
 *
 * Architecture:
 * - Each effect is a "pass" (fragment shader)
 * - Passes read from a framebuffer, write to another (ping-pong)
 * - Source texture holds the original image (never modified)
 * - Final pass writes to the visible canvas
 */

export class GrainPipeline {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true, // needed for toBlob export
    });

    if (!gl) {
      throw new Error('WebGL2 not supported. Please use a modern browser.');
    }

    this.gl = gl;
    this.canvas = canvas;
    this.passes = [];          // ordered array of shader passes
    this.params = {};          // current parameter values
    this.sourceTexture = null; // original image — never modified
    this.pingPong = [null, null]; // two framebuffers for multi-pass rendering
    this.imageWidth = 0;
    this.imageHeight = 0;
    this._quadBuffer = null;
    this._initialized = false;
  }

  // ── Initialization ──────────────────────────────────────────

  async init() {
    if (this._initialized) return;

    const gl = this.gl;

    // Enable float textures (for precision)
    gl.getExtension('EXT_color_buffer_float');

    // Create the full-screen quad
    this._createQuad();

    // Load and compile all shaders
    await this._loadAllPasses();

    // Set initial params
    this._setDefaultParams();

    this._initialized = true;
  }

  _createQuad() {
    const gl = this.gl;

    // Full-screen quad: 2 triangles covering NDC [-1,1]
    const positions = new Float32Array([
      -1, -1,   1, -1,   -1, 1,
      -1,  1,   1, -1,    1, 1,
    ]);
    const texCoords = new Float32Array([
      0, 1,   1, 1,   0, 0,
      0, 0,   1, 1,   1, 0,
    ]);

    const posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    const texBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);

    this._quadBuffer = { posBuffer, texBuffer };
  }

  async _loadAllPasses() {
    // Load vertex shader (shared)
    const vertSrc = await this._fetchShader('src/processing/shaders/common.vert.glsl');

    // Define all passes in order
    const passConfigs = [
      { name: 'brightness',     frag: 'src/processing/shaders/brightness.frag.glsl',    enabled: true },
      { name: 'dynamic_range',  frag: 'src/processing/shaders/dynamic_range.frag.glsl', enabled: true },
      { name: 'film_emulate',   frag: 'src/processing/shaders/film_emulate.frag.glsl',  enabled: false },
      { name: 'soften',         frag: 'src/processing/shaders/soften.frag.glsl',        enabled: true },
      { name: 'halation',       frag: 'src/processing/shaders/halation.frag.glsl',      enabled: false },
      { name: 'channel_sep',    frag: 'src/processing/shaders/channel_sep.frag.glsl',   enabled: false },
      { name: 'noise',          frag: 'src/processing/shaders/noise.frag.glsl',         enabled: true },
      { name: 'light_leak',     frag: 'src/processing/shaders/light_leak.frag.glsl',    enabled: false },
      { name: 'border',         frag: 'src/processing/shaders/border_composite.frag.glsl', enabled: false },
    ];

    for (const config of passConfigs) {
      const fragSrc = await this._fetchShader(config.frag);
      const program = this._compileProgram(vertSrc, fragSrc, config.name);
      this.passes.push({
        name: config.name,
        program,
        enabled: config.enabled,
      });
    }
  }

  async _fetchShader(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Failed to load shader: ${path}`);
    return response.text();
  }

  _compileProgram(vertSrc, fragSrc, name) {
    const gl = this.gl;

    const vert = this._compileShader(gl.VERTEX_SHADER, vertSrc, `${name}.vert`);
    const frag = this._compileShader(gl.FRAGMENT_SHADER, fragSrc, `${name}.frag`);

    const program = gl.createProgram();
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`Shader link error (${name}): ${info}`);
    }

    gl.deleteShader(vert);
    gl.deleteShader(frag);

    return program;
  }

  _compileShader(type, src, name) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Shader compile error (${name}):\n${info}`);
    }

    return shader;
  }

  _setDefaultParams() {
    this.params = {
      // Brightness
      exposure: 0.0,

      // Dynamic range
      dr_amount: 0.0,
      clip_highlights: false,

      // Film emulation
      film_enabled: false,
      film_strength: 1.0,
      film_stock: null,

      // Image analysis (set by analyze pass)
      img_shadow: 0.05,
      img_mid: 0.5,
      img_highlight: 0.95,
      img_dr: 0.9,
      img_colortemp: 0.0,
      img_saturation: 0.5,

      // Soften
      soften: 0.0,

      // Grain
      grain: 0.0,
      grain_time: Math.random(),

      // Halation
      halation: 0.0,
      halation_threshold: 0.75,

      // Channel separation
      channel_sep: 0.0,

      // Light leak
      leak_intensity: 0.0,
      leak_blend: 0,
      leak_scale: 1.0,
      leak_offset: [0.0, 0.0],

      // Border
      border_enabled: false,
      border_color: [0.0, 0.0, 0.0],
      border_size: 0.05,
    };
  }

  // ── Texture Management ─────────────────────────────────────

  setSourceImage(imageData) {
    const gl = this.gl;

    if (this.sourceTexture) {
      gl.deleteTexture(this.sourceTexture);
    }

    this.imageWidth = imageData.width;
    this.imageHeight = imageData.height;

    // Resize canvas to match image
    this.canvas.width = imageData.width;
    this.canvas.height = imageData.height;
    gl.viewport(0, 0, imageData.width, imageData.height);

    this.sourceTexture = this._createTexture(imageData);
    this._createPingPongBuffers(imageData.width, imageData.height);

    // Reset grain time on new image
    this.params.grain_time = Math.random();
  }

  _createTexture(source) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    if (source instanceof ImageData) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    } else if (source instanceof HTMLImageElement || source instanceof HTMLCanvasElement || source instanceof ImageBitmap) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    }

    return tex;
  }

  _createPingPongBuffers(w, h) {
    const gl = this.gl;

    // Clean up old buffers
    for (const pb of this.pingPong) {
      if (pb) {
        gl.deleteFramebuffer(pb.fbo);
        gl.deleteTexture(pb.texture);
      }
    }

    this.pingPong = [0, 1].map(() => {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      return { fbo, texture };
    });
  }

  // ── Rendering ──────────────────────────────────────────────

  setParam(name, value) {
    this.params[name] = value;
    this.render();
  }

  setParams(updates) {
    Object.assign(this.params, updates);
    this.render();
  }

  setPassEnabled(name, enabled) {
    const pass = this.passes.find(p => p.name === name);
    if (pass) {
      pass.enabled = enabled;
      this.render();
    }
  }

  render() {
    if (!this.sourceTexture || !this._initialized) return;

    const gl = this.gl;
    const w = this.imageWidth;
    const h = this.imageHeight;

    let currentTexture = this.sourceTexture;
    let pingPongIndex = 0;

    const enabledPasses = this.passes.filter(p => p.enabled);

    for (let i = 0; i < enabledPasses.length; i++) {
      const pass = enabledPasses[i];
      const isLast = i === enabledPasses.length - 1;

      // Last pass renders to screen canvas; others to ping-pong FBOs
      if (isLast) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      } else {
        const target = this.pingPong[pingPongIndex % 2];
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
        gl.viewport(0, 0, w, h);
      }

      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      this._renderPass(pass.program, currentTexture, w, h);

      if (!isLast) {
        currentTexture = this.pingPong[pingPongIndex % 2].texture;
        pingPongIndex++;
      }
    }

    // If no passes, just copy source to screen
    if (enabledPasses.length === 0) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      this._renderPass(this.passes[0].program, currentTexture, w, h);
    }
  }

  _renderPass(program, inputTexture, w, h) {
    const gl = this.gl;
    const params = this.params;

    gl.useProgram(program);

    // Bind quad geometry
    const posLoc = gl.getAttribLocation(program, 'a_position');
    const texLoc = gl.getAttribLocation(program, 'a_texCoord');

    gl.bindBuffer(gl.ARRAY_BUFFER, this._quadBuffer.posBuffer);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this._quadBuffer.texBuffer);
    gl.enableVertexAttribArray(texLoc);
    gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);

    // Bind main image texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, inputTexture);
    this._setUniform(program, 'u_image', 0, 'int');

    // Set texel size
    this._setUniform(program, 'u_texel', [1.0 / w, 1.0 / h], 'vec2');

    // Set all relevant uniforms for this pass
    this._setPassUniforms(program, params, w, h);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  _setPassUniforms(program, p, w, h) {
    // Brightness
    this._setUniform(program, 'u_exposure', p.exposure, 'float');

    // Dynamic range
    this._setUniform(program, 'u_dr_amount', p.dr_amount, 'float');
    this._setUniform(program, 'u_clip_highlights', p.clip_highlights, 'bool');

    // Soften
    this._setUniform(program, 'u_soften', p.soften, 'float');

    // Grain
    this._setUniform(program, 'u_grain', p.grain, 'float');
    this._setUniform(program, 'u_time', p.grain_time, 'float');

    // Halation
    this._setUniform(program, 'u_halation', p.halation, 'float');
    this._setUniform(program, 'u_threshold', p.halation_threshold, 'float');

    // Channel separation
    this._setUniform(program, 'u_separation', p.channel_sep, 'float');

    // Light leak
    this._setUniform(program, 'u_leak_intensity', p.leak_intensity, 'float');
    this._setUniform(program, 'u_leak_blend', p.leak_blend, 'int');
    this._setUniform(program, 'u_leak_scale', p.leak_scale, 'float');
    if (p.leak_offset) {
      this._setUniform(program, 'u_leak_offset', p.leak_offset, 'vec2');
    }

    // Border
    if (p.border_color) {
      this._setUniform(program, 'u_border_color', p.border_color, 'vec3');
    }
    this._setUniform(program, 'u_border_size', p.border_size, 'float');
    this._setUniform(program, 'u_aspect', w / h, 'float');
    this._setUniform(program, 'u_image_aspect', w / h, 'float');

    // Film emulation — image analysis
    this._setUniform(program, 'u_img_shadow',     p.img_shadow,     'float');
    this._setUniform(program, 'u_img_mid',         p.img_mid,        'float');
    this._setUniform(program, 'u_img_highlight',   p.img_highlight,  'float');
    this._setUniform(program, 'u_img_dr',          p.img_dr,         'float');
    this._setUniform(program, 'u_img_colortemp',   p.img_colortemp,  'float');
    this._setUniform(program, 'u_img_saturation',  p.img_saturation, 'float');

    // Film stock parameters
    if (p.film_stock) {
      const s = p.film_stock;
      this._setUniform(program, 'u_film_shadow_lift',            s.shadowLift,            'float');
      this._setUniform(program, 'u_film_highlight_compression',  s.highlightCompression,  'float');
      this._setUniform(program, 'u_film_toe_strength',           s.toeStrength,           'float');
      this._setUniform(program, 'u_film_shoulder_strength',      s.shoulderStrength,      'float');
      this._setUniform(program, 'u_film_mid_contrast',           s.midContrast,           'float');
      this._setUniform(program, 'u_film_saturation_scale',       s.saturationScale,       'float');
      this._setUniform(program, 'u_film_exposure_colorshift',    s.exposureColorshift,    'float');
      this._setUniform(program, 'u_film_crosscoupling',          s.crossCoupling,         'float');
      this._setUniform(program, 'u_film_strength',               p.film_strength,         'float');

      if (s.spectral) {
        this._setUniform(program, 'u_film_spectral_r', s.spectral[0], 'vec3');
        this._setUniform(program, 'u_film_spectral_g', s.spectral[1], 'vec3');
        this._setUniform(program, 'u_film_spectral_b', s.spectral[2], 'vec3');
      }
      if (s.colorBias) {
        this._setUniform(program, 'u_film_color_bias', s.colorBias, 'vec3');
      }
      if (s.shadowColor) {
        this._setUniform(program, 'u_film_shadow_color', s.shadowColor, 'vec3');
      }
      if (s.highlightColor) {
        this._setUniform(program, 'u_film_highlight_color', s.highlightColor, 'vec3');
      }
    }
  }

  _setUniform(program, name, value, type) {
    const gl = this.gl;
    const loc = gl.getUniformLocation(program, name);
    if (loc === null) return; // uniform not used in this shader — skip

    switch (type) {
      case 'float': gl.uniform1f(loc, value); break;
      case 'int':   gl.uniform1i(loc, value); break;
      case 'bool':  gl.uniform1i(loc, value ? 1 : 0); break;
      case 'vec2':  gl.uniform2fv(loc, value); break;
      case 'vec3':  gl.uniform3fv(loc, value); break;
      case 'vec4':  gl.uniform4fv(loc, value); break;
    }
  }

  // ── Export ─────────────────────────────────────────────────

  async exportImageBlob(quality = 0.92) {
    // Re-render at full resolution
    this.render();

    return new Promise((resolve, reject) => {
      this.canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('Export failed')),
        'image/jpeg',
        quality
      );
    });
  }

  // ── Cleanup ────────────────────────────────────────────────

  destroy() {
    const gl = this.gl;
    for (const pass of this.passes) {
      gl.deleteProgram(pass.program);
    }
    for (const pb of this.pingPong) {
      if (pb) {
        gl.deleteFramebuffer(pb.fbo);
        gl.deleteTexture(pb.texture);
      }
    }
    if (this.sourceTexture) gl.deleteTexture(this.sourceTexture);
    if (this._quadBuffer) {
      gl.deleteBuffer(this._quadBuffer.posBuffer);
      gl.deleteBuffer(this._quadBuffer.texBuffer);
    }
  }
}
