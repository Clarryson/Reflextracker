import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api': {
        target: 'https://backend-production-7f0d0.up.railway.app',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});