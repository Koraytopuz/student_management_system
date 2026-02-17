"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const pdfGenerator_1 = require("./services/pdfGenerator");
const analysisService_1 = require("./services/analysisService");
const db_1 = require("./db");
const router = express_1.default.Router();
/**
 * GET /api/exams
 * Sınav listesini döner (admin paneli için).
 */
router.get('/exams', async (_req, res, next) => {
    try {
        const exams = await db_1.prisma.exam.findMany({
            orderBy: { date: 'desc' },
            select: { id: true, name: true, type: true, date: true },
        });
        res.json({
            exams: exams.map((e) => ({
                id: e.id,
                name: e.name,
                type: e.type,
                date: e.date instanceof Date ? e.date.toISOString() : e.date,
            })),
        });
    }
    catch (err) {
        next(err);
    }
});
/**
 * GET /api/analysis/:studentId/:examId
 * Öğrenci ve sınav için analiz verisini JSON olarak döner (grafikler için).
 */
router.get('/analysis/:studentId/:examId', async (req, res, next) => {
    try {
        const studentId = req.params.studentId;
        const examId = Number(req.params.examId);
        if (!studentId || isNaN(examId)) {
            res.status(400).json({ error: 'Geçersiz studentId veya examId' });
            return;
        }
        const analysis = await (0, analysisService_1.getExamAnalysisForStudent)(studentId, examId);
        if (!analysis) {
            res.status(404).json({ error: 'Analiz bulunamadı', message: 'Bu öğrenci için bu sınavda sonuç yok.' });
            return;
        }
        const projection = (0, analysisService_1.simulateImprovement)(analysis.score, analysis.priorityCounts.one, analysis.priorityCounts.two, analysis.priorityCounts.three);
        res.json({
            ...analysis,
            projection,
            date: analysis.date instanceof Date ? analysis.date.toISOString() : analysis.date,
        });
    }
    catch (err) {
        next(err);
    }
});
/**
 * GET /api/analysis/:studentId/progress
 * Son N sınavın kümülatif analizi (gelişim grafiği).
 */
router.get('/analysis/:studentId/progress', async (req, res, next) => {
    try {
        const studentId = req.params.studentId;
        const limit = Math.min(parseInt(req.query.limit) || 5, 20);
        if (!studentId) {
            res.status(400).json({ error: 'Geçersiz studentId' });
            return;
        }
        const data = await (0, analysisService_1.getStudentProgress)(studentId, limit);
        res.json({
            ...data,
            exams: data.exams.map((e) => ({
                ...e,
                date: e.date instanceof Date ? e.date.toISOString() : e.date,
            })),
        });
    }
    catch (err) {
        next(err);
    }
});
/**
 * POST /api/analysis/report
 * Body: { studentId: string | number, examId: string | number }
 * Öğrenci ve sınav için analiz raporunu PDF olarak üretir ve döner.
 */
router.post('/analysis/report', async (req, res, next) => {
    try {
        const { studentId, examId } = req.body;
        if (studentId == null || examId == null) {
            res.status(400).json({
                error: 'Eksik parametre',
                message: 'studentId ve examId zorunludur.',
            });
            return;
        }
        const buffer = await (0, pdfGenerator_1.generateAnalysisPdf)(studentId, examId);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=analiz-raporu-${studentId}-${examId}.pdf`);
        res.send(buffer);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Rapor oluşturulamadı';
        if (message.includes('bulunamadı')) {
            res.status(404).json({ error: 'Veri bulunamadı', message });
            return;
        }
        next(err);
    }
});
/**
 * POST /api/analysis/send
 * Body: { studentId, examId, target: 'parent' | 'student' }
 * PDF raporunu veli veya öğrenciye bildirim olarak gönderir.
 */
router.post('/analysis/send', async (req, res, next) => {
    try {
        const { studentId, examId, target } = req.body;
        if (!studentId || examId == null || !target) {
            res.status(400).json({
                error: 'Eksik parametre',
                message: 'studentId, examId ve target (parent|student) zorunludur.',
            });
            return;
        }
        const analysis = await (0, analysisService_1.getExamAnalysisForStudent)(studentId, examId);
        if (!analysis) {
            res.status(404).json({ error: 'Analiz bulunamadı' });
            return;
        }
        const payload = JSON.stringify({ studentId, examId });
        const body = `${analysis.examName} sınavı için kişiye özel analiz raporunuz hazır. ` +
            `Bildirimin sonundaki "PDF İndir / Görüntüle" butonuna tıklayarak rapora erişebilirsiniz.`;
        if (target === 'student') {
            await db_1.prisma.notification.create({
                data: {
                    userId: studentId,
                    type: 'analysis_report_ready',
                    title: 'Kişiye Özel Analiz Raporunuz Hazır',
                    body,
                    relatedEntityType: 'analysis_report',
                    relatedEntityId: payload,
                },
            });
        }
        else {
            const links = await db_1.prisma.parentStudent.findMany({
                where: { studentId },
                select: { parentId: true },
            });
            if (links.length === 0) {
                res.status(400).json({ error: 'Öğrenciye bağlı veli bulunamadı' });
                return;
            }
            await db_1.prisma.notification.createMany({
                data: links.map((l) => ({
                    userId: l.parentId,
                    type: 'analysis_report_ready',
                    title: 'Çocuğunuz İçin Kişiye Özel Analiz Raporu Hazır',
                    body: `${analysis.examName} sınavı için ${studentId} numaralı öğrencinin analiz raporu hazır. Bildirimin sonundaki "PDF İndir / Görüntüle" butonuna tıklayarak rapora erişebilirsiniz.`,
                    relatedEntityType: 'analysis_report',
                    relatedEntityId: payload,
                })),
            });
        }
        res.json({ success: true, message: 'Bildirim gönderildi' });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=routes.analysis.js.map