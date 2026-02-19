import express from 'express';
import bcrypt from 'bcrypt';
import { authenticate, AuthenticatedRequest } from './auth';
import { prisma } from './db';
import type { Parent, Student, Teacher } from './types';
import { UserRole, ExamType, PriorityLevel } from '@prisma/client';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Multer Setup
const uploadDir = 'uploads/profiles';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'profile-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

const router = express.Router();

function getInstitutionName(req: AuthenticatedRequest): string {
  const raw = (req.user as any)?.institutionName;
  const trimmed = raw ? String(raw).trim() : '';
  // Geriye dönük uyumluluk: eski veriler kurum adı olmadan kalmış olabilir
  return trimmed || 'SKYANALİZ';
}

// Sistem genelinde kullanılacak sabit sınıf seviyeleri
// Öğrenci ve soru bankası tarafındaki gradeLevel alanlarıyla uyumlu tutulmalıdır.
const ALLOWED_GRADES = ['4', '5', '6', '7', '8', '9', '10', '11', '12', 'Mezun'];

function toTeacher(u: {
  id: string;
  name: string;
  email: string;
  subjectAreas: string[];
  teacherGrades?: string[] | null;
}): Teacher {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: 'teacher',
    subjectAreas: u.subjectAreas ?? [],
    assignedGrades: u.teacherGrades ?? [],
  };
}

/**
 * Veli telefon numarasını normalize eder.
 * - Tüm rakam dışı karakterleri temizler
 * - 90 / 0 gibi önekleri kırpar
 * - Veritabanında 5XXXXXXXXX (10 hane) formatında saklar
 */
function normalizeParentPhone(raw: unknown): string | null {
  if (raw == null) return null;
  const str = String(raw).trim();
  if (!str) return null;

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

function toStudent(u: {
  id: string;
  name: string;
  email: string;
  gradeLevel: string | null;
  classId: string | null;
  parentPhone: string | null;
  profilePictureUrl?: string | null;
}): Student {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: 'student',
    gradeLevel: u.gradeLevel ?? '',
    classId: u.classId ?? '',
    parentPhone: u.parentPhone ?? undefined,
    profilePictureUrl: u.profilePictureUrl ?? undefined,
  };
}

function toParent(
  u: { id: string; name: string; email: string },
  studentIds: string[],
): Parent {
  return { id: u.id, name: u.name, email: u.email, role: 'parent', studentIds };
}

// Yönetici dashboard için özet
router.get('/summary', authenticate('admin'), async (req: AuthenticatedRequest, res) => {
  const institutionName = getInstitutionName(req);
  try {
    const [teacherCount, studentCount, parentCount, assignmentCount] = await Promise.all([
      prisma.user.count({ where: { role: 'teacher', institutionName } as any }),
      prisma.user.count({ where: { role: 'student', institutionName } as any }),
      prisma.user.count({ where: { role: 'parent', institutionName } as any }),
      prisma.assignment.count({
        where: {
          OR: [
            { createdByTeacher: { institutionName } as any },
            { students: { some: { student: { institutionName } as any } } } as any,
          ],
        } as any,
      }),
    ]);
    return res.json({
      teacherCount,
      studentCount,
      parentCount,
      assignmentCount,
    });
  } catch (error) {
    console.error('[admin/summary] Error:', error);
    return res.status(500).json({
      error: 'Yönetici özet verileri yüklenemedi',
      ...(process.env.NODE_ENV !== 'production' && {
        details: error instanceof Error ? error.message : String(error),
      }),
    });
  }
});

router.get('/teachers', authenticate('admin'), async (req: AuthenticatedRequest, res) => {
  const institutionName = getInstitutionName(req);
  try {
    const list = await prisma.user.findMany({
      where: { role: 'teacher', institutionName } as any,
      select: { id: true, name: true, email: true, subjectAreas: true, teacherGrades: true },
    });
    return res.json(list.map(toTeacher));
  } catch (error) {
    console.error('[admin/teachers] Error:', error);
    // Öğretmen listesi boş olsa bile hata döndürmeyelim, boş liste döndürelim
    return res.json([]);
  }
});

router.get('/students', authenticate('admin'), async (req: AuthenticatedRequest, res) => {
  const institutionName = getInstitutionName(req);
  try {
    const list = await prisma.user.findMany({
      where: { role: 'student', institutionName } as any,
      select: {
        id: true,
        name: true,
        email: true,
        gradeLevel: true,
        classId: true,
        parentPhone: true,
        profilePictureUrl: true,
      } as any,
    });
    return res.json(list.map((u) => toStudent(u as any)));
  } catch (error) {
    console.error('[admin/students] Error:', error);
    // Öğrenci listesi boş olsa bile hata döndürmeyelim, boş liste döndürelim
    return res.json([]);
  }
});

