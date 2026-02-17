"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateTopicSuccessRatio = calculateTopicSuccessRatio;
exports.getPriorityLevelFromRatio = getPriorityLevelFromRatio;
exports.inferTopicGroup = inferTopicGroup;
exports.getExamAnalysisForStudent = getExamAnalysisForStudent;
exports.getMultiExamBranchTable = getMultiExamBranchTable;
exports.getTopicGroupAnalysisForExam = getTopicGroupAnalysisForExam;
exports.simulateImprovement = simulateImprovement;
exports.getStudentProgress = getStudentProgress;
const db_1 = require("../db");
// ----------------- Yardımcı Fonksiyonlar -----------------
/**
 * Bir konudaki başarı yüzdesini hesaplar.
 */
function calculateTopicSuccessRatio(correct, totalQuestion) {
    if (!totalQuestion || totalQuestion <= 0)
        return 0;
    return (correct / totalQuestion) * 100;
}
/**
 * Başarı oranına göre öncelik seviyesi atar.
 * - %0–30   -> 1. Öncelik (PriorityLevel.ONE)
 * - %30–60  -> 2. Öncelik (PriorityLevel.TWO)
 * - %60–80  -> 3. Öncelik (PriorityLevel.THREE)
 * - %80+    -> 3. Öncelik (iyi durumda; istersen ayrı enum da ekleyebilirsin)
 */
function getPriorityLevelFromRatio(ratio) {
    if (ratio < 30)
        return 'ONE';
    if (ratio < 60)
        return 'TWO';
    if (ratio < 80)
        return 'THREE';
    return 'THREE';
}
/**
 * "Konu grubu" tahmini – referans PDF'teki gibi Dil Bilgisi / Paragraf / 1. Dönem vb.
 * Bu sadece temel bir iskelet; ileride ihtiyaç oldukça genişletilebilir.
 */
function inferTopicGroup(lessonName, topicName) {
    const combined = `${lessonName} ${topicName}`.toLowerCase();
    // Türkçe örnekleri
    if (combined.includes('paragraf'))
        return 'Paragraf';
    if (combined.includes('dil bilgisi') ||
        combined.includes('fiilimsi') ||
        combined.includes('yazım') ||
        combined.includes('noktalama')) {
        return 'Dil Bilgisi';
    }
    if (combined.includes('1. dönem') || combined.includes('1.dönem') || combined.includes('1 donem')) {
        return '1. Dönem';
    }
    if (combined.includes('2. dönem') || combined.includes('2.dönem') || combined.includes('2 donem')) {
        return '2. Dönem';
    }
    // Genel fen / matematik blokları (örnek)
    if (combined.includes('mevsimler') || combined.includes('iklim'))
        return 'Mevsimler ve İklim';
    if (combined.includes('dna') || combined.includes('genetik'))
        return 'DNA ve Genetik';
    if (combined.includes('çarpanlar') || combined.includes('katlar'))
        return 'Çarpanlar ve Katlar';
    if (combined.includes('olasılık'))
        return 'Olasılık';
    return 'Genel';
}
// ----------------- Ana Servis Fonksiyonları -----------------
/**
 * Belirli bir öğrenci + sınav için:
 * - Ders/Konu bazlı doğru/yanlış/boş/net
 * - Konu bazlı başarı yüzdesi
 * - Öncelik seviyesi (1., 2., 3.)
 * hesaplar ve döner.
 */
