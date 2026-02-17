"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("./db");
const examService_1 = require("./services/examService");
const router = (0, express_1.Router)();
// const prisma = new PrismaClient(); // Removed: Using centralized prisma client from src/db
// POST /api/exams - Sınav oluştur
router.post('/exams', async (req, res) => {
    try {
        // Not: Şu anda sınav dosyası veritabanında saklanmıyor,
        // bu nedenle fileUrl ve fileName sadece log amaçlı okunuyor.
        const { name, type, date, questionCount, description, classGroupIds, fileUrl, fileName } = req.body;
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
        };
        if (Array.isArray(classGroupIds) && classGroupIds.length > 0) {
            examData.examAssignments = {
                create: classGroupIds.map((id) => ({
                    classGroupId: id,
                })),
            };
            console.log(`✅ Creating ${classGroupIds.length} class assignments`);
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
        res.status(500).json({ error: 'Failed to create exam' });
    }
});
// PUT /api/exams/:id - Sınav güncelle
router.put('/exams/:id', async (req, res) => {
    var _a;
    try {
        const { id } = req.params;
        const examId = parseInt(id);
        const { name, type, date, questionCount, description, classGroupIds } = req.body;
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
// DELETE /api/exams/:id - Sınav sil
router.delete('/exams/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const examId = parseInt(id);
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
// GET /api/exams - Tüm sınavları listele
router.get('/exams', async (req, res) => {
    try {
        const exams = await db_1.prisma.exam.findMany({
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
// GET /api/exams/:id - Sınav detayı
router.get('/exams/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const examId = parseInt(id);
        const exam = await db_1.prisma.exam.findUnique({
            where: { id: examId },
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
// POST /api/exams/:id/assign - Sınavı sınıflara ata (çoklu)
router.post('/exams/:id/assign', async (req, res) => {
    try {
        const { id } = req.params;
        const examId = parseInt(id);
        const { classGroupIds } = req.body; // string[]
        if (!Array.isArray(classGroupIds) || classGroupIds.length === 0) {
            return res.status(400).json({ error: 'classGroupIds must be a non-empty array' });
        }
        // Mevcut atamaları kontrol et ve yeni atamaları oluştur
        const assignments = await Promise.all(classGroupIds.map((classGroupId) => db_1.prisma.examAssignment.upsert({
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
exports.default = router;
//# sourceMappingURL=routes.exam.js.map