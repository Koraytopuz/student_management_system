"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const auth_1 = require("./auth");
const routes_teacher_1 = __importDefault(require("./routes.teacher"));
const routes_student_1 = __importDefault(require("./routes.student"));
const routes_parent_1 = __importDefault(require("./routes.parent"));
const routes_admin_1 = __importDefault(require("./routes.admin"));
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
app.use(express_1.default.json());
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
app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Backend API http://localhost:${PORT} üzerinde çalışıyor`);
});
//# sourceMappingURL=index.js.map