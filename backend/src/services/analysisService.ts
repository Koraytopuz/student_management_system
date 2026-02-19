import { prisma } from '../db';

type PriorityLevelType = 'ONE' | 'TWO' | 'THREE';

// ----------------- Tipler -----------------

// Tek bir konu için analiz sonucu
export interface TopicPriority {
  lessonName: string;
  topicName: string;
  totalQuestion: number;
  correct: number;
  wrong: number;
  empty: number;
  net: number;
  priorityLevel: PriorityLevelType; // ONE / TWO / THREE
}

// Belirli bir sınav için öğrenci analizi
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
  /** Konu bazlı (TopicAnalysis) veri var mı; false ise yalnızca ders özeti kullanıldı */
  hasDetailedAnalysis: boolean;
}

// Çoklu sınav için "NETLER VE PUANLAR" tablosu satırı
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

// "KONU GRUBU ANALİZİ" için satır tipi
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

// ----------------- Yardımcı Fonksiyonlar -----------------

/**
 * Bir konudaki başarı yüzdesini hesaplar.
 */
export function calculateTopicSuccessRatio(correct: number, totalQuestion: number): number {
  if (!totalQuestion || totalQuestion <= 0) return 0;
  return (correct / totalQuestion) * 100;
}

/**
 * Başarı oranına göre öncelik seviyesi atar.
 * - %0–30   -> 1. Öncelik (PriorityLevel.ONE)
 * - %30–60  -> 2. Öncelik (PriorityLevel.TWO)
 * - %60–80  -> 3. Öncelik (PriorityLevel.THREE)
 * - %80+    -> 3. Öncelik (iyi durumda; istersen ayrı enum da ekleyebilirsin)
 */
export function getPriorityLevelFromRatio(ratio: number): PriorityLevelType {
  if (ratio < 30) return 'ONE';
  if (ratio < 60) return 'TWO';
  if (ratio < 80) return 'THREE';
  return 'THREE';
}

/**
 * "Konu grubu" tahmini – referans PDF'teki gibi Dil Bilgisi / Paragraf / 1. Dönem vb.
 * Bu sadece temel bir iskelet; ileride ihtiyaç oldukça genişletilebilir.
 */