async function getExamAnalysisForStudent(studentId, examId) {
    const sid = typeof studentId === 'number' ? String(studentId) : studentId;
    const examResult = await db_1.prisma.examResult.findFirst({
        where: { studentId: sid, examId },
        include: {
            exam: true,
            details: {
                include: {
                    lesson: true,
                    topicAnalyses: {
                        include: {
                            topic: true,
                        },
                    },
                },
            },
        },
    });
    if (!examResult) {
        return null;
    }
    const topicPriorities = [];
    // Önce tüm konuları toplayalım; başarı oranı ve hata oranını hesaplayalım.
    for (const detail of examResult.details) {
        for (const ta of detail.topicAnalyses) {
            const totalQ = ta.totalQuestion || 0;
            const successRatio = calculateTopicSuccessRatio(ta.correct, totalQ);
            const errorRatio = totalQ > 0 ? ((ta.wrong + ta.empty) / totalQ) * 100 : 0;
            const net = ta.correct - ta.wrong * 0.25; // 4 yanlış 1 doğru götürür varsayımı
            topicPriorities.push({
                lessonName: detail.lesson.name,
                topicName: ta.topic.name,
                totalQuestion: totalQ,
                correct: ta.correct,
                wrong: ta.wrong,
                empty: ta.empty,
                net,
                // Şimdilik geçici – birazdan gerçek öncelik seviyesini hata oranına göre atayacağız
                priorityLevel: getPriorityLevelFromRatio(successRatio),
            });
            topicPriorities[topicPriorities.length - 1].errorRatio = errorRatio;
        }
    }
    // Öğrencinin en çok zorlandığı konuları belirlemek için:
    // - Önce hata oranına (yanlış + boş) göre azalan sırada sıralıyoruz.
    // - İlk 1/3'lük dilimi 1. öncelik, ikinci 1/3'lük dilimi 2. öncelik,
    //   kalanları 3. öncelik olarak işaretliyoruz.
    const sortedByError = [...topicPriorities].sort((a, b) => { var _a, _b; return ((_a = b.errorRatio) !== null && _a !== void 0 ? _a : 0) - ((_b = a.errorRatio) !== null && _b !== void 0 ? _b : 0); });
    const n = sortedByError.length;
    let oneCount = 0;
    let twoCount = 0;
    let threeCount = 0;
    if (n > 0) {
        const firstCut = Math.max(1, Math.floor(n / 3));
        const secondCut = Math.max(firstCut + 1, Math.floor((2 * n) / 3));
        sortedByError.forEach((tp, index) => {
            let level;
            if (index < firstCut) {
                level = 'ONE';
                oneCount++;
            }
            else if (index < secondCut) {
                level = 'TWO';
                twoCount++;
            }
            else {
                level = 'THREE';
                threeCount++;
            }
            tp.priorityLevel = level;
        });
    }
    return {
        examId: examResult.examId,
        examName: examResult.exam.name,
        examType: examResult.exam.type,
        date: examResult.exam.date,
        totalNet: examResult.totalNet,
        score: examResult.score,
        percentile: examResult.percentile,
        topicPriorities,
        priorityCounts: {
            one: oneCount,
            two: twoCount,
            three: threeCount,
        },
    };
}
/**
 * Çoklu sınav için "NETLER VE PUANLAR" tablosu verisi.
 * Her satır bir sınav; her satır içinde ders bazlı net, doğru, yanlış, boş bilgileri bulunur.
 */
