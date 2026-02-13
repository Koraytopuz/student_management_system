import React, { useEffect, useMemo, useState } from 'react';
import { Download, Send, User } from 'lucide-react';
import { useAuth } from '../../AuthContext';
import {
  apiRequest,
  type ExamListItem,
  downloadAnalysisPdf,
  sendAnalysisPdf,
  getAnalysisPdfObjectUrl,
  getAnalysisProgress,
  createSampleExamForAli12Say,
  getExamAnalysis,
} from '../../api';
import { GlassCard } from '../../components/DashboardPrimitives';
import StudentAnalysisReport, {
  type AnalysisData,
} from '../../components/StudentAnalysisReport';
import SubjectAnalysisReport, {
  type SubjectAnalysisData,
  type TopicRow,
} from '../../components/SubjectAnalysisReport';
import CourseAnalysisReport, {
  type CourseAnalysisData,
  type CourseRow,
} from '../../components/CourseAnalysisReport';
import SubjectDetailReport, {
  type SubjectDetailData as SubjectDetailDataUI,
  type SubjectBlock as SubjectBlockUI,
  type TopicDetail as TopicDetailUI,
} from '../../components/SubjectDetailReport';
import ThirdPriorityReport, {
  type ThirdPriorityData,
  type PriorityTopic,
} from '../../components/ThirdPriorityReport';

interface StudentOption {
  id: string;
  name: string;
  email: string;
  gradeLevel?: string;
  classId?: string;
}

