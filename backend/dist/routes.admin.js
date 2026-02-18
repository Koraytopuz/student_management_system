"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const auth_1 = require("./auth");
const db_1 = require("./db");
const client_1 = require("@prisma/client");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// Multer Setup
const uploadDir = 'uploads/profiles';
if (!fs_1.default.existsSync(uploadDir)) {
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, 'profile-' + uniqueSuffix + path_1.default.extname(file.originalname));
    },
});
const upload = (0, multer_1.default)({ storage });
const router = express_1.default.Router();
function getInstitutionName(req) {
    var _a;
    const raw = (_a = req.user) === null || _a === void 0 ? void 0 : _a.institutionName;
    const trimmed = raw ? String(raw).trim() : '';
    // Geriye dönük uyumluluk: eski veriler kurum adı olmadan kalmış olabilir
    return trimmed || 'SKYANALİZ';
}
// Sistem genelinde kullanılacak sabit sınıf seviyeleri
// Öğrenci ve soru bankası tarafındaki gradeLevel alanlarıyla uyumlu tutulmalıdır.
const ALLOWED_GRADES = ['4', '5', '6', '7', '8', '9', '10', '11', '12', 'Mezun'];
function toTeacher(u) {
    var _a, _b;
    return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: 'teacher',
        subjectAreas: (_a = u.subjectAreas) !== null && _a !== void 0 ? _a : [],
        assignedGrades: (_b = u.teacherGrades) !== null && _b !== void 0 ? _b : [],
    };
}
/**
 * Veli telefon numarasını normalize eder.
 * - Tüm rakam dışı karakterleri temizler
 * - 90 / 0 gibi önekleri kırpar
 * - Veritabanında 5XXXXXXXXX (10 hane) formatında saklar
 */
function normalizeParentPhone(raw) {
    if (raw == null)
        return null;
    const str = String(raw).trim();
    if (!str)
        return null;
    // Tüm rakam dışı karakterleri temizle
    let digits = str.replace(/\D+/g, '');
    // Çok uzunsa son 10 haneyi bırak (9053..., 0090..., vb.)
    if (digits.length > 10) {
        digits = digits.slice(-10);
    }
    // 0XXXXXXXXXX formatı geldiyse baştaki 0'ı at
    if (digits.length === 11 && digits.startsWith('0')) {
        digits = digits.slice(1);
    }
    // 90XXXXXXXXXX gibi ülke kodu dahil geldiyse son 10 haneyi bırakmış olduk
    if (digits.length !== 10 || !digits.startsWith('5')) {
        throw new Error('INVALID_PARENT_PHONE');
    }
    return digits;
}
function toStudent(u) {
    var _a, _b, _c, _d;
    return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: 'student',
        gradeLevel: (_a = u.gradeLevel) !== null && _a !== void 0 ? _a : '',
        classId: (_b = u.classId) !== null && _b !== void 0 ? _b : '',
        parentPhone: (_c = u.parentPhone) !== null && _c !== void 0 ? _c : undefined,
        profilePictureUrl: (_d = u.profilePictureUrl) !== null && _d !== void 0 ? _d : undefined,
    };
}
function toParent(u, studentIds) {
    return { id: u.id, name: u.name, email: u.email, role: 'parent', studentIds };
}
// Yönetici dashboard için özet
router.get('/summary', (0, auth_1.authenticate)('admin'), async (req, res) => {
    const institutionName = getInstitutionName(req);
    try {
        const [teacherCount, studentCount, parentCount, assignmentCount] = await Promise.all([
            db_1.prisma.user.count({ where: { role: 'teacher', institutionName } }),
            db_1.prisma.user.count({ where: { role: 'student', institutionName } }),
            db_1.prisma.user.count({ where: { role: 'parent', institutionName } }),
            db_1.prisma.assignment.count({
                where: {
                    OR: [
                        { createdByTeacher: { institutionName } },
                        { students: { some: { student: { institutionName } } } },
                    ],
                },
            }),
        ]);
        return res.json({
            teacherCount,
            studentCount,
            parentCount,
            assignmentCount,
        });
    }
    catch (error) {
        console.error('[admin/summary] Error:', error);
        return res.status(500).json({
            error: 'Yönetici özet verileri yüklenemedi',
            ...(process.env.NODE_ENV !== 'production' && {
                details: error instanceof Error ? error.message : String(error),
            }),
        });
    }
});
router.get('/teachers', (0, auth_1.authenticate)('admin'), async (req, res) => {
    const institutionName = getInstitutionName(req);
    try {
        const list = await db_1.prisma.user.findMany({
            where: { role: 'teacher', institutionName },
            select: { id: true, name: true, email: true, subjectAreas: true, teacherGrades: true },
        });
        return res.json(list.map(toTeacher));
    }
    catch (error) {
        console.error('[admin/teachers] Error:', error);
        // Öğretmen listesi boş olsa bile hata döndürmeyelim, boş liste döndürelim
        return res.json([]);
    }
});
router.get('/students', (0, auth_1.authenticate)('admin'), async (req, res) => {
    const institutionName = getInstitutionName(req);
    try {
        const list = await db_1.prisma.user.findMany({
            where: { role: 'student', institutionName },
            select: {
                id: true,
                name: true,
                email: true,
                gradeLevel: true,
                classId: true,
                parentPhone: true,
                profilePictureUrl: true,
            },
        });
        return res.json(list.map((u) => toStudent(u)));
    }
    catch (error) {
        console.error('[admin/students] Error:', error);
        // Öğrenci listesi boş olsa bile hata döndürmeyelim, boş liste döndürelim
        return res.json([]);
    }
});
router.get('/parents', (0, auth_1.authenticate)('admin'), async (req, res) => {
    const institutionName = getInstitutionName(req);
    try {
        const list = await db_1.prisma.user.findMany({
            where: { role: 'parent', institutionName },
            include: { parentStudents: { select: { studentId: true } } },
        });
        return res.json(list.map((u) => toParent(u, u.parentStudents.map((ps) => ps.studentId))));
    }
    catch (error) {
        console.error('[admin/parents] Error:', error);
        // Veli listesi boş olsa bile hata döndürmeyelim, boş liste döndürelim
        return res.json([]);
    }
});
/**
 * GET /admin/exam-result-students
 * ExamResult tablosunda en az bir sınav sonucu olan öğrencileri listeler.
 * Amaç: Kişiye özel rapor ve analiz ekranları için "hangi öğrencinin gerçekten
 * sınav sonucu var?" sorusuna hızlı cevap vermek.
 *
 * Dönüş örneği:
 * [
 *   {
 *     studentId: "ck123...",
 *     name: "Ali 11. Sınıf 1",
 *     email: "ali@example.com",
 *     gradeLevel: "11",
 *     classId: "cg123...",
 *     examCount: 3
 *   },
 *   ...
 * ]
 */
