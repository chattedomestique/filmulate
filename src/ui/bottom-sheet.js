/**
 * BottomSheet — reusable slide-up panel
 *
 * Interaction Design compliance:
 * - Single focused control area (caller defines content)
 * - Swipe-to-dismiss with downward gesture
 * - Pill handle visible at top
 * - Haptic on open/close where supported
 */

export class BottomSheet {
  constructor({ id, title, onClose } = {}) {
    this.id = id || `sheet-${Date.now()}`;
    this.title = title || '';
    this.onClose = onClose || (() => {});
    this._el = null;
    this._backdrop = null;
    this._open = false;
    this._dragStartY = 0;
    this._dragCurrentY = 0;
    this._isDragging = false;
  }

  // ── Build DOM ──────────────────────────────────────────────

  build(contentEl) {
    // Backdrop
    this._backdrop = document.createElement('div');
    this._backdrop.className = 'sheet-backdrop';
    this._backdrop.addEventListener('click', () => this.close());

    // Sheet
    this._el = document.createElement('div');
    this._el.className = 'bottom-sheet';
    this._el.id = this.id;
    this._el.setAttribute('role', 'dialog');
    this._el.setAttribute('aria-modal', 'true');
    if (this.title) this._el.setAttribute('aria-label', this.title);

    // Handle
    const handle = document.createElement('div');
    handle.className = 'sheet-handle';

    // Header
    const header = document.createElement('div');
    header.className = 'sheet-header';

    const titleEl = document.createElement('span');
    titleEl.className = 'sheet-title';
    titleEl.textContent = this.title;

    header.appendChild(titleEl);

    // Body
    const body = document.createElement('div');
    body.className = 'sheet-body';
    body.appendChild(contentEl);

    this._el.appendChild(handle);
    this._el.appendChild(header);
    this._el.appendChild(body);

    // Drag-to-dismiss
    this._setupDragDismiss();

    return this;
  }

  _setupDragDismiss() {
    const el = this._el;

    el.addEventListener('touchstart', (e) => {
      // Only drag from the handle area or top portion
      const touch = e.touches[0];
      const rect = el.getBoundingClientRect();
      const relativeY = touch.clientY - rect.top;

      // Allow dragging from top 60px (handle + header area)
      if (relativeY > 60) return;

      this._isDragging = true;
      this._dragStartY = touch.clientY;
      this._dragCurrentY = 0;
      el.style.transition = 'none';
    }, { passive: true });

    el.addEventListener('touchmove', (e) => {
      if (!this._isDragging) return;
      const touch = e.touches[0];
      const delta = touch.clientY - this._dragStartY;

      // Only allow downward drag
      if (delta > 0) {
        this._dragCurrentY = delta;
        el.style.transform = `translateY(${delta}px)`;
      }
    }, { passive: true });

    el.addEventListener('touchend', () => {
      if (!this._isDragging) return;
      this._isDragging = false;
      el.style.transition = '';

      // If dragged more than 100px down — dismiss
      if (this._dragCurrentY > 100) {
        this.close();
      } else {
        // Snap back
        el.style.transform = '';
      }
    });
  }

  // ── Lifecycle ──────────────────────────────────────────────

  mount(container) {
    container.appendChild(this._backdrop);
    container.appendChild(this._el);
    return this;
  }

  open() {
    if (this._open) return;
    this._open = true;

    // Force layout before transition
    this._el.offsetHeight;
    this._el.classList.add('bottom-sheet--open');
    this._backdrop.classList.add('sheet-backdrop--visible');

    this._haptic('light');

    // Focus management
    const firstFocusable = this._el.querySelector('button, input, [tabindex]');
    if (firstFocusable) firstFocusable.focus();
  }

  close() {
    if (!this._open) return;
    this._open = false;

    this._el.style.transform = '';
    this._el.classList.remove('bottom-sheet--open');
    this._backdrop.classList.remove('sheet-backdrop--visible');

    this._haptic('light');
    this.onClose();
  }

  isOpen() {
    return this._open;
  }

  destroy() {
    this._backdrop?.remove();
    this._el?.remove();
  }

  // ── Haptics ────────────────────────────────────────────────

  _haptic(type) {
    if ('vibrate' in navigator) {
      const patterns = { light: [10], medium: [20, 10, 20] };
      navigator.vibrate(patterns[type] || [10]);
    }
  }
}
