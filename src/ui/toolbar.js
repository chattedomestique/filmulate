/**
 * Toolbar — manages bottom nav, tool strip, and all tool sheets
 *
 * Edit mode flow:
 *   Main nav → tap Edit → nav swaps to edit sub-nav (Exposure / Latitude /
 *   Diffusion / Grain).  Tap any → shows ONE slider sheet.  Tap Done → back
 *   to main nav.  Only one slider is ever visible at a time.
 */

import { BottomSheet } from './bottom-sheet.js';
import { Slider } from './slider.js';
import { FilmStrip } from './film-strip.js';
import { ColorPicker } from './color-picker.js';

export class Toolbar {
  constructor({ pipeline, onStateChange, undoManager } = {}) {
    this.pipeline = pipeline;
    this.onStateChange = onStateChange || (() => {});
    this.undoManager = undoManager;

    this._activeSheet = null;
    this._activeNav = null;
    this._inEditMode = false;
    this._editNavSetup = false;

    this._navButtons = {};
    this._sheetContainer = null;
    this._filmStrip = null;
    this._sheets = {};

    this._state = {
      exposure: 0,
      dr_amount: 0,
      clip_highlights: false,
      soften: 0,
      grain: 0,
      film_stock: null,
      film_strength: 1.0,
      halation: 0,
      channel_sep: 0,
      border_enabled: false,
      border_color: [0, 0, 0],
      border_size: 0.05,
    };
  }

  // ── Initialize ─────────────────────────────────────────────

  init() {
    this._sheetContainer = document.getElementById('sheetContainer');
    this._navButtons = {
      import: document.getElementById('navImport'),
      edit:   document.getElementById('navEdit'),
      film:   document.getElementById('navFilm'),
      border: document.getElementById('navBorder'),
      export: document.getElementById('navExport'),
    };

    this._setupNavListeners();
    this._buildFilmStrip();
    this._buildUndoBar();
  }

  _setupNavListeners() {
    const nav = this._navButtons;
    nav.edit?.addEventListener('click', () => this._enterEditMode());
    nav.film?.addEventListener('click', () => this._openTool('film'));
    nav.border?.addEventListener('click', () => this._openTool('border'));
    nav.export?.addEventListener('click', () => this._handleExport());
  }

  _buildFilmStrip() {
    const wrapper = document.getElementById('toolStripWrapper');
    if (!wrapper) return;
    this._filmStrip = new FilmStrip({
      pipeline: this.pipeline,
      onSelect: (stock) => this._onStockSelect(stock),
    });
    const el = this._filmStrip.build();
    wrapper.innerHTML = '';
    wrapper.appendChild(el);
  }

  _buildUndoBar() {
    const bar = document.createElement('div');
    bar.className = 'undo-bar';

    const undoBtn = document.createElement('button');
    undoBtn.className = 'undo-btn';
    undoBtn.title = 'Undo';
    undoBtn.setAttribute('aria-label', 'Undo');
    undoBtn.textContent = '↩';
    undoBtn.disabled = true;
    undoBtn.id = 'undoBtn';
    undoBtn.addEventListener('click', () => { if (this.undoManager) this.undoManager.undo(); });

    const redoBtn = document.createElement('button');
    redoBtn.className = 'undo-btn';
    redoBtn.title = 'Redo';
    redoBtn.setAttribute('aria-label', 'Redo');
    redoBtn.textContent = '↪';
    redoBtn.disabled = true;
    redoBtn.id = 'redoBtn';
    redoBtn.addEventListener('click', () => { if (this.undoManager) this.undoManager.redo(); });

    bar.appendChild(undoBtn);
    bar.appendChild(redoBtn);
    document.getElementById('app').appendChild(bar);
  }

  // ── Edit mode ─────────────────────────────────────────────
  // Clicking Edit swaps the bottom nav to the edit sub-nav (Exposure /
  // Latitude / Diffusion / Grain).  Each icon opens exactly one slider.

  _enterEditMode() {
    this._closeCurrentSheet();
    this._inEditMode = true;
    this._setNavActive(null);

    document.getElementById('navGroupMain').hidden = true;
    document.getElementById('navGroupEdit').hidden = false;

    if (!this._editNavSetup) {
      this._setupEditNavListeners();
      this._editNavSetup = true;
    }
  }

  _exitEditMode() {
    this._closeCurrentSheet();
    this._inEditMode = false;
    this._activeNav = null;

    document.getElementById('navGroupEdit').hidden = true;
    document.getElementById('navGroupMain').hidden = false;
  }

