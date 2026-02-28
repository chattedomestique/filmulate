/**
 * App — root application controller
 *
 * Coordinates:
 * - Image import/export (image-io.js)
 * - WebGL pipeline (pipeline.js)
 * - UI toolbar (toolbar.js)
 * - Film analysis (analyze.js)
 * - Color extraction (color-extract.js)
 * - Undo/redo stack
 */

import { GrainPipeline } from '../processing/pipeline.js';
import { Toolbar } from './toolbar.js';
import { analyzeImage, analysisToUniforms } from '../processing/film/analyze.js';
import { extractColors } from '../utils/color-extract.js';
import { importImage, bitmapToImageData, downloadBlob, generateFilename } from '../utils/image-io.js';
import { injectExif } from '../utils/exif-writer.js';

// ── Undo Manager ───────────────────────────────────────────

class UndoManager {
  constructor(maxStates = 20) {
    this.maxStates = maxStates;
    this._stack = [];
    this._index = -1;
  }

  push(state) {
    // Remove any redo states
    this._stack.splice(this._index + 1);
    this._stack.push(structuredClone(state));

    if (this._stack.length > this.maxStates) {
      this._stack.shift();
    } else {
      this._index++;
    }
  }

  undo() {
    if (!this.canUndo()) return null;
    this._index--;
    return structuredClone(this._stack[this._index]);
  }

  redo() {
    if (!this.canRedo()) return null;
    this._index++;
    return structuredClone(this._stack[this._index]);
  }

  canUndo() { return this._index > 0; }
  canRedo() { return this._index < this._stack.length - 1; }

  current() {
    return this._index >= 0 ? structuredClone(this._stack[this._index]) : null;
  }
}

// ── App ────────────────────────────────────────────────────

export class App {
  constructor() {
    this._pipeline = null;
    this._toolbar = null;
    this._undoManager = new UndoManager(20);
    this._imageBitmap = null;
    this._originalFile = null;
    this._analysisCache = null;
    this._paletteCache = null;
    this._rafPending = false;

    // DOM refs
    this._canvas = null;
    this._fileInput = null;
    this._imageArea = null;
    this._emptyState = null;
    this._canvasContainer = null;
    this._loadingOverlay = null;
    this._toast = null;
    this._dropOverlay = null;
  }

  // ── Boot ───────────────────────────────────────────────────

  async init() {
    // Get DOM refs
    this._canvas           = document.getElementById('outputCanvas');
    this._fileInput        = document.getElementById('fileInput');
    this._imageArea        = document.getElementById('imageArea');
    this._emptyState       = document.getElementById('emptyState');
    this._canvasContainer  = document.getElementById('canvasContainer');
    this._loadingOverlay   = document.getElementById('loadingOverlay');
    this._toast            = document.getElementById('toast');

    // Initialize WebGL pipeline
    try {
      this._pipeline = new GrainPipeline(this._canvas);
      await this._pipeline.init();
    } catch (err) {
      this._showToast('WebGL2 not supported. Please use iOS Safari 15+.', 5000);
      console.error(err);
      return;
    }

    // Initialize toolbar
    this._toolbar = new Toolbar({
      pipeline: this._pipeline,
      undoManager: this._undoManager,
      onStateChange: (state) => this._onStateChange(state),
    });
    this._toolbar.init();

    // Set up import
    this._setupImport();

    // Set up drag-drop
    this._setupDragDrop();

    // Set up shake-to-undo
    this._setupShakeUndo();

    // Register service worker
    this._registerSW();
  }

  // ── Import ─────────────────────────────────────────────────

