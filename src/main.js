/**
 * Grain — Film Emulation PWA
 * Entry point
 */

import { App } from './ui/app.js';

// Initialize on DOMContentLoaded
document.addEventListener('DOMContentLoaded', async () => {
  // Set image area to empty state initially
  document.getElementById('imageArea').classList.add('image-area--empty');

  const app = new App();

  try {
    await app.init();
  } catch (err) {
    console.error('App init failed:', err);
    // Show a friendly error
    const emptyState = document.getElementById('emptyState');
    if (emptyState) {
      emptyState.innerHTML = `
        <div class="empty-state__inner">
          <h1 class="wordmark">Grain</h1>
          <p style="color: var(--accent-primary); font-weight: 600;">
            WebGL2 required
          </p>
          <p class="empty-state__tagline">
            Please use iOS Safari 15+ or Chrome on Android
          </p>
        </div>
      `;
    }
  }
});