  _setupEditNavListeners() {
    document.getElementById('navEditDone')
      ?.addEventListener('click', () => this._exitEditMode());
    document.getElementById('navEditExposure')
      ?.addEventListener('click', () => this._openEditSubTool('exposure'));
    document.getElementById('navEditDR')
      ?.addEventListener('click', () => this._openEditSubTool('dr'));
    document.getElementById('navEditDiffusion')
      ?.addEventListener('click', () => this._openEditSubTool('diffusion'));
    document.getElementById('navEditGrain')
      ?.addEventListener('click', () => this._openEditSubTool('grain'));
  }

  _openEditSubTool(toolId) {
    // Toggle: tap same icon again to close
    if (this._activeSheet && this._activeNav === toolId) {
      this._closeCurrentSheet();
      return;
    }
    this._closeCurrentSheet();

    const builders = {
      exposure:  () => this._buildExposureSheet(),
      dr:        () => this._buildDRSheet(),
      diffusion: () => this._buildDiffusionSheet(),
      grain:     () => this._buildGrainSheet(),
    };
    if (!builders[toolId]) return;

    this._activeNav = toolId;
    this._setEditSubNavActive(toolId);
    const sheet = builders[toolId]();
    sheet.open();
    this._activeSheet = sheet;
  }

  _setEditSubNavActive(toolId) {
    const map = {
      exposure:  'navEditExposure',
      dr:        'navEditDR',
      diffusion: 'navEditDiffusion',
      grain:     'navEditGrain',
    };
    for (const [id, btnId] of Object.entries(map)) {
      document.getElementById(btnId)?.classList.toggle('active', id === toolId);
    }
  }

  // ── Individual edit sheets (one slider each) ──────────────

  _buildExposureSheet() {
    const container = document.createElement('div');
    container.appendChild(new Slider({
      name: 'Exposure',
      min: -2, max: 2, step: 0.05,
      value: this._state.exposure,
      format: (v) => (v >= 0 ? '+' : '') + v.toFixed(1) + ' EV',
      onChange: (v) => this._applyParam('exposure', v),
      onCommit: (v) => this._commit({ exposure: v }),
    }).build());

    return new BottomSheet({
      id: 'sheet-exposure',
      title: 'Exposure',
      onClose: () => {
        this._setEditSubNavActive(null);
        if (this._activeNav === 'exposure') this._activeNav = null;
      },
    }).build(container).mount(this._sheetContainer);
  }

  _buildDRSheet() {
    const container = document.createElement('div');
    const drSlider = new Slider({
      name: 'Latitude',
      subtitle: 'dynamic range',
      min: 0, max: 1, step: 0.01,
      value: this._state.dr_amount,
      format: (v) => Math.round(v * 100) + '%',
      onChange: (v) => this._applyParam('dr_amount', v),
      onCommit: (v) => this._commit({ dr_amount: v }),
    });
    const drEl = drSlider.build(); // build() first, then addSecondary (API requirement)
    drSlider.addSecondary(this._buildToggle(
      'Clip highlights hard', this._state.clip_highlights, (v) => {
        this._applyParam('clip_highlights', v);
        this._commit({ clip_highlights: v });
      }
    ));
    container.appendChild(drEl);

    return new BottomSheet({
      id: 'sheet-dr',
      title: 'Latitude',
      onClose: () => {
        this._setEditSubNavActive(null);
        if (this._activeNav === 'dr') this._activeNav = null;
      },
    }).build(container).mount(this._sheetContainer);
  }

  _buildDiffusionSheet() {
    const container = document.createElement('div');
    container.appendChild(new Slider({
      name: 'Diffusion',
      subtitle: 'analog softness',
      min: 0, max: 1, step: 0.01,
      value: this._state.soften,
      format: (v) => Math.round(v * 100) + '%',
      onChange: (v) => this._applyParam('soften', v),
      onCommit: (v) => this._commit({ soften: v }),
    }).build());

    return new BottomSheet({
      id: 'sheet-diffusion',
      title: 'Diffusion',
      onClose: () => {
        this._setEditSubNavActive(null);
        if (this._activeNav === 'diffusion') this._activeNav = null;
      },
    }).build(container).mount(this._sheetContainer);
  }

  _buildGrainSheet() {
    const container = document.createElement('div');
    const grainSlider = new Slider({
      name: 'Grain',
      subtitle: 'ISO character',
      min: 0, max: 1, step: 0.01,
      value: this._state.grain,
      format: (v) => {
        const iso = Math.round(100 * Math.pow(32, v));
        return `ISO ${iso}`;
      },
      onChange: (v) => this._applyParam('grain', v),
      onCommit: (v) => this._commit({ grain: v }),
    });
    const grainEl = grainSlider.build(); // build() first, then addSecondary
    grainSlider.addSecondary(this._buildIsoDots());
    container.appendChild(grainEl);

    return new BottomSheet({
      id: 'sheet-grain',
      title: 'Grain',
      onClose: () => {
        this._setEditSubNavActive(null);
        if (this._activeNav === 'grain') this._activeNav = null;
      },
    }).build(container).mount(this._sheetContainer);
  }

