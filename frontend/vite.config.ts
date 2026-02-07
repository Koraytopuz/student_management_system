import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || '/', // Vercel: '/', Skyweb/demo: '/demo/'
  server: {
    port: 5173,
    allowedHosts: true, // localhost:5173 ile localhost:4000 arasında geçiş yapabilmek için
  },
});

