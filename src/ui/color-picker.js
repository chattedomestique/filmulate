/**
 * ColorPicker — swatch row for border color selection
 *
 * Shows:
 * - 8 colors extracted from the image (k-means palette)
 * - Always: pure black (#000000) and pure white (#FFFFFF)
 * - Selected swatch has hard-shadow inset indicator
 */

export class ColorPicker {
  constructor({ onChange } = {}) {
    this.onChange = onChange || (() => {});
    this._el = null;
    this._selected = '#000000';
    this._swatches = [];
  }

  // ── Build DOM ──────────────────────────────────────────────

  build(palette = []) {
    this._el = document.createElement('div');
    this._el.className = 'color-swatch-row';

    // Always include black and white
    const colors = [
      '#000000',
      '#FFFFFF',
      ...palette.filter(c => c !== '#000000' && c !== '#FFFFFF'),
    ];

    for (const color of colors) {
      this._addSwatch(color);
    }

    return this._el;
  }

  _addSwatch(color) {
    const swatch = document.createElement('button');
    swatch.className = 'color-swatch' + (color === this._selected ? ' color-swatch--active' : '');
    swatch.style.background = color;
    swatch.setAttribute('aria-label', `Select color ${color}`);
    swatch.dataset.color = color;

    // White swatch needs a border to be visible
    if (color === '#FFFFFF' || this._isLight(color)) {
      swatch.style.border = '2.5px solid #1A1410';
    }

    swatch.addEventListener('click', () => {
      this._select(color);
    });

    this._swatches.push(swatch);
    this._el.appendChild(swatch);
    return swatch;
  }

  _select(color) {
    this._selected = color;

    for (const swatch of this._swatches) {
      swatch.classList.toggle('color-swatch--active', swatch.dataset.color === color);
    }

    this.onChange(color);
  }

  // ── Palette update ─────────────────────────────────────────

  updatePalette(palette) {
    if (!this._el) return;

    // Keep existing swatches, add new ones
    const existing = new Set(this._swatches.map(s => s.dataset.color));

    for (const color of palette) {
      if (!existing.has(color)) {
        this._addSwatch(color);
      }
    }
  }

  _isLight(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) > 200;
  }

  getSelected() {
    return this._selected;
  }

  getElement() {
    return this._el;
  }
}