router.get('/exam-result-students', (0, auth_1.authenticate)('admin'), async (_req, res) => {
    // 1) ExamResult üzerinden hangi öğrencilerin sonucu olduğunu grup­la
    const grouped = await db_1.prisma.examResult.groupBy({
        by: ['studentId'],
        _count: { _all: true },
    });
    if (grouped.length === 0) {
        return res.json([]);
    }
    const studentIds = grouped.map((g) => g.studentId);
    // 2) Bu öğrencilerin temel bilgilerini çek
    const students = await db_1.prisma.user.findMany({
        where: { id: { in: studentIds }, role: 'student' },
        select: {
            id: true,
            name: true,
            email: true,
            gradeLevel: true,
            classId: true,
        },
    });
    // 3) groupBy sonucuyla birleştir
    const examCountByStudent = {};
    for (const row of grouped) {
        examCountByStudent[row.studentId] = row._count._all;
    }
    const result = students.map((s) => {
        var _a, _b, _c;
        return ({
            studentId: s.id,
            name: s.name,
            email: s.email,
            gradeLevel: (_a = s.gradeLevel) !== null && _a !== void 0 ? _a : '',
            classId: (_b = s.classId) !== null && _b !== void 0 ? _b : '',
            examCount: (_c = examCountByStudent[s.id]) !== null && _c !== void 0 ? _c : 0,
        });
    });
    res.json(result);
});
/**
 * POST /admin/debug/create-sample-exam-ali-12-say
 *
 * Geliştirme amaçlı yardımcı endpoint:
 * - Önce 12. Sınıf Sayısal sınıfındaki "Ali" isimli öğrenciyi bulmaya çalışır.
 * - Bulamazsa gradeLevel=12 ve isminde "Ali" geçen ilk öğrenciyi seçer.
 * - Hiçbiri yoksa herhangi bir 12. sınıf öğrencisini seçer.
 * - Bu öğrenci için basit bir TYT denemesi ve ExamResult kaydı oluşturur.
 *
 * Böylece Kişiye Özel Rapor ekranında sınav listesini test etmek için
 * hazır bir örnek veri oluşur.
 */
router.post('/debug/create-sample-exam-ali-12-say', (0, auth_1.authenticate)('admin'), async (_req, res) => {
    var _a;
    try {
        // 1) Hedef öğrenciyi bul
        // Önce 12. sınıf sayısal sınıflardan birinde "Ali" isimli öğrenciyi bulmaya çalış
        let student = await db_1.prisma.user.findFirst({
            where: {
                role: 'student',
                gradeLevel: '12',
                name: { contains: 'Ali', mode: 'insensitive' },
            },
        });
        if (!student) {
            student = await db_1.prisma.user.findFirst({
                where: {
                    role: 'student',
                    gradeLevel: '12',
                    name: { contains: 'Ali', mode: 'insensitive' },
                },
            });
        }
        if (!student) {
            student = await db_1.prisma.user.findFirst({
                where: {
                    role: 'student',
                    gradeLevel: '12',
                },
            });
        }
        if (!student) {
            return res.status(404).json({
                success: false,
                error: '12. sınıf seviyesinde öğrenci bulunamadı. Önce en az bir 12. sınıf öğrencisi oluşturun.',
            });
        }
        // 2) Örnek için kullanılacak bir TYT (veya herhangi bir) sınav bul
        // Not: Bazı ortamlarda `exam` tablosunun ID sequence'i bozulmuş olabildiği için
        // burada YENİ sınav oluşturmak yerine mevcut bir sınavı kullanıyoruz.
        let exam = await db_1.prisma.exam.findFirst({
            where: { type: client_1.ExamType.TYT },
            orderBy: { date: 'desc' },
        });
        if (!exam) {
            // TYT yoksa, tarihine göre herhangi bir sınavı kullan
            exam = await db_1.prisma.exam.findFirst({
                orderBy: { date: 'desc' },
            });
        }
        if (!exam) {
            return res.status(400).json({
                success: false,
                error: 'Örnek sınav sonucu oluşturmak için önce "Sınav Yönetimi" ekranından en az bir sınav oluşturmalısınız.',
            });
        }
        // 3) "Detaylı Sınav Analizi" PDF'ine benzeyen örnek veriler oluştur
        // Dersler: Türkçe, Matematik, Fen Bilimleri, Sosyal Bilgiler, Din, İngilizce
        // Konular: her dersten 1-2 örnek konu
        // Önce ihtiyaç duyulan ders ve konu kayıtlarını Subject / Topic tablolarında garanti altına alalım
        const subjectDefs = [
            { id: 'sub_tyt_turkce', name: 'Türkçe' },
            { id: 'sub_tyt_matematik', name: 'Matematik' },
            { id: 'sub_tyt_fen', name: 'Fen Bilimleri' },
            { id: 'sub_tyt_sosyal', name: 'Sosyal Bilgiler' },
            { id: 'sub_tyt_din', name: 'Din Kültürü' },
            { id: 'sub_tyt_ing', name: 'İngilizce' },
        ];
        const subjectMap = {};
        for (const def of subjectDefs) {
            const s = await db_1.prisma.subject.upsert({
                where: { id: def.id },
                create: { id: def.id, name: def.name },
                update: { name: def.name },
            });
            subjectMap[def.id] = { id: s.id, name: s.name };
        }
        const topicDefs = [
            { id: 'top_tyt_tr_paragraf', name: 'Paragraf', subjectId: 'sub_tyt_turkce' },
            { id: 'top_tyt_tr_dilbilgisi', name: 'Dil Bilgisi', subjectId: 'sub_tyt_turkce' },
            { id: 'top_tyt_mat_uslu', name: 'Üslü Sayılar', subjectId: 'sub_tyt_matematik' },
            { id: 'top_tyt_mat_denklik', name: 'Denklemler', subjectId: 'sub_tyt_matematik' },
            { id: 'top_tyt_fen_fizik', name: 'Kuvvet ve Hareket', subjectId: 'sub_tyt_fen' },
            { id: 'top_tyt_sosyal_tarih', name: 'İnkılap Tarihi', subjectId: 'sub_tyt_sosyal' },
            { id: 'top_tyt_din_inanc', name: 'İnanç', subjectId: 'sub_tyt_din' },
            { id: 'top_tyt_ing_paragraf', name: 'Okuduğunu Anlama', subjectId: 'sub_tyt_ing' },
        ];
        const topicMap = {};
        for (const def of topicDefs) {
            const t = await db_1.prisma.topic.upsert({
                where: { id: def.id },
                create: { id: def.id, name: def.name },
                update: { name: def.name },
            });
            topicMap[def.id] = { id: t.id, name: t.name, subjectId: def.subjectId };
        }
        // Örnek netler – referans PDF'e yakın ama tamamen sembolik.
        // Burada özellikle bazı konuları düşük / orta başarı oranında bırakıyoruz ki
        // PDF'teki 1. ve 2. öncelik tabloları da dolu gelsin.
        const lessonStats = [
            {
                subjectKey: 'sub_tyt_turkce',
                correct: 22,
                wrong: 11,
                empty: 7,
                topics: [
                    // Orta başarı (2. öncelik)
                    { topicKey: 'top_tyt_tr_paragraf', total: 20, correct: 8, wrong: 8, empty: 4 },
                    // Yüksek başarı (3. öncelik)
                    { topicKey: 'top_tyt_tr_dilbilgisi', total: 20, correct: 14, wrong: 3, empty: 3 },
                ],
            },
            {
                subjectKey: 'sub_tyt_matematik',
                correct: 17,
                wrong: 9,
                empty: 4,
                topics: [
                    // Düşük başarı (1. öncelik)
                    { topicKey: 'top_tyt_mat_uslu', total: 15, correct: 4, wrong: 8, empty: 3 },
                    // Yüksek başarı (3. öncelik)
                    { topicKey: 'top_tyt_mat_denklik', total: 15, correct: 13, wrong: 1, empty: 1 },
                ],
            },
            {
                subjectKey: 'sub_tyt_fen',
                correct: 15,
                wrong: 5,
                empty: 5,
                topics: [{ topicKey: 'top_tyt_fen_fizik', total: 15, correct: 10, wrong: 3, empty: 2 }],
            },
            {
                subjectKey: 'sub_tyt_sosyal',
                correct: 18,
                wrong: 4,
                empty: 3,
                topics: [{ topicKey: 'top_tyt_sosyal_tarih', total: 15, correct: 11, wrong: 2, empty: 2 }],
            },
            {
                subjectKey: 'sub_tyt_din',
                correct: 8,
                wrong: 1,
                empty: 1,
                topics: [{ topicKey: 'top_tyt_din_inanc', total: 10, correct: 8, wrong: 1, empty: 1 }],
            },
            {
                subjectKey: 'sub_tyt_ing',
                correct: 11,
                wrong: 3,
                empty: 1,
                topics: [{ topicKey: 'top_tyt_ing_paragraf', total: 10, correct: 7, wrong: 2, empty: 1 }],
            },
        ];
        // Genel net ve skor – örnek
        const totalNet = (_a = lessonStats.reduce((sum, l) => sum + (l.correct - l.wrong * 0.25), 0)) !== null && _a !== void 0 ? _a : 65;
        const score = 430;
        const percentile = 82;
        // ExamResult kaydı oluştur / güncelle
        const examResult = await db_1.prisma.examResult.upsert({
            where: {
                studentId_examId: {
                    studentId: student.id,
                    examId: exam.id,
                },
            },
            create: {
                studentId: student.id,
                examId: exam.id,
                totalNet,
                score,
                percentile,
            },
            update: {
                totalNet,
                score,
                percentile,
            },
        });
        // Mevcut detayları temizleyip örnek ders/konu detaylarını ekleyelim
        await db_1.prisma.examResultDetail.deleteMany({ where: { examResultId: examResult.id } });
        for (const lesson of lessonStats) {
            const subj = subjectMap[lesson.subjectKey];
            if (!subj)
                continue;
            const detail = await db_1.prisma.examResultDetail.create({
                data: {
                    examResultId: examResult.id,
                    lessonId: subj.id,
                    lessonName: subj.name,
                    correct: lesson.correct,
                    wrong: lesson.wrong,
                    empty: lesson.empty,
                    net: lesson.correct - lesson.wrong * 0.25,
                },
            });
            for (const t of lesson.topics) {
                const topic = topicMap[t.topicKey];
                if (!topic)
                    continue;
                await db_1.prisma.topicAnalysis.create({
                    data: {
                        examResultDetailId: detail.id,
                        topicId: topic.id,
                        topicName: topic.name,
                        totalQuestion: t.total,
                        correct: t.correct,
                        wrong: t.wrong,
                        empty: t.empty,
                        net: t.correct - t.wrong * 0.25,
                        priorityLevel: t.correct / (t.total || 1) < 0.3
                            ? client_1.PriorityLevel.ONE
                            : t.correct / (t.total || 1) < 0.6
                                ? client_1.PriorityLevel.TWO
                                : client_1.PriorityLevel.THREE,
                        lostPoints: t.wrong + t.empty,
                    },
                });
            }
        }
        return res.json({
            success: true,
            message: 'Örnek TYT sınavı ve sınav sonucu oluşturuldu / güncellendi.',
            student: {
                id: student.id,
                name: student.name,
                email: student.email,
                gradeLevel: student.gradeLevel,
                classId: student.classId,
            },
            exam,
            examResult,
        });
    }
    catch (error) {
        // eslint-disable-next-line no-console
        console.error('[admin][debug/create-sample-exam-ali-12-say] Error:', error);
        const message = error instanceof Error ? error.message : String(error);
        return res.status(500).json({
            success: false,
            // Geliştirme ortamında hata ayrıntısını doğrudan gösterelim ki
            // frontend'deki hata mesajından sorunu görebilelim.
            error: process.env.NODE_ENV !== 'production'
                ? `[debug] Örnek sınav oluşturulamadı: ${message}`
                : 'Örnek sınav verisi oluşturulurken bir hata oluştu.',
        });
    }
});
/**
 * GET /admin/class-groups
 * Yönetici paneli için tüm sınıf gruplarını listeler.
 *
 * Not:
 * - `ExamManagement` ekranındaki "Sınıf Seç" çoklu seçim listesi bu endpoint'i kullanır.
 * - Yalnızca ilgili kurumun (institutionName) sınıfları döndürülür.
 */
