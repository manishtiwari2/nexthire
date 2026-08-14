import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  build: {
    rollupOptions: {
      output: {
        // Monaco is by far the largest dependency and it changes only when the editor is
        // upgraded. Keeping it in its own chunk means (a) the problem statement is not stuck
        // behind a megabyte of editor code, and (b) the browser keeps the cached copy across
        // ordinary app deploys instead of re-downloading it every release.
        manualChunks(id) {
          if (id.includes('node_modules/monaco-editor')) return 'monaco';
        },
      },
    },
    // The monaco chunk is legitimately large; warning on it every build is just noise.
    chunkSizeWarningLimit: 1500,
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      },
      '/socket.io': {
        target: 'http://localhost:5000',
        ws: true
      }
    }
  }
});