export const PersonalizedReport: React.FC = () => {
  const { token } = useAuth();
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [exams, setExams] = useState<ExamListItem[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [selectedExamId, setSelectedExamId] = useState<number | ''>('');
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [sendingTo, setSendingTo] = useState<'parent' | 'student' | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [creatingSampleExam, setCreatingSampleExam] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [subjectAnalysis, setSubjectAnalysis] = useState<SubjectAnalysisData | null>(null);
  const [courseAnalysis, setCourseAnalysis] = useState<CourseAnalysisData | null>(null);
  const [subjectDetail, setSubjectDetail] = useState<SubjectDetailDataUI | null>(null);
  const [thirdPriority, setThirdPriority] = useState<ThirdPriorityData | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    apiRequest<StudentOption[]>('/admin/students', {}, token)
      .then((studentsRes) => {
        setStudents(studentsRes);
        if (studentsRes.length > 0 && !selectedStudentId) {
          setSelectedStudentId(studentsRes[0].id);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Veri yüklenemedi'))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (exams.length > 0 && selectedExamId === '') {
      setSelectedExamId(exams[0].id);
    }
  }, [exams, selectedExamId]);

  // Seçili öğrenci + sınav için analiz verisini çek ve StudentAnalysisReport'a map et
  useEffect(() => {
    if (!token || !selectedStudentId || selectedExamId === '') {
      setAnalysis(null);
      setSubjectAnalysis(null);
      setCourseAnalysis(null);
      setSubjectDetail(null);
      setThirdPriority(null);
      return;
    }

    setAnalysisLoading(true);
    getExamAnalysis(token, selectedStudentId, selectedExamId as number)
      .then((res) => {
        const student = students.find((s) => s.id === selectedStudentId);

        // Ders bazlı netler – topicPriorities üzerinden grupla
        const byLesson: Record<
          string,
          { questionCount: number; net: number; correct: number; wrong: number; empty: number }
        > = {};
        res.topicPriorities.forEach((t) => {
          if (!byLesson[t.lessonName]) {
            byLesson[t.lessonName] = {
              questionCount: 0,
              net: 0,
              correct: 0,
              wrong: 0,
              empty: 0,
            };
          }
          byLesson[t.lessonName].questionCount += t.totalQuestion;
          byLesson[t.lessonName].net += t.net;
          byLesson[t.lessonName].correct += t.correct;
          byLesson[t.lessonName].wrong += t.wrong;
          byLesson[t.lessonName].empty += t.empty;
        });

        const getNet = (name: string) => byLesson[name]?.net ?? 0;

        const turkce = getNet('Türkçe');
        const inkilap = getNet('İnkılap Tarihi ve Atatürkçülük');
        const din = getNet('Din Kültürü');
        const ingilizce = getNet('İngilizce');
        const matematik = getNet('Matematik');
        const fen = getNet('Fen Bilimleri');
        const total = turkce + inkilap + din + ingilizce + matematik + fen;

        // Önceliklere göre konu sayıları
        const level1 = res.priorityCounts.one;
        const level2 = res.priorityCounts.two;
        const level3 = res.priorityCounts.three;

        // Basit puan projeksiyonları (backend'deki simulateImprovement mantığına benzer)
        const currentPuan = res.score;
        const currentPercentile = res.percentile;
        const improvementPerOne = 3;
        const improvementPerTwo = 1.5;
        const improvementPerThree = 0.5;

        const level1Puan = currentPuan + level1 * improvementPerOne;
        const level2Puan = level1Puan + level2 * improvementPerTwo;
        const level3Puan = level2Puan + level3 * improvementPerThree;

        const makePercentile = (delta: number) =>
          Math.max(1, Math.min(99, currentPercentile - delta));

        const analysisData: AnalysisData = {
          studentName: student?.name ?? res.examName,
          subjectNets: {
            turkce,
            inkilap,
            din,
            ingilizce,
            matematik,
            fen,
            total,
          },
          currentStatus: { puan: currentPuan, percentile: currentPercentile },
          priorityTopics: {
            total: res.topicPriorities.length,
            levels: {
              level1,
              level2,
              level3,
            },
          },
          projections: {
            current: { puan: currentPuan, percentile: currentPercentile },
            level1: { puan: level1Puan, percentile: makePercentile(level1 * 0.4) },
            level2: { puan: level2Puan, percentile: makePercentile(level1 * 0.4 + level2 * 0.3) },
            level3: {
              puan: level3Puan,
              percentile: makePercentile(level1 * 0.4 + level2 * 0.3 + level3 * 0.2),
            },
          },
        };

        setAnalysis(analysisData);

        // --- Konu Grubu Analizi bileşeni için veri hazırla (TopicRow) ---
        const topicRows: TopicRow[] = res.topicPriorities.map((tp, idx) => {
          const totalQ = tp.totalQuestion || 0;
          const success = totalQ > 0 ? (tp.correct / totalQ) * 100 : 0;
          return {
            id: `${idx}-${tp.lessonName}-${tp.topicName}`,
            subject: tp.lessonName,
            topic: tp.topicName,
            questionCount: totalQ,
            lgsPercent: success,
            acquiredScore: tp.net,
            // Basit kayıp puan tahmini: yanlış + boş
            lostScore: tp.wrong + tp.empty,
          };
        });

        setSubjectAnalysis({
          studentName: student?.name ?? res.examName,
          reportDate: res.date,
          topics: topicRows,
        });

        // --- Ders Analizi bileşeni için veri hazırla (CourseRow) ---
        const courseRows: CourseRow[] = Object.entries(byLesson).map(
          ([lessonName, stats]) => {
            const totalQ = stats.questionCount || 0;
            const success =
              totalQ > 0 ? (stats.net / totalQ) * 100 : 0;
            const lost = stats.wrong + stats.empty;
            return {
              courseName: lessonName,
              questionCount: totalQ,
              correct: stats.correct,
              wrong: stats.wrong,
              empty: stats.empty,
              net: stats.net,
              lostScore: lost,
              successPercent: success,
            };
          },
        );

        setCourseAnalysis({
          studentName: student?.name ?? res.examName,
          reportDate: res.date,
          courses: courseRows,
        });

        // --- Ders bazlı konu detayları (SubjectDetailReport) için veri hazırla ---
        const blocksMap = new Map<string, TopicDetailUI[]>();
        res.topicPriorities.forEach((tp) => {
          const list = blocksMap.get(tp.lessonName) ?? [];
          const totalQ = tp.totalQuestion || 0;
          const percent = totalQ > 0 ? (tp.correct / totalQ) * 100 : 0;
          const detail: TopicDetailUI = {
            topicName: tp.topicName,
            questionCount: totalQ,
            correct: tp.correct,
            wrong: tp.wrong,
            empty: tp.empty,
            net: tp.net,
            lostScore: tp.wrong + tp.empty,
            percent,
          };
          list.push(detail);
          blocksMap.set(tp.lessonName, list);
        });

        const subjectBlocks: SubjectBlockUI[] = Array.from(blocksMap.entries()).map(
          ([subjectName, topics]) => ({
            subjectName,
            topics,
          }),
        );

        setSubjectDetail({
          studentName: student?.name ?? res.examName,
          reportDate: res.date,
          subjects: subjectBlocks,
        });

        // --- 3. Öncelikli (Destekleyici) konular raporu için veri hazırla ---
        const thirdTopics: PriorityTopic[] = res.topicPriorities
          .filter((tp) => tp.priorityLevel === 'THREE')
          .map((tp, idx) => {
            const totalQ = tp.totalQuestion || 0;
            const success = totalQ > 0 ? (tp.correct / totalQ) * 100 : 0;
            return {
              id: `third-${idx}-${tp.lessonName}-${tp.topicName}`,
              subject: tp.lessonName,
              topic: tp.topicName,
              question: totalQ,
              correct: tp.correct,
              wrong: tp.wrong,
              empty: tp.empty,
              net: tp.net,
              lostScore: tp.wrong + tp.empty,
              successPercent: success,
            };
          });

        const scoreIncreaseThird = level3Puan - currentPuan;

        setThirdPriority({
          studentName: student?.name ?? res.examName,
          reportDate: res.date,
          targetScore: level3Puan,
          scoreIncrease: scoreIncreaseThird,
          topics: thirdTopics,
        });
      })
      .catch(() => {
        setAnalysis(null);
        setSubjectAnalysis(null);
        setCourseAnalysis(null);
        setSubjectDetail(null);
        setThirdPriority(null);
      })
      .finally(() => {
        setAnalysisLoading(false);
      });
  }, [token, selectedStudentId, selectedExamId, students]);

  // Seçili öğrenciye göre sadece o öğrencinin girdiği sınavları getir
  useEffect(() => {
    if (!token || !selectedStudentId) {
      setExams([]);
      return;
    }
    setError(null);
    getAnalysisProgress(token, selectedStudentId, 20)
      .then((res) => {
        const mapped: ExamListItem[] = res.exams.map((e) => ({
          id: e.examId,
          name: e.examName,
          type: e.examType, // TYT, LGS, AYT...
          date: e.date,
        }));
        setExams(mapped);
        if (mapped.length > 0) {
          setSelectedExamId((prev) => (prev === '' ? mapped[0].id : prev));
        } else {
          setSelectedExamId('');
        }
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Sınav listesi yüklenemedi'),
      );
  }, [token, selectedStudentId]);

  // Sınıf seçenekleri (öğrencilerin gradeLevel değerlerinden türetilir)
  const classOptions = useMemo(
    () =>
      Array.from(
        new Set(
          students
            .map((s) => s.gradeLevel)
            .filter((g): g is string => !!g),
        ),
      ).sort(),
    [students],
  );

  const filteredStudents = useMemo(
    () =>
      selectedClass
        ? students.filter((s) => s.gradeLevel === selectedClass)
        : students,
    [students, selectedClass],
  );

  // Seçili sınıf düzeyine göre hangi sınav tiplerinin gösterileceğini belirle
  const filteredExams = useMemo(() => {
    if (exams.length === 0) return exams;

    const currentStudent = students.find((s) => s.id === selectedStudentId);
    const gradeRaw = (currentStudent?.gradeLevel || selectedClass || '').toString().trim();

    if (!gradeRaw) {
      return exams;
    }

    // "11. Sınıf", "9 SAY", "12. sınıf (sayısal)" gibi değerlerden sadece sayısal kısmı çek
    const numericMatch = gradeRaw.match(/\d+/);
    const normalizedGrade = (numericMatch ? numericMatch[0] : gradeRaw).toUpperCase();

    const isHighSchool =
      ['9', '10', '11', '12'].includes(normalizedGrade) ||
      normalizedGrade === 'MEZUN';

    const isMiddleSchool = ['7', '8'].includes(normalizedGrade);

    const result = exams.filter((exam) => {
      const t = exam.type?.toUpperCase() ?? '';

      if (!t) return true;

      // LGS sınavları ağırlıklı olarak 8. sınıf için
      if (t === 'LGS') {
        return isMiddleSchool;
      }

      // TYT sınavları 9–12 ve mezun tarafından görülmeli
      if (t === 'TYT') {
        return isHighSchool;
      }

      // AYT türevleri (AYT, AYT_SAY, AYT_SOZ, AYT_EA) – 11, 12, mezun
      if (t.startsWith('AYT')) {
        return (
          ['11', '12'].includes(normalizedGrade) || normalizedGrade === 'MEZUN'
        );
      }

      // Ara sınıf sınavları – şimdilik herkese açık bırak
      if (t === 'ARA_SINIF') {
        return true;
      }

      return true;
    });

    // Eğer filtre sonucunda hiç sınav kalmadıysa, öğrencinin girdiği
    // sınavları tamamen kaybetmemek için orijinal listeye geri dön.
    return result.length > 0 ? result : exams;
  }, [exams, students, selectedStudentId, selectedClass]);

  useEffect(() => {
    if (!selectedClass) return;
    const eligible = students.filter((s) => s.gradeLevel === selectedClass);
    if (eligible.length === 0) {
      setSelectedStudentId('');
      return;
    }
    if (!eligible.some((s) => s.id === selectedStudentId)) {
      setSelectedStudentId(eligible[0].id);
    }
  }, [selectedClass, students, selectedStudentId]);

  const handleOpenPreview = async () => {
    if (!token || !selectedStudentId || selectedExamId === '') return;
    setPreviewLoading(true);
    try {
      const url = await getAnalysisPdfObjectUrl(
        token,
        selectedStudentId,
        selectedExamId as number,
      );
      setPreviewUrl(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'PDF indirilemedi');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleClosePreview = () => {
    if (previewUrl) {
      window.URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
  };

  const handleDownloadFromPreview = async () => {
    if (!token || !selectedStudentId || selectedExamId === '') return;
    setDownloading(true);
    try {
      await downloadAnalysisPdf(token, selectedStudentId, selectedExamId as number);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'PDF indirilemedi');
      return;
    } finally {
      setDownloading(false);
    }
    handleClosePreview();
  };

  const handleSend = async (target: 'parent' | 'student') => {
    if (!token || !selectedStudentId || selectedExamId === '') return;
    setSendingTo(target);
    try {
      await sendAnalysisPdf(token, selectedStudentId, selectedExamId as number, target);
      alert(target === 'parent' ? 'Rapor veliye bildirim olarak gönderildi.' : 'Rapor öğrenciye bildirim olarak gönderildi.');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Gönderilemedi');
    } finally {
      setSendingTo(null);
    }
  };

  const handleCreateSampleExam = async () => {
    if (!token) return;
    setCreatingSampleExam(true);
    setError(null);
    try {
      const res = await createSampleExamForAli12Say(token);

      // Örneği oluşturduğumuz öğrenciyi otomatik seç
      let sid = selectedStudentId;
      if (res.student?.id) {
        sid = res.student.id;
        setSelectedStudentId(res.student.id);
        if (res.student.gradeLevel) {
          setSelectedClass(String(res.student.gradeLevel));
        }
      }

      // Kullanıcıya sonucu hemen bildir
      alert(res.message ?? 'Örnek TYT sınavı ve sınav sonucu oluşturuldu / güncellendi.');

      // Backend yanıtından sınav bilgisini doğrudan al ve listeye ekle
      if (res.exam) {
        const examItem: ExamListItem = {
          id: res.exam.id,
          name: res.exam.name,
          type: res.exam.type,
          date: res.exam.date,
        };

        setExams((prev) => {
          const exists = prev.some((e) => e.id === examItem.id);
          const next = exists ? prev : [...prev, examItem];
          return next;
        });
        setSelectedExamId(res.exam.id);
      } else if (sid) {
        // Güvenlik için: exam alanı yoksa, en azından mevcut progressten yeniden yüklemeye çalış
        try {
          const progress = await getAnalysisProgress(token, sid, 20);
          const mapped: ExamListItem[] = progress.exams.map((e) => ({
            id: e.examId,
            name: e.examName,
            type: e.examType,
            date: e.date,
          }));
          setExams(mapped);
          if (mapped.length > 0) {
            setSelectedExamId(mapped[0].id);
          }
        } catch {
          // Sessiz geç
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Örnek sınav verisi oluşturulamadı.');
    } finally {
      setCreatingSampleExam(false);
    }
  };

  const canProceed = selectedStudentId && selectedExamId !== '';

  if (loading) {
    return (
      <div className="p-6 text-center text-slate-400">
        Öğrenci ve sınav listesi yükleniyor…
      </div>
    );
  }

  return (
    <GlassCard
      title="Kişiye Özel Rapor"
      subtitle="Öğrenci seçin, sınav seçin ve PDF rapor oluşturun veya veliye/öğrenciye bildirim olarak gönderin."
    >
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 text-red-400 text-sm mb-4">{error}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Sınıf</label>
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200"
          >
            <option value="">Tüm Sınıflar</option>
            {classOptions.map((cls) => (
              <option key={cls} value={cls}>
                {cls}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Öğrenci</label>
          <select
            value={selectedStudentId}
            onChange={(e) => setSelectedStudentId(e.target.value)}
            className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200"
          >
            <option value="">Öğrenci seçin</option>
            {filteredStudents.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} {s.gradeLevel ? `(${s.gradeLevel}. Sınıf)` : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Sınav</label>
          <select
            value={selectedExamId}
            onChange={(e) => setSelectedExamId(e.target.value ? Number(e.target.value) : '')}
            className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200"
          >
            <option value="">Sınav seçin</option>
            {filteredExams.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
                {e.type ? ` (${e.type})` : ''} –{' '}
                {new Date(e.date).toLocaleDateString('tr-TR')}
              </option>
            ))}
          </select>
        </div>
      </div>

      {analysisLoading && (
        <p className="text-xs text-slate-400 mb-4">Analiz verileri hazırlanıyor…</p>
      )}

      {analysis && !analysisLoading && (
        <div className="mb-6">
          <StudentAnalysisReport data={analysis} />
        </div>
      )}

      {subjectAnalysis && (
        <div className="mb-8">
          <SubjectAnalysisReport data={subjectAnalysis} />
        </div>
      )}

      {courseAnalysis && (
        <div className="mb-8">
          <CourseAnalysisReport data={courseAnalysis} />
        </div>
      )}

      {subjectDetail && (
        <div className="mb-8">
          <SubjectDetailReport data={subjectDetail} />
        </div>
      )}

      {thirdPriority && (
        <div className="mb-8">
          <ThirdPriorityReport data={thirdPriority} />
        </div>
      )}

      {exams.length === 0 && (
        <div className="mb-4 space-y-2 text-sm">
          <p className="text-amber-400">
            Henüz seçili öğrenci için sınav kaydı bulunamadı. Analiz raporu oluşturmak için önce bu öğrenciye ait
            en az bir sınav sonucu girilmelidir.
          </p>
          <button
            type="button"
            onClick={handleCreateSampleExam}
            disabled={!token || creatingSampleExam}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-emerald-500/60 text-emerald-200 text-xs hover:bg-emerald-500/10 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {creatingSampleExam ? 'Örnek sınav oluşturuluyor…' : '12. sınıf sayısal Ali için örnek TYT sınavı oluştur'}
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleOpenPreview}
          disabled={!canProceed || previewLoading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          <Download size={18} />
          {previewLoading ? 'Önizleme hazırlanıyor…' : 'PDF ile İndir'}
        </button>
        <button
          type="button"
          onClick={() => handleSend('student')}
          disabled={!canProceed || !!sendingTo}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          <User size={18} />
          {sendingTo === 'student' ? 'Gönderiliyor…' : 'Öğrenciye Gönder'}
        </button>
        <button
          type="button"
          onClick={() => handleSend('parent')}
          disabled={!canProceed || !!sendingTo}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 text-white font-medium hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          <Send size={18} />
          {sendingTo === 'parent' ? 'Gönderiliyor…' : 'Veliye Gönder'}
        </button>
      </div>

      <p className="text-xs text-slate-500 mt-4">
        «Veliye Gönder» ve «Öğrenciye Gönder» ile rapor ilgili kişiye bildirim olarak iletilir. Kullanıcı bildirime
        tıkladığında, bildirimin sonundaki «PDF İndir / Görüntüle» butonuna basarak rapora erişebilir.
      </p>

      {previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70">
          <div className="bg-slate-900 rounded-2xl shadow-xl max-w-5xl w-full mx-4 p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-100">
                PDF Önizleme – Kişiye Özel Rapor
              </h2>
              <button
                type="button"
                onClick={handleClosePreview}
                className="px-3 py-1.5 text-xs rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800"
              >
                Kapat
              </button>
            </div>
            <div className="bg-white rounded-lg overflow-hidden">
              <iframe
                src={previewUrl}
                title="Analiz PDF Önizleme"
                className="w-full h-[70vh] border-0"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleClosePreview}
                className="px-3 py-1.5 text-xs rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleDownloadFromPreview}
                disabled={downloading}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                <Download size={16} />
                {downloading ? 'İndiriliyor…' : 'PDF İndir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </GlassCard>
  );
};
