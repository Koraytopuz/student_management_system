import express from 'express';
import cors from 'cors';

import { loginHandler } from './auth';
import teacherRoutes from './routes.teacher';
import studentRoutes from './routes.student';
import parentRoutes from './routes.parent';
import adminRoutes from './routes.admin';

const app = express();
const PORT = 4000;

app.use(
  cors({
    // Geliştirme için herhangi bir localhost portundan (5173, 5174, vs.) gelen istekleri kabul et
    origin: (origin, callback) => {
      if (!origin) {
        // curl gibi origin göndermeyen istekler
        return callback(null, true);
      }
      if (origin.startsWith('http://localhost:')) {
        return callback(null, true);
      }
      return callback(new Error('CORS: İzin verilmeyen origin'), false);
    },
    credentials: true,
  }),
);
app.use(express.json());

// Kök: tarayıcıda localhost:4000 açıldığında bilgilendirme sayfası
app.get('/', (_req, res) => {
  res.type('html').send(`
    <!DOCTYPE html>
    <html><head><meta charset="utf-8"><title>Öğrenci Yönetim API</title></head>
    <body style="font-family:sans-serif;max-width:520px;margin:2rem auto;padding:0 1rem;">
      <h1>Öğrenci Yönetim Sistemi – API</h1>
      <p>Backend API çalışıyor. Uygulama arayüzü için frontend’i kullanın.</p>
      <p><a href="http://localhost:5173">http://localhost:5173</a> adresinde frontend’i başlatın (Vite).</p>
      <p><a href="/health">/health</a> — sağlık kontrolü</p>
    </body>
    </html>
  `);
});

// Favicon 404'ünü önlemek için boş yanıt
app.get('/favicon.ico', (_req, res) => {
  res.status(204).end();
});

// Sağlık kontrolü
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Kimlik doğrulama
app.post('/auth/login', loginHandler);

// Rol bazlı router'lar
app.use('/admin', adminRoutes);
app.use('/teacher', teacherRoutes);
app.use('/student', studentRoutes);
app.use('/parent', parentRoutes);

// Chrome DevTools isteği (CSP hatasını önlemek için boş yanıt)
app.get('/.well-known/appspecific/com.chrome.devtools.json', (_req, res) => {
  res.status(204).end();
});

// Özel 404 handler: Express varsayılanı "default-src 'none'" CSP ekliyor ve tarayıcıda hata oluşturuyor
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found', path: _req.path });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend API http://localhost:${PORT} üzerinde çalışıyor`);
});

