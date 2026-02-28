/**
 * Slider — custom touch-friendly range slider
 *
 * Interaction Design compliance:
 * - Large touch target (28px thumb)
 * - Live update on drag (no Apply button)
 * - Shows value in DM Mono
 * - Optional subtitle (analog descriptor)
 * - Optional secondary control (appears after primary engagement)
 */

export class Slider {
  constructor({
    name,        // display label (uppercase)
    subtitle,    // small italic descriptor
    min = 0,
    max = 1,
    step = 0.01,
    value = 0,
    format,      // (value) => string for display
    onChange,    // (value) => void, called on every change
    onCommit,    // (value) => void, called on release
  } = {}) {
    this.name = name;
    this.subtitle = subtitle;
    this.min = min;
    this.max = max;
    this.step = step;
    this._value = value;
    this.format = format || ((v) => v.toFixed(2));
    this.onChange = onChange || (() => {});
    this.onCommit = onCommit || (() => {});
    this._el = null;
    this._input = null;
    this._valueDisplay = null;
    this._hasEngaged = false; // for secondary control reveal
  }

  get value() { return this._value; }

  set value(v) {
    this._value = v;
    if (this._input) {
      this._input.value = String(v);
      this._updateDisplay();
    }
  }

  // ── Build DOM ──────────────────────────────────────────────

  build() {
    const wrapper = document.createElement('div');
    wrapper.className = 'slider-wrapper';

    // Label row
    const labelRow = document.createElement('div');
    labelRow.className = 'slider-label';

    const nameGroup = document.createElement('div');

    const nameEl = document.createElement('span');
    nameEl.className = 'slider-label__name';
    nameEl.textContent = this.name;
    nameGroup.appendChild(nameEl);

    if (this.subtitle) {
      const subEl = document.createElement('span');
      subEl.className = 'slider-label__sub';
      subEl.textContent = this.subtitle;
      nameGroup.appendChild(document.createTextNode(' '));
      nameGroup.appendChild(subEl);
    }

    this._valueDisplay = document.createElement('span');
    this._valueDisplay.className = 'slider-label__value';
    this._updateDisplay();

    labelRow.appendChild(nameGroup);
    labelRow.appendChild(this._valueDisplay);
    wrapper.appendChild(labelRow);

    // Track
    const trackContainer = document.createElement('div');
    trackContainer.className = 'slider-track-container';

    this._input = document.createElement('input');
    this._input.type = 'range';
    this._input.min = String(this.min);
    this._input.max = String(this.max);
    this._input.step = String(this.step);
    this._input.value = String(this._value);
    this._input.setAttribute('aria-label', this.name);

    this._input.addEventListener('input', () => {
      this._value = parseFloat(this._input.value);
      this._updateDisplay();
      this._hasEngaged = true;
      this.onChange(this._value);
      this._revealSecondary();
    });

    this._input.addEventListener('change', () => {
      this.onCommit(this._value);
    });

    trackContainer.appendChild(this._input);
    wrapper.appendChild(trackContainer);

    this._el = wrapper;
    return wrapper;
  }

  _updateDisplay() {
    if (this._valueDisplay) {
      this._valueDisplay.textContent = this.format(this._value);
    }
  }

  _revealSecondary() {
    // After first engagement, reveal secondary controls if present
    if (!this._secondaryEl) return;
    this._secondaryEl.classList.add('secondary-control--visible');
  }

  // ── Secondary control (optional) ──────────────────────────

  addSecondary(el) {
    if (!this._el) return this;
    const wrapper = document.createElement('div');
    wrapper.className = 'secondary-control';
    wrapper.appendChild(el);
    this._el.appendChild(wrapper);
    this._secondaryEl = wrapper;
    return this;
  }

  getElement() {
    return this._el;
  }
}
