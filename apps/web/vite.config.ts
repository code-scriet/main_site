import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  base: '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    sourcemap: false,
    // Per-chunk CSS — async-loaded routes get their own CSS file rather than
    // a single fat index-*.css. Helps perf/css-file-size on smaller routes.
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-ui': ['framer-motion', '@tanstack/react-query'],
          'markdown': ['react-markdown', 'remark-gfm'],
          // Heavy, route-specific deps — keep them out of the route chunks so
          // they're only fetched when the screens that need them mount.
          'vendor-charts': ['recharts'],
          // W1: QR *rendering* (qrcode.react, ~4 KB gz) is split from QR
          // *scanning* (html5-qrcode, ~148 KB gz). Every quiz player + ticket
          // viewer renders a QR but never scans one — they used to download
          // both decode engines. Now only AdminScanner + VerifyCertificatePage
          // pull the scan chunk, and only when they mount.
          'vendor-qr-render': ['qrcode.react'],
          'vendor-qr-scan': ['html5-qrcode'],
        },
      },
    },
    chunkSizeWarningLimit: 500,
    minify: 'esbuild',
    // To inspect bundle composition:
    //   npm i -D rollup-plugin-visualizer --workspace=apps/web
    //   ANALYZE=1 npm run build --workspace=apps/web
    // then gate plugin with `process.env.ANALYZE` in the plugins array above.
  },
  // Optimize dependencies
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', 'framer-motion'],
  },
  // Drop console in production
  esbuild: {
    drop: ['console', 'debugger'],
  },
})
