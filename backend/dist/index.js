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
const auth_1 = require("./auth");
const routes_teacher_1 = __importDefault(require("./routes.teacher"));
const routes_student_1 = __importDefault(require("./routes.student"));
const routes_parent_1 = __importDefault(require("./routes.parent"));
const routes_admin_1 = __importDefault(require("./routes.admin"));
const routes_questionbank_1 = __importDefault(require("./routes.questionbank"));
const aiRoutes_1 = __importDefault(require("./aiRoutes"));
const routes_assignmentRoutes_1 = __importDefault(require("./routes.assignmentRoutes"));
const routes_analysis_1 = __importDefault(require("./routes.analysis"));
const routes_exam_1 = __importDefault(require("./routes.exam"));
// Varsayılan davranış: çalışma dizinindeki .env dosyasını yükler (backend klasörü)
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = Number(process.env.PORT) || 4000;
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
app.use('/teacher', routes_teacher_1.default);
app.use('/student', routes_student_1.default);
app.use('/parent', routes_parent_1.default);
app.use('/questionbank', routes_questionbank_1.default);
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