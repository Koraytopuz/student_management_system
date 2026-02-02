import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { allUsers, teachers, students, parents } from './data';
import { User, UserRole } from './types';

const JWT_SECRET = 'dev-student-management-secret';

// Demo için basit şifreler
const PLAIN_PASSWORD = 'password123';

// Uygulama başlangıcında demo kullanıcıları için hash üretelim
let passwordHash: string | null = null;

async function ensurePasswordHash() {
  if (!passwordHash) {
    passwordHash = await bcrypt.hash(PLAIN_PASSWORD, 10);
  }
}

export interface AuthenticatedRequest extends express.Request {
  user?: User;
}

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(4),
  role: z.enum(['teacher', 'student', 'parent', 'admin']),
});

export const loginHandler: express.RequestHandler = async (req, res) => {
  await ensurePasswordHash();

  const parseResult = loginSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Geçersiz giriş verisi', details: parseResult.error.flatten() });
  }

  const { email, password, role } = parseResult.data;

  const user = allUsers().find((u) => u.email === email && u.role === role);
  if (!user) {
    return res.status(401).json({ error: 'E-posta veya rol hatalı' });
  }

  const ok = await bcrypt.compare(password, passwordHash!);
  if (!ok) {
    return res.status(401).json({ error: 'Şifre hatalı' });
  }

  const token = jwt.sign(
    {
      sub: user.id,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: '8h' },
  );

  return res.json({
    token,
    user,
    demoInfo: {
      password: PLAIN_PASSWORD,
      exampleAdminEmail: 'admin@example.com',
      exampleTeacherEmail: teachers[0]?.email,
      exampleStudentEmail: students[0]?.email,
      exampleParentEmail: parents[0]?.email,
    },
  });
};

export function authenticate(requiredRole?: UserRole): express.RequestHandler {
  return (req: AuthenticatedRequest, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Yetkilendirme başlığı gerekli' });
    }

    const token = authHeader.slice('Bearer '.length);

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { sub: string; role: UserRole };
      const user = allUsers().find((u) => u.id === decoded.sub && u.role === decoded.role);
      if (!user) {
        return res.status(401).json({ error: 'Kullanıcı bulunamadı' });
      }

      if (requiredRole && user.role !== requiredRole) {
        return res.status(403).json({ error: 'Bu kaynağa erişim izniniz yok' });
      }

      req.user = user;
      next();
    } catch {
      return res.status(401).json({ error: 'Geçersiz veya süresi dolmuş token' });
    }
  };
}