router.get('/parents', authenticate('admin'), async (req: AuthenticatedRequest, res) => {
  const institutionName = getInstitutionName(req);
  try {
    const list = await prisma.user.findMany({
      where: { role: 'parent', institutionName } as any,
      include: { parentStudents: { select: { studentId: true } } },
    });
    return res.json(
      list.map((u) =>
        toParent(u, u.parentStudents.map((ps) => ps.studentId)),
      ),
    );
  } catch (error) {
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
router.get('/exam-result-students', authenticate('admin'), async (_req, res) => {
  // 1) ExamResult üzerinden hangi öğrencilerin sonucu olduğunu grup­la
  const grouped = await (prisma as any).examResult.groupBy({
    by: ['studentId'],
    _count: { _all: true },
  });

  if (grouped.length === 0) {
    return res.json([]);
  }

  const studentIds = grouped.map((g: any) => g.studentId);

  // 2) Bu öğrencilerin temel bilgilerini çek
  const students = await prisma.user.findMany({
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
  const examCountByStudent: Record<string, number> = {};
  for (const row of grouped as Array<{ studentId: string; _count: { _all: number } }>) {
    examCountByStudent[row.studentId] = row._count._all;
  }

  const result = students.map((s) => ({
    studentId: s.id,
    name: s.name,
    email: s.email,
    gradeLevel: s.gradeLevel ?? '',
    classId: s.classId ?? '',
    examCount: examCountByStudent[s.id] ?? 0,
  }));

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
router.post(
  '/debug/create-sample-exam-ali-12-say',
  authenticate('admin'),
  async (_req: AuthenticatedRequest, res) => {
    try {
      // 1) Hedef öğrenciyi bul
      // Önce 12. sınıf sayısal sınıflardan birinde "Ali" isimli öğrenciyi bulmaya çalış
      let student = await prisma.user.findFirst({
        where: {
          role: 'student',
          gradeLevel: '12',
          name: { contains: 'Ali', mode: 'insensitive' },
        },
      });

      if (!student) {
        student = await prisma.user.findFirst({
          where: {
            role: 'student',
            gradeLevel: '12',
            name: { contains: 'Ali', mode: 'insensitive' },
          },
        });
      }

      if (!student) {
        student = await prisma.user.findFirst({
          where: {
            role: 'student',
            gradeLevel: '12',
          },
        });
      }

      if (!student) {
        return res.status(404).json({
          success: false,
          error:
            '12. sınıf seviyesinde öğrenci bulunamadı. Önce en az bir 12. sınıf öğrencisi oluşturun.',
        });
      }

      // 2) Örnek için kullanılacak bir TYT (veya herhangi bir) sınav bul
      // Not: Bazı ortamlarda `exam` tablosunun ID sequence'i bozulmuş olabildiği için
      // burada YENİ sınav oluşturmak yerine mevcut bir sınavı kullanıyoruz.
      let exam = await prisma.exam.findFirst({
        where: { type: ExamType.TYT },
        orderBy: { date: 'desc' },
      });

      if (!exam) {
        // TYT yoksa, tarihine göre herhangi bir sınavı kullan
        exam = await prisma.exam.findFirst({
          orderBy: { date: 'desc' },
        });
      }

      if (!exam) {
        return res.status(400).json({
          success: false,
          error:
            'Örnek sınav sonucu oluşturmak için önce "Sınav Yönetimi" ekranından en az bir sınav oluşturmalısınız.',
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
      ] as const;

      const subjectMap: Record<string, { id: string; name: string }> = {};
      for (const def of subjectDefs) {
        const s = await prisma.subject.upsert({
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
      ] as const;

      const topicMap: Record<string, { id: string; name: string; subjectId: string }> = {};
      for (const def of topicDefs) {
        const t = await prisma.topic.upsert({
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
      const totalNet =
        lessonStats.reduce((sum, l) => sum + (l.correct - l.wrong * 0.25), 0) ?? 65;
      const score = 430;
      const percentile = 82;

      // ExamResult kaydı oluştur / güncelle
      const examResult = await (prisma as any).examResult.upsert({
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
      await (prisma as any).examResultDetail.deleteMany({ where: { examResultId: examResult.id } });

      for (const lesson of lessonStats) {
        const subj = subjectMap[lesson.subjectKey];
        if (!subj) continue;

        const detail = await (prisma as any).examResultDetail.create({
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
          if (!topic) continue;

          await (prisma as any).topicAnalysis.create({
            data: {
              examResultDetailId: detail.id,
              topicId: topic.id,
              topicName: topic.name,
              totalQuestion: t.total,
              correct: t.correct,
              wrong: t.wrong,
              empty: t.empty,
              net: t.correct - t.wrong * 0.25,
              priorityLevel:
                t.correct / (t.total || 1) < 0.3
                  ? PriorityLevel.ONE
                  : t.correct / (t.total || 1) < 0.6
                    ? PriorityLevel.TWO
                    : PriorityLevel.THREE,
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
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[admin][debug/create-sample-exam-ali-12-say] Error:', error);
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({
        success: false,
        // Geliştirme ortamında hata ayrıntısını doğrudan gösterelim ki
        // frontend'deki hata mesajından sorunu görebilelim.
        error:
          process.env.NODE_ENV !== 'production'
            ? `[debug] Örnek sınav oluşturulamadı: ${message}`
            : 'Örnek sınav verisi oluşturulurken bir hata oluştu.',
      });
    }
  },
);

/**
 * GET /admin/class-groups
 * Yönetici paneli için tüm sınıf gruplarını listeler.
 *
 * Not:
 * - `ExamManagement` ekranındaki "Sınıf Seç" çoklu seçim listesi bu endpoint'i kullanır.
 * - Yalnızca ilgili kurumun (institutionName) sınıfları döndürülür.
 */
router.get('/class-groups', authenticate('admin'), async (req: AuthenticatedRequest, res) => {
  const institutionName = getInstitutionName(req);

  const groups = await prisma.classGroup.findMany({
    where: institutionName
      ? ({
          teacher: {
            institutionName,
          },
        } as any)
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

  res.json(
    groups.map((g) => ({
      id: g.id,
      name: g.name,
      gradeLevel: g.gradeLevel,
      stream: g.stream,
      section: g.section,
    })),
  );
});

// ========== DEVAMSIZLIK / YOKLAMA (ADMIN) ==========

/**
 * GET /admin/attendance/classes?days=7
 * Yönetici için sınıf bazlı yoklama özetleri (kurum bazlı)
 */
router.get('/attendance/classes', authenticate('admin'), async (req: AuthenticatedRequest, res) => {
  const institutionName = getInstitutionName(req);
  const daysRaw = String(req.query.days ?? '7');
  const days = Number.isFinite(Number(daysRaw)) ? Math.max(1, Math.min(90, Number(daysRaw))) : 7;

  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  since.setHours(0, 0, 0, 0);

  try {
    const classGroups = await prisma.classGroup.findMany({
      where: institutionName
        ? ({
            teacher: {
              institutionName,
            },
          } as any)
        : undefined,
      orderBy: [{ gradeLevel: 'asc' }, { name: 'asc' }],
      include: {
        teacher: { select: { id: true, name: true } },
        students: { select: { studentId: true } },
      },
    });

    const classGroupIds = classGroups.map((cg) => cg.id);

    const grouped =
      classGroupIds.length === 0
        ? []
        : await prisma.classAttendance.groupBy({
            by: ['classGroupId', 'present'],
            where: {
              date: { gte: since },
              classGroupId: { in: classGroupIds },
            },
            _count: { _all: true },
          });

    const countsByClass = new Map<
      string,
      { presentCount: number; absentCount: number; totalRecords: number }
    >();
    for (const row of grouped) {
      const prev = countsByClass.get(row.classGroupId) ?? { presentCount: 0, absentCount: 0, totalRecords: 0 };
      const c = row._count._all;
      if (row.present) prev.presentCount += c;
      else prev.absentCount += c;
      prev.totalRecords += c;
      countsByClass.set(row.classGroupId, prev);
    }

    return res.json(
      classGroups.map((cg) => {
        const counts = countsByClass.get(cg.id) ?? { presentCount: 0, absentCount: 0, totalRecords: 0 };
        return {
          id: cg.id,
          name: cg.name,
          gradeLevel: cg.gradeLevel,
          teacherId: cg.teacherId,
          teacherName: cg.teacher?.name ?? 'Öğretmen',
          studentCount: cg.students.length,
          days,
          ...counts,
        };
      }),
    );
  } catch (error) {
    console.error('[admin/attendance/classes]', error);
    return res.status(500).json({ error: 'Sınıf devamsızlık özetleri yüklenemedi.' });
  }
});

/**
 * GET /admin/attendance/classes/:classId/students?days=7
 * Yönetici için seçili sınıftaki öğrencilerin yoklama özeti (kurum bazlı)
 */
router.get(
  '/attendance/classes/:classId/students',
  authenticate('admin'),
  async (req: AuthenticatedRequest, res) => {
    const institutionName = getInstitutionName(req);
  const classId = String(req.params.classId);
  const daysRaw = String(req.query.days ?? '7');
  const days = Number.isFinite(Number(daysRaw)) ? Math.max(1, Math.min(90, Number(daysRaw))) : 7;

  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  since.setHours(0, 0, 0, 0);

  try {
    const classGroup = await prisma.classGroup.findUnique({
      where: { id: classId },
      include: {
        teacher: { select: { id: true, name: true, institutionName: true } as any },
        students: {
          include: {
            student: { select: { id: true, name: true, gradeLevel: true, profilePictureUrl: true } },
          },
        },
      },
    });

    if (
      !classGroup ||
      (institutionName && (classGroup.teacher as any)?.institutionName !== institutionName)
    ) {
      return res.status(404).json({ error: 'Sınıf bulunamadı.' });
    }

    const studentIds = classGroup.students.map((s) => s.studentId);

    const [grouped, recent] = await Promise.all([
      prisma.classAttendance.groupBy({
        by: ['studentId', 'present'],
        where: { classGroupId: classId, date: { gte: since }, studentId: { in: studentIds } },
        _count: { _all: true },
      }),
      prisma.classAttendance.findMany({
        where: { classGroupId: classId, studentId: { in: studentIds } },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        take: 2000, // sınıf küçük; son kayıtları çıkarmak için yeterli
        select: { studentId: true, date: true, present: true },
      }),
    ]);

    const countsByStudent = new Map<string, { presentCount: number; absentCount: number; total: number }>();
    for (const row of grouped) {
      const prev = countsByStudent.get(row.studentId) ?? { presentCount: 0, absentCount: 0, total: 0 };
      const c = row._count._all;
      if (row.present) prev.presentCount += c;
      else prev.absentCount += c;
      prev.total += c;
      countsByStudent.set(row.studentId, prev);
    }

    const lastByStudent = new Map<string, { date: string; present: boolean }>();
    for (const r of recent) {
      if (!lastByStudent.has(r.studentId)) {
        lastByStudent.set(r.studentId, { date: r.date.toISOString(), present: r.present });
      }
    }

    const students = classGroup.students
      .map((s) => {
        const counts = countsByStudent.get(s.studentId) ?? { presentCount: 0, absentCount: 0, total: 0 };
        const last = lastByStudent.get(s.studentId) ?? null;
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
        teacherName: classGroup.teacher?.name ?? 'Öğretmen',
      },
      students,
    });
  } catch (error) {
    console.error('[admin/attendance/classes/:classId/students]', error);
    return res.status(500).json({ error: 'Sınıf öğrenci devamsızlık özeti yüklenemedi.' });
  }
});

/**
 * GET /admin/attendance/students/:studentId/history?days=30
 * Yönetici için öğrencinin yoklama geçmişi ve istatistikleri (kurum bazlı)
 */
router.get(
  '/attendance/students/:studentId/history',
  authenticate('admin'),
  async (req: AuthenticatedRequest, res) => {
    const institutionName = getInstitutionName(req);
    const studentId = String(req.params.studentId);
    const daysRaw = String(req.query.days ?? '30');
    const days = Number.isFinite(Number(daysRaw)) ? Math.max(1, Math.min(180, Number(daysRaw))) : 30;

    const since = new Date();
    since.setDate(since.getDate() - (days - 1));
    since.setHours(0, 0, 0, 0);

    try {
      const student = await prisma.user.findFirst({
        where: { id: studentId, role: 'student', institutionName } as any,
        select: { id: true, name: true, gradeLevel: true, classId: true },
      });
      if (!student) {
        return res.status(404).json({ error: 'Öğrenci bulunamadı.' });
      }

      const records = await prisma.classAttendance.findMany({
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

      const summaryText =
        total === 0
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
        records: records.map((r) => ({
          id: r.id,
          date: r.date.toISOString(),
          present: r.present,
          notes: r.notes,
          createdAt: r.createdAt.toISOString(),
          classGroupId: r.classGroupId,
          classGroupName: r.classGroup.name,
          teacherId: r.teacherId,
          teacherName: r.teacher?.name ?? 'Öğretmen',
        })),
      });
    } catch (error) {
      console.error('[admin/attendance/students/:studentId/history]', error);
      return res.status(500).json({ error: 'Öğrenci devamsızlık geçmişi yüklenemedi.' });
    }
  },
);

router.post('/teachers', authenticate('admin'), async (req: AuthenticatedRequest, res: express.Response) => {
  const institutionName = getInstitutionName(req);
  const { name, email, subjectAreas, assignedGrades, password } = req.body as {
    name?: string;
    email?: string;
    subjectAreas?: string[] | string;
    assignedGrades?: string[] | string;
    password?: string;
  };

  if (!name || !email) {
    return res.status(400).json({ error: 'İsim ve e-posta zorunludur' });
  }
  if (!password || password.length < 4) {
    return res.status(400).json({ error: 'Şifre en az 4 karakter olmalıdır' });
  }

  const exists = await prisma.user.findFirst({ where: { email, role: 'teacher' } });
  if (exists) {
    return res.status(400).json({ error: 'Bu e-posta ile kayıtlı öğretmen var' });
  }

  const areasArray: string[] =
    typeof subjectAreas === 'string'
      ? subjectAreas.split(',').map((s) => s.trim()).filter(Boolean)
      : subjectAreas ?? [];

  const gradesArray: string[] =
    typeof assignedGrades === 'string'
      ? assignedGrades
        .split(',')
        .map((s) => s.trim())
        .filter((g) => g && ALLOWED_GRADES.includes(g))
      : (assignedGrades ?? []).filter((g) => typeof g === 'string' && ALLOWED_GRADES.includes(g));

  const passwordHash = await bcrypt.hash(password, 10);
  const created = await prisma.user.create({
    data: {
      name,
      email,
      role: 'teacher' as UserRole,
      passwordHash,
      subjectAreas: areasArray,
      teacherGrades: gradesArray,
      institutionName,
    },
    select: { id: true, name: true, email: true, subjectAreas: true, teacherGrades: true },
  });
  return res.status(201).json(toTeacher(created));
});

router.put(
  '/teachers/:id',
  authenticate('admin'),
  async (req: AuthenticatedRequest, res: express.Response) => {
    const institutionName = getInstitutionName(req);
    const id = String(req.params.id);

    const existing = await prisma.user.findFirst({
      where: { id, role: 'teacher', institutionName } as any,
      select: {
        id: true,
        email: true,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Öğretmen bulunamadı' });
    }

    const { name, email, subjectAreas, assignedGrades, password } = req.body as {
      name?: string;
      email?: string;
      subjectAreas?: string[] | string;
      assignedGrades?: string[] | string;
      password?: string;
    };

    if (!name || !email) {
      return res.status(400).json({ error: 'İsim ve e-posta zorunludur' });
    }

    if (password && password.length > 0 && password.length < 4) {
      return res.status(400).json({ error: 'Şifre en az 4 karakter olmalıdır' });
    }

    // E-posta değişmişse aynı rol için çakışma kontrolü yap
    if (email !== existing.email) {
      const emailConflict = await prisma.user.findFirst({
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

    const areasArray: string[] =
      typeof subjectAreas === 'string'
        ? subjectAreas
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
        : subjectAreas ?? [];

    const gradesArray: string[] =
      typeof assignedGrades === 'string'
        ? assignedGrades
          .split(',')
          .map((s) => s.trim())
          .filter((g) => g && ALLOWED_GRADES.includes(g))
        : (assignedGrades ?? []).filter((g) => typeof g === 'string' && ALLOWED_GRADES.includes(g));

    const updateData: any = {
      name,
      email,
      subjectAreas: areasArray,
      teacherGrades: gradesArray,
    };

    if (password && password.length >= 4) {
      updateData.passwordHash = await bcrypt.hash(password, 10);
    }

    const updated = await prisma.user.update({
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
  },
);

router.delete('/teachers/:id', authenticate('admin'), async (req: AuthenticatedRequest, res: express.Response) => {
  const institutionName = getInstitutionName(req);
  const id = String(req.params.id);
  const existing = await prisma.user.findFirst({ where: { id, role: 'teacher', institutionName } as any });
  if (!existing) {
    return res.status(404).json({ error: 'Öğretmen bulunamadı' });
  }
  await prisma.user.delete({ where: { id } });
  return res.json(toTeacher(existing));
});

router.post('/students', authenticate('admin'), async (req: AuthenticatedRequest, res: express.Response) => {
  const institutionName = getInstitutionName(req);
  const { name, email, gradeLevel, classId, parentPhone: parentPhoneRaw, password, profilePictureUrl } = req.body as {
    name?: string;
    email?: string;
    gradeLevel?: string;
    classId?: string;
    parentPhone?: string;
    password?: string;
    profilePictureUrl?: string;
  };

  if (!name || !email) {
    return res.status(400).json({ error: 'İsim ve e-posta zorunludur' });
  }
  if (!password || password.length < 4) {
    return res.status(400).json({ error: 'Şifre en az 4 karakter olmalıdır' });
  }

  if (gradeLevel && !ALLOWED_GRADES.includes(gradeLevel)) {
    return res.status(400).json({ error: 'Geçersiz sınıf seviyesi' });
  }

  let parentPhone: string | null = null;
  try {
    parentPhone = normalizeParentPhone(parentPhoneRaw);
  } catch (err) {
    if (err instanceof Error && err.message === 'INVALID_PARENT_PHONE') {
      return res
        .status(400)
        .json({ error: 'Geçersiz veli telefon numarası. Lütfen 555 123 45 67 formatında girin.' });
    }
    throw err;
  }

  const exists = await prisma.user.findFirst({ where: { email, role: 'student' } });
  if (exists) {
    return res.status(400).json({ error: 'Bu e-posta ile kayıtlı öğrenci var' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const created = await prisma.user.create({
    data: {
      name,
      email,
      role: 'student' as UserRole,
      passwordHash,
      gradeLevel: gradeLevel ?? '',
      classId: classId ?? '',
      parentPhone,
      profilePictureUrl,
      institutionName,
    } as any,
    select: {
      id: true,
      name: true,
      email: true,
      gradeLevel: true,
      classId: true,
      parentPhone: true,
      profilePictureUrl: true,
    } as any,
  });
  // Sınıf atandıysa ClassGroupStudent'a da ekle (sınav bildirimleri için)
  if (classId && created.id) {
    const classGroupId = String(classId);
    await (prisma as any).classGroupStudent.upsert({
      where: { classGroupId_studentId: { classGroupId, studentId: created.id } },
      create: { classGroupId, studentId: created.id },
      update: {},
    });
  }
  return res.status(201).json(toStudent(created as any));
});

router.put('/students/:id', authenticate('admin'), async (req: AuthenticatedRequest, res: express.Response) => {
  const institutionName = getInstitutionName(req);
  const id = String(req.params.id);
  const { name, email, gradeLevel, classId, parentPhone: parentPhoneRaw, password, profilePictureUrl } = req.body as {
    name?: string;
    email?: string;
    gradeLevel?: string;
    classId?: string;
    parentPhone?: string | null;
    password?: string;
    profilePictureUrl?: string;
  };

  const existing = await prisma.user.findFirst({ where: { id, role: 'student', institutionName } as any });
  if (!existing) {
    return res.status(404).json({ error: 'Öğrenci bulunamadı' });
  }

  if (
    name === undefined &&
    email === undefined &&
    gradeLevel === undefined &&
    classId === undefined &&
    classId === undefined &&
    parentPhoneRaw === undefined &&
    password === undefined &&
    profilePictureUrl === undefined
  ) {
    return res
      .status(400)
      .json({ error: 'Güncellenecek en az bir alan gönderilmelidir' });
  }

  const data: {
    name?: string;
    email?: string;
    gradeLevel?: string | null;
    classId?: string | null;
    parentPhone?: string | null;
    passwordHash?: string;
    profilePictureUrl?: string;
  } = {};

  if (name !== undefined) data.name = String(name).trim();
  if (email !== undefined) data.email = String(email).trim();
  if (gradeLevel !== undefined) {
    if (gradeLevel && !ALLOWED_GRADES.includes(gradeLevel)) {
      return res.status(400).json({ error: 'Geçersiz sınıf seviyesi' });
    }
    data.gradeLevel = gradeLevel ?? '';
  }
  if (classId !== undefined) data.classId = classId ?? '';

  if (parentPhoneRaw !== undefined) {
    try {
      const normalized = normalizeParentPhone(parentPhoneRaw);
      data.parentPhone = normalized;
    } catch (err) {
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
    data.passwordHash = await bcrypt.hash(password, 10);
  }

  if (profilePictureUrl !== undefined) {
    data.profilePictureUrl = profilePictureUrl;
  }

  const updated = await prisma.user.update({
    where: { id },
    data: data as any,
    select: {
      id: true,
      name: true,
      email: true,
      gradeLevel: true,
      classId: true,
      parentPhone: true,
      profilePictureUrl: true,
    } as any,
  });

  // classId değiştiyse ClassGroupStudent'ı senkronize et (sınav bildirimleri için)
  if (classId !== undefined) {
    await (prisma as any).classGroupStudent.deleteMany({ where: { studentId: id } });
    if (updated.classId) {
      const classGroupId = String(updated.classId);
      await (prisma as any).classGroupStudent.upsert({
        where: { classGroupId_studentId: { classGroupId, studentId: id } },
        create: { classGroupId, studentId: id },
        update: {},
      });
    }
  }

  return res.json(toStudent(updated as any));
});

router.delete('/students/:id', authenticate('admin'), async (req: AuthenticatedRequest, res: express.Response) => {
  const institutionName = getInstitutionName(req);
  const id = String(req.params.id);
  const existing = await prisma.user.findFirst({ where: { id, role: 'student', institutionName } as any });
  if (!existing) {
    return res.status(404).json({ error: 'Öğrenci bulunamadı' });
  }
  await prisma.parentStudent.deleteMany({ where: { studentId: id } });
  await prisma.user.delete({ where: { id } });
  return res.json(toStudent(existing as any));
});

router.post('/parents', authenticate('admin'), async (req: AuthenticatedRequest, res: express.Response) => {
  const institutionName = getInstitutionName(req);
  const { name, email, password } = req.body as {
    name?: string;
    email?: string;
    password?: string;
  };

  if (!name || !email) {
    return res.status(400).json({ error: 'İsim ve e-posta zorunludur' });
  }
  if (!password || password.length < 4) {
    return res.status(400).json({ error: 'Şifre en az 4 karakter olmalıdır' });
  }

  const exists = await prisma.user.findFirst({ where: { email, role: 'parent' } });
  if (exists) {
    return res.status(400).json({ error: 'Bu e-posta ile kayıtlı veli var' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const created = await prisma.user.create({
    data: {
      name,
      email,
      role: 'parent' as UserRole,
      passwordHash,
      institutionName,
    },
    select: { id: true, name: true, email: true },
  });
  return res.status(201).json(toParent(created, []));
});

router.put(
  '/parents/:id',
  authenticate('admin'),
  async (req: AuthenticatedRequest, res: express.Response) => {
    const institutionName = getInstitutionName(req);
    const id = String(req.params.id);
    const { name, email, password } = req.body as { name?: string; email?: string; password?: string };

    if (!name && !email && (password === undefined || password === '')) {
      return res.status(400).json({ error: 'Güncellenecek en az bir alan (isim, e-posta veya şifre) gereklidir' });
    }

    const existing = await prisma.user.findFirst({
      where: { id, role: 'parent', institutionName } as any,
      include: { parentStudents: { select: { studentId: true } } },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Veli bulunamadı' });
    }

    if (email && email !== existing.email) {
      const emailTaken = await prisma.user.findFirst({
        where: { email, role: 'parent', NOT: { id } },
      });
      if (emailTaken) {
        return res.status(400).json({ error: 'Bu e-posta ile kayıtlı başka bir veli var' });
      }
    }

    if (password !== undefined && password.length > 0 && password.length < 4) {
      return res.status(400).json({ error: 'Yeni şifre en az 4 karakter olmalıdır' });
    }

    const updateData: { name?: string; email?: string; passwordHash?: string } = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (password && password.length >= 4) {
      updateData.passwordHash = await bcrypt.hash(password, 10);
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
      select: { id: true, name: true, email: true },
    });

    return res.json(
      toParent(updated, existing.parentStudents.map((ps) => ps.studentId)),
    );
  },
);

router.delete('/parents/:id', authenticate('admin'), async (req: AuthenticatedRequest, res: express.Response) => {
  const institutionName = getInstitutionName(req);
  const id = String(req.params.id);
  const existing = await prisma.user.findFirst({
    where: { id, role: 'parent', institutionName } as any,
    include: { parentStudents: { select: { studentId: true } } },
  });
  if (!existing) {
    return res.status(404).json({ error: 'Veli bulunamadı' });
  }
  await prisma.user.delete({ where: { id } });
  return res.json(
    toParent(existing, existing.parentStudents.map((ps) => ps.studentId)),
  );
});

router.post(
  '/parents/:id/assign-student',
  authenticate('admin'),
  async (req: AuthenticatedRequest, res: express.Response) => {
    const institutionName = getInstitutionName(req);
    const parentId = String(req.params.id);
    const { studentId } = req.body as { studentId?: string };

    if (!studentId) {
      return res.status(400).json({ error: 'studentId zorunludur' });
    }

    const parent = await prisma.user.findFirst({
      where: { id: parentId, role: 'parent', institutionName } as any,
      include: { parentStudents: { select: { studentId: true } } },
    });
    if (!parent) {
      return res.status(404).json({ error: 'Veli bulunamadı' });
    }

    const studentExists = await prisma.user.findFirst({
      where: { id: studentId, role: 'student', institutionName } as any,
    });
    if (!studentExists) {
      return res.status(404).json({ error: 'Öğrenci bulunamadı' });
    }

    await prisma.parentStudent.upsert({
      where: {
        parentId_studentId: { parentId, studentId },
      },
      create: { parentId, studentId },
      update: {},
    });

    const updated = await prisma.user.findFirst({
      where: { id: parentId, institutionName } as any,
      include: { parentStudents: { select: { studentId: true } } },
    });
    return res.json(
      toParent(updated!, updated!.parentStudents.map((ps) => ps.studentId)),
    );
  },
);

router.post(
  '/parents/:id/unassign-student',
  authenticate('admin'),
  async (req: AuthenticatedRequest, res: express.Response) => {
    const institutionName = getInstitutionName(req);
    const parentId = String(req.params.id);
    const { studentId } = req.body as { studentId?: string };

    if (!studentId) {
      return res.status(400).json({ error: 'studentId zorunludur' });
    }

    const parent = await prisma.user.findFirst({
      where: { id: parentId, role: 'parent', institutionName } as any,
      include: { parentStudents: { select: { studentId: true } } },
    });
    if (!parent) {
      return res.status(404).json({ error: 'Veli bulunamadı' });
    }

    await prisma.parentStudent.deleteMany({
      where: { parentId, studentId },
    });

    const updated = await prisma.user.findFirst({
      where: { id: parentId, institutionName } as any,
      include: { parentStudents: { select: { studentId: true } } },
    });
    return res.json(
      toParent(updated!, updated!.parentStudents.map((ps) => ps.studentId)),
    );
  },
);

// Şikayet / öneriler (öğrenci + veli) – kurum bazlı
router.get('/complaints', authenticate('admin'), async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const institutionName = getInstitutionName(req);
    const status = req.query.status ? String(req.query.status) : undefined;

    const where: any = {};
    if (status) {
      where.status = status as any;
    }
    if (institutionName) {
      // Şikayeti gönderen kullanıcının kurumuna göre filtrele
      where.fromUser = { institutionName };
    }

    const list = await prisma.complaint.findMany({
      where,
      include: {
        fromUser: { select: { id: true, name: true, email: true, role: true, institutionName: true } as any },
        aboutTeacher: { select: { id: true, name: true, email: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return res.json(
      list.map((c) => ({
        id: c.id,
        fromRole: c.fromRole,
        fromUser: c.fromUser,
        aboutTeacher: c.aboutTeacher ?? undefined,
        subject: c.subject,
        body: c.body,
        status: c.status,
        createdAt: c.createdAt.toISOString(),
        reviewedAt: c.reviewedAt?.toISOString(),
        closedAt: c.closedAt?.toISOString(),
      })),
    );
  } catch (error) {
    console.error('[admin/complaints] Error:', error);
    // Şikayet listesi boş olsa bile hata döndürmeyelim, boş liste döndürelim
    return res.json([]);
  }
});

// Bildirimler (şikayet/öneri vb.)
// Tekil mesaj detayı (bildirim modalında içerik göstermek için)
router.get(
  '/messages/:id',
  authenticate('admin'),
  async (req: AuthenticatedRequest, res: express.Response) => {
    const adminId = req.user!.id;
    const messageId = String(req.params.id);

    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message) {
      return res.status(404).json({ error: 'Mesaj bulunamadı' });
    }

    // Admin tüm mesajları görebilir (kurum içindeki mesajlar)
    const users = await prisma.user.findMany({
      where: { id: { in: [message.fromUserId, message.toUserId] } },
      select: { id: true, name: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u.name]));

    return res.json({
      id: message.id,
      fromUserId: message.fromUserId,
      toUserId: message.toUserId,
      studentId: message.studentId ?? undefined,
      subject: message.subject ?? undefined,
      text: message.text,
      attachments: message.attachments ?? undefined,
      read: message.read,
      readAt: message.readAt?.toISOString(),
      createdAt: message.createdAt.toISOString(),
      fromUserName: userMap.get(message.fromUserId) ?? message.fromUserId,
      toUserName: userMap.get(message.toUserId) ?? message.toUserId,
    });
  },
);

router.get('/notifications', authenticate('admin'), async (req: AuthenticatedRequest, res: express.Response) => {
  const userId = req.user!.id;
  const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
  const list = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit > 0 ? limit : 50,
  });
  return res.json(
    list.map((n) => ({
      id: n.id,
      userId: n.userId,
      type: n.type,
      title: n.title,
      body: n.body,
      read: n.read,
      relatedEntityType: n.relatedEntityType ?? undefined,
      relatedEntityId: n.relatedEntityId ?? undefined,
      readAt: n.readAt?.toISOString(),
      createdAt: n.createdAt.toISOString(),
    })),
  );
});

router.put('/notifications/:id/read', authenticate('admin'), async (req: AuthenticatedRequest, res: express.Response) => {
  const userId = req.user!.id;
  const id = String(req.params.id);
  const n = await prisma.notification.findFirst({ where: { id, userId } });
  if (!n) return res.status(404).json({ error: 'Bildirim bulunamadı' });
  const updated = await prisma.notification.update({
    where: { id },
    data: { read: true, readAt: new Date() },
  });
  return res.json({
    id: updated.id,
    read: updated.read,
    readAt: updated.readAt?.toISOString(),
  });
});

// Şikayet durum güncelleme – kurum bazlı güvenlik
router.put('/complaints/:id', authenticate('admin'), async (req: AuthenticatedRequest, res: express.Response) => {
  const institutionName = getInstitutionName(req);
  const id = String(req.params.id);
  const { status } = req.body as { status?: 'open' | 'reviewed' | 'closed' };
  if (!status) {
    return res.status(400).json({ error: 'status zorunludur (open|reviewed|closed)' });
  }

  const existing = await prisma.complaint.findFirst({
    where: institutionName
      ? ({ id, fromUser: { institutionName } } as any)
      : { id },
  });
  if (!existing) {
    return res.status(404).json({ error: 'Kayıt bulunamadı' });
  }

  const now = new Date();
  const updated = await prisma.complaint.update({
    where: { id },
    data: {
      status: status as any,
      reviewedAt: status === 'reviewed' ? (existing.reviewedAt ?? now) : existing.reviewedAt,
      closedAt: status === 'closed' ? (existing.closedAt ?? now) : existing.closedAt,
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
    aboutTeacher: updated.aboutTeacher ?? undefined,
    subject: updated.subject,
    body: updated.body,
    status: updated.status,
    createdAt: updated.createdAt.toISOString(),
    reviewedAt: updated.reviewedAt?.toISOString(),
    closedAt: updated.closedAt?.toISOString(),
  });
});

// Şikayet silme – kurum bazlı güvenlik (AdminDashboard "Sil" butonu için)
router.delete(
  '/complaints/:id',
  authenticate('admin'),
  async (req: AuthenticatedRequest, res: express.Response) => {
    const institutionName = getInstitutionName(req);
    const id = String(req.params.id);

    const existing = await prisma.complaint.findFirst({
      where: institutionName
        ? ({ id, fromUser: { institutionName } } as any)
        : { id },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Kayıt bulunamadı' });
    }

    await prisma.complaint.delete({ where: { id } });
    return res.status(204).send();
  },
);

// Koçluk seansları - admin görünümü (sadece okuma)
router.get(
  '/coaching',
  authenticate('admin'),
  async (req: AuthenticatedRequest, res: express.Response) => {
    const { studentId, teacherId } = req.query as {
      studentId?: string;
      teacherId?: string;
    };

    const where: {
      studentId?: string;
      teacherId?: string;
    } = {};

    if (studentId) where.studentId = String(studentId);
    if (teacherId) where.teacherId = String(teacherId);

    const sessions = await prisma.coachingSession.findMany({
      where,
      orderBy: { date: 'desc' },
    });

    return res.json(
      sessions.map((s) => ({
        id: s.id,
        studentId: s.studentId,
        teacherId: s.teacherId,
        date: s.date.toISOString(),
        durationMinutes: s.durationMinutes ?? undefined,
        title: s.title,
        notes: s.notes,
        mode: s.mode,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      })),
    );
  },
);

router.post(
  '/upload/student-image',
  authenticate('admin'),
  upload.single('file'),
  (req: AuthenticatedRequest, res: express.Response) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Dosya yüklenemedi' });
    }
    // relative path döndür
    // src/uploads/profiles/... -> frontend'den erişim için /uploads/profiles/...
    // backend static serve ayarı lazım, varsayılan olarak /uploads serve ediliyorsa:
    const url = `/uploads/profiles/${req.file.filename}`;
    return res.json({ url });
  },
);

// ==================== OMR (Optical Mark Recognition) Routes ====================

import {
  processStandardOMR,
  validateStudentNumber,
  createExamResultFromOMR,
  createProcessingJob,
  updateProcessingJob,
  getProcessingJobStatus,
  processOMRAsync,
  type OMRResult
} from './services/opticalService';

// Multer setup for OMR form uploads
const omrUploadDir = 'uploads/omr-scans';
if (!fs.existsSync(omrUploadDir)) {
  fs.mkdirSync(omrUploadDir, { recursive: true });
}

const omrStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, omrUploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'omr-scan-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const omrUpload = multer({
  storage: omrStorage,
  fileFilter: (req, file, cb) => {
    // Accept only image files
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/tiff'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
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
router.post(
  '/omr/upload',
  authenticate('admin'),
  omrUpload.single('file'),
  async (req: AuthenticatedRequest, res: express.Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Dosya yüklenemedi' });
      }

      const { examId, formType = 'YKS_STANDARD' } = req.body;

      if (!examId) {
        return res.status(400).json({ error: 'Sınav ID gereklidir' });
      }

      // Create processing job
      const jobId = createProcessingJob(parseInt(examId), req.file.path);

      // Start async processing
      processOMRAsync(jobId, req.file.path, formType, parseInt(examId))
        .catch(err => console.error('OMR processing error:', err));

      return res.json({
        success: true,
        jobId,
        message: 'Form yüklendi, işleniyor...'
      });
    } catch (error: any) {
      console.error('OMR upload error:', error);
      return res.status(500).json({
        error: 'Form yüklenirken hata oluştu',
        details: error.message
      });
    }
  }
);

/**
 * GET /admin/omr/status/:jobId
 * Check processing status of an OMR job
 */
router.get(
  '/omr/status/:jobId',
  authenticate('admin'),
  async (req: AuthenticatedRequest, res: express.Response) => {
    try {
      const jobId = String(req.params.jobId);
      const job = getProcessingJobStatus(jobId);

      if (!job) {
        return res.status(404).json({ error: 'İşlem bulunamadı' });
      }

      return res.json(job);
    } catch (error: any) {
      console.error('OMR status error:', error);
      return res.status(500).json({ error: 'Durum sorgulanırken hata oluştu' });
    }
  }
);

/**
 * POST /admin/omr/validate
 * Manually validate and correct OMR results
 */
router.post(
  '/omr/validate',
  authenticate('admin'),
  async (req: AuthenticatedRequest, res: express.Response) => {
    try {
      const { jobId, studentNumber, answers, examId } = req.body;

      if (!jobId || !studentNumber || !answers || !examId) {
        return res.status(400).json({
          error: 'jobId, studentNumber, answers ve examId gereklidir'
        });
      }

      // Validate student
      const validation = await validateStudentNumber(studentNumber);

      if (!validation.valid) {
        return res.status(400).json({
          error: 'Öğrenci bulunamadı',
          studentNumber
        });
      }

      // Create exam result
      const omrData: OMRResult = {
        success: true,
        student_number_detected: studentNumber,
        answers,
        confidence_score: 1.0 // Manual validation = 100% confidence
      };

      const examResult = await createExamResultFromOMR(
        omrData,
        parseInt(examId),
        validation.studentId!
      );

      // Update job status
      updateProcessingJob(jobId, {
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
    } catch (error: any) {
      console.error('OMR validation error:', error);
      return res.status(500).json({
        error: 'Doğrulama sırasında hata oluştu',
        details: error.message
      });
    }
  }
);

/**
 * GET /admin/omr/templates
 * List available form templates
 */
router.get(
  '/omr/templates',
  authenticate('admin'),
  async (req: AuthenticatedRequest, res: express.Response) => {
    try {
      const configPath = path.join(__dirname, '../python-scripts/omr_config.json');
      const configData = await fs.promises.readFile(configPath, 'utf-8');
      const config = JSON.parse(configData);

      const templates = Object.entries(config.templates).map(([key, value]: [string, any]) => ({
        id: key,
        name: value.name,
        description: value.description
      }));

      return res.json(templates);
    } catch (error: any) {
      console.error('OMR templates error:', error);
      return res.status(500).json({ error: 'Şablonlar yüklenirken hata oluştu' });
    }
  }
);

/**
 * POST /admin/omr/process-batch
 * Process multiple scanned forms in batch
 */
router.post(
  '/omr/process-batch',
  authenticate('admin'),
  omrUpload.array('files', 50), // Max 50 files
  async (req: AuthenticatedRequest, res: express.Response) => {
    try {
      const files = req.files as Express.Multer.File[];

      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'Dosya yüklenemedi' });
      }

      const { examId, formType = 'YKS_STANDARD' } = req.body;

      if (!examId) {
        return res.status(400).json({ error: 'Sınav ID gereklidir' });
      }

      const formTypeStr = String(formType);

      const jobs = files.map(file => {
        const jobId = createProcessingJob(parseInt(examId), file.path);

        // Start async processing
        processOMRAsync(jobId, file.path, formTypeStr, parseInt(examId))
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
    } catch (error: any) {
      console.error('OMR batch upload error:', error);
      return res.status(500).json({
        error: 'Toplu yükleme sırasında hata oluştu',
        details: error.message
      });
    }
  }
);

export default router;

