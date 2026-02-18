import express from 'express';
import bcrypt from 'bcrypt';
import { authenticate, type AuthenticatedRequest } from './auth';
import { prisma } from './db';
import type { UserRole } from '@prisma/client';

const router = express.Router();

const SYSTEM_ADMIN_EMAIL = 'admin@skytechyazilim.com.tr';

function requireSystemAdmin(req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) {
  const user = req.user;
  if (!user || user.role !== 'admin' || user.email !== SYSTEM_ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Bu kaynağa sadece sistem yöneticisi erişebilir' });
  }
  return next();
}

router.use(authenticate('admin'));
router.use(requireSystemAdmin);

router.get('/admins', async (_req: AuthenticatedRequest, res: express.Response) => {
  const admins = await prisma.user.findMany({
    where: { role: 'admin' as UserRole },
    orderBy: { createdAt: 'asc' },
  });
  return res.json(
    admins.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      createdAt: u.createdAt.toISOString(),
      lastSeenAt: u.lastSeenAt ? u.lastSeenAt.toISOString() : undefined,
      institutionName: (u as any).institutionName ?? undefined,
      isSystemAdmin: u.email === SYSTEM_ADMIN_EMAIL,
    })),
  );
});

router.post('/admins', async (req: AuthenticatedRequest, res: express.Response) => {
  const { name, email, password, institutionName } = req.body as {
    name?: string;
    email?: string;
    password?: string;
    institutionName?: string;
  };

  if (!name || !email || !password || !institutionName) {
    return res.status(400).json({ error: 'İsim, e-posta, kurum adı ve şifre zorunludur' });
  }

  if (password.length < 4) {
    return res.status(400).json({ error: 'Şifre en az 4 karakter olmalıdır' });
  }

  const exists = await prisma.user.findFirst({
    where: { email, role: 'admin' as UserRole },
    select: { id: true },
  });
  if (exists) {
    return res.status(400).json({ error: 'Bu e-posta ile kayıtlı bir yönetici zaten var' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const created = await prisma.user.create({
    data: {
      name,
      email,
      role: 'admin' as UserRole,
      passwordHash,
      institutionName,
    },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      lastSeenAt: true,
      institutionName: true,
    },
  });

  return res.status(201).json({
    id: created.id,
    name: created.name,
    email: created.email,
    createdAt: created.createdAt.toISOString(),
    lastSeenAt: created.lastSeenAt ? created.lastSeenAt.toISOString() : undefined,
    institutionName: created.institutionName ?? undefined,
    isSystemAdmin: created.email === SYSTEM_ADMIN_EMAIL,
  });
});

router.put('/admins/:id', async (req: AuthenticatedRequest, res: express.Response) => {
  const id = String(req.params.id);
  const { name, email, password, institutionName } = req.body as {
    name?: string;
    email?: string;
    password?: string;
    institutionName?: string;
  };

  const existing = await prisma.user.findFirst({
    where: { id, role: 'admin' as UserRole },
    select: { id: true, name: true, email: true, institutionName: true },
  });

  if (!existing) {
    return res.status(404).json({ error: 'Yönetici bulunamadı' });
  }

  if (existing.email === SYSTEM_ADMIN_EMAIL) {
    return res.status(400).json({ error: 'Sistem yöneticisi bu panelden düzenlenemez' });
  }

  if (!name && !email && !institutionName && (password === undefined || password === '')) {
    return res.status(400).json({ error: 'Güncellenecek en az bir alan (isim, e-posta, kurum adı veya şifre) gereklidir' });
  }

  if (email && email !== existing.email) {
    const emailTaken = await prisma.user.findFirst({
      where: {
        email,
        role: 'admin' as UserRole,
        NOT: { id },
      },
      select: { id: true },
    });
    if (emailTaken) {
      return res.status(400).json({ error: 'Bu e-posta ile kayıtlı başka bir yönetici var' });
    }
  }

  if (password !== undefined && password.length > 0 && password.length < 4) {
    return res.status(400).json({ error: 'Yeni şifre en az 4 karakter olmalıdır' });
  }

  const updateData: { name?: string; email?: string; passwordHash?: string; institutionName?: string | null } = {};
  if (name) updateData.name = name;
  if (email) updateData.email = email;
  if (institutionName !== undefined) updateData.institutionName = institutionName || null;
  if (password && password.length >= 4) {
    updateData.passwordHash = await bcrypt.hash(password, 10);
  }

  const updated = await prisma.user.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      lastSeenAt: true,
      institutionName: true,
    },
  });

  return res.json({
    id: updated.id,
    name: updated.name,
    email: updated.email,
    createdAt: updated.createdAt.toISOString(),
    lastSeenAt: updated.lastSeenAt ? updated.lastSeenAt.toISOString() : undefined,
    institutionName: updated.institutionName ?? undefined,
    isSystemAdmin: updated.email === SYSTEM_ADMIN_EMAIL,
  });
});

router.delete('/admins/:id', async (req: AuthenticatedRequest, res: express.Response) => {
  const id = String(req.params.id);

  const existing = await prisma.user.findFirst({
    where: { id, role: 'admin' as UserRole },
    select: { id: true, email: true, name: true },
  });

  if (!existing) {
    return res.status(404).json({ error: 'Yönetici bulunamadı' });
  }

  if (existing.email === SYSTEM_ADMIN_EMAIL) {
    return res.status(400).json({ error: 'Sistem yöneticisi bu panelden silinemez' });
  }

  await prisma.user.delete({ where: { id } });

  return res.json({
    id: existing.id,
    name: existing.name,
    email: existing.email,
    deleted: true,
  });
});

export default router;

