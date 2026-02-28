// Grain PWA Service Worker — cache-first strategy
const CACHE_NAME = 'grain-v2';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/styles/tokens.css',
  '/styles/components.css',
  '/styles/layout.css',
  '/src/main.js',
  '/src/ui/app.js',
  '/src/ui/toolbar.js',
  '/src/ui/bottom-sheet.js',
  '/src/ui/color-picker.js',
  '/src/ui/film-strip.js',
  '/src/ui/slider.js',
  '/src/processing/pipeline.js',
  '/src/processing/shaders/common.vert.glsl',
  '/src/processing/shaders/brightness.frag.glsl',
  '/src/processing/shaders/dynamic_range.frag.glsl',
  '/src/processing/shaders/soften.frag.glsl',
  '/src/processing/shaders/noise.frag.glsl',
  '/src/processing/shaders/film_emulate.frag.glsl',
  '/src/processing/shaders/halation.frag.glsl',
  '/src/processing/shaders/light_leak.frag.glsl',
  '/src/processing/shaders/channel_sep.frag.glsl',
  '/src/processing/shaders/border_composite.frag.glsl',
  '/src/processing/film/analyze.js',
  '/src/processing/film/stocks.js',
  '/src/utils/color-extract.js',
  '/src/utils/exif-writer.js',
  '/src/utils/image-io.js',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/assets/icons/icon-180.png',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Cache core assets, skip external fonts on first install
      const coreAssets = STATIC_ASSETS.filter(url => !url.startsWith('https://'));
      return cache.addAll(coreAssets);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Skip non-GET and browser-extension requests
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).then((response) => {
        // Cache successful responses
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(() => {
        // Offline fallback for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
