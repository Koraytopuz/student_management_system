import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
  plugins: [react()],
  base: '/demo/', // asset'ler /demo/ altından yüklenecek (www.skytechyazilim.com.tr/demo)
  server: {
    port: 5173,
    allowedHosts: true, // localhost:5173 ile localhost:4000 arasında geçiş yapabilmek için
  },
});