  _setupImport() {
    // Primary import button (empty state)
    document.getElementById('importBtn')?.addEventListener('click', () => this._triggerImport());

    // Nav import button
    document.getElementById('navImport')?.addEventListener('click', () => this._triggerImport());

    // File input handler
    this._fileInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (file) await this._handleFile(file);
      // Reset so same file can be re-imported
      this._fileInput.value = '';
    });
  }

  _triggerImport() {
    // Must be triggered from a user gesture (iOS requirement)
    this._fileInput.click();
    if ('vibrate' in navigator) navigator.vibrate(10);
  }

  async _handleFile(file) {
    this._showLoading(true);

    try {
      this._originalFile = file;
      const bitmap = await importImage(file);
      this._imageBitmap = bitmap;

      // Set image in pipeline
      const imageData = bitmapToImageData(bitmap);
      this._pipeline.setSourceImage(imageData);

      // Run analysis
      this._analysisCache = await analyzeImage(bitmap);
      const uniforms = analysisToUniforms(this._analysisCache);
      this._pipeline.setParams(uniforms);

      // Initial render
      this._pipeline.render();

      // Switch to loaded state
      this._setLoadedState();

      // Run color extraction async (non-blocking)
      this._extractColorsAsync(bitmap);

      // Render film thumbnails async
      this._toolbar.renderFilmThumbnails(bitmap);

      // Push initial undo state
      this._undoManager.push(this._pipeline.params);

      if ('vibrate' in navigator) navigator.vibrate([10, 30, 10]);

    } catch (err) {
      console.error('Import failed:', err);
      this._showToast('Failed to import image. Try a different file.');
    } finally {
      this._showLoading(false);
    }
  }

  async _extractColorsAsync(bitmap) {
    try {
      const palette = await extractColors(bitmap);
      this._paletteCache = palette;
      this._toolbar.updatePalette(palette);
    } catch (err) {
      console.warn('Color extraction failed:', err);
    }
  }

  // ── State management ───────────────────────────────────────

  _onStateChange(state) {
    if (state.exporting) {
      this._handleExport();
      return;
    }
    if (state.error) {
      this._showToast(state.error);
    }
    if (state.exported) {
      this._showToast('Saved to photos!');
    }
  }

  async _handleExport() {
    this._showLoading(true);

    try {
      const blob = await this._pipeline.exportImageBlob(0.92);

      // Inject EXIF metadata
      const params = this._pipeline.params;
      const enrichedBlob = await injectExif(blob, {
        stockName:    params.film_stock?.name,
        exposure:     params.exposure,
        grain:        params.grain,
        soften:       params.soften,
        filmStrength: params.film_strength,
      });

      const filename = generateFilename(params.film_stock?.id);
      downloadBlob(enrichedBlob, filename);

      if ('vibrate' in navigator) navigator.vibrate(10);
      this._showToast('Exported!');
    } catch (err) {
      console.error('Export error:', err);
      this._showToast('Export failed. Please try again.');
    } finally {
      this._showLoading(false);
    }
  }

  // ── Undo/Redo ──────────────────────────────────────────────

  undo() {
    const state = this._undoManager.undo();
    if (state) {
      this._pipeline.setParams(state);
      this._pipeline.render();
      this._updateUndoButtons();
      if ('vibrate' in navigator) navigator.vibrate([10, 10, 20]);
    }
  }

  redo() {
    const state = this._undoManager.redo();
    if (state) {
      this._pipeline.setParams(state);
      this._pipeline.render();
      this._updateUndoButtons();
    }
  }

  _updateUndoButtons() {
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    if (undoBtn) undoBtn.disabled = !this._undoManager.canUndo();
    if (redoBtn) redoBtn.disabled = !this._undoManager.canRedo();
  }

  _setupShakeUndo() {
    // Shake gesture: detect significant acceleration change
    let lastAccel = null;
    let shakeCount = 0;
    let lastShakeTime = 0;

    window.addEventListener('devicemotion', (e) => {
      const acc = e.accelerationIncludingGravity;
      if (!acc) return;

      if (lastAccel) {
        const delta = Math.sqrt(
          Math.pow(acc.x - lastAccel.x, 2) +
          Math.pow(acc.y - lastAccel.y, 2) +
          Math.pow(acc.z - lastAccel.z, 2)
        );

        if (delta > 15) {
          const now = Date.now();
          if (now - lastShakeTime < 1500) {
            shakeCount++;
            if (shakeCount >= 2) {
              shakeCount = 0;
              this.undo();
            }
          } else {
            shakeCount = 1;
          }
          lastShakeTime = now;
        }
      }

      lastAccel = { x: acc.x, y: acc.y, z: acc.z };
    });
  }

  // ── Drag & Drop ────────────────────────────────────────────

  _setupDragDrop() {
    const dropOverlay = document.createElement('div');
    dropOverlay.className = 'drop-overlay';
    dropOverlay.innerHTML = '<span class="drop-overlay__label">Drop photo here</span>';
    document.getElementById('app').appendChild(dropOverlay);
    this._dropOverlay = dropOverlay;

    const appEl = document.getElementById('app');

    appEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropOverlay.classList.add('drop-overlay--active');
    });

    appEl.addEventListener('dragleave', (e) => {
      if (!appEl.contains(e.relatedTarget)) {
        dropOverlay.classList.remove('drop-overlay--active');
      }
    });

    appEl.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropOverlay.classList.remove('drop-overlay--active');

      const file = e.dataTransfer.files?.[0];
      if (file?.type.startsWith('image/')) {
        await this._handleFile(file);
      }
    });
  }

  // ── UI State ───────────────────────────────────────────────

  _setLoadedState() {
    this._emptyState.hidden = true;
    this._canvasContainer.hidden = false;
    this._imageArea.classList.remove('image-area--empty');
    this._toolbar.enableNav(true);
    document.getElementById('toolStripWrapper').hidden = false;
  }

  // ── Helpers ────────────────────────────────────────────────

  _showLoading(visible) {
    this._loadingOverlay.hidden = !visible;
  }

  _showToast(message, duration = 2500) {
    this._toast.textContent = message;
    this._toast.classList.add('toast--visible');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this._toast.classList.remove('toast--visible');
    }, duration);
  }

  _registerSW() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch((err) => {
          console.warn('SW registration failed:', err);
        });
      });
    }
  }
}
