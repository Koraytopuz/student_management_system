"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
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
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = 4000;
app.use((0, cors_1.default)({
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
// Kimlik doğrulama
app.post('/auth/login', auth_1.loginHandler);
// Rol bazlı router'lar
app.use('/admin', routes_admin_1.default);
app.use('/teacher', routes_teacher_1.default);
app.use('/student', routes_student_1.default);
app.use('/parent', routes_parent_1.default);
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