export function inferTopicGroup(lessonName: string, topicName: string): string {
  const combined = `${lessonName} ${topicName}`.toLowerCase();

  // Türkçe örnekleri
  if (combined.includes('paragraf')) return 'Paragraf';
  if (
    combined.includes('dil bilgisi') ||
    combined.includes('fiilimsi') ||
    combined.includes('yazım') ||
    combined.includes('noktalama')
  ) {
    return 'Dil Bilgisi';
  }
  if (combined.includes('1. dönem') || combined.includes('1.dönem') || combined.includes('1 donem')) {
    return '1. Dönem';
  }
  if (combined.includes('2. dönem') || combined.includes('2.dönem') || combined.includes('2 donem')) {
    return '2. Dönem';
  }

  // Genel fen / matematik blokları (örnek)
  if (combined.includes('mevsimler') || combined.includes('iklim')) return 'Mevsimler ve İklim';
  if (combined.includes('dna') || combined.includes('genetik')) return 'DNA ve Genetik';
  if (combined.includes('çarpanlar') || combined.includes('katlar')) return 'Çarpanlar ve Katlar';
  if (combined.includes('olasılık')) return 'Olasılık';

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
export async function getExamAnalysisForStudent(
  studentId: string | number,
  examId: number
): Promise<ExamAnalysis | null> {
  const sid = typeof studentId === 'number' ? String(studentId) : studentId;
  const examResult = await (prisma as any).examResult.findFirst({
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

  const topicPriorities: TopicPriority[] = [];
  let hadTopicAnalyses = false;

  // Önce tüm konuları toplayalım; başarı oranı ve hata oranını hesaplayalım.
  for (const detail of examResult.details) {
    for (const ta of detail.topicAnalyses) {
      hadTopicAnalyses = true;
      const totalQ = ta.totalQuestion || 0;
      const successRatio = calculateTopicSuccessRatio(ta.correct, totalQ);
      const errorRatio =
        totalQ > 0 ? ((ta.wrong + ta.empty) / totalQ) * 100 : 0;
      const net = ta.correct - ta.wrong * 0.25; // 4 yanlış 1 doğru götürür varsayımı

      topicPriorities.push({
        lessonName: detail.lesson.name,
        topicName: ta.topic.name,
        totalQuestion: totalQ,
        correct: ta.correct,
        wrong: ta.wrong,
        empty: ta.empty,
        net,
        priorityLevel: getPriorityLevelFromRatio(successRatio),
      } as TopicPriority & { errorRatio?: number });
      (topicPriorities[topicPriorities.length - 1] as any).errorRatio = errorRatio;
    }
  }

  // Konu analizi yoksa ama ders detayı varsa: ders bazlı özeti konu gibi kullan (gerçek veri)
  if (topicPriorities.length === 0 && examResult.details?.length > 0) {
    for (const detail of examResult.details) {
      const totalQ = detail.correct + detail.wrong + detail.empty;
      const successRatio = calculateTopicSuccessRatio(detail.correct, totalQ);
      const errorRatio =
        totalQ > 0 ? ((detail.wrong + detail.empty) / totalQ) * 100 : 0;
      const lessonName = detail.lesson?.name ?? detail.lessonName ?? 'Genel';
      topicPriorities.push({
        lessonName,
        topicName: lessonName,
        totalQuestion: totalQ,
        correct: detail.correct,
        wrong: detail.wrong,
        empty: detail.empty,
        net: detail.net ?? Math.max(0, detail.correct - detail.wrong * 0.25),
        priorityLevel: getPriorityLevelFromRatio(successRatio),
      } as TopicPriority & { errorRatio?: number });
      (topicPriorities[topicPriorities.length - 1] as any).errorRatio = errorRatio;
    }
  }

  // Öğrencinin en çok zorlandığı konuları belirlemek için:
  // - Önce hata oranına (yanlış + boş) göre azalan sırada sıralıyoruz.
  // - İlk 1/3'lük dilimi 1. öncelik, ikinci 1/3'lük dilimi 2. öncelik,
  //   kalanları 3. öncelik olarak işaretliyoruz.
  const sortedByError = [...topicPriorities].sort(
    (a: any, b: any) => (b.errorRatio ?? 0) - (a.errorRatio ?? 0),
  );

  const n = sortedByError.length;
  let oneCount = 0;
  let twoCount = 0;
  let threeCount = 0;

  if (n > 0) {
    const firstCut = Math.max(1, Math.floor(n / 3));
    const secondCut = Math.max(firstCut + 1, Math.floor((2 * n) / 3));

    sortedByError.forEach((tp, index) => {
      let level: PriorityLevelType;
      if (index < firstCut) {
        level = 'ONE';
        oneCount++;
      } else if (index < secondCut) {
        level = 'TWO';
        twoCount++;
      } else {
        level = 'THREE';
        threeCount++;
      }
      (tp as any).priorityLevel = level;
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
    hasDetailedAnalysis: hadTopicAnalyses,
  };
}

/**
 * Çoklu sınav için "NETLER VE PUANLAR" tablosu verisi.
 * Her satır bir sınav; her satır içinde ders bazlı net, doğru, yanlış, boş bilgileri bulunur.
 */
export async function getMultiExamBranchTable(
  studentId: string | number,
  examLimit = 10
): Promise<MultiExamBranchTable> {
  const sid = typeof studentId === 'number' ? String(studentId) : studentId;

  const results = await (prisma as any).examResult.findMany({
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

  const lessonNameSet = new Set<string>();
  const rows: BranchNetRow[] = [];

  for (const res of results) {
    const lessonMap = new Map<string, BranchNetLessonStats>();

    for (const detail of res.details) {
      const lessonName: string = detail.lesson?.name ?? 'Genel';
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
export async function getTopicGroupAnalysisForExam(
  studentId: string | number,
  examId: number
): Promise<TopicGroupAnalysis | null> {
  const base = await getExamAnalysisForStudent(studentId, examId);
  if (!base) return null;

  const groupMap = new Map<string, TopicGroupRow>();

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
    if (a.lessonName === b.lessonName) return a.groupName.localeCompare(b.groupName);
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

// ----------------- Kazanım Tahmini -----------------

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
export function simulateImprovement(
  currentScore: number,
  onePriorityCount: number,
  twoPriorityCount: number,
  threePriorityCount: number
): ProjectionResult {
  const improvementPerOne = 3;
  const improvementPerTwo = 1.5;
  const improvementPerThree = 0.5;

  const projectedScore =
    currentScore +
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

// ----------------- Kümülatif Analiz (Gelişim Grafiği) -----------------

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
export async function getStudentProgress(
  studentId: string | number,
  limit = 5
): Promise<ProgressResponse> {
  const sid = typeof studentId === 'number' ? String(studentId) : studentId;

  const results = await (prisma as any).examResult.findMany({
    where: { studentId: sid },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { exam: true },
  });

  const exams = results
    .sort((a: any, b: any) => a.exam.date.getTime() - b.exam.date.getTime())
    .map((r: any) => ({
      examId: r.examId,
      examName: r.exam.name,
      examType: r.exam.type,
      date: r.exam.date,
      score: r.score,
      totalNet: r.totalNet,
    }));

  const averageScore = exams.length > 0 ? exams.reduce((s: number, e: any) => s + e.score, 0) / exams.length : 0;
  const averageNet = exams.length > 0 ? exams.reduce((s: number, e: any) => s + e.totalNet, 0) / exams.length : 0;

  return {
    studentId: sid,
    exams,
    averageScore,
    averageNet,
  };
}