  // ── Other tool sheets (Film, Border) ──────────────────────

  _openTool(toolId) {
    if (this._activeSheet && this._activeNav === toolId) {
      this._closeCurrentSheet();
      return;
    }
    this._closeCurrentSheet();

    const builders = {
      film:   () => this._buildFilmSheet(),
      border: () => this._buildBorderSheet(),
    };
    if (!builders[toolId]) return;

    this._activeNav = toolId;
    this._setNavActive(toolId);
    const sheet = builders[toolId]();
    sheet.open();
    this._activeSheet = sheet;
  }

  _closeCurrentSheet() {
    if (this._activeSheet) {
      this._activeSheet.close();
      this._activeSheet = null;
    }
    if (!this._inEditMode) {
      this._setNavActive(null);
      this._activeNav = null;
    } else {
      this._setEditSubNavActive(null);
      this._activeNav = null;
    }
  }

  _setNavActive(toolId) {
    for (const [id, btn] of Object.entries(this._navButtons)) {
      btn?.classList.toggle('active', id === toolId);
    }
  }

  // ── Film sheet ─────────────────────────────────────────────

  _buildFilmSheet() {
    const container = document.createElement('div');

    const stockDetail = document.createElement('div');
    stockDetail.className = 'stock-detail';
    stockDetail.id = 'stockDetail';

    const stockName = document.createElement('span');
    stockName.className = 'stock-detail__name';
    stockName.id = 'stockName';

    const currentStock = this._state.film_stock;
    stockName.textContent = currentStock ? currentStock.name : 'No film selected';
    if (!currentStock) stockName.style.color = 'var(--text-muted)';

    stockDetail.appendChild(stockName);
    container.appendChild(stockDetail);

    const desc = document.createElement('p');
    desc.className = 'stock-description';
    desc.id = 'stockDesc';
    if (currentStock) desc.textContent = currentStock.description || '';
    container.appendChild(desc);

    container.appendChild(this._divider());

    container.appendChild(new Slider({
      name: 'Strength',
      min: 0, max: 1, step: 0.01,
      value: this._state.film_strength,
      format: (v) => Math.round(v * 100) + '%',
      onChange: (v) => this._applyParam('film_strength', v),
      onCommit: (v) => this._commit({ film_strength: v }),
    }).build());

    const sheet = new BottomSheet({
      id: 'sheet-film',
      title: 'Film Stock',
      onClose: () => { if (this._activeNav === 'film') this._setNavActive(null); },
    });
    sheet.build(container).mount(this._sheetContainer);
    return sheet;
  }

  _onStockSelect(stock) {
    this._state.film_stock = stock;
    this.pipeline.setParams({ film_stock: stock, film_enabled: !!stock });
    this.pipeline.setPassEnabled('film_emulate', !!stock);

    const nameEl = document.getElementById('stockName');
    const descEl = document.getElementById('stockDesc');
    if (nameEl) {
      nameEl.textContent = stock ? stock.name : 'No film selected';
      nameEl.style.color = stock ? '' : 'var(--text-muted)';
    }
    if (descEl) descEl.textContent = stock?.description || '';

    if ('vibrate' in navigator) navigator.vibrate(10);
    this._commit({ film_stock: stock });
  }

  // ── Border sheet ───────────────────────────────────────────