router.get('/class-groups', (0, auth_1.authenticate)('admin'), async (req, res) => {
    const institutionName = getInstitutionName(req);
    const groups = await db_1.prisma.classGroup.findMany({
        where: institutionName
            ? {
                teacher: {
                    institutionName,
                },
            }
            : undefined,
        orderBy: [{ gradeLevel: 'asc' }, { name: 'asc' }],
        select: {
            id: true,
            name: true,
            gradeLevel: true,
            stream: true,
            section: true,
        },
    });
    res.json(groups.map((g) => ({
        id: g.id,
        name: g.name,
        gradeLevel: g.gradeLevel,
        stream: g.stream,
        section: g.section,
    })));
});
// ========== DEVAMSIZLIK / YOKLAMA (ADMIN) ==========
/**
 * GET /admin/attendance/classes?days=7
 * Yönetici için sınıf bazlı yoklama özetleri (kurum bazlı)
 */
router.get('/attendance/classes', (0, auth_1.authenticate)('admin'), async (req, res) => {
    var _a, _b;
    const institutionName = getInstitutionName(req);
    const daysRaw = String((_a = req.query.days) !== null && _a !== void 0 ? _a : '7');
    const days = Number.isFinite(Number(daysRaw)) ? Math.max(1, Math.min(90, Number(daysRaw))) : 7;
    const since = new Date();
    since.setDate(since.getDate() - (days - 1));
    since.setHours(0, 0, 0, 0);
    try {
        const classGroups = await db_1.prisma.classGroup.findMany({
            where: institutionName
                ? {
                    teacher: {
                        institutionName,
                    },
                }
                : undefined,
            orderBy: [{ gradeLevel: 'asc' }, { name: 'asc' }],
            include: {
                teacher: { select: { id: true, name: true } },
                students: { select: { studentId: true } },
            },
        });
        const classGroupIds = classGroups.map((cg) => cg.id);
        const grouped = classGroupIds.length === 0
            ? []
            : await db_1.prisma.classAttendance.groupBy({
                by: ['classGroupId', 'present'],
                where: {
                    date: { gte: since },
                    classGroupId: { in: classGroupIds },
                },
                _count: { _all: true },
            });
        const countsByClass = new Map();
        for (const row of grouped) {
            const prev = (_b = countsByClass.get(row.classGroupId)) !== null && _b !== void 0 ? _b : { presentCount: 0, absentCount: 0, totalRecords: 0 };
            const c = row._count._all;
            if (row.present)
                prev.presentCount += c;
            else
                prev.absentCount += c;
            prev.totalRecords += c;
            countsByClass.set(row.classGroupId, prev);
        }
        return res.json(classGroups.map((cg) => {
            var _a, _b, _c;
            const counts = (_a = countsByClass.get(cg.id)) !== null && _a !== void 0 ? _a : { presentCount: 0, absentCount: 0, totalRecords: 0 };
            return {
                id: cg.id,
                name: cg.name,
                gradeLevel: cg.gradeLevel,
                teacherId: cg.teacherId,
                teacherName: (_c = (_b = cg.teacher) === null || _b === void 0 ? void 0 : _b.name) !== null && _c !== void 0 ? _c : 'Öğretmen',
                studentCount: cg.students.length,
                days,
                ...counts,
            };
        }));
    }
    catch (error) {
        console.error('[admin/attendance/classes]', error);
        return res.status(500).json({ error: 'Sınıf devamsızlık özetleri yüklenemedi.' });
    }
});
/**
 * GET /admin/attendance/classes/:classId/students?days=7
 * Yönetici için seçili sınıftaki öğrencilerin yoklama özeti (kurum bazlı)
 */
