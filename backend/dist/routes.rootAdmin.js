"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const auth_1 = require("./auth");
const db_1 = require("./db");
const router = express_1.default.Router();
const SYSTEM_ADMIN_EMAIL = 'admin@skytechyazilim.com.tr';
function requireSystemAdmin(req, res, next) {
    const user = req.user;
    if (!user || user.role !== 'admin' || user.email !== SYSTEM_ADMIN_EMAIL) {
        return res.status(403).json({ error: 'Bu kaynağa sadece sistem yöneticisi erişebilir' });
    }
    return next();
}
router.use((0, auth_1.authenticate)('admin'));
router.use(requireSystemAdmin);
router.get('/admins', async (_req, res) => {
    const admins = await db_1.prisma.user.findMany({
        where: { role: 'admin' },
        orderBy: { createdAt: 'asc' },
    });
    return res.json(admins.map((u) => {
        var _a;
        return ({
            id: u.id,
            name: u.name,
            email: u.email,
            createdAt: u.createdAt.toISOString(),
            lastSeenAt: u.lastSeenAt ? u.lastSeenAt.toISOString() : undefined,
            institutionName: (_a = u.institutionName) !== null && _a !== void 0 ? _a : undefined,
            isSystemAdmin: u.email === SYSTEM_ADMIN_EMAIL,
        });
    }));
});
router.post('/admins', async (req, res) => {
    var _a;
    const { name, email, password, institutionName } = req.body;
    if (!name || !email || !password || !institutionName) {
        return res.status(400).json({ error: 'İsim, e-posta, kurum adı ve şifre zorunludur' });
    }
    if (password.length < 4) {
        return res.status(400).json({ error: 'Şifre en az 4 karakter olmalıdır' });
    }
    const exists = await db_1.prisma.user.findFirst({
        where: { email, role: 'admin' },
        select: { id: true },
    });
    if (exists) {
        return res.status(400).json({ error: 'Bu e-posta ile kayıtlı bir yönetici zaten var' });
    }
    const passwordHash = await bcrypt_1.default.hash(password, 10);
    const created = await db_1.prisma.user.create({
        data: {
            name,
            email,
            role: 'admin',
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
        institutionName: (_a = created.institutionName) !== null && _a !== void 0 ? _a : undefined,
        isSystemAdmin: created.email === SYSTEM_ADMIN_EMAIL,
    });
});
router.put('/admins/:id', async (req, res) => {
    var _a;
    const id = String(req.params.id);
    const { name, email, password, institutionName } = req.body;
    const existing = await db_1.prisma.user.findFirst({
        where: { id, role: 'admin' },
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
        const emailTaken = await db_1.prisma.user.findFirst({
            where: {
                email,
                role: 'admin',
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
    const updateData = {};
    if (name)
        updateData.name = name;
    if (email)
        updateData.email = email;
    if (institutionName !== undefined)
        updateData.institutionName = institutionName || null;
    if (password && password.length >= 4) {
        updateData.passwordHash = await bcrypt_1.default.hash(password, 10);
    }
    const updated = await db_1.prisma.user.update({
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
        institutionName: (_a = updated.institutionName) !== null && _a !== void 0 ? _a : undefined,
        isSystemAdmin: updated.email === SYSTEM_ADMIN_EMAIL,
    });
});
router.delete('/admins/:id', async (req, res) => {
    const id = String(req.params.id);
    const existing = await db_1.prisma.user.findFirst({
        where: { id, role: 'admin' },
        select: { id: true, email: true, name: true },
    });
    if (!existing) {
        return res.status(404).json({ error: 'Yönetici bulunamadı' });
    }
    if (existing.email === SYSTEM_ADMIN_EMAIL) {
        return res.status(400).json({ error: 'Sistem yöneticisi bu panelden silinemez' });
    }
    await db_1.prisma.user.delete({ where: { id } });
    return res.json({
        id: existing.id,
        name: existing.name,
        email: existing.email,
        deleted: true,
    });
});
exports.default = router;
//# sourceMappingURL=routes.rootAdmin.js.map