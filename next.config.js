/** @type {import('next').NextConfig} */
const nextConfig = {};

const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  // Disable in dev — SW interferes with hot reload
  disable: process.env.NODE_ENV === 'development',
  // Merge our custom worker code (sync-on-connect) into the generated SW
  customWorkerDir: 'worker',
  runtimeCaching: [
    // ── Dashboard API: NetworkFirst, 5s timeout → falls back to cache ───────
    {
      urlPattern: /\/api\/dashboard(\?.*)?$/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'api-dashboard',
        networkTimeoutSeconds: 5,
        expiration: { maxEntries: 30, maxAgeSeconds: 24 * 60 * 60 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    // ── Next.js static chunks (content-hashed): CacheFirst ──────────────────
    {
      urlPattern: /\/_next\/(static|image)\/.+/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'next-static',
        expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    // ── App icons + images ───────────────────────────────────────────────────
    {
      urlPattern: /\.(png|jpg|jpeg|svg|gif|ico|webp|woff2?)(\?.*)?$/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'images',
        expiration: { maxEntries: 60, maxAgeSeconds: 7 * 24 * 60 * 60 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    // ── App pages: StaleWhileRevalidate for instant shell loads ─────────────
    {
      urlPattern: /^\/(today|calendar|stats)(\/.*)?(\?.*)?$/,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'pages',
        expiration: { maxEntries: 10, maxAgeSeconds: 24 * 60 * 60 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
  ],
});

module.exports = withPWA(nextConfig);