router.get('/attendance/classes/:classId/students', (0, auth_1.authenticate)('admin'), async (req, res) => {
    var _a, _b, _c, _d, _e;
    const institutionName = getInstitutionName(req);
    const classId = String(req.params.classId);
    const daysRaw = String((_a = req.query.days) !== null && _a !== void 0 ? _a : '7');
    const days = Number.isFinite(Number(daysRaw)) ? Math.max(1, Math.min(90, Number(daysRaw))) : 7;
    const since = new Date();
    since.setDate(since.getDate() - (days - 1));
    since.setHours(0, 0, 0, 0);
    try {
        const classGroup = await db_1.prisma.classGroup.findUnique({
            where: { id: classId },
            include: {
                teacher: { select: { id: true, name: true, institutionName: true } },
                students: {
                    include: {
                        student: { select: { id: true, name: true, gradeLevel: true, profilePictureUrl: true } },
                    },
                },
            },
        });
        if (!classGroup ||
            (institutionName && ((_b = classGroup.teacher) === null || _b === void 0 ? void 0 : _b.institutionName) !== institutionName)) {
            return res.status(404).json({ error: 'Sınıf bulunamadı.' });
        }
        const studentIds = classGroup.students.map((s) => s.studentId);
        const [grouped, recent] = await Promise.all([
            db_1.prisma.classAttendance.groupBy({
                by: ['studentId', 'present'],
                where: { classGroupId: classId, date: { gte: since }, studentId: { in: studentIds } },
                _count: { _all: true },
            }),
            db_1.prisma.classAttendance.findMany({
                where: { classGroupId: classId, studentId: { in: studentIds } },
                orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
                take: 2000, // sınıf küçük; son kayıtları çıkarmak için yeterli
                select: { studentId: true, date: true, present: true },
            }),
        ]);
        const countsByStudent = new Map();
        for (const row of grouped) {
            const prev = (_c = countsByStudent.get(row.studentId)) !== null && _c !== void 0 ? _c : { presentCount: 0, absentCount: 0, total: 0 };
            const c = row._count._all;
            if (row.present)
                prev.presentCount += c;
            else
                prev.absentCount += c;
            prev.total += c;
            countsByStudent.set(row.studentId, prev);
        }
        const lastByStudent = new Map();
        for (const r of recent) {
            if (!lastByStudent.has(r.studentId)) {
                lastByStudent.set(r.studentId, { date: r.date.toISOString(), present: r.present });
            }
        }
        const students = classGroup.students
            .map((s) => {
            var _a, _b;
            const counts = (_a = countsByStudent.get(s.studentId)) !== null && _a !== void 0 ? _a : { presentCount: 0, absentCount: 0, total: 0 };
            const last = (_b = lastByStudent.get(s.studentId)) !== null && _b !== void 0 ? _b : null;
            return {
                studentId: s.student.id,
                studentName: s.student.name,
                gradeLevel: s.student.gradeLevel,
                profilePictureUrl: s.student.profilePictureUrl,
                days,
                ...counts,
                lastRecord: last,
            };
        })
            .sort((a, b) => b.absentCount - a.absentCount || a.studentName.localeCompare(b.studentName, 'tr'));
        return res.json({
            classGroup: {
                id: classGroup.id,
                name: classGroup.name,
                gradeLevel: classGroup.gradeLevel,
                teacherId: classGroup.teacherId,
                teacherName: (_e = (_d = classGroup.teacher) === null || _d === void 0 ? void 0 : _d.name) !== null && _e !== void 0 ? _e : 'Öğretmen',
            },
            students,
        });
    }
    catch (error) {
        console.error('[admin/attendance/classes/:classId/students]', error);
        return res.status(500).json({ error: 'Sınıf öğrenci devamsızlık özeti yüklenemedi.' });
    }
});
/**
 * GET /admin/attendance/students/:studentId/history?days=30
 * Yönetici için öğrencinin yoklama geçmişi ve istatistikleri (kurum bazlı)
 */
