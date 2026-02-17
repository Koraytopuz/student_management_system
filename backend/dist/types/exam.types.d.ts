export interface RankComparison {
    currentYear: {
        year: number;
        rank: number;
    };
    previousYear: {
        year: number;
        rank: number;
    };
    change: number;
}
export interface TopicPerformance {
    id: number;
    topicId: string;
    topicName: string;
    lessonName: string;
    totalQuestion: number;
    correct: number;
    wrong: number;
    empty: number;
    net: number;
    priorityLevel: 'ONE' | 'TWO' | 'THREE';
    lostPoints: number;
    wrongRate: number;
}
export interface PriorityAnalysis {
    priority1: TopicPerformance[];
    priority2: TopicPerformance[];
    priority3: TopicPerformance[];
    totalLostPoints: number;
}
export interface WhatIfProjection {
    currentScore: number;
    projectedScore: number;
    scoreDifference: number;
    currentRank: number;
    projectedRank: number;
    rankImprovement: number;
    affectedTopics: string[];
}
export interface ExamCoefficients {
    [lessonName: string]: number;
}
export type ExamType = 'LGS' | 'TYT' | 'AYT_SAY' | 'AYT_SOZ' | 'AYT_EA' | 'ARA_SINIF';
export type PriorityLevel = 'ONE' | 'TWO' | 'THREE';
//# sourceMappingURL=exam.types.d.ts.map