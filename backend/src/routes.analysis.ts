import express from 'express';
import { generateAnalysisPdf } from './services/pdfGenerator';
import {
  getExamAnalysisForStudent,
  getStudentProgress,
  simulateImprovement,
} from './services/analysisService';
import { prisma } from './db';

const router = express.Router();

/**
 * GET /api/exams
 * Sınav listesini döner (admin paneli için).
 */
router.get('/exams', async (_req, res, next) => {
  try {
    const exams = await prisma.exam.findMany({
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
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/analysis/:studentId/progress
 * Son N sınavın kümülatif analizi (gelişim grafiği).
 * Not: Bu route /analysis/:studentId/:examId'dan ÖNCE tanımlanmalı, yoksa "progress" examId olarak yakalanır.
 */
router.get('/analysis/:studentId/progress', async (req, res, next) => {
  try {
    const studentId = req.params.studentId;
    const limit = Math.min(parseInt(req.query.limit as string) || 5, 20);
    if (!studentId) {
      res.status(400).json({ error: 'Geçersiz studentId' });
      return;
    }
    const data = await getStudentProgress(studentId, limit);
    res.json({
      ...data,
      exams: data.exams.map((e) => ({
        ...e,
        date: e.date instanceof Date ? e.date.toISOString() : e.date,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/analysis/:studentId/:examId
 * Öğrenci ve sınav için analiz verisini JSON olarak döner (grafikler için).
 */
router.get('/analysis/:studentId/:examId', async (req, res, next) => {
  try {
    const rawStudentId = req.params.studentId;
    const studentId = typeof rawStudentId === 'string' ? rawStudentId.trim() : '';
    const examId = Number(req.params.examId);
    const invalidStudentId = !studentId || studentId === 'undefined' || studentId === 'null';
    const invalidExamId = !Number.isInteger(examId) || isNaN(examId) || examId <= 0;
    if (invalidStudentId || invalidExamId) {
      res.status(400).json({ error: 'Geçersiz studentId veya examId' });
      return;
    }
    const analysis = await getExamAnalysisForStudent(studentId, examId);
    if (!analysis) {
      res.status(404).json({ error: 'Analiz bulunamadı', message: 'Bu öğrenci için bu sınavda sonuç yok.' });
      return;
    }
    const projection = simulateImprovement(
      analysis.score,
      analysis.priorityCounts.one,
      analysis.priorityCounts.two,
      analysis.priorityCounts.three
    );

    res.json({
      ...analysis,
      projection,
      date: analysis.date instanceof Date ? analysis.date.toISOString() : analysis.date,
    });
  } catch (err) {
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
    const { studentId, examId } = req.body as { studentId?: string | number; examId?: string | number };

    if (studentId == null || examId == null) {
      res.status(400).json({
        error: 'Eksik parametre',
        message: 'studentId ve examId zorunludur.',
      });
      return;
    }

    const buffer = await generateAnalysisPdf(studentId, examId);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=analiz-raporu-${studentId}-${examId}.pdf`
    );
    res.send(buffer);
  } catch (err) {
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
    const { studentId, examId, target } = req.body as {
      studentId?: string;
      examId?: number;
      target?: 'parent' | 'student';
    };

    if (!studentId || examId == null || !target) {
      res.status(400).json({
        error: 'Eksik parametre',
        message: 'studentId, examId ve target (parent|student) zorunludur.',
      });
      return;
    }

    const analysis = await getExamAnalysisForStudent(studentId, examId);
    if (!analysis) {
      res.status(404).json({ error: 'Analiz bulunamadı' });
      return;
    }

    const payload = JSON.stringify({ studentId, examId });
    const body =
      `${analysis.examName} sınavı için kişiye özel analiz raporunuz hazır. ` +
      `Bildirimin sonundaki "PDF İndir / Görüntüle" butonuna tıklayarak rapora erişebilirsiniz.`;

    if (target === 'student') {
      await prisma.notification.create({
        data: {
          userId: studentId,
          type: 'analysis_report_ready' as any,
          title: 'Kişiye Özel Analiz Raporunuz Hazır',
          body,
          relatedEntityType: 'analysis_report' as any,
          relatedEntityId: payload,
        },
      });
    } else {
      const links = await prisma.parentStudent.findMany({
        where: { studentId },
        select: { parentId: true },
      });
      if (links.length === 0) {
        res.status(400).json({ error: 'Öğrenciye bağlı veli bulunamadı' });
        return;
      }
      await prisma.notification.createMany({
        data: links.map((l) => ({
          userId: l.parentId,
          type: 'analysis_report_ready' as any,
          title: 'Çocuğunuz İçin Kişiye Özel Analiz Raporu Hazır',
          body: `${analysis.examName} sınavı için ${studentId} numaralı öğrencinin analiz raporu hazır. Bildirimin sonundaki "PDF İndir / Görüntüle" butonuna tıklayarak rapora erişebilirsiniz.`,
          relatedEntityType: 'analysis_report' as any,
          relatedEntityId: payload,
        })),
      });
    }

    res.json({ success: true, message: 'Bildirim gönderildi' });
  } catch (err) {
    next(err);
  }
});

export default router;
