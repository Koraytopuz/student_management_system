"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getExamCoefficients = getExamCoefficients;
exports.calculateRankSimulation = calculateRankSimulation;
exports.analyzePriority = analyzePriority;
exports.calculateWhatIf = calculateWhatIf;
exports.getTopicPerformancesForExamResult = getTopicPerformancesForExamResult;
const db_1 = require("../db");
// const prisma = new PrismaClient(); // Removed: Using centralized prisma client from src/db
/**
 * Sınav katsayılarını döndürür
 */
function getExamCoefficients(examType) {
    const coefficients = {
        TYT: {
            'Türkçe': 3.3,
            'Matematik': 3.3,
            'Fen Bilimleri': 3.3,
            'Sosyal Bilimler': 3.3,
        },
        AYT_SAY: {
            'Matematik': 3.0,
            'Fizik': 2.5,
            'Kimya': 2.5,
            'Biyoloji': 2.5,
        },
        AYT_SOZ: {
            'Türk Dili ve Edebiyatı': 3.0,
            'Tarih': 3.0,
            'Coğrafya': 3.0,
            'Felsefe': 3.0,
        },
        AYT_EA: {
            'Matematik': 2.5,
            'Türk Dili ve Edebiyatı': 2.5,
            'Tarih': 2.5,
            'Coğrafya': 2.5,
        },
        LGS: {
            'Türkçe': 1.0,
            'Matematik': 1.0,
            'Fen Bilimleri': 1.0,
            'İnkılap Tarihi': 1.0,
            'Din Kültürü': 1.0,
            'İngilizce': 1.0,
        },
        ARA_SINIF: {
            // Genel katsayı
            'default': 1.0,
        },
    };
    return coefficients[examType] || {};
}
/**
 * Sıralama simülasyonu - Geçmiş yıl verileriyle karşılaştırma
 */
async function calculateRankSimulation(score, examType) {
    // 2024 ve 2025 verilerini çek
    const [data2024, data2025] = await Promise.all([
        db_1.prisma.rankingScale.findMany({
            where: { year: 2024, examType },
            orderBy: { scoreRangeMin: 'asc' },
        }),
        db_1.prisma.rankingScale.findMany({
            where: { year: 2025, examType },
            orderBy: { scoreRangeMin: 'asc' },
        }),
    ]);
    // Interpolasyon fonksiyonu
    const interpolateRank = (data, targetScore) => {
        if (!data || data.length === 0)
            return 0;
        // Puanın düştüğü aralığı bul
        for (let i = 0; i < data.length; i++) {
            const current = data[i];
            if (!current)
                continue;
            if (targetScore >= current.scoreRangeMin && targetScore <= current.scoreRangeMax) {
                return current.estimatedRank;
            }
            // Aralıklar arasında interpolasyon
            if (i < data.length - 1) {
                const next = data[i + 1];
                if (!next)
                    continue;
                if (targetScore > current.scoreRangeMax && targetScore < next.scoreRangeMin) {
                    // Linear interpolation
                    const ratio = (targetScore - current.scoreRangeMax) / (next.scoreRangeMin - current.scoreRangeMax);
                    return Math.round(current.estimatedRank + ratio * (next.estimatedRank - current.estimatedRank));
                }
            }
        }
        const first = data[0];
        const last = data[data.length - 1];
        if (!first || !last)
            return 0;
        // En düşük veya en yüksek puan
        if (targetScore < first.scoreRangeMin) {
            return last.estimatedRank; // En kötü sıralama
        }
        return first.estimatedRank; // En iyi sıralama
    };
    const rank2024 = data2024.length > 0 ? interpolateRank(data2024, score) : 0;
    const rank2025 = data2025.length > 0 ? interpolateRank(data2025, score) : 0;
    return {
        currentYear: { year: 2025, rank: rank2025 },
        previousYear: { year: 2024, rank: rank2024 },
        change: rank2025 - rank2024, // pozitif = kötüleşme
    };
}
/**
 * Öncelik analizi - Konuları yanlış oranına göre önceliklendir
 */
