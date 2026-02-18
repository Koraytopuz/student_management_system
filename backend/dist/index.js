"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const auth_1 = require("./auth");
const routes_teacher_1 = __importDefault(require("./routes.teacher"));
const routes_student_1 = __importDefault(require("./routes.student"));
const routes_parent_1 = __importDefault(require("./routes.parent"));
const routes_admin_1 = __importDefault(require("./routes.admin"));
const routes_rootAdmin_1 = __importDefault(require("./routes.rootAdmin"));
const routes_questionbank_1 = __importDefault(require("./routes.questionbank"));
const aiRoutes_1 = __importDefault(require("./aiRoutes"));
const routes_assignmentRoutes_1 = __importDefault(require("./routes.assignmentRoutes"));
const routes_analysis_1 = __importDefault(require("./routes.analysis"));
const routes_exam_1 = __importDefault(require("./routes.exam"));
const db_1 = require("./db");
// Varsayılan davranış: çalışma dizinindeki .env dosyasını yükler (backend klasörü)
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = Number(process.env.PORT) || 4000;
const SYSTEM_ADMIN_EMAIL = 'admin@skytechyazilim.com.tr';
const SYSTEM_ADMIN_DEFAULT_PASSWORD = 'skytech123';
async function ensureSystemAdminUser() {
    try {
        const existing = await db_1.prisma.user.findFirst({
            where: { email: SYSTEM_ADMIN_EMAIL, role: 'admin' },
            select: { id: true },
        });
        if (existing) {
            return;
        }
        const passwordHash = await bcrypt_1.default.hash(SYSTEM_ADMIN_DEFAULT_PASSWORD, 10);
        await db_1.prisma.user.create({
            data: {
                name: 'Sistem Yöneticisi',
                email: SYSTEM_ADMIN_EMAIL,
                role: 'admin',
                passwordHash,
                institutionName: 'SKYANALİZ',
            },
        });
        // eslint-disable-next-line no-console
        console.log(`[bootstrap] Sistem yöneticisi kullanıcısı oluşturuldu: ${SYSTEM_ADMIN_EMAIL} / ${SYSTEM_ADMIN_DEFAULT_PASSWORD}`);
    }
    catch (err) {
        // eslint-disable-next-line no-console
        console.error('[bootstrap] Sistem yöneticisi oluşturulamadı', err);
    }
}
async function backfillMissingInstitutionNames() {
    // Eski kayıtlar kurum adı olmadan kalmış olabilir; varsayılan tenant'a taşı
    try {
        const updated = await db_1.prisma.user.updateMany({
            where: { institutionName: null },
            data: { institutionName: 'SKYANALİZ' },
        });
        if (updated.count > 0) {
            // eslint-disable-next-line no-console
            console.log(`[bootstrap] institutionName backfill: ${updated.count} kullanıcı güncellendi`);
        }
        const examsUpdated = await db_1.prisma.exam.updateMany({
            where: { institutionName: null },
            data: { institutionName: 'SKYANALİZ' },
        });
        if (examsUpdated.count > 0) {
            // eslint-disable-next-line no-console
            console.log(`[bootstrap] exam.institutionName backfill: ${examsUpdated.count} sınav güncellendi`);
        }
    }
    catch (err) {
        // eslint-disable-next-line no-console
        console.error('[bootstrap] institutionName backfill başarısız', err);
    }
}
// Arka planda sistem yöneticisi kullanıcısının varlığını garanti et
void ensureSystemAdminUser();
void backfillMissingInstitutionNames();
// Production'da ALLOWED_ORIGINS ile izin verilen domain'ler (virgülle ayrılmış)
// Örnek: https://www.skytechyazilim.com.tr,https://skytechyazilim.com.tr
const allowedOriginsStr = (_a = process.env.ALLOWED_ORIGINS) !== null && _a !== void 0 ? _a : '';
const allowedOrigins = allowedOriginsStr
    ? allowedOriginsStr.split(',').map((o) => o.trim()).filter(Boolean)
    : [];
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin)
            return callback(null, true);
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
}));
app.use(express_1.default.json({ limit: '25mb' }));
// Yüklenen dosyalar için uploads klasörü (örn. video)
const uploadsRoot = path_1.default.join(__dirname, '..', 'uploads');
if (!fs_1.default.existsSync(uploadsRoot)) {
    fs_1.default.mkdirSync(uploadsRoot, { recursive: true });
}
app.use('/uploads', express_1.default.static(uploadsRoot));
// Öğretmen/admin tarafından yüklenen sınav kitapçıkları (PDF) frontend/public/tests altında tutuluyor.
// Bunları backend üzerinden /tests yoluyla servis et.
const testsPublicDir = path_1.default.join(__dirname, '..', '..', 'frontend', 'public', 'tests');
if (fs_1.default.existsSync(testsPublicDir)) {
    app.use('/tests', express_1.default.static(testsPublicDir));
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
        const { prisma } = await Promise.resolve().then(() => __importStar(require('./db')));
        const admin = await prisma.user.findFirst({
            where: { email: 'admin@example.com', role: 'admin' },
            select: { id: true, email: true, name: true, role: true },
        });
        return res.json({
            adminExists: !!admin,
            admin: admin ? { email: admin.email, name: admin.name } : null,
            hint: admin ? 'Şifre: sky123' : 'Seed çalıştırın: npx prisma db seed',
        });
    }
    catch (e) {
        return res.status(500).json({ error: String(e) });
    }
});
// Kimlik doğrulama
app.post('/auth/login', auth_1.loginHandler);
// Rol bazlı router'lar
app.use('/admin', routes_admin_1.default);
app.use('/root-admin', routes_rootAdmin_1.default);
app.use('/teacher', routes_teacher_1.default);
app.use('/student', routes_student_1.default);
app.use('/parent', routes_parent_1.default);
app.use('/questionbank', routes_questionbank_1.default);
// API prefix'leri – frontend bazı student endpoint'lerine /api/student ile erişiyor
app.use('/api/student', routes_student_1.default);
app.use('/api/ai', aiRoutes_1.default);
app.use('/api', routes_exam_1.default); // examRoutes önce - GET /api/exams examAssignments ile dönsün
app.use('/api', routes_analysis_1.default);
app.use('/assignments', routes_assignmentRoutes_1.default);
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
//# sourceMappingURL=index.js.map