router.get('/attendance/students/:studentId/history', (0, auth_1.authenticate)('admin'), async (req, res) => {
    var _a;
    const institutionName = getInstitutionName(req);
    const studentId = String(req.params.studentId);
    const daysRaw = String((_a = req.query.days) !== null && _a !== void 0 ? _a : '30');
    const days = Number.isFinite(Number(daysRaw)) ? Math.max(1, Math.min(180, Number(daysRaw))) : 30;
    const since = new Date();
    since.setDate(since.getDate() - (days - 1));
    since.setHours(0, 0, 0, 0);
    try {
        const student = await db_1.prisma.user.findFirst({
            where: { id: studentId, role: 'student', institutionName },
            select: { id: true, name: true, gradeLevel: true, classId: true },
        });
        if (!student) {
            return res.status(404).json({ error: 'Öğrenci bulunamadı.' });
        }
        const records = await db_1.prisma.classAttendance.findMany({
            where: { studentId, date: { gte: since } },
            include: {
                classGroup: { select: { id: true, name: true, gradeLevel: true } },
                teacher: { select: { id: true, name: true } },
            },
            orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
            take: 500,
        });
        const absentCount = records.filter((r) => !r.present).length;
        const presentCount = records.filter((r) => r.present).length;
        const total = records.length;
        const absenceRate = total > 0 ? Math.round((absentCount / total) * 100) : 0;
        const summaryText = total === 0
            ? `Son ${days} gün içinde yoklama kaydı bulunamadı.`
            : `Son ${days} gün içinde ${absentCount} kez derse katılmadı. (Devamsızlık oranı %${absenceRate})`;
        return res.json({
            student: {
                id: student.id,
                name: student.name,
                gradeLevel: student.gradeLevel,
                classId: student.classId,
            },
            stats: { days, absentCount, presentCount, total, absenceRate, summaryText },
            records: records.map((r) => {
                var _a, _b;
                return ({
                    id: r.id,
                    date: r.date.toISOString(),
                    present: r.present,
                    notes: r.notes,
                    createdAt: r.createdAt.toISOString(),
                    classGroupId: r.classGroupId,
                    classGroupName: r.classGroup.name,
                    teacherId: r.teacherId,
                    teacherName: (_b = (_a = r.teacher) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : 'Öğretmen',
                });
            }),
        });
    }
    catch (error) {
        console.error('[admin/attendance/students/:studentId/history]', error);
        return res.status(500).json({ error: 'Öğrenci devamsızlık geçmişi yüklenemedi.' });
    }
});
router.post('/teachers', (0, auth_1.authenticate)('admin'), async (req, res) => {
    const institutionName = getInstitutionName(req);
    const { name, email, subjectAreas, assignedGrades, password } = req.body;
    if (!name || !email) {
        return res.status(400).json({ error: 'İsim ve e-posta zorunludur' });
    }
    if (!password || password.length < 4) {
        return res.status(400).json({ error: 'Şifre en az 4 karakter olmalıdır' });
    }
    const exists = await db_1.prisma.user.findFirst({ where: { email, role: 'teacher' } });
    if (exists) {
        return res.status(400).json({ error: 'Bu e-posta ile kayıtlı öğretmen var' });
    }
    const areasArray = typeof subjectAreas === 'string'
        ? subjectAreas.split(',').map((s) => s.trim()).filter(Boolean)
        : subjectAreas !== null && subjectAreas !== void 0 ? subjectAreas : [];
    const gradesArray = typeof assignedGrades === 'string'
        ? assignedGrades
            .split(',')
            .map((s) => s.trim())
            .filter((g) => g && ALLOWED_GRADES.includes(g))
        : (assignedGrades !== null && assignedGrades !== void 0 ? assignedGrades : []).filter((g) => typeof g === 'string' && ALLOWED_GRADES.includes(g));
    const passwordHash = await bcrypt_1.default.hash(password, 10);
    const created = await db_1.prisma.user.create({
        data: {
            name,
            email,
            role: 'teacher',
            passwordHash,
            subjectAreas: areasArray,
            teacherGrades: gradesArray,
            institutionName,
        },
        select: { id: true, name: true, email: true, subjectAreas: true, teacherGrades: true },
    });
    return res.status(201).json(toTeacher(created));
});
router.put('/teachers/:id', (0, auth_1.authenticate)('admin'), async (req, res) => {
    const institutionName = getInstitutionName(req);
    const id = String(req.params.id);
    const existing = await db_1.prisma.user.findFirst({
        where: { id, role: 'teacher', institutionName },
        select: {
            id: true,
            email: true,
        },
    });
    if (!existing) {
        return res.status(404).json({ error: 'Öğretmen bulunamadı' });
    }
    const { name, email, subjectAreas, assignedGrades, password } = req.body;
    if (!name || !email) {
        return res.status(400).json({ error: 'İsim ve e-posta zorunludur' });
    }
    if (password && password.length > 0 && password.length < 4) {
        return res.status(400).json({ error: 'Şifre en az 4 karakter olmalıdır' });
    }
    // E-posta değişmişse aynı rol için çakışma kontrolü yap
    if (email !== existing.email) {
        const emailConflict = await db_1.prisma.user.findFirst({
            where: {
                email,
                role: 'teacher',
                NOT: { id },
            },
            select: { id: true },
        });
        if (emailConflict) {
            return res.status(400).json({ error: 'Bu e-posta ile kayıtlı başka bir öğretmen var' });
        }
    }
    const areasArray = typeof subjectAreas === 'string'
        ? subjectAreas
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : subjectAreas !== null && subjectAreas !== void 0 ? subjectAreas : [];
    const gradesArray = typeof assignedGrades === 'string'
        ? assignedGrades
            .split(',')
            .map((s) => s.trim())
            .filter((g) => g && ALLOWED_GRADES.includes(g))
        : (assignedGrades !== null && assignedGrades !== void 0 ? assignedGrades : []).filter((g) => typeof g === 'string' && ALLOWED_GRADES.includes(g));
    const updateData = {
        name,
        email,
        subjectAreas: areasArray,
        teacherGrades: gradesArray,
    };
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
            subjectAreas: true,
            teacherGrades: true,
        },
    });
    return res.json(toTeacher(updated));
});
router.delete('/teachers/:id', (0, auth_1.authenticate)('admin'), async (req, res) => {
    const institutionName = getInstitutionName(req);
    const id = String(req.params.id);
    const existing = await db_1.prisma.user.findFirst({ where: { id, role: 'teacher', institutionName } });
    if (!existing) {
        return res.status(404).json({ error: 'Öğretmen bulunamadı' });
    }
    await db_1.prisma.user.delete({ where: { id } });
    return res.json(toTeacher(existing));
});
router.post('/students', (0, auth_1.authenticate)('admin'), async (req, res) => {
    const institutionName = getInstitutionName(req);
    const { name, email, gradeLevel, classId, parentPhone: parentPhoneRaw, password, profilePictureUrl } = req.body;
    if (!name || !email) {
        return res.status(400).json({ error: 'İsim ve e-posta zorunludur' });
    }
    if (!password || password.length < 4) {
        return res.status(400).json({ error: 'Şifre en az 4 karakter olmalıdır' });
    }
    if (gradeLevel && !ALLOWED_GRADES.includes(gradeLevel)) {
        return res.status(400).json({ error: 'Geçersiz sınıf seviyesi' });
    }
    let parentPhone = null;
    try {
        parentPhone = normalizeParentPhone(parentPhoneRaw);
    }
    catch (err) {
        if (err instanceof Error && err.message === 'INVALID_PARENT_PHONE') {
            return res
                .status(400)
                .json({ error: 'Geçersiz veli telefon numarası. Lütfen 555 123 45 67 formatında girin.' });
        }
        throw err;
    }
    const exists = await db_1.prisma.user.findFirst({ where: { email, role: 'student' } });
    if (exists) {
        return res.status(400).json({ error: 'Bu e-posta ile kayıtlı öğrenci var' });
    }
    const passwordHash = await bcrypt_1.default.hash(password, 10);
    const created = await db_1.prisma.user.create({
        data: {
            name,
            email,
            role: 'student',
            passwordHash,
            gradeLevel: gradeLevel !== null && gradeLevel !== void 0 ? gradeLevel : '',
            classId: classId !== null && classId !== void 0 ? classId : '',
            parentPhone,
            profilePictureUrl,
            institutionName,
        },
        select: {
            id: true,
            name: true,
            email: true,
            gradeLevel: true,
            classId: true,
            parentPhone: true,
            profilePictureUrl: true,
        },
    });
    // Sınıf atandıysa ClassGroupStudent'a da ekle (sınav bildirimleri için)
    if (classId && created.id) {
        const classGroupId = String(classId);
        await db_1.prisma.classGroupStudent.upsert({
            where: { classGroupId_studentId: { classGroupId, studentId: created.id } },
            create: { classGroupId, studentId: created.id },
            update: {},
        });
    }
    return res.status(201).json(toStudent(created));
});
router.put('/students/:id', (0, auth_1.authenticate)('admin'), async (req, res) => {
    const institutionName = getInstitutionName(req);
    const id = String(req.params.id);
    const { name, email, gradeLevel, classId, parentPhone: parentPhoneRaw, password, profilePictureUrl } = req.body;
    const existing = await db_1.prisma.user.findFirst({ where: { id, role: 'student', institutionName } });
    if (!existing) {
        return res.status(404).json({ error: 'Öğrenci bulunamadı' });
    }
    if (name === undefined &&
        email === undefined &&
        gradeLevel === undefined &&
        classId === undefined &&
        classId === undefined &&
        parentPhoneRaw === undefined &&
        password === undefined &&
        profilePictureUrl === undefined) {
        return res
            .status(400)
            .json({ error: 'Güncellenecek en az bir alan gönderilmelidir' });
    }
    const data = {};
    if (name !== undefined)
        data.name = String(name).trim();
    if (email !== undefined)
        data.email = String(email).trim();
    if (gradeLevel !== undefined) {
        if (gradeLevel && !ALLOWED_GRADES.includes(gradeLevel)) {
            return res.status(400).json({ error: 'Geçersiz sınıf seviyesi' });
        }
        data.gradeLevel = gradeLevel !== null && gradeLevel !== void 0 ? gradeLevel : '';
    }
    if (classId !== undefined)
        data.classId = classId !== null && classId !== void 0 ? classId : '';
    if (parentPhoneRaw !== undefined) {
        try {
            const normalized = normalizeParentPhone(parentPhoneRaw);
            data.parentPhone = normalized;
        }
        catch (err) {
            if (err instanceof Error && err.message === 'INVALID_PARENT_PHONE') {
                return res
                    .status(400)
                    .json({ error: 'Geçersiz veli telefon numarası. Lütfen 555 123 45 67 formatında girin.' });
            }
            throw err;
        }
    }
    if (password !== undefined) {
        if (!password || password.length < 4) {
            return res.status(400).json({ error: 'Yeni şifre en az 4 karakter olmalıdır' });
        }
        data.passwordHash = await bcrypt_1.default.hash(password, 10);
    }
    if (profilePictureUrl !== undefined) {
        data.profilePictureUrl = profilePictureUrl;
    }
    const updated = await db_1.prisma.user.update({
        where: { id },
        data: data,
        select: {
            id: true,
            name: true,
            email: true,
            gradeLevel: true,
            classId: true,
            parentPhone: true,
            profilePictureUrl: true,
        },
    });
    // classId değiştiyse ClassGroupStudent'ı senkronize et (sınav bildirimleri için)
    if (classId !== undefined) {
        await db_1.prisma.classGroupStudent.deleteMany({ where: { studentId: id } });
        if (updated.classId) {
            const classGroupId = String(updated.classId);
            await db_1.prisma.classGroupStudent.upsert({
                where: { classGroupId_studentId: { classGroupId, studentId: id } },
                create: { classGroupId, studentId: id },
                update: {},
            });
        }
    }
    return res.json(toStudent(updated));
});
router.delete('/students/:id', (0, auth_1.authenticate)('admin'), async (req, res) => {
    const institutionName = getInstitutionName(req);
    const id = String(req.params.id);
    const existing = await db_1.prisma.user.findFirst({ where: { id, role: 'student', institutionName } });
    if (!existing) {
        return res.status(404).json({ error: 'Öğrenci bulunamadı' });
    }
    await db_1.prisma.parentStudent.deleteMany({ where: { studentId: id } });
    await db_1.prisma.user.delete({ where: { id } });
    return res.json(toStudent(existing));
});
router.post('/parents', (0, auth_1.authenticate)('admin'), async (req, res) => {
    const institutionName = getInstitutionName(req);
    const { name, email, password } = req.body;
    if (!name || !email) {
        return res.status(400).json({ error: 'İsim ve e-posta zorunludur' });
    }
    if (!password || password.length < 4) {
        return res.status(400).json({ error: 'Şifre en az 4 karakter olmalıdır' });
    }
    const exists = await db_1.prisma.user.findFirst({ where: { email, role: 'parent' } });
    if (exists) {
        return res.status(400).json({ error: 'Bu e-posta ile kayıtlı veli var' });
    }
    const passwordHash = await bcrypt_1.default.hash(password, 10);
    const created = await db_1.prisma.user.create({
        data: {
            name,
            email,
            role: 'parent',
            passwordHash,
            institutionName,
        },
        select: { id: true, name: true, email: true },
    });
    return res.status(201).json(toParent(created, []));
});
router.put('/parents/:id', (0, auth_1.authenticate)('admin'), async (req, res) => {
    const institutionName = getInstitutionName(req);
    const id = String(req.params.id);
    const { name, email, password } = req.body;
    if (!name && !email && (password === undefined || password === '')) {
        return res.status(400).json({ error: 'Güncellenecek en az bir alan (isim, e-posta veya şifre) gereklidir' });
    }
    const existing = await db_1.prisma.user.findFirst({
        where: { id, role: 'parent', institutionName },
        include: { parentStudents: { select: { studentId: true } } },
    });
    if (!existing) {
        return res.status(404).json({ error: 'Veli bulunamadı' });
    }
    if (email && email !== existing.email) {
        const emailTaken = await db_1.prisma.user.findFirst({
            where: { email, role: 'parent', NOT: { id } },
        });
        if (emailTaken) {
            return res.status(400).json({ error: 'Bu e-posta ile kayıtlı başka bir veli var' });
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
    if (password && password.length >= 4) {
        updateData.passwordHash = await bcrypt_1.default.hash(password, 10);
    }
    const updated = await db_1.prisma.user.update({
        where: { id },
        data: updateData,
        select: { id: true, name: true, email: true },
    });
    return res.json(toParent(updated, existing.parentStudents.map((ps) => ps.studentId)));
});
router.delete('/parents/:id', (0, auth_1.authenticate)('admin'), async (req, res) => {
    const institutionName = getInstitutionName(req);
    const id = String(req.params.id);
    const existing = await db_1.prisma.user.findFirst({
        where: { id, role: 'parent', institutionName },
        include: { parentStudents: { select: { studentId: true } } },
    });
    if (!existing) {
        return res.status(404).json({ error: 'Veli bulunamadı' });
    }
    await db_1.prisma.user.delete({ where: { id } });
    return res.json(toParent(existing, existing.parentStudents.map((ps) => ps.studentId)));
});
router.post('/parents/:id/assign-student', (0, auth_1.authenticate)('admin'), async (req, res) => {
    const institutionName = getInstitutionName(req);
    const parentId = String(req.params.id);
    const { studentId } = req.body;
    if (!studentId) {
        return res.status(400).json({ error: 'studentId zorunludur' });
    }
    const parent = await db_1.prisma.user.findFirst({
        where: { id: parentId, role: 'parent', institutionName },
        include: { parentStudents: { select: { studentId: true } } },
    });
    if (!parent) {
        return res.status(404).json({ error: 'Veli bulunamadı' });
    }
    const studentExists = await db_1.prisma.user.findFirst({
        where: { id: studentId, role: 'student', institutionName },
    });
    if (!studentExists) {
        return res.status(404).json({ error: 'Öğrenci bulunamadı' });
    }
    await db_1.prisma.parentStudent.upsert({
        where: {
            parentId_studentId: { parentId, studentId },
        },
        create: { parentId, studentId },
        update: {},
    });
    const updated = await db_1.prisma.user.findFirst({
        where: { id: parentId, institutionName },
        include: { parentStudents: { select: { studentId: true } } },
    });
    return res.json(toParent(updated, updated.parentStudents.map((ps) => ps.studentId)));
});
router.post('/parents/:id/unassign-student', (0, auth_1.authenticate)('admin'), async (req, res) => {
    const institutionName = getInstitutionName(req);
    const parentId = String(req.params.id);
    const { studentId } = req.body;
    if (!studentId) {
        return res.status(400).json({ error: 'studentId zorunludur' });
    }
    const parent = await db_1.prisma.user.findFirst({
        where: { id: parentId, role: 'parent', institutionName },
        include: { parentStudents: { select: { studentId: true } } },
    });
    if (!parent) {
        return res.status(404).json({ error: 'Veli bulunamadı' });
    }
    await db_1.prisma.parentStudent.deleteMany({
        where: { parentId, studentId },
    });
    const updated = await db_1.prisma.user.findFirst({
        where: { id: parentId, institutionName },
        include: { parentStudents: { select: { studentId: true } } },
    });
    return res.json(toParent(updated, updated.parentStudents.map((ps) => ps.studentId)));
});
// Şikayet / öneriler (öğrenci + veli) – kurum bazlı
router.get('/complaints', (0, auth_1.authenticate)('admin'), async (req, res) => {
    try {
        const institutionName = getInstitutionName(req);
        const status = req.query.status ? String(req.query.status) : undefined;
        const where = {};
        if (status) {
            where.status = status;
        }
        if (institutionName) {
            // Şikayeti gönderen kullanıcının kurumuna göre filtrele
            where.fromUser = { institutionName };
        }
        const list = await db_1.prisma.complaint.findMany({
            where,
            include: {
                fromUser: { select: { id: true, name: true, email: true, role: true, institutionName: true } },
                aboutTeacher: { select: { id: true, name: true, email: true, role: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 100,
        });
        return res.json(list.map((c) => {
            var _a, _b, _c;
            return ({
                id: c.id,
                fromRole: c.fromRole,
                fromUser: c.fromUser,
                aboutTeacher: (_a = c.aboutTeacher) !== null && _a !== void 0 ? _a : undefined,
                subject: c.subject,
                body: c.body,
                status: c.status,
                createdAt: c.createdAt.toISOString(),
                reviewedAt: (_b = c.reviewedAt) === null || _b === void 0 ? void 0 : _b.toISOString(),
                closedAt: (_c = c.closedAt) === null || _c === void 0 ? void 0 : _c.toISOString(),
            });
        }));
    }
    catch (error) {
        console.error('[admin/complaints] Error:', error);
        // Şikayet listesi boş olsa bile hata döndürmeyelim, boş liste döndürelim
        return res.json([]);
    }
});
// Bildirimler (şikayet/öneri vb.)
router.get('/notifications', (0, auth_1.authenticate)('admin'), async (req, res) => {
    const userId = req.user.id;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
    const list = await db_1.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit > 0 ? limit : 50,
    });
    return res.json(list.map((n) => {
        var _a, _b, _c;
        return ({
            id: n.id,
            userId: n.userId,
            type: n.type,
            title: n.title,
            body: n.body,
            read: n.read,
            relatedEntityType: (_a = n.relatedEntityType) !== null && _a !== void 0 ? _a : undefined,
            relatedEntityId: (_b = n.relatedEntityId) !== null && _b !== void 0 ? _b : undefined,
            readAt: (_c = n.readAt) === null || _c === void 0 ? void 0 : _c.toISOString(),
            createdAt: n.createdAt.toISOString(),
        });
    }));
});
router.put('/notifications/:id/read', (0, auth_1.authenticate)('admin'), async (req, res) => {
    var _a;
    const userId = req.user.id;
    const id = String(req.params.id);
    const n = await db_1.prisma.notification.findFirst({ where: { id, userId } });
    if (!n)
        return res.status(404).json({ error: 'Bildirim bulunamadı' });
    const updated = await db_1.prisma.notification.update({
        where: { id },
        data: { read: true, readAt: new Date() },
    });
    return res.json({
        id: updated.id,
        read: updated.read,
        readAt: (_a = updated.readAt) === null || _a === void 0 ? void 0 : _a.toISOString(),
    });
});
// Şikayet durum güncelleme – kurum bazlı güvenlik
router.put('/complaints/:id', (0, auth_1.authenticate)('admin'), async (req, res) => {
    var _a, _b, _c, _d, _e;
    const institutionName = getInstitutionName(req);
    const id = String(req.params.id);
    const { status } = req.body;
    if (!status) {
        return res.status(400).json({ error: 'status zorunludur (open|reviewed|closed)' });
    }
    const existing = await db_1.prisma.complaint.findFirst({
        where: institutionName
            ? { id, fromUser: { institutionName } }
            : { id },
    });
    if (!existing) {
        return res.status(404).json({ error: 'Kayıt bulunamadı' });
    }
    const now = new Date();
    const updated = await db_1.prisma.complaint.update({
        where: { id },
        data: {
            status: status,
            reviewedAt: status === 'reviewed' ? ((_a = existing.reviewedAt) !== null && _a !== void 0 ? _a : now) : existing.reviewedAt,
            closedAt: status === 'closed' ? ((_b = existing.closedAt) !== null && _b !== void 0 ? _b : now) : existing.closedAt,
        },
        include: {
            fromUser: { select: { id: true, name: true, email: true, role: true } },
            aboutTeacher: { select: { id: true, name: true, email: true, role: true } },
        },
    });
    return res.json({
        id: updated.id,
        fromRole: updated.fromRole,
        fromUser: updated.fromUser,
        aboutTeacher: (_c = updated.aboutTeacher) !== null && _c !== void 0 ? _c : undefined,
        subject: updated.subject,
        body: updated.body,
        status: updated.status,
        createdAt: updated.createdAt.toISOString(),
        reviewedAt: (_d = updated.reviewedAt) === null || _d === void 0 ? void 0 : _d.toISOString(),
        closedAt: (_e = updated.closedAt) === null || _e === void 0 ? void 0 : _e.toISOString(),
    });
});
// Şikayet silme – kurum bazlı güvenlik (AdminDashboard "Sil" butonu için)
router.delete('/complaints/:id', (0, auth_1.authenticate)('admin'), async (req, res) => {
    const institutionName = getInstitutionName(req);
    const id = String(req.params.id);
    const existing = await db_1.prisma.complaint.findFirst({
        where: institutionName
            ? { id, fromUser: { institutionName } }
            : { id },
    });
    if (!existing) {
        return res.status(404).json({ error: 'Kayıt bulunamadı' });
    }
    await db_1.prisma.complaint.delete({ where: { id } });
    return res.status(204).send();
});
// Koçluk seansları - admin görünümü (sadece okuma)
router.get('/coaching', (0, auth_1.authenticate)('admin'), async (req, res) => {
    const { studentId, teacherId } = req.query;
    const where = {};
    if (studentId)
        where.studentId = String(studentId);
    if (teacherId)
        where.teacherId = String(teacherId);
    const sessions = await db_1.prisma.coachingSession.findMany({
        where,
        orderBy: { date: 'desc' },
    });
    return res.json(sessions.map((s) => {
        var _a;
        return ({
            id: s.id,
            studentId: s.studentId,
            teacherId: s.teacherId,
            date: s.date.toISOString(),
            durationMinutes: (_a = s.durationMinutes) !== null && _a !== void 0 ? _a : undefined,
            title: s.title,
            notes: s.notes,
            mode: s.mode,
            createdAt: s.createdAt.toISOString(),
            updatedAt: s.updatedAt.toISOString(),
        });
    }));
});
router.post('/upload/student-image', (0, auth_1.authenticate)('admin'), upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Dosya yüklenemedi' });
    }
    // relative path döndür
    // src/uploads/profiles/... -> frontend'den erişim için /uploads/profiles/...
    // backend static serve ayarı lazım, varsayılan olarak /uploads serve ediliyorsa:
    const url = `/uploads/profiles/${req.file.filename}`;
    return res.json({ url });
});
// ==================== OMR (Optical Mark Recognition) Routes ====================
const opticalService_1 = require("./services/opticalService");
// Multer setup for OMR form uploads
const omrUploadDir = 'uploads/omr-scans';
if (!fs_1.default.existsSync(omrUploadDir)) {
    fs_1.default.mkdirSync(omrUploadDir, { recursive: true });
}
const omrStorage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, omrUploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, 'omr-scan-' + uniqueSuffix + path_1.default.extname(file.originalname));
    },
});
const omrUpload = (0, multer_1.default)({
    storage: omrStorage,
    fileFilter: (req, file, cb) => {
        // Accept only image files
        const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/tiff'];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            cb(new Error('Sadece resim dosyaları (JPG, PNG, TIFF) yüklenebilir'));
        }
    },
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});
/**
 * POST /admin/omr/upload
 * Upload a scanned OMR form for processing
 */
