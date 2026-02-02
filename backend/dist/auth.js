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
const data_1 = require("./data");
const JWT_SECRET = 'dev-student-management-secret';
// Demo için basit şifreler
const PLAIN_PASSWORD = 'password123';
// Uygulama başlangıcında demo kullanıcıları için hash üretelim
let passwordHash = null;
async function ensurePasswordHash() {
    if (!passwordHash) {
        passwordHash = await bcrypt_1.default.hash(PLAIN_PASSWORD, 10);
    }
}
exports.loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(4),
    role: zod_1.z.enum(['teacher', 'student', 'parent', 'admin']),
});
const loginHandler = async (req, res) => {
    var _a, _b, _c;
    await ensurePasswordHash();
    const parseResult = exports.loginSchema.safeParse(req.body);
    if (!parseResult.success) {
        return res.status(400).json({ error: 'Geçersiz giriş verisi', details: parseResult.error.flatten() });
    }
    const { email, password, role } = parseResult.data;
    const user = (0, data_1.allUsers)().find((u) => u.email === email && u.role === role);
    if (!user) {
        return res.status(401).json({ error: 'E-posta veya rol hatalı' });
    }
    const ok = await bcrypt_1.default.compare(password, passwordHash);
    if (!ok) {
        return res.status(401).json({ error: 'Şifre hatalı' });
    }
    const token = jsonwebtoken_1.default.sign({
        sub: user.id,
        role: user.role,
    }, JWT_SECRET, { expiresIn: '8h' });
    return res.json({
        token,
        user,
        demoInfo: {
            password: PLAIN_PASSWORD,
            exampleAdminEmail: 'admin@example.com',
            exampleTeacherEmail: (_a = data_1.teachers[0]) === null || _a === void 0 ? void 0 : _a.email,
            exampleStudentEmail: (_b = data_1.students[0]) === null || _b === void 0 ? void 0 : _b.email,
            exampleParentEmail: (_c = data_1.parents[0]) === null || _c === void 0 ? void 0 : _c.email,
        },
    });
};
exports.loginHandler = loginHandler;
function authenticate(requiredRole) {
    return (req, res, next) => {
        const authHeader = req.headers.authorization;
        if (!(authHeader === null || authHeader === void 0 ? void 0 : authHeader.startsWith('Bearer '))) {
            return res.status(401).json({ error: 'Yetkilendirme başlığı gerekli' });
        }
        const token = authHeader.slice('Bearer '.length);
        try {
            const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
            const user = (0, data_1.allUsers)().find((u) => u.id === decoded.sub && u.role === decoded.role);
            if (!user) {
                return res.status(401).json({ error: 'Kullanıcı bulunamadı' });
            }
            if (requiredRole && user.role !== requiredRole) {
                return res.status(403).json({ error: 'Bu kaynağa erişim izniniz yok' });
            }
            req.user = user;
            next();
        }
        catch {
            return res.status(401).json({ error: 'Geçersiz veya süresi dolmuş token' });
        }
    };
}
//# sourceMappingURL=auth.js.map