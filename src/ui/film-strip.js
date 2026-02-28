/**
 * FilmStrip — horizontal scrollable film stock selector
 *
 * Features:
 * - Pill buttons for each stock (DM Mono font)
 * - Thumbnail preview of current image rendered through each stock (lazy, cached)
 * - Active state: black fill, cream text
 * - Haptic on selection
 */

import { FILM_STOCKS } from '../processing/film/stocks.js';

export class FilmStrip {
  constructor({ onSelect, pipeline } = {}) {
    this.onSelect = onSelect || (() => {});
    this.pipeline = pipeline; // GrainPipeline instance
    this._el = null;
    this._activeId = null;
    this._pills = {};
    this._thumbCache = {}; // stockId → base64 thumbnail
    this._thumbCanvas = null;
  }

  // ── Build DOM ──────────────────────────────────────────────

  build() {
    this._el = document.createElement('div');
    this._el.className = 'tool-strip';
    this._el.setAttribute('role', 'tablist');
    this._el.setAttribute('aria-label', 'Film stocks');

    // "Off" pill (no emulation)
    this._addPill({ id: null, shortName: 'NONE', name: 'No Film' });

    for (const stock of Object.values(FILM_STOCKS)) {
      this._addPill(stock);
    }

    return this._el;
  }

  _addPill(stock) {
    const pill = document.createElement('button');
    pill.className = 'film-pill' + (stock.id === this._activeId ? ' film-pill--active' : '');
    pill.setAttribute('role', 'tab');
    pill.setAttribute('aria-selected', stock.id === this._activeId ? 'true' : 'false');
    pill.setAttribute('aria-label', stock.name || 'No emulation');
    pill.dataset.stockId = stock.id || 'none';

    // Thumbnail (if not "Off" pill)
    if (stock.id) {
      const thumb = document.createElement('canvas');
      thumb.className = 'film-pill__thumb';
      thumb.width = 20;
      thumb.height = 20;
      pill.appendChild(thumb);
      this._thumbCanvas = this._thumbCanvas || thumb;
    }

    const label = document.createElement('span');
    label.textContent = stock.shortName || 'NONE';
    pill.appendChild(label);

    pill.addEventListener('click', () => {
      this._select(stock.id);
    });

    this._pills[stock.id || 'none'] = pill;
    this._el.appendChild(pill);
  }

  _select(stockId) {
    // Update active state
    const prevId = this._activeId;
    this._activeId = stockId;

    // Update pill styles
    for (const [id, pill] of Object.entries(this._pills)) {
      const isActive = (id === (stockId || 'none'));
      pill.classList.toggle('film-pill--active', isActive);
      pill.setAttribute('aria-selected', isActive ? 'true' : 'false');
    }

    this._haptic('light');

    const stock = stockId ? FILM_STOCKS[this._idToKey(stockId)] : null;
    this.onSelect(stock, stockId);
  }

  _idToKey(id) {
    // Convert stock ID to FILM_STOCKS key
    return Object.keys(FILM_STOCKS).find(k => FILM_STOCKS[k].id === id);
  }

  // ── Thumbnail rendering ────────────────────────────────────

  async renderThumbnails(sourceImageBitmap) {
    if (!sourceImageBitmap || !this.pipeline) return;

    for (const stock of Object.values(FILM_STOCKS)) {
      if (this._thumbCache[stock.id]) continue;
      await this._renderThumb(stock, sourceImageBitmap);
    }
  }

  async _renderThumb(stock, sourceImageBitmap) {
    // Create a small offscreen canvas (80x80) to render the stock preview
    const size = 80;
    const offCanvas = new OffscreenCanvas(size, size);
    const ctx = offCanvas.getContext('2d');

    // Draw image scaled into square
    ctx.drawImage(sourceImageBitmap, 0, 0, size, size);
    const imageData = ctx.getImageData(0, 0, size, size);

    // Render through stock (simplified — just store the image data for now)
    // Full rendering would need a separate tiny pipeline
    // We'll use a simplified color tint approach for thumbnails
    const tinted = this._applyStockTint(imageData, stock);
    ctx.putImageData(tinted, 0, 0);

    const blob = await offCanvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
    this._thumbCache[stock.id] = URL.createObjectURL(blob);

    // Update pill thumbnail
    const pill = this._pills[stock.id];
    if (pill) {
      const thumbCanvas = pill.querySelector('.film-pill__thumb');
      if (thumbCanvas) {
        const thumbCtx = thumbCanvas.getContext('2d');
        thumbCtx.drawImage(await createImageBitmap(blob), 0, 0, 20, 20);
      }
    }
  }

  _applyStockTint(imageData, stock) {
    // Simplified color tint for thumbnails (not the full emulation)
    const data = new Uint8ClampedArray(imageData.data);
    const bias = stock.colorBias || [0, 0, 0];
    const satScale = stock.saturationScale || 1.0;

    for (let i = 0; i < data.length; i += 4) {
      let r = data[i] / 255;
      let g = data[i + 1] / 255;
      let b = data[i + 2] / 255;

      // Simple saturation scale
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      r = lum + (r - lum) * satScale;
      g = lum + (g - lum) * satScale;
      b = lum + (b - lum) * satScale;

      // Color bias
      r = Math.min(1, r + bias[0] * 0.2);
      g = Math.min(1, g + bias[1] * 0.2);
      b = Math.min(1, b + bias[2] * 0.2);

      data[i]     = Math.max(0, Math.min(255, r * 255));
      data[i + 1] = Math.max(0, Math.min(255, g * 255));
      data[i + 2] = Math.max(0, Math.min(255, b * 255));
    }

    return new ImageData(data, imageData.width, imageData.height);
  }

  _haptic(type) {
    if ('vibrate' in navigator) {
      navigator.vibrate(type === 'light' ? 10 : 20);
    }
  }

  getElement() {
    return this._el;
  }

  getActiveId() {
    return this._activeId;
  }
}
