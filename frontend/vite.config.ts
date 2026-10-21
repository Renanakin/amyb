import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // strictPort: si el puerto esta ocupado, fallar en vez de tomar
    // silenciosamente el siguiente. Sin esto, Vite tomaba el 3001
    // (puerto del backend) cuando el 3000 ya lo ocupaba otro proyecto.
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
