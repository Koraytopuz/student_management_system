"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("./db");
const auth_1 = require("./auth");
const examService_1 = require("./services/examService");
const router = (0, express_1.Router)();
// const prisma = new PrismaClient(); // Removed: Using centralized prisma client from src/db
// Yardımcı: kurum adı
function getInstitutionName(req) {
    var _a;
    const raw = (_a = req.user) === null || _a === void 0 ? void 0 : _a.institutionName;
    const trimmed = raw ? String(raw).trim() : '';
    return trimmed || undefined;
}
// POST /api/exams - Sınav oluştur (kurum bazlı)
router.post('/exams', (0, auth_1.authenticate)('admin'), async (req, res) => {
    try {
        const { name, type, date, questionCount, description, classGroupIds, fileUrl, fileName } = req.body;
        const institutionName = getInstitutionName(req);
        console.log('📥 Received exam creation request:', {
            name,
            type,
            date,
            questionCount,
            classGroupIds,
            fileUrl,
            fileName,
        });
        const examData = {
            name,
            type,
            date: new Date(date),
            questionCount: questionCount || 0,
            description,
            institutionName,
        };
        // Eğer admin PDF kitapçığı yükleyip URL bilgisini gönderdiyse, kayda ekle
        if (typeof fileUrl === 'string' && fileUrl.trim()) {
            examData.fileUrl = fileUrl.trim();
        }
        if (typeof fileName === 'string' && fileName.trim()) {
            examData.fileName = fileName.trim();
        }
        // Sınıf gruplarını güvenli hale getir (sadece gerçekten var olan ve aynı kurumdaki id'ler)
        let validClassGroupIds = [];
        if (Array.isArray(classGroupIds) && classGroupIds.length > 0) {
            const existingClassGroups = await db_1.prisma.classGroup.findMany({
                where: institutionName
                    ? {
                        id: { in: classGroupIds },
                        teacher: { institutionName },
                    }
                    : { id: { in: classGroupIds } },
                select: { id: true },
            });
            validClassGroupIds = existingClassGroups.map((g) => g.id);
            if (validClassGroupIds.length > 0) {
                examData.examAssignments = {
                    create: validClassGroupIds.map((id) => ({
                        classGroupId: id,
                    })),
                };
                console.log(`✅ Creating ${validClassGroupIds.length} class assignments (filtered from ${classGroupIds.length})`);
            }
            else {
                console.warn('[Exam] No valid classGroupIds found, creating exam without assignments', { classGroupIds });
            }
        }
        else {
            console.log('⚠️ No classGroupIds provided');
        }
        const exam = await db_1.prisma.exam.create({
            data: examData,
            include: {
                examAssignments: {
                    include: {
                        classGroup: true,
                    },
                },
                _count: {
                    select: { results: true },
                },
            },
        });
        // -----------------------------------------------------------------------
        // BİLDİRİM GÖNDERME
        // -----------------------------------------------------------------------
        if (Array.isArray(classGroupIds) && classGroupIds.length > 0) {
            try {
                // 1. Bu sınıflardaki öğrencileri bul
                const students = await db_1.prisma.classGroupStudent.findMany({
                    where: {
                        classGroupId: { in: classGroupIds },
                    },
                    select: { studentId: true },
                });
                let studentIds = [...new Set(students.map((s) => s.studentId))];
                console.log(`[DEBUG] Found ${students.length} students via ClassGroupStudent`);
                // 2) User.classId ile atanmış öğrencileri de ekle (admin panelden eklenen öğrenciler)
                // Bu, ClassGroupStudent tablosunda kaydı olmayan ama User.classId'si dolu olanlar için yedek.
                const usersInClass = await db_1.prisma.user.findMany({
                    where: {
                        role: 'student',
                        classId: { in: classGroupIds },
                    },
                    select: { id: true },
                });
                const fromClassId = usersInClass.map((u) => u.id);
                console.log(`[DEBUG] Found ${fromClassId.length} students via User.classId`);
                studentIds = [...new Set([...studentIds, ...fromClassId])];
                console.log(`[DEBUG] Total unique students for notification: ${studentIds.length}`);
                if (studentIds.length > 0) {
                    // Tarih formatını Türkçe'ye çevir
                    const examDate = new Date(date);
                    const formattedDate = examDate.toLocaleDateString('tr-TR', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                    });
                    // Bildirimleri oluştur
                    await db_1.prisma.notification.createMany({
                        data: studentIds.map((studentId) => ({
                            userId: studentId,
                            // Yeni sınav için mevcut tiplerden birini kullanıyoruz
                            type: 'content_assigned',
                            title: 'Yeni Deneme Sınavı',
                            body: `${formattedDate} tarihinde "${name}" isimli deneme sınavınız vardır.`,
                            read: false,
                            relatedEntityType: 'exam',
                            relatedEntityId: exam.id.toString(),
                        })),
                    });
                    console.log(`✅ Sent notifications to ${studentIds.length} students`);
                }
            }
            catch (notificationError) {
                // Bildirim hatası sınav oluşturmayı engellemez
                console.error('⚠️ Error sending notifications:', notificationError);
            }
        }
        res.json(exam);
    }
    catch (error) {
        console.error('❌ Error creating exam:', error);
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({
            error: 'Failed to create exam',
            ...(process.env.NODE_ENV !== 'production' && { debug: message }),
        });
    }
});
// PUT /api/exams/:id - Sınav güncelle (kurum bazlı)
router.put('/exams/:id', (0, auth_1.authenticate)('admin'), async (req, res) => {
    var _a;
    try {
        const { id } = req.params;
        const examId = parseInt(id);
        const { name, type, date, questionCount, description, classGroupIds, fileUrl, fileName } = req.body;
        const institutionName = getInstitutionName(req);
        const existing = await db_1.prisma.exam.findUnique({
            where: { id: examId },
            select: { id: true, institutionName: true },
        });
        if (!existing || (institutionName && existing.institutionName !== institutionName)) {
            return res.status(404).json({ error: 'Exam not found' });
        }
        console.log('📝 Updating exam:', examId, {
            name,
            questionCount,
            classGroupIds,
        });
        const updateData = {
            name,
            type,
            date: new Date(date),
            questionCount: questionCount || 0,
            description,
        };
        // PDF kitapçığı güncellemesi (varsa)
        if (typeof fileUrl === 'string') {
            updateData.fileUrl = fileUrl && fileUrl.trim() ? fileUrl.trim() : null;
        }
        if (typeof fileName === 'string') {
            updateData.fileName = fileName && fileName.trim() ? fileName.trim() : null;
        }
        if (Array.isArray(classGroupIds)) {
            updateData.examAssignments = {
                deleteMany: {}, // Clear existing assignments
                create: classGroupIds.map((id) => ({
                    classGroupId: id,
                })), // Create new assignments
            };
            console.log(`✅ Updating to ${classGroupIds.length} class assignments`);
        }
        const exam = await db_1.prisma.exam.update({
            where: { id: examId },
            data: updateData,
            include: {
                examAssignments: {
                    include: {
                        classGroup: true,
                    },
                },
                _count: {
                    select: { results: true },
                },
            },
        });
        // -----------------------------------------------------------------------
        // BİLDİRİM GÖNDERME (Update durumunda da)
        // -----------------------------------------------------------------------
        if (Array.isArray(classGroupIds) && classGroupIds.length > 0) {
            try {
                // Öğrencileri bul ve bildirim gönder
                const students = await db_1.prisma.classGroupStudent.findMany({
                    where: { classGroupId: { in: classGroupIds } },
                    include: { student: { select: { id: true } } },
                });
                console.log(`[DEBUG] Found ${students.length} students for class groups:`, classGroupIds);
                if (students.length > 0) {
                    const notifications = students.map((s) => ({
                        userId: s.student.id, // Corrected access to student ID
                        type: 'exam_created',
                        title: 'Yeni Deneme Sınavı',
                        body: `"${name}" sınavı sınıfınıza atandı. Tarih: ${new Date(date).toLocaleDateString('tr-TR')}`,
                        relatedEntityId: String(exam.id),
                        relatedEntityType: 'exam',
                        read: false,
                    }));
                    await db_1.prisma.notification.createMany({
                        data: notifications,
                    });
                    console.log(`📢 ${students.length} öğrenciye sınav bildirimi gönderildi.`);
                }
                else {
                    console.log('[DEBUG] No students found for these class groups. Notifications skipped.');
                }
            }
            catch (notifError) {
                console.error('❌ Bildirim gönderilirken hata:', notifError);
            }
        }
        console.log('✅ Exam updated successfully:', {
            id: exam.id,
            questionCount: exam.questionCount,
            assignmentsCount: ((_a = exam.examAssignments) === null || _a === void 0 ? void 0 : _a.length) || 0,
        });
        res.json(exam);
    }
    catch (error) {
        console.error('❌ Error updating exam:', error);
        res.status(500).json({ error: 'Failed to update exam' });
    }
});
// DELETE /api/exams/:id - Sınav sil (kurum bazlı)
router.delete('/exams/:id', (0, auth_1.authenticate)('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const examId = parseInt(id);
        const institutionName = getInstitutionName(req);
        const existing = await db_1.prisma.exam.findUnique({
            where: { id: examId },
            select: { id: true, institutionName: true },
        });
        if (!existing || (institutionName && existing.institutionName !== institutionName)) {
            return res.status(404).json({ error: 'Exam not found' });
        }
        // Önce atamaları ve sonuçları sil (FK kısıtları için)
        await db_1.prisma.examAssignment.deleteMany({ where: { examId } });
        await db_1.prisma.examResult.deleteMany({ where: { examId } });
        await db_1.prisma.exam.delete({ where: { id: examId } });
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error deleting exam:', error);
        res.status(500).json({ error: 'Failed to delete exam' });
    }
});
// GET /api/exams - Tüm sınavları listele (kurum bazlı)
router.get('/exams', (0, auth_1.authenticate)('admin'), async (req, res) => {
    try {
        const institutionName = getInstitutionName(req);
        const exams = await db_1.prisma.exam.findMany({
            where: institutionName ? { institutionName } : undefined,
            orderBy: { date: 'desc' },
            include: {
                examAssignments: {
                    include: {
                        classGroup: true,
                    },
                },
                _count: {
                    select: { results: true },
                },
            },
        });
        // Admin paneli mevcut yapıda { exams: [...] } beklediği için
        // dizi yerine obje ile döndürüyoruz.
        res.json({ exams });
    }
    catch (error) {
        console.error('Error fetching exams:', error);
        res.status(500).json({ error: 'Failed to fetch exams' });
    }
});
// GET /api/exams/:id - Sınav detayı (kurum bazlı - admin)
router.get('/exams/:id', (0, auth_1.authenticate)('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const examId = parseInt(id);
        const institutionName = getInstitutionName(req);
        const exam = await db_1.prisma.exam.findFirst({
            where: { id: examId, institutionName },
            include: {
                examAssignments: {
                    include: {
                        classGroup: {
                            include: {
                                students: {
                                    include: {
                                        student: {
                                            select: {
                                                id: true,
                                                name: true,
                                                email: true,
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                results: {
                    include: {
                        student: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                            },
                        },
                    },
                },
            },
        });
        if (!exam) {
            return res.status(404).json({ error: 'Exam not found' });
        }
        res.json(exam);
    }
    catch (error) {
        console.error('Error fetching exam:', error);
        res.status(500).json({ error: 'Failed to fetch exam' });
    }
});
// POST /api/exams/:id/assign - Sınavı sınıflara ata (çoklu, kurum bazlı)
router.post('/exams/:id/assign', (0, auth_1.authenticate)('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const examId = parseInt(id);
        const { classGroupIds } = req.body; // string[]
        const institutionName = getInstitutionName(req);
        if (!Array.isArray(classGroupIds) || classGroupIds.length === 0) {
            return res.status(400).json({ error: 'classGroupIds must be a non-empty array' });
        }
        // Sınavın bu kuruma ait olduğunu doğrula
        const existingExam = await db_1.prisma.exam.findUnique({
            where: { id: examId },
            select: { id: true, institutionName: true },
        });
        if (!existingExam || (institutionName && existingExam.institutionName !== institutionName)) {
            return res.status(404).json({ error: 'Exam not found' });
        }
        // Mevcut atamaları kontrol et ve yeni atamaları oluştur (yalnızca aynı kurumdaki sınıflar için)
        const allowedClassGroups = await db_1.prisma.classGroup.findMany({
            where: institutionName
                ? {
                    id: { in: classGroupIds },
                    teacher: { institutionName },
                }
                : { id: { in: classGroupIds } },
            select: { id: true },
        });
        const allowedIds = allowedClassGroups.map((g) => g.id);
        if (allowedIds.length === 0) {
            return res
                .status(400)
                .json({ error: 'Bu kuruma ait geçerli bir sınıf bulunamadı. Sınav atanmadı.' });
        }
        const assignments = await Promise.all(allowedIds.map((classGroupId) => db_1.prisma.examAssignment.upsert({
            where: {
                examId_classGroupId: {
                    examId,
                    classGroupId,
                },
            },
            create: {
                examId,
                classGroupId,
            },
            update: {},
        })));
        res.json({ success: true, assignments });
    }
    catch (error) {
        console.error('Error assigning exam:', error);
        res.status(500).json({ error: 'Failed to assign exam' });
    }
});
// POST /api/exams/:id/results - Sonuç girişi
router.post('/exams/:id/results', async (req, res) => {
    try {
        const { id } = req.params;
        const examId = parseInt(id);
        const { studentId, totalNet, score, percentile, details } = req.body;
        /*
        details: [
          {
            lessonId: string,
            lessonName: string,
            correct: number,
            wrong: number,
            empty: number,
            net: number,
            topics: [
              {
                topicId: string,
                topicName: string,
                totalQuestion: number,
                correct: number,
                wrong: number,
                empty: number,
                net: number,
                priorityLevel: 'ONE' | 'TWO' | 'THREE',
                lostPoints: number
              }
            ]
          }
        ]
        */
        // Exam result oluştur
        const examResult = await db_1.prisma.examResult.create({
            data: {
                studentId,
                examId,
                totalNet,
                score,
                percentile,
                details: {
                    create: details.map((detail) => ({
                        lessonId: detail.lessonId,
                        lessonName: detail.lessonName,
                        correct: detail.correct,
                        wrong: detail.wrong,
                        empty: detail.empty,
                        net: detail.net,
                        topicAnalyses: {
                            create: detail.topics.map((topic) => ({
                                topicId: topic.topicId,
                                topicName: topic.topicName,
                                totalQuestion: topic.totalQuestion,
                                correct: topic.correct,
                                wrong: topic.wrong,
                                empty: topic.empty,
                                net: topic.net,
                                priorityLevel: topic.priorityLevel,
                                lostPoints: topic.lostPoints,
                            })),
                        },
                    })),
                },
            },
            include: {
                details: {
                    include: {
                        topicAnalyses: true,
                    },
                },
            },
        });
        res.json(examResult);
    }
    catch (error) {
        console.error('Error creating exam result:', error);
        res.status(500).json({ error: 'Failed to create exam result' });
    }
});
// GET /api/student/assigned-exams/:studentId - Öğrencinin sınıfına atanmış sınavlar (sonuç girilmemiş)
router.get('/student/assigned-exams/:studentId', async (req, res) => {
    try {
        const { studentId } = req.params;
        const sid = studentId;
        // Öğrencinin sınıf ID'lerini bul (ClassGroupStudent + User.classId)
        const inClassGroup = await db_1.prisma.classGroupStudent.findMany({
            where: { studentId: sid },
            select: { classGroupId: true },
        });
        const user = await db_1.prisma.user.findFirst({
            where: { id: sid, role: 'student' },
            select: { classId: true },
        });
        const classIds = [...new Set([
                ...inClassGroup.map((c) => c.classGroupId),
                ...((user === null || user === void 0 ? void 0 : user.classId) ? [user.classId] : []),
            ])].filter(Boolean);
        if (classIds.length === 0) {
            return res.json([]);
        }
        const exams = await db_1.prisma.exam.findMany({
            where: {
                examAssignments: {
                    some: { classGroupId: { in: classIds } },
                },
            },
            include: {
                _count: { select: { results: true } },
            },
            orderBy: { date: 'desc' },
        });
        // Sonuç girilmiş sınavları filtrele - sadece henüz sonuç girilmemiş olanları döndür
        const result = [];
        for (const e of exams) {
            const hasResult = await db_1.prisma.examResult.findUnique({
                where: { studentId_examId: { studentId: sid, examId: e.id } },
            });
            if (!hasResult) {
                result.push({
                    id: e.id,
                    name: e.name,
                    type: e.type,
                    date: e.date,
                    questionCount: e.questionCount,
                });
            }
        }
        res.json(result);
    }
    catch (error) {
        console.error('Error fetching assigned exams:', error);
        res.status(500).json({ error: 'Failed to fetch assigned exams' });
    }
});
// GET /api/student/exam-results/:studentId - Öğrencinin tüm sınav sonuçları
router.get('/student/exam-results/:studentId', async (req, res) => {
    try {
        const { studentId } = req.params;
        const results = await db_1.prisma.examResult.findMany({
            where: { studentId: studentId },
            include: {
                exam: {
                    select: {
                        id: true,
                        name: true,
                        type: true,
                        date: true,
                    }
                }
            },
            orderBy: {
                exam: {
                    date: 'desc'
                }
            }
        });
        res.json(results);
    }
    catch (error) {
        console.error('Error fetching student exam results:', error);
        res.status(500).json({ error: 'Failed to fetch student exam results' });
    }
});
// GET /api/exams/:id/results/:studentId - Öğrenci sonucu
router.get('/exams/:examId/results/:studentId', async (req, res) => {
    try {
        const { examId: eid, studentId: sid } = req.params;
        const examId = parseInt(eid);
        const studentId = sid;
        const examResult = await db_1.prisma.examResult.findUnique({
            where: {
                studentId_examId: {
                    studentId: studentId,
                    examId: examId,
                },
            },
            include: {
                exam: true,
                student: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                details: {
                    include: {
                        topicAnalyses: true,
                    },
                },
            },
        });
        if (!examResult) {
            return res.status(404).json({ error: 'Exam result not found' });
        }
        res.json(examResult);
    }
    catch (error) {
        console.error('Error fetching exam result:', error);
        res.status(500).json({ error: 'Failed to fetch exam result' });
    }
});
// GET /api/exams/:id/analysis/:studentId - Detaylı analiz (öncelik + what-if)
router.get('/exams/:examId/analysis/:studentId', async (req, res) => {
    try {
        const { examId: eid, studentId: sid } = req.params;
        const examId = parseInt(eid);
        const studentId = sid;
        // Exam result'ı bul
        const examResult = await db_1.prisma.examResult.findUnique({
            where: {
                studentId_examId: {
                    studentId: studentId,
                    examId: examId,
                },
            },
            include: {
                exam: true,
            },
        });
        if (!examResult) {
            return res.status(404).json({ error: 'Exam result not found' });
        }
        // Topic performanslarını çek
        const topicPerformances = await (0, examService_1.getTopicPerformancesForExamResult)(examResult.id);
        // Öncelik analizi
        const priorityAnalysis = (0, examService_1.analyzePriority)(topicPerformances, examResult.exam.type);
        // Sıralama simülasyonu
        const rankComparison = await (0, examService_1.calculateRankSimulation)(examResult.score, examResult.exam.type);
        // What-If projeksiyonları (1., 2., 3. öncelik için)
        const [whatIf1, whatIf2, whatIf3] = await Promise.all([
            (0, examService_1.calculateWhatIf)(examResult.id, 1, examResult.exam.type),
            (0, examService_1.calculateWhatIf)(examResult.id, 2, examResult.exam.type),
            (0, examService_1.calculateWhatIf)(examResult.id, 3, examResult.exam.type),
        ]);
        res.json({
            examResult,
            priorityAnalysis,
            rankComparison,
            whatIfProjections: {
                priority1: whatIf1,
                priority2: whatIf2,
                priority3: whatIf3,
            },
        });
    }
    catch (error) {
        console.error('Error fetching exam analysis:', error);
        res.status(500).json({ error: 'Failed to fetch exam analysis' });
    }
});
// GET /api/ranking-scales - Sıralama ölçekleri
router.get('/ranking-scales', async (req, res) => {
    try {
        const { year, examType } = req.query;
        const where = {};
        if (year)
            where.year = parseInt(year);
        if (examType)
            where.examType = examType;
        const scales = await db_1.prisma.rankingScale.findMany({
            where,
            orderBy: [{ year: 'desc' }, { scoreRangeMin: 'asc' }],
        });
        res.json(scales);
    }
    catch (error) {
        console.error('Error fetching ranking scales:', error);
        res.status(500).json({ error: 'Failed to fetch ranking scales' });
    }
});
// POST /api/ranking-scales - Sıralama ölçeği ekle
router.post('/ranking-scales', async (req, res) => {
    try {
        const { year, examType, scoreRangeMin, scoreRangeMax, estimatedRank } = req.body;
        const scale = await db_1.prisma.rankingScale.create({
            data: {
                year,
                examType,
                scoreRangeMin,
                scoreRangeMax,
                estimatedRank,
            },
        });
        res.json(scale);
    }
    catch (error) {
        console.error('Error creating ranking scale:', error);
        res.status(500).json({ error: 'Failed to create ranking scale' });
    }
});
// GET /api/exams/:id/all-results - Bir sınava ait tüm öğrenci cevaplarını listele (admin)
router.get('/exams/:id/all-results', async (req, res) => {
    try {
        const examId = Number(req.params.id);
        if (isNaN(examId)) {
            return res.status(400).json({ error: 'Geçersiz sınav ID' });
        }
        const results = await db_1.prisma.examResult.findMany({
            where: { examId },
            include: {
                student: { select: { id: true, name: true, email: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
        return res.json(results.map((r) => {
            var _a, _b, _c, _d;
            return ({
                id: r.id,
                studentId: r.studentId,
                studentName: (_b = (_a = r.student) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : '',
                studentEmail: (_d = (_c = r.student) === null || _c === void 0 ? void 0 : _c.email) !== null && _d !== void 0 ? _d : '',
                score: r.score,
                totalNet: r.totalNet,
                percentile: r.percentile,
                gradingStatus: r.gradingStatus,
                createdAt: r.createdAt,
            });
        }));
    }
    catch (error) {
        console.error('Error fetching exam all-results:', error);
        return res.status(500).json({ error: 'Sonuçlar alınamadı.' });
    }
});
// Yardımcı: Optik metnini { soruNo: 'A' } map'ine çevir
function parseOpticInput(raw) {
    const map = {};
    const text = (raw || '').toUpperCase();
    // Örnek desteklenen formatlar:
    // 1-A 2-B 3-C
    // 1 A, 2 C, 3 D
    // 1)A  2) B  3)C
    const pairRegex = /(\d+)\s*[-:.)]?\s*([A-E])/g;
    let match;
    while ((match = pairRegex.exec(text)) !== null) {
        const g1 = match[1];
        const g2 = match[2];
        if (g1 != null && g2 != null) {
            const qNum = parseInt(g1, 10);
            if (!Number.isNaN(qNum)) {
                map[qNum] = g2;
            }
        }
    }
    // Eğer hiç eşleşme yoksa, sadece harflerden oluşan sıralı optik kabul et (örn. ABCDE...)
    if (Object.keys(map).length === 0) {
        const letters = text.replace(/[^A-E]/g, '');
        letters.split('').forEach((ch, idx) => {
            const qNum = idx + 1;
            map[qNum] = ch;
        });
    }
    return map;
}
/**
 * POST /api/exams/:examId/manual-grade/:studentId
 * Admin'in girdiği cevap anahtarı ve öğrenci optiğine göre sonucu hesaplar.
 */
router.post('/exams/:examId/manual-grade/:studentId', (0, auth_1.authenticate)('admin'), async (req, res) => {
    try {
        const examId = Number(req.params.examId);
        const studentId = String(req.params.studentId);
        if (Number.isNaN(examId)) {
            return res.status(400).json({ error: 'Geçersiz sınav ID' });
        }
        const { answerKey, studentAnswers } = req.body;
        if (!answerKey || !studentAnswers) {
            return res.status(400).json({
                error: 'answerKey ve studentAnswers alanları zorunludur.',
            });
        }
        const keyMap = parseOpticInput(answerKey);
        const ansMap = parseOpticInput(studentAnswers);
        if (Object.keys(keyMap).length === 0) {
            return res.status(400).json({
                error: 'Geçerli bir cevap anahtarı çözümlenemedi. Lütfen formatı kontrol edin.',
            });
        }
        const questionNumbers = Array.from(new Set(Object.keys(keyMap)
            .map((n) => parseInt(n, 10))
            .filter((n) => !Number.isNaN(n)))).sort((a, b) => a - b);
        let correct = 0;
        let wrong = 0;
        let empty = 0;
        for (const q of questionNumbers) {
            const key = keyMap[q];
            const ansRaw = ansMap[q];
            const ans = ansRaw ? ansRaw.replace(/[^A-E]/g, '') : '';
            if (!key)
                continue;
            if (!ans || ans === '-' || ans === '_') {
                empty += 1;
            }
            else if (ans === key) {
                correct += 1;
            }
            else {
                wrong += 1;
            }
        }
        const totalQuestions = correct + wrong + empty;
        if (totalQuestions === 0) {
            return res.status(400).json({
                error: 'Hiç soru değerlendirilemedi. Lütfen optik girişlerini kontrol edin.',
            });
        }
        // TYT tipi sınavlar için klasik net hesabı: doğru - yanlış * 0.25
        const totalNet = correct - wrong * 0.25;
        // Basit bir puan tahmini: 3 * net (ileride özelleştirilebilir)
        const score = totalNet * 3;
        const answersJson = {
            answerKey: keyMap,
            studentAnswers: ansMap,
            summary: { correct, wrong, empty, totalQuestions },
        };
        const examResult = await db_1.prisma.examResult.upsert({
            where: {
                studentId_examId: {
                    studentId,
                    examId,
                },
            },
            create: {
                studentId,
                examId,
                totalNet,
                score,
                percentile: 0,
                gradingStatus: 'auto_graded',
                answers: answersJson,
            },
            update: {
                totalNet,
                score,
                percentile: 0,
                gradingStatus: 'auto_graded',
                answers: answersJson,
            },
        });
        return res.json({
            success: true,
            examResult: {
                id: examResult.id,
                studentId: examResult.studentId,
                examId: examResult.examId,
                totalNet: examResult.totalNet,
                score: examResult.score,
                percentile: examResult.percentile,
                gradingStatus: examResult.gradingStatus,
                summary: { correct, wrong, empty, totalQuestions },
            },
        });
    }
    catch (error) {
        console.error('Error in manual-grade endpoint:', error);
        return res.status(500).json({ error: 'Sonuç hesaplanırken hata oluştu.' });
    }
});
// POST /api/exams/:id/questions - Sınav cevap anahtarını kaydet (admin/öğretmen)
router.post('/exams/:id/questions', async (req, res) => {
    try {
        const examId = Number(req.params.id);
        if (isNaN(examId)) {
            return res.status(400).json({ error: 'Geçersiz sınav ID' });
        }
        const { questions } = req.body;
        if (!Array.isArray(questions) || questions.length === 0) {
            return res.status(400).json({ error: 'Soru listesi boş veya geçersiz.' });
        }
        // Upsert each question (update if exists, create if not)
        const upserted = await Promise.all(questions.map((q) => {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
            return db_1.prisma.examQuestion.upsert({
                where: { examId_questionNumber: { examId, questionNumber: q.questionNumber } },
                update: {
                    correctOption: (_a = q.correctOption) !== null && _a !== void 0 ? _a : null,
                    topicName: (_b = q.topicName) !== null && _b !== void 0 ? _b : 'Genel',
                    lessonName: (_c = q.lessonName) !== null && _c !== void 0 ? _c : 'Genel',
                    difficulty: (_d = q.difficulty) !== null && _d !== void 0 ? _d : 'Orta',
                    questionText: (_e = q.questionText) !== null && _e !== void 0 ? _e : null,
                },
                create: {
                    examId,
                    questionNumber: q.questionNumber,
                    correctOption: (_f = q.correctOption) !== null && _f !== void 0 ? _f : null,
                    topicName: (_g = q.topicName) !== null && _g !== void 0 ? _g : 'Genel',
                    lessonName: (_h = q.lessonName) !== null && _h !== void 0 ? _h : 'Genel',
                    difficulty: (_j = q.difficulty) !== null && _j !== void 0 ? _j : 'Orta',
                    questionText: (_k = q.questionText) !== null && _k !== void 0 ? _k : null,
                },
            });
        }));
        return res.json({ success: true, count: upserted.length });
    }
    catch (error) {
        console.error('Error saving exam questions:', error);
        return res.status(500).json({ error: 'Cevap anahtarı kaydedilemedi.' });
    }
});
// GET /api/exams/:id/questions - Sınav cevap anahtarını getir
router.get('/exams/:id/questions', async (req, res) => {
    try {
        const examId = Number(req.params.id);
        if (isNaN(examId)) {
            return res.status(400).json({ error: 'Geçersiz sınav ID' });
        }
        const questions = await db_1.prisma.examQuestion.findMany({
            where: { examId },
            orderBy: { questionNumber: 'asc' },
        });
        return res.json(questions);
    }
    catch (error) {
        console.error('Error fetching exam questions:', error);
        return res.status(500).json({ error: 'Soru listesi alınamadı.' });
    }
});
exports.default = router;
//# sourceMappingURL=routes.exam.js.map