async function getMultiExamBranchTable(studentId, examLimit = 10) {
    var _a, _b;
    const sid = typeof studentId === 'number' ? String(studentId) : studentId;
    const results = await db_1.prisma.examResult.findMany({
        where: { studentId: sid },
        orderBy: { createdAt: 'asc' },
        take: examLimit,
        include: {
            exam: true,
            details: {
                include: {
                    lesson: true,
                    topicAnalyses: true,
                },
            },
        },
    });
    const lessonNameSet = new Set();
    const rows = [];
    for (const res of results) {
        const lessonMap = new Map();
        for (const detail of res.details) {
            const lessonName = (_b = (_a = detail.lesson) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : 'Genel';
            let stats = lessonMap.get(lessonName);
            if (!stats) {
                stats = {
                    lessonName,
                    questionCount: 0,
                    correct: 0,
                    wrong: 0,
                    empty: 0,
                    net: 0,
                };
                lessonMap.set(lessonName, stats);
            }
            for (const ta of detail.topicAnalyses) {
                stats.questionCount += ta.totalQuestion;
                stats.correct += ta.correct;
                stats.wrong += ta.wrong;
                stats.empty += ta.empty;
            }
            // 4 yanlış 1 doğru götürür varsayımı
            stats.net = stats.correct - stats.wrong * 0.25;
            lessonNameSet.add(lessonName);
        }
        rows.push({
            examId: res.examId,
            examName: res.exam.name,
            examType: res.exam.type,
            date: res.exam.date,
            lessons: Array.from(lessonMap.values()),
        });
    }
    return {
        rows,
        lessonNames: Array.from(lessonNameSet).sort(),
    };
}
/**
 * Tek bir sınav için "KONU GRUBU ANALİZİ" verisi.
 * TopicPriority çıktısını, tahmini konu gruplarına göre toplar.
 */
async function getTopicGroupAnalysisForExam(studentId, examId) {
    const base = await getExamAnalysisForStudent(studentId, examId);
    if (!base)
        return null;
    const groupMap = new Map();
    for (const tp of base.topicPriorities) {
        const groupName = inferTopicGroup(tp.lessonName, tp.topicName);
        const key = `${tp.lessonName}__${groupName}`;
        let row = groupMap.get(key);
        if (!row) {
            row = {
                lessonName: tp.lessonName,
                groupName,
                questionCount: 0,
                correct: 0,
                wrong: 0,
                empty: 0,
                successPercent: 0,
                scoreLoss: 0,
            };
            groupMap.set(key, row);
        }
        row.questionCount += tp.totalQuestion;
        row.correct += tp.correct;
        row.wrong += tp.wrong;
        row.empty += tp.empty;
    }
    // Yüzde ve kayıp puanları hesapla
    for (const row of groupMap.values()) {
        row.successPercent =
            row.questionCount > 0 ? (row.correct / row.questionCount) * 100 : 0;
        // Basit kayıp puan tahmini: yanlış + boş
        row.scoreLoss = row.wrong + row.empty;
    }
    const rows = Array.from(groupMap.values()).sort((a, b) => {
        if (a.lessonName === b.lessonName)
            return a.groupName.localeCompare(b.groupName);
        return a.lessonName.localeCompare(b.lessonName);
    });
    return {
        examId: base.examId,
        examName: base.examName,
        examType: base.examType,
        date: base.date,
        rows,
    };
}
/**
 * "Eğer 1. öncelikli konuları halledersen puanın X olur" simülasyonu.
 * Basit katsayı: her öncelik grubu için iyileşme potansiyeli.
 */
function simulateImprovement(currentScore, onePriorityCount, twoPriorityCount, threePriorityCount) {
    const improvementPerOne = 3;
    const improvementPerTwo = 1.5;
    const improvementPerThree = 0.5;
    const projectedScore = currentScore +
        onePriorityCount * improvementPerOne +
        twoPriorityCount * improvementPerTwo +
        threePriorityCount * improvementPerThree;
    // Sıralama tahmini (basit: puan arttıkça yüzdelik iyileşir)
    const currentRank = null;
    const projectedRank = null;
    return {
        currentScore,
        projectedScore,
        currentRank,
        projectedRank,
    };
}
/**
 * Öğrencinin girdiği son N sınavın ortalamasını alarak gelişim grafiği verisi üretir.
 */
async function getStudentProgress(studentId, limit = 5) {
    const sid = typeof studentId === 'number' ? String(studentId) : studentId;
    const results = await db_1.prisma.examResult.findMany({
        where: { studentId: sid },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: { exam: true },
    });
    const exams = results
        .sort((a, b) => a.exam.date.getTime() - b.exam.date.getTime())
        .map((r) => ({
        examId: r.examId,
        examName: r.exam.name,
        examType: r.exam.type,
        date: r.exam.date,
        score: r.score,
        totalNet: r.totalNet,
    }));
    const averageScore = exams.length > 0 ? exams.reduce((s, e) => s + e.score, 0) / exams.length : 0;
    const averageNet = exams.length > 0 ? exams.reduce((s, e) => s + e.totalNet, 0) / exams.length : 0;
    return {
        studentId: sid,
        exams,
        averageScore,
        averageNet,
    };
}
//# sourceMappingURL=analysisService.js.map