type PriorityLevelType = 'ONE' | 'TWO' | 'THREE';
export interface TopicPriority {
    lessonName: string;
    topicName: string;
    totalQuestion: number;
    correct: number;
    wrong: number;
    empty: number;
    net: number;
    priorityLevel: PriorityLevelType;
}
export interface ExamAnalysis {
    examId: number;
    examName: string;
    examType: string;
    date: Date;
    totalNet: number;
    score: number;
    percentile: number;
    topicPriorities: TopicPriority[];
    priorityCounts: {
        one: number;
        two: number;
        three: number;
    };
}
export interface BranchNetLessonStats {
    lessonName: string;
    questionCount: number;
    correct: number;
    wrong: number;
    empty: number;
    net: number;
}
export interface BranchNetRow {
    examId: number;
    examName: string;
    examType: string;
    date: Date;
    lessons: BranchNetLessonStats[];
}
export interface MultiExamBranchTable {
    rows: BranchNetRow[];
    /** Tabloda sütun başlıkları için kullanılacak ders isimleri (Türkçe, Matematik, Fen ...) */
    lessonNames: string[];
}
export interface TopicGroupRow {
    lessonName: string;
    groupName: string;
    questionCount: number;
    correct: number;
    wrong: number;
    empty: number;
    successPercent: number;
    /** Basit kayıp puan tahmini (ör: yanlış + boş) */
    scoreLoss: number;
}
export interface TopicGroupAnalysis {
    examId: number;
    examName: string;
    examType: string;
    date: Date;
    rows: TopicGroupRow[];
}
/**
 * Bir konudaki başarı yüzdesini hesaplar.
 */
export declare function calculateTopicSuccessRatio(correct: number, totalQuestion: number): number;
/**
 * Başarı oranına göre öncelik seviyesi atar.
 * - %0–30   -> 1. Öncelik (PriorityLevel.ONE)
 * - %30–60  -> 2. Öncelik (PriorityLevel.TWO)
 * - %60–80  -> 3. Öncelik (PriorityLevel.THREE)
 * - %80+    -> 3. Öncelik (iyi durumda; istersen ayrı enum da ekleyebilirsin)
 */
export declare function getPriorityLevelFromRatio(ratio: number): PriorityLevelType;
/**
 * "Konu grubu" tahmini – referans PDF'teki gibi Dil Bilgisi / Paragraf / 1. Dönem vb.
 * Bu sadece temel bir iskelet; ileride ihtiyaç oldukça genişletilebilir.
 */
export declare function inferTopicGroup(lessonName: string, topicName: string): string;
/**
 * Belirli bir öğrenci + sınav için:
 * - Ders/Konu bazlı doğru/yanlış/boş/net
 * - Konu bazlı başarı yüzdesi
 * - Öncelik seviyesi (1., 2., 3.)
 * hesaplar ve döner.
 */
export declare function getExamAnalysisForStudent(studentId: string | number, examId: number): Promise<ExamAnalysis | null>;
/**
 * Çoklu sınav için "NETLER VE PUANLAR" tablosu verisi.
 * Her satır bir sınav; her satır içinde ders bazlı net, doğru, yanlış, boş bilgileri bulunur.
 */
export declare function getMultiExamBranchTable(studentId: string | number, examLimit?: number): Promise<MultiExamBranchTable>;
/**
 * Tek bir sınav için "KONU GRUBU ANALİZİ" verisi.
 * TopicPriority çıktısını, tahmini konu gruplarına göre toplar.
 */
export declare function getTopicGroupAnalysisForExam(studentId: string | number, examId: number): Promise<TopicGroupAnalysis | null>;
export interface ProjectionResult {
    currentScore: number;
    projectedScore: number;
    currentRank: number | null;
    projectedRank: number | null;
}
/**
 * "Eğer 1. öncelikli konuları halledersen puanın X olur" simülasyonu.
 * Basit katsayı: her öncelik grubu için iyileşme potansiyeli.
 */
export declare function simulateImprovement(currentScore: number, onePriorityCount: number, twoPriorityCount: number, threePriorityCount: number): ProjectionResult;
export interface ProgressPoint {
    examId: number;
    examName: string;
    examType: string;
    date: Date;
    score: number;
    totalNet: number;
}
export interface ProgressResponse {
    studentId: string;
    exams: ProgressPoint[];
    averageScore: number;
    averageNet: number;
}
/**
 * Öğrencinin girdiği son N sınavın ortalamasını alarak gelişim grafiği verisi üretir.
 */
export declare function getStudentProgress(studentId: string | number, limit?: number): Promise<ProgressResponse>;
export {};
//# sourceMappingURL=analysisService.d.ts.map