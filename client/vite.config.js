import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// A interface é gerada em client/dist e servida pelo próprio servidor do Ghostflix.
// Em desenvolvimento ("npm run dev"), o Vite repassa a API para o servidor na porta 3000.
const api = `http://localhost:${process.env.PORT || 3000}`;

export default defineConfig({
  root: 'client',
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1000 }, // hls.js sozinho tem ~500 kB
  server: {
    port: 5173,
    proxy: { '/api': api, '/hls': api, '/covers': api }
  }
});