router.post('/omr/upload', (0, auth_1.authenticate)('admin'), omrUpload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Dosya yüklenemedi' });
        }
        const { examId, formType = 'YKS_STANDARD' } = req.body;
        if (!examId) {
            return res.status(400).json({ error: 'Sınav ID gereklidir' });
        }
        // Create processing job
        const jobId = (0, opticalService_1.createProcessingJob)(parseInt(examId), req.file.path);
        // Start async processing
        (0, opticalService_1.processOMRAsync)(jobId, req.file.path, formType, parseInt(examId))
            .catch(err => console.error('OMR processing error:', err));
        return res.json({
            success: true,
            jobId,
            message: 'Form yüklendi, işleniyor...'
        });
    }
    catch (error) {
        console.error('OMR upload error:', error);
        return res.status(500).json({
            error: 'Form yüklenirken hata oluştu',
            details: error.message
        });
    }
});
/**
 * GET /admin/omr/status/:jobId
 * Check processing status of an OMR job
 */
router.get('/omr/status/:jobId', (0, auth_1.authenticate)('admin'), async (req, res) => {
    try {
        const jobId = String(req.params.jobId);
        const job = (0, opticalService_1.getProcessingJobStatus)(jobId);
        if (!job) {
            return res.status(404).json({ error: 'İşlem bulunamadı' });
        }
        return res.json(job);
    }
    catch (error) {
        console.error('OMR status error:', error);
        return res.status(500).json({ error: 'Durum sorgulanırken hata oluştu' });
    }
});
/**
 * POST /admin/omr/validate
 * Manually validate and correct OMR results
 */
