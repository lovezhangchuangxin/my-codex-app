import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  optimizeDeps: {
    exclude: ["@my-codex-app/protocol", "@my-codex-app/sdk"]
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      // devOptions: { enabled: true },
      includeAssets: ["icon.png"],
      manifest: {
        name: "My Codex App",
        short_name: "Codex",
        description: "Codex access platform",
        theme_color: "#0b0b0d",
        background_color: "#0b0b0d",
        display: "standalone",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" }
        ]
      },
      workbox: {
        navigateFallback: "index.html",
        navigateFallbackAllowlist: [/^\/$/, /^\/(threads|inbox|connection)(\/.*)?$/],
        manifestTransforms: [
          (entries) => {
            const manifest = entries.filter((entry) => {
              const { url } = entry;
              if (!url.startsWith("assets/")) return true;
              if (/\.(css|woff2?)$/.test(url)) return true;
              if (/^assets\/(index|chunk|preload-helper)-/.test(url)) return true;
              return false;
            });
            return { manifest, warnings: [] };
          }
        ],
        runtimeCaching: [
          {
            urlPattern: /\.(?:js|css|woff2?|png|svg|ico)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "static-assets",
              expiration: { maxEntries: 150, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@my-codex-app/protocol": fileURLToPath(
        new URL("../../packages/protocol/src/index.ts", import.meta.url)
      ),
      "@my-codex-app/sdk": fileURLToPath(
        new URL("../../packages/sdk/src/index.ts", import.meta.url)
      )
    }
  },
  server: {
    port: 5173,
    host: true
  }
});
