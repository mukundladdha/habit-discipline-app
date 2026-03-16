/**
 * worker/index.js — Custom service-worker code merged by next-pwa.
 *
 * This file is bundled INTO the generated sw.js by next-pwa's customWorkerDir.
 * Keep it lean — only SW-context code (no DOM, no React).
 *
 * What we do here:
 *   - Listen for the 'message' event so the app can notify the SW
 *     when it comes back online (future: Background Sync API hook).
 *   - Re-broadcast a 'sw-ready' message to all clients so the app
 *     knows the SW is in control (useful for first-install UX).
 */

// Tell all open app windows that the SW is active and in control.
self.addEventListener('activate', () => {
  self.clients.matchAll({ type: 'window' }).then((clients) => {
    clients.forEach((client) => client.postMessage({ type: 'SW_READY' }));
  });
});

// Allow the app to send messages to the SW (e.g. 'SKIP_WAITING').
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
