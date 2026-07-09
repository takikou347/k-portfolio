import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // pnpm dev 時は wrangler dev (8787) へ WebSocket をプロキシする
      '/ws': { target: 'ws://127.0.0.1:8787', ws: true },
    },
  },
});
