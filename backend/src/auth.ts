import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { prisma } from './db';
import { User, UserRole } from './types';
import type { User as PrismaUser } from '@prisma/client';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-student-management-secret';

export type AuthenticatedRequest = express.Request & { user?: User };

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(4),
  role: z.enum(['teacher', 'student', 'parent', 'admin']),
});

function prismaUserToApiUser(dbUser: PrismaUser, studentIds?: string[]): User {
  const base = {
    id: dbUser.id,
    name: dbUser.name,
    email: dbUser.email,
    role: dbUser.role as UserRole,
  };
  switch (dbUser.role) {
    case 'teacher':
      return {
        ...base,
        role: 'teacher',
        subjectAreas: dbUser.subjectAreas,
        // Yeni alan: öğretmenin girebildiği sınıflar (opsiyonel)
        assignedGrades: (dbUser as any).teacherGrades ?? [],
      };
    case 'student':
      return {
        ...base,
        role: 'student',
        gradeLevel: dbUser.gradeLevel ?? '',
        classId: dbUser.classId ?? '',
        profilePictureUrl: (dbUser as any).profilePictureUrl ?? undefined,
      };
    case 'parent':
      return { ...base, role: 'parent', studentIds: studentIds ?? [] };
    case 'admin':
      return { ...base, role: 'admin' };
    default:
      return base as User;
  }
}

export const loginHandler: express.RequestHandler = async (req, res) => {
  try {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Geçersiz giriş verisi', details: parseResult.error.flatten() });
    }

    const { email, password, role } = parseResult.data;

    const dbUser = await prisma.user.findFirst({
      where: { email, role },
      include: {
        parentStudents: role === 'parent' ? { select: { studentId: true } } : false,
      },
    });

    if (!dbUser) {
      return res.status(401).json({ error: 'E-posta veya rol hatalı' });
    }

    const ok = await bcrypt.compare(password, dbUser.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: 'Şifre hatalı' });
    }

    const studentIds =
      dbUser.role === 'parent' && dbUser.parentStudents
        ? dbUser.parentStudents.map((ps) => ps.studentId)
        : undefined;

    const user = prismaUserToApiUser(dbUser, studentIds);

    const token = jwt.sign(
      {
        sub: user.id,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: '8h' },
    );

    const response: { token: string; user: User; demoInfo?: Record<string, string> } = {
      token,
      user,
    };

    if (process.env.NODE_ENV !== 'production') {
      response.demoInfo = {
        hint: 'Geliştirme modu - demo kullanıcılar için seed çalıştırın',
      };
    }

    return res.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[auth/login] Error:', err);
    return res.status(500).json({
      error: 'Sunucu hatası',
      ...(process.env.NODE_ENV !== 'production' && { debug: message }),
    });
  }
};

export function authenticate(requiredRole?: UserRole): express.RequestHandler {
  return authenticateMultiple(requiredRole ? [requiredRole] : undefined);
}

export function authenticateMultiple(requiredRoles?: UserRole[]): express.RequestHandler {
  return async (req: AuthenticatedRequest, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Yetkilendirme başlığı gerekli' });
    }

    const token = authHeader.slice('Bearer '.length);

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { sub: string; role: UserRole };
      const dbUser = await prisma.user.findUnique({
        where: { id: decoded.sub },
        include: {
          parentStudents: decoded.role === 'parent' ? { select: { studentId: true } } : false,
        },
      });

      if (!dbUser || dbUser.role !== decoded.role) {
        return res.status(401).json({ error: 'Kullanıcı bulunamadı' });
      }

      if (requiredRoles && requiredRoles.length > 0 && !requiredRoles.includes(dbUser.role)) {
        return res.status(403).json({ error: 'Bu kaynağa erişim izniniz yok' });
      }

      // Aktiflik takibi: her doğrulanmış istekte son görülme zamanını güncelle
      try {
        await prisma.user.update({
          where: { id: dbUser.id },
          data: { lastSeenAt: new Date() },
        });
      } catch {
        // ignore (aktiflik kritik değil)
      }

      const studentIds =
        dbUser.role === 'parent' && dbUser.parentStudents
          ? dbUser.parentStudents.map((ps) => ps.studentId)
          : undefined;
      req.user = prismaUserToApiUser(dbUser, studentIds);
      next();
    } catch {
      return res.status(401).json({ error: 'Geçersiz veya süresi dolmuş token' });
    }
  };
}