router.post('/omr/validate', (0, auth_1.authenticate)('admin'), async (req, res) => {
    try {
        const { jobId, studentNumber, answers, examId } = req.body;
        if (!jobId || !studentNumber || !answers || !examId) {
            return res.status(400).json({
                error: 'jobId, studentNumber, answers ve examId gereklidir'
            });
        }
        // Validate student
        const validation = await (0, opticalService_1.validateStudentNumber)(studentNumber);
        if (!validation.valid) {
            return res.status(400).json({
                error: 'Öğrenci bulunamadı',
                studentNumber
            });
        }
        // Create exam result
        const omrData = {
            success: true,
            student_number_detected: studentNumber,
            answers,
            confidence_score: 1.0 // Manual validation = 100% confidence
        };
        const examResult = await (0, opticalService_1.createExamResultFromOMR)(omrData, parseInt(examId), validation.studentId);
        // Update job status
        (0, opticalService_1.updateProcessingJob)(jobId, {
            status: 'COMPLETED',
            studentNumber,
            confidence: 1.0
        });
        return res.json({
            success: true,
            examResult,
            student: {
                id: validation.studentId,
                name: validation.studentName
            }
        });
    }
    catch (error) {
        console.error('OMR validation error:', error);
        return res.status(500).json({
            error: 'Doğrulama sırasında hata oluştu',
            details: error.message
        });
    }
});
/**
 * GET /admin/omr/templates
 * List available form templates
 */