function analyzePriority(topicPerformances, examType) {
    const coefficients = getExamCoefficients(examType);
    const priority1 = [];
    const priority2 = [];
    const priority3 = [];
    let totalLostPoints = 0;
    topicPerformances.forEach((topic) => {
        const wrongRate = topic.totalQuestion > 0 ? topic.wrong / topic.totalQuestion : 0;
        const coefficient = coefficients[topic.lessonName] || coefficients['default'] || 1.0;
        const lostPoints = topic.wrong * coefficient;
        const enrichedTopic = {
            ...topic,
            wrongRate,
            lostPoints,
        };
        totalLostPoints += lostPoints;
        // Önceliklendirme
        if (wrongRate > 0.6) {
            enrichedTopic.priorityLevel = 'ONE';
            priority1.push(enrichedTopic);
        }
        else if (wrongRate >= 0.3) {
            enrichedTopic.priorityLevel = 'TWO';
            priority2.push(enrichedTopic);
        }
        else {
            enrichedTopic.priorityLevel = 'THREE';
            priority3.push(enrichedTopic);
        }
    });
    // Kayıp puana göre sırala (en yüksek kayıp önce)
    const sortByLostPoints = (a, b) => b.lostPoints - a.lostPoints;
    priority1.sort(sortByLostPoints);
    priority2.sort(sortByLostPoints);
    priority3.sort(sortByLostPoints);
    return {
        priority1,
        priority2,
        priority3,
        totalLostPoints,
    };
}
/**
 * What-If Projeksiyonu - Belirli öncelik seviyesindeki konuları halletseydi ne olurdu?
 */
async function calculateWhatIf(examResultId, priorityLevel, examType) {
    // Sınav sonucunu ve detaylarını çek
    const examResult = await db_1.prisma.examResult.findUnique({
        where: { id: examResultId },
        include: {
            details: {
                include: {
                    topicAnalyses: true,
                },
            },
            exam: true,
        },
    });
    if (!examResult) {
        throw new Error('Exam result not found');
    }
    const coefficients = getExamCoefficients(examType);
    let currentScore = examResult.score;
    let projectedScore = currentScore;
    const affectedTopics = [];
    // Belirtilen öncelik seviyesindeki konuları bul
    const priorityMap = {
        1: 'ONE',
        2: 'TWO',
        3: 'THREE',
    };
    const targetPriority = priorityMap[priorityLevel];
    examResult.details.forEach((detail) => {
        const coefficient = coefficients[detail.lessonName] || coefficients['default'] || 1.0;
        detail.topicAnalyses.forEach((topic) => {
            if (topic.priorityLevel === targetPriority) {
                // Yanlışları doğruya çevir
                const additionalNet = topic.wrong;
                const additionalPoints = additionalNet * coefficient;
                projectedScore += additionalPoints;
                affectedTopics.push(topic.topicName);
            }
        });
    });
    // Mevcut ve projeksiyon sıralamalarını hesapla
    const [currentRankData, projectedRankData] = await Promise.all([
        calculateRankSimulation(currentScore, examType),
        calculateRankSimulation(projectedScore, examType),
    ]);
    return {
        currentScore,
        projectedScore,
        scoreDifference: projectedScore - currentScore,
        currentRank: currentRankData.currentYear.rank,
        projectedRank: projectedRankData.currentYear.rank,
        rankImprovement: currentRankData.currentYear.rank - projectedRankData.currentYear.rank,
        affectedTopics,
    };
}
/**
 * Konu performanslarını veritabanından çek ve analiz et
 */
async function getTopicPerformancesForExamResult(examResultId) {
    const examResult = await db_1.prisma.examResult.findUnique({
        where: { id: examResultId },
        include: {
            details: {
                include: {
                    topicAnalyses: true,
                },
            },
        },
    });
    if (!examResult) {
        throw new Error('Exam result not found');
    }
    const performances = [];
    examResult.details.forEach((detail) => {
        detail.topicAnalyses.forEach((topic) => {
            performances.push({
                id: topic.id,
                topicId: topic.topicId,
                topicName: topic.topicName,
                lessonName: detail.lessonName,
                totalQuestion: topic.totalQuestion,
                correct: topic.correct,
                wrong: topic.wrong,
                empty: topic.empty,
                net: topic.net,
                priorityLevel: topic.priorityLevel,
                lostPoints: topic.lostPoints,
                wrongRate: topic.totalQuestion > 0 ? topic.wrong / topic.totalQuestion : 0,
            });
        });
    });
    return performances;
}
//# sourceMappingURL=examService.js.map