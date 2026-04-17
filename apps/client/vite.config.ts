import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const tauriDevHost = process.env.TAURI_DEV_HOST;
const isTauriBuild = Boolean(process.env.TAURI_ENV_PLATFORM);
const base = process.env.VITE_BASE || '/';

// Build PWA allowlist patterns based on base path.
// When base is "/" (local/Tauri): patterns match /, /threads, etc.
// When base is "/my-codex-app/" (GitHub Pages): patterns match /my-codex-app/, /my-codex-app/threads, etc.
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
const basePrefix = escapeRegex(base === '/' ? '' : base.replace(/\/$/, ''));

export default defineConfig({
  base,
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  optimizeDeps: {
    exclude: ['@my-codex-app/protocol', '@my-codex-app/sdk'],
  },
  plugins: [
    // HTTPS only for browser dev (LAN camera access requires secure context).
    // Tauri dev skips this — WebView rejects self-signed certs.
    ...(tauriDevHost ? [] : [basicSsl()]),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      // devOptions: { enabled: true },
      includeAssets: ['icon.png'],
      manifest: {
        name: 'My Codex App',
        short_name: 'Codex',
        description: 'Codex access platform',
        theme_color: '#0b0b0d',
        background_color: '#0b0b0d',
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          { src: 'icon-640.png', sizes: '640x640', type: 'image/png' },
        ],
      },
      workbox: {
        navigateFallback: 'index.html',
        navigateFallbackAllowlist: [
          new RegExp(`^${basePrefix}/$`),
          new RegExp(`^${basePrefix}/(threads|inbox|connection)(/.*)?$`),
        ],
        manifestTransforms: [
          (entries) => {
            const manifest = entries.filter((entry) => {
              const { url } = entry;
              if (!url.startsWith('assets/')) return true;
              if (/\.(css|woff2?)$/.test(url)) return true;
              if (/^assets\/(index|chunk|preload-helper)-/.test(url))
                return true;
              return false;
            });
            return { manifest, warnings: [] };
          },
        ],
        runtimeCaching: [
          {
            urlPattern: /\.(?:js|css|woff2?|png|svg|ico)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'static-assets',
              expiration: { maxEntries: 150, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@my-codex-app/protocol': fileURLToPath(
        new URL('../../packages/protocol/src/index.ts', import.meta.url),
      ),
      '@my-codex-app/sdk': fileURLToPath(
        new URL('../../packages/sdk/src/index.ts', import.meta.url),
      ),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    host: tauriDevHost || true,
    hmr: tauriDevHost
      ? {
          protocol: 'ws',
          host: tauriDevHost,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  build: isTauriBuild
    ? {
        target:
          process.env.TAURI_ENV_PLATFORM === 'windows' ||
          process.env.TAURI_ENV_PLATFORM === 'android'
            ? 'chrome105'
            : 'safari13',
        minify: process.env.TAURI_ENV_DEBUG ? false : 'esbuild',
        sourcemap: Boolean(process.env.TAURI_ENV_DEBUG),
      }
    : undefined,
});
