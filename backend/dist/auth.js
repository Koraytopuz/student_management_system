"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginHandler = exports.loginSchema = void 0;
exports.authenticate = authenticate;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const zod_1 = require("zod");
const db_1 = require("./db");
const JWT_SECRET = process.env.JWT_SECRET || 'dev-student-management-secret';
exports.loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(4),
    role: zod_1.z.enum(['teacher', 'student', 'parent', 'admin']),
});
function prismaUserToApiUser(dbUser, studentIds) {
    var _a, _b;
    const base = {
        id: dbUser.id,
        name: dbUser.name,
        email: dbUser.email,
        role: dbUser.role,
    };
    switch (dbUser.role) {
        case 'teacher':
            return { ...base, role: 'teacher', subjectAreas: dbUser.subjectAreas };
        case 'student':
            return {
                ...base,
                role: 'student',
                gradeLevel: (_a = dbUser.gradeLevel) !== null && _a !== void 0 ? _a : '',
                classId: (_b = dbUser.classId) !== null && _b !== void 0 ? _b : '',
            };
        case 'parent':
            return { ...base, role: 'parent', studentIds: studentIds !== null && studentIds !== void 0 ? studentIds : [] };
        case 'admin':
            return { ...base, role: 'admin' };
        default:
            return base;
    }
}
const loginHandler = async (req, res) => {
    const parseResult = exports.loginSchema.safeParse(req.body);
    if (!parseResult.success) {
        return res.status(400).json({ error: 'Geçersiz giriş verisi', details: parseResult.error.flatten() });
    }
    const { email, password, role } = parseResult.data;
    const dbUser = await db_1.prisma.user.findFirst({
        where: { email, role },
        include: {
            parentStudents: role === 'parent' ? { select: { studentId: true } } : false,
        },
    });
    if (!dbUser) {
        return res.status(401).json({ error: 'E-posta veya rol hatalı' });
    }
    const ok = await bcrypt_1.default.compare(password, dbUser.passwordHash);
    if (!ok) {
        return res.status(401).json({ error: 'Şifre hatalı' });
    }
    const studentIds = dbUser.role === 'parent' && dbUser.parentStudents
        ? dbUser.parentStudents.map((ps) => ps.studentId)
        : undefined;
    const user = prismaUserToApiUser(dbUser, studentIds);
    const token = jsonwebtoken_1.default.sign({
        sub: user.id,
        role: user.role,
    }, JWT_SECRET, { expiresIn: '8h' });
    const response = {
        token,
        user,
    };
    if (process.env.NODE_ENV !== 'production') {
        response.demoInfo = {
            hint: 'Geliştirme modu - demo kullanıcılar için seed çalıştırın',
        };
    }
    return res.json(response);
};
exports.loginHandler = loginHandler;
function authenticate(requiredRole) {
    return async (req, res, next) => {
        const authHeader = req.headers.authorization;
        if (!(authHeader === null || authHeader === void 0 ? void 0 : authHeader.startsWith('Bearer '))) {
            return res.status(401).json({ error: 'Yetkilendirme başlığı gerekli' });
        }
        const token = authHeader.slice('Bearer '.length);
        try {
            const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
            const dbUser = await db_1.prisma.user.findUnique({
                where: { id: decoded.sub },
                include: {
                    parentStudents: decoded.role === 'parent' ? { select: { studentId: true } } : false,
                },
            });
            if (!dbUser || dbUser.role !== decoded.role) {
                return res.status(401).json({ error: 'Kullanıcı bulunamadı' });
            }
            if (requiredRole && dbUser.role !== requiredRole) {
                return res.status(403).json({ error: 'Bu kaynağa erişim izniniz yok' });
            }
            const studentIds = dbUser.role === 'parent' && dbUser.parentStudents
                ? dbUser.parentStudents.map((ps) => ps.studentId)
                : undefined;
            req.user = prismaUserToApiUser(dbUser, studentIds);
            next();
        }
        catch {
            return res.status(401).json({ error: 'Geçersiz veya süresi dolmuş token' });
        }
    };
}
//# sourceMappingURL=auth.js.map