  _buildBorderSheet() {
    const container = document.createElement('div');

    container.appendChild(new ColorPicker({
      onChange: (color) => {
        const rgb = this._hexToRgb(color);
        this._applyParam('border_color', rgb);
        this._commit({ border_color: rgb });
      },
    }).build());

    container.appendChild(this._divider());

    container.appendChild(new Slider({
      name: 'Border Width',
      min: 0, max: 0.2, step: 0.005,
      value: this._state.border_size,
      format: (v) => Math.round(v * 100) + '%',
      onChange: (v) => {
        this._applyParam('border_size', v);
        this.pipeline.setPassEnabled('border', v > 0);
      },
      onCommit: (v) => this._commit({ border_size: v }),
    }).build());

    container.appendChild(this._divider());

    const shapeLabel = document.createElement('div');
    shapeLabel.className = 'sheet-title';
    shapeLabel.textContent = 'Shape';
    shapeLabel.style.marginBottom = '8px';
    container.appendChild(shapeLabel);

    const shapeToggle = document.createElement('div');
    shapeToggle.className = 'toggle-group';

    const origBtn = document.createElement('button');
    origBtn.className = 'toggle-btn toggle-btn--active';
    origBtn.textContent = 'Original';
    const squareBtn = document.createElement('button');
    squareBtn.className = 'toggle-btn';
    squareBtn.textContent = 'Square';

    origBtn.addEventListener('click', () => {
      origBtn.classList.add('toggle-btn--active');
      squareBtn.classList.remove('toggle-btn--active');
      this._applyParam('border_square', false);
    });
    squareBtn.addEventListener('click', () => {
      squareBtn.classList.add('toggle-btn--active');
      origBtn.classList.remove('toggle-btn--active');
      this._applyParam('border_square', true);
    });

    shapeToggle.appendChild(origBtn);
    shapeToggle.appendChild(squareBtn);
    container.appendChild(shapeToggle);

    const sheet = new BottomSheet({
      id: 'sheet-border',
      title: 'Border',
      onClose: () => { if (this._activeNav === 'border') this._setNavActive(null); },
    });
    sheet.build(container).mount(this._sheetContainer);
    return sheet;
  }

  // ── State management ───────────────────────────────────────

  _applyParam(key, value) {
    this._state[key] = value;
    this.pipeline.setParam(key, value);
  }

  _commit(changes) {
    Object.assign(this._state, changes);
    if (this.undoManager) this.undoManager.push({ ...this._state });
    this.onStateChange({ ...this._state });
    this._updateUndoButtons();
  }

  _updateUndoButtons() {
    if (!this.undoManager) return;
    const u = document.getElementById('undoBtn');
    const r = document.getElementById('redoBtn');
    if (u) u.disabled = !this.undoManager.canUndo();
    if (r) r.disabled = !this.undoManager.canRedo();
  }

  // ── Export ─────────────────────────────────────────────────

  async _handleExport() {
    this._closeCurrentSheet();
    this.onStateChange({ exporting: true });
    if ('vibrate' in navigator) navigator.vibrate(10);

    try {
      const blob = await this.pipeline.exportImageBlob(0.92);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `grain-${Date.now()}.jpg`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      this.onStateChange({ exporting: false, exported: true });
    } catch (err) {
      console.error('Export failed:', err);
      this.onStateChange({ exporting: false, error: 'Export failed' });
    }
  }

  // ── UI helpers ─────────────────────────────────────────────

  _divider() {
    const d = document.createElement('div');
    d.className = 'sheet-divider';
    return d;
  }

  _buildToggle(label, initialValue, onChange) {
    const row = document.createElement('div');
    row.className = 'check-toggle';

    const labelEl = document.createElement('span');
    labelEl.className = 'check-toggle__label';
    labelEl.textContent = label;

    const switchEl = document.createElement('label');
    switchEl.className = 'toggle-switch';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = initialValue;
    input.addEventListener('change', () => onChange(input.checked));

    const track = document.createElement('span');
    track.className = 'toggle-switch__track';
    const thumb = document.createElement('span');
    thumb.className = 'toggle-switch__thumb';

    switchEl.appendChild(input);
    switchEl.appendChild(track);
    switchEl.appendChild(thumb);
    row.appendChild(labelEl);
    row.appendChild(switchEl);
    return row;
  }

  _buildIsoDots() {
    const row = document.createElement('div');
    row.className = 'iso-indicator';
    const label = document.createElement('span');
    label.className = 'iso-label';
    label.textContent = 'ISO';
    const dots = document.createElement('div');
    dots.className = 'iso-dots';
    for (let i = 0; i < 5; i++) {
      const dot = document.createElement('div');
      dot.className = 'iso-dot';
      dots.appendChild(dot);
    }
    row.appendChild(label);
    row.appendChild(dots);
    return row;
  }

  _hexToRgb(hex) {
    return [
      parseInt(hex.slice(1, 3), 16) / 255,
      parseInt(hex.slice(3, 5), 16) / 255,
      parseInt(hex.slice(5, 7), 16) / 255,
    ];
  }

  // ── Enable/disable nav ─────────────────────────────────────

  enableNav(enabled = true) {
    for (const [id, btn] of Object.entries(this._navButtons)) {
      if (id !== 'import') btn.disabled = !enabled;
    }
    document.getElementById('toolStripWrapper').hidden = !enabled;
  }

  updatePalette(palette) {
    this._extractedPalette = palette;
  }

  renderFilmThumbnails(imageBitmap) {
    this._filmStrip?.renderThumbnails(imageBitmap);
  }
}
