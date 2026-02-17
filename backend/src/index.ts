import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';

import { loginHandler } from './auth';
import teacherRoutes from './routes.teacher';
import studentRoutes from './routes.student';
import parentRoutes from './routes.parent';
import adminRoutes from './routes.admin';
import questionBankRoutes from './routes.questionbank';
import aiRoutes from './aiRoutes';
import assignmentRoutes from './routes.assignmentRoutes';
import analysisRoutes from './routes.analysis';
import examRoutes from './routes.exam';

// Varsayılan davranış: çalışma dizinindeki .env dosyasını yükler (backend klasörü)
dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 4000;

// Production'da ALLOWED_ORIGINS ile izin verilen domain'ler (virgülle ayrılmış)
// Örnek: https://www.skytechyazilim.com.tr,https://skytechyazilim.com.tr
const allowedOriginsStr = process.env.ALLOWED_ORIGINS ?? '';
const allowedOrigins = allowedOriginsStr
  ? allowedOriginsStr.split(',').map((o) => o.trim()).filter(Boolean)
  : [];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        return callback(null, true);
      }
      // Localtunnel ve ngrok demo tünelleri (URL her seferinde değişse bile)
      if (origin.endsWith('.loca.lt') || origin.includes('ngrok-free.app') || origin.includes('ngrok-free.dev')) {
        return callback(null, true);
      }
      // Vercel deployment'ları
      if (origin.endsWith('.vercel.app')) {
        return callback(null, true);
      }
      if (allowedOrigins.length > 0 && allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      if (allowedOrigins.length === 0) {
        return callback(new Error('CORS: İzin verilmeyen origin'), false);
      }
      return callback(new Error('CORS: İzin verilmeyen origin'), false);
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: '25mb' }));

// Yüklenen dosyalar için uploads klasörü (örn. video)
const uploadsRoot = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsRoot)) {
  fs.mkdirSync(uploadsRoot, { recursive: true });
}
app.use('/uploads', express.static(uploadsRoot));

// Öğretmen/admin tarafından yüklenen sınav kitapçıkları (PDF) frontend/public/tests altında tutuluyor.
// Bunları backend üzerinden /tests yoluyla servis et.
const testsPublicDir = path.join(__dirname, '..', '..', 'frontend', 'public', 'tests');
if (fs.existsSync(testsPublicDir)) {
  app.use('/tests', express.static(testsPublicDir));
}

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

// Demo kullanıcı kontrolü (geliştirme - admin var mı?)
app.get('/auth/check-demo', async (_req, res) => {
  try {
    const { prisma } = await import('./db');
    const admin = await prisma.user.findFirst({
      where: { email: 'admin@example.com', role: 'admin' },
      select: { id: true, email: true, name: true, role: true },
    });
    return res.json({
      adminExists: !!admin,
      admin: admin ? { email: admin.email, name: admin.name } : null,
      hint: admin ? 'Şifre: sky123' : 'Seed çalıştırın: npx prisma db seed',
    });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

// Kimlik doğrulama
app.post('/auth/login', loginHandler);

// Rol bazlı router'lar
app.use('/admin', adminRoutes);
app.use('/teacher', teacherRoutes);
app.use('/student', studentRoutes);
app.use('/parent', parentRoutes);
app.use('/questionbank', questionBankRoutes);

// API prefix'leri – frontend bazı student endpoint'lerine /api/student ile erişiyor
app.use('/api/student', studentRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api', examRoutes);   // examRoutes önce - GET /api/exams examAssignments ile dönsün
app.use('/api', analysisRoutes);
app.use('/assignments', assignmentRoutes);

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

