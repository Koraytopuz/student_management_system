import { RankComparison, TopicPerformance, PriorityAnalysis, WhatIfProjection, ExamCoefficients, ExamType } from '../types/exam.types';
/**
 * Sınav katsayılarını döndürür
 */
export declare function getExamCoefficients(examType: ExamType): ExamCoefficients;
/**
 * Sıralama simülasyonu - Geçmiş yıl verileriyle karşılaştırma
 */
export declare function calculateRankSimulation(score: number, examType: ExamType): Promise<RankComparison>;
/**
 * Öncelik analizi - Konuları yanlış oranına göre önceliklendir
 */
export declare function analyzePriority(topicPerformances: TopicPerformance[], examType: ExamType): PriorityAnalysis;
/**
 * What-If Projeksiyonu - Belirli öncelik seviyesindeki konuları halletseydi ne olurdu?
 */
export declare function calculateWhatIf(examResultId: number, priorityLevel: 1 | 2 | 3, examType: ExamType): Promise<WhatIfProjection>;
/**
 * Konu performanslarını veritabanından çek ve analiz et
 */
export declare function getTopicPerformancesForExamResult(examResultId: number): Promise<TopicPerformance[]>;
//# sourceMappingURL=examService.d.ts.map