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

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend API http://localhost:${PORT} üzerinde çalışıyor`);
});

