import process from 'node:process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { sentryVitePlugin } from '@sentry/vite-plugin'

// Error reports name the commit they came from: Netlify sets COMMIT_REF while it builds, and Vite
// exposes VITE_* variables to the app (lib/errorReporting.js).
process.env.VITE_RELEASE ||= process.env.COMMIT_REF || ''

// Readable stack traces in Sentry: with SENTRY_AUTH_TOKEN set (a secret in Netlify's Production
// context), the build makes source maps, uploads them to Sentry, and deletes them from dist/, so
// they are never served. Without the token (local dev, previews, tests) there are no source maps.
const uploadSourceMaps = Boolean(process.env.SENTRY_AUTH_TOKEN)

// https://vite.dev/config/
export default defineConfig({
  build: { sourcemap: uploadSourceMaps ? 'hidden' : false },
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    // The service worker's own source maps would be written after the Sentry upload deletes the
    // app's, and then served; it's library code, so skip them.
    workbox: { sourcemap: false },
    manifest: {
      name: 'Variety H2O + Ice Cream Tracker',
      short_name: 'Variety H2O',
      description: 'Gallons tracker for prepaid water account',
      theme_color: '#ffffff',
      background_color: '#f6f8fb',
      display: 'standalone',
      // No orientation lock: a web app manifest can't lock phones only, and tablets should rotate.
      icons: [
        {
          src: 'icon-192.png',
          sizes: '192x192',
          type: 'image/png'
        },
        {
          src: 'icon-512.png',
          sizes: '512x512',
          type: 'image/png'
        }
      ]
    }
  }), sentryVitePlugin({
    disable: !uploadSourceMaps,
    org: 'gk-company-llc',
    project: 'variety-h2o',
    authToken: process.env.SENTRY_AUTH_TOKEN,
    release: {
      name: process.env.VITE_RELEASE || undefined,
      // Ties the release to its commit, so Sentry can name the commit that likely caused an
      // error. Sentry reads the commits from GitHub, so the build's shallow clone doesn't matter;
      // if the lookup fails, the plugin logs it and the deploy goes on.
      setCommits: process.env.COMMIT_REF ? { repo: 'rkansagra/VH2O', commit: process.env.COMMIT_REF } : undefined,
    },
    sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
    telemetry: false,
  })],
})
