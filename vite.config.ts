import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Reine Client-Anwendung: `npm run build` erzeugt einen statischen Ordner `dist/`,
// der von jedem einfachen Webserver (auch einem Raspberry Pi) ausgeliefert werden kann.
export default defineConfig({
  // Basis-Pfad: „/“ für Browser und Desktop-App, „/iron-vault/“ für die Web-Demo auf
  // GitHub Pages (wird im Pages-Workflow über IRON_VAULT_BASE gesetzt).
  base: process.env.IRON_VAULT_BASE ?? '/',
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 4173 },
  build: {
    target: 'es2022',
    // three.js ist groß; in einen eigenen, gut cachebaren Chunk auslagern.
    rollupOptions: {
      output: {
        manualChunks: (id) => (id.includes('node_modules/three/') ? 'three' : undefined),
      },
    },
    chunkSizeWarningLimit: 800,
  },
});