router.get('/omr/templates', (0, auth_1.authenticate)('admin'), async (req, res) => {
    try {
        const configPath = path_1.default.join(__dirname, '../python-scripts/omr_config.json');
        const configData = await fs_1.default.promises.readFile(configPath, 'utf-8');
        const config = JSON.parse(configData);
        const templates = Object.entries(config.templates).map(([key, value]) => ({
            id: key,
            name: value.name,
            description: value.description
        }));
        return res.json(templates);
    }
    catch (error) {
        console.error('OMR templates error:', error);
        return res.status(500).json({ error: 'Şablonlar yüklenirken hata oluştu' });
    }
});
/**
 * POST /admin/omr/process-batch
 * Process multiple scanned forms in batch
 */
router.post('/omr/process-batch', (0, auth_1.authenticate)('admin'), omrUpload.array('files', 50), // Max 50 files
async (req, res) => {
    try {
        const files = req.files;
        if (!files || files.length === 0) {
            return res.status(400).json({ error: 'Dosya yüklenemedi' });
        }
        const { examId, formType = 'YKS_STANDARD' } = req.body;
        if (!examId) {
            return res.status(400).json({ error: 'Sınav ID gereklidir' });
        }
        const formTypeStr = String(formType);
        const jobs = files.map(file => {
            const jobId = (0, opticalService_1.createProcessingJob)(parseInt(examId), file.path);
            // Start async processing
            (0, opticalService_1.processOMRAsync)(jobId, file.path, formTypeStr, parseInt(examId))
                .catch(err => console.error('Batch OMR processing error:', err));
            return {
                jobId,
                filename: file.originalname
            };
        });
        return res.json({
            success: true,
            message: `${files.length} form yüklendi, işleniyor...`,
            jobs
        });
    }
    catch (error) {
        console.error('OMR batch upload error:', error);
        return res.status(500).json({
            error: 'Toplu yükleme sırasında hata oluştu',
            details: error.message
        });
    }
});
exports.default = router;
//# sourceMappingURL=routes.admin.js.map