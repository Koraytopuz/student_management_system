import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  CartesianGrid,
  LineChart,
  Line,
} from 'recharts';
import { Download, ArrowLeft, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '../../AuthContext';
import {
  getExamAnalysis,
  getAnalysisProgress,
  downloadAnalysisPdf,
  type ExamAnalysisResponse,
  type ProgressResponse,
} from '../../api';
import { Breadcrumb } from '../../components/DashboardPrimitives';

const COLORS = ['#ef4444', '#f59e0b', '#22c55e'];
const PRIORITY_LABELS: Record<string, string> = {
  ONE: '1. Öncelik (Acil)',
  TWO: '2. Öncelik (Orta)',
  THREE: '3. Öncelik (Destekleyici)',
};
const BADGE_SHORT: Record<string, string> = {
  ONE: 'Kırmızı (Acil)',
  TWO: 'Sarı (Orta)',
  THREE: 'Yeşil',
};

export const AnalysisReportPage: React.FC = () => {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const [data, setData] = useState<ExamAnalysisResponse | null>(null);
  const [progress, setProgress] = useState<ProgressResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [accordionOpen, setAccordionOpen] = useState<string | null>('ONE');

  const studentId = user?.id != null ? String(user.id).trim() : '';
  const examIdNum = examId != null && examId !== '' ? parseInt(examId, 10) : NaN;
  const validParams = Boolean(token && studentId && !isNaN(examIdNum) && examIdNum > 0);

  useEffect(() => {
    if (!validParams) {
      setLoading(false);
      if (!user) setError('Oturum açmanız gerekiyor.');
      else if (!examId || examId === 'undefined' || examId === 'null' || isNaN(examIdNum) || examIdNum <= 0)
        setError('Geçerli bir sınav numarası gerekli. Panele dönüp sınav kartına tıklayarak tekrar deneyin.');
      else if (!studentId) setError('Öğrenci bilgisi yüklenemedi. Çıkış yapıp tekrar giriş yapın.');
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      getExamAnalysis(token!, studentId, examIdNum),
      getAnalysisProgress(token!, studentId, 5),
    ])
      .then(([analysisRes, progressRes]) => {
        if (!cancelled) {
          setData(analysisRes);
          setProgress(progressRes);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Veri yüklenemedi';
          const friendly =
            msg.includes('studentId') || msg.includes('examId')
              ? 'Bu sınav için analiz bulunamadı veya bağlantı geçersiz. Panele dönüp tekrar deneyin.'
              : msg;
          setError(friendly);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [token, studentId, examIdNum, validParams, user, examId]);

  const handleDownloadPdf = async () => {
    if (!token || !studentId || isNaN(examIdNum) || examIdNum <= 0) return;
    setDownloading(true);
    try {
      await downloadAnalysisPdf(token, studentId, examIdNum);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'PDF indirilemedi');
    } finally {
      setDownloading(false);
    }
  };

  const lessonNetData = React.useMemo(() => {
    if (!data) return [];
    const byLesson: Record<string, { correct: number; wrong: number; net: number }> = {};
    data.topicPriorities.forEach((t) => {
      if (!byLesson[t.lessonName]) byLesson[t.lessonName] = { correct: 0, wrong: 0, net: 0 };
      byLesson[t.lessonName].correct += t.correct;
      byLesson[t.lessonName].wrong += t.wrong;
      byLesson[t.lessonName].net += t.net;
    });
    return Object.entries(byLesson).map(([name, v]) => ({
      name,
      net: v.net,
      correct: v.correct,
      wrong: v.wrong,
    }));
  }, [data]);

  const pieData = React.useMemo(() => {
    if (!data) return [];
    const { one, two, three } = data.priorityCounts;
    return [
      { name: PRIORITY_LABELS.ONE, value: one, color: COLORS[0] },
      { name: PRIORITY_LABELS.TWO, value: two, color: COLORS[1] },
      { name: PRIORITY_LABELS.THREE, value: three, color: COLORS[2] },
    ].filter((d) => d.value > 0);
  }, [data]);

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-400">
        Rapor yükleniyor…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8">
        <Breadcrumb
          items={[
            { label: 'Öğrenci Paneli', onClick: () => navigate('/student') },
            { label: 'Analiz Raporu' },
          ]}
        />
        <div className="glass-card mt-4 p-6 flex items-center gap-3 text-[var(--error)]">
          <AlertCircle size={24} />
          <span>{error ?? 'Veri bulunamadı.'}</span>
        </div>
        <button
          type="button"
          onClick={() => navigate('/student')}
          className="mt-4 flex items-center gap-2 text-slate-400 hover:text-slate-200"
        >
          <ArrowLeft size={16} />
          Panele dön
        </button>
      </div>
    );
  }

  const formattedDate = new Date(data.date).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const hasNoDetailedData =
    data.topicPriorities.length === 0 ||
    (data.hasDetailedAnalysis === false && data.priorityCounts.one + data.priorityCounts.two + data.priorityCounts.three === 0);
  const totalPriorityCount = data.priorityCounts.one + data.priorityCounts.two + data.priorityCounts.three;
  const showPercentile = !hasNoDetailedData || data.percentile > 0;
  const showPriorityCount = !hasNoDetailedData || totalPriorityCount > 0;

  return (
    <div className="analysis-report-page p-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <Breadcrumb
            items={[
              { label: 'Öğrenci Paneli', onClick: () => navigate('/student') },
              { label: `${data.examName} – Analiz` },
            ]}
          />
          <h1 className="analysis-report-title">{data.examName}</h1>
          <p className="analysis-report-subtitle">{formattedDate} · {data.examType}</p>
        </div>
        <button
          type="button"
          onClick={handleDownloadPdf}
          disabled={downloading}
          className="analysis-report-pdf-btn"
        >
          <Download size={20} strokeWidth={2.25} />
          {downloading ? 'İndiriliyor…' : 'PDF Raporu İndir'}
        </button>
      </div>

      {hasNoDetailedData && (
        <div className="glass-card p-4 mb-6 border-l-4 border-amber-500/80 bg-amber-500/5">
          <p className="text-sm text-[var(--color-text-main)]">
            Bu sınav için ders ve konu bazlı detay analizi henüz oluşturulmamış. Aşağıda yalnızca sınav özeti (puan, net) gösterilmektedir. Detaylı analiz için sınavın cevap anahtarı girilmiş olmalı ve sonuç otomatik hesaplanmış olmalıdır.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="glass-card p-4">
          <p className="analysis-report-label">Puan</p>
          <p className="analysis-report-value">{data.score.toFixed(1)}</p>
          {data.projection && totalPriorityCount > 0 && (
            <p className="analysis-report-hint">
              Tahmini hedef: {data.projection.projectedScore.toFixed(1)}
            </p>
          )}
        </div>
        <div className="glass-card p-4">
          <p className="analysis-report-label">Yüzdelik Dilim</p>
          <p className="analysis-report-value">
            {showPercentile ? `% ${data.percentile.toFixed(2)}` : '—'}
          </p>
        </div>
        <div className="glass-card p-4">
          <p className="analysis-report-label">Çalışılması Gereken Konu Sayısı</p>
          <p className="analysis-report-value">
            {showPriorityCount ? totalPriorityCount : '—'}
          </p>
          {(showPriorityCount && totalPriorityCount > 0) && (
            <div className="flex flex-wrap gap-2 mt-2 text-xs">
              <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">
                1. Öncelik: {data.priorityCounts.one}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">
                2. Öncelik: {data.priorityCounts.two}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
                3. Öncelik: {data.priorityCounts.three}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card p-4">
          <h2 className="analysis-report-section-title">Ders Bazlı Netler</h2>
          {lessonNetData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={lessonNetData} layout="vertical" margin={{ left: 20, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                  <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" width={80} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderRadius: 8,
                      border: '1px solid rgba(148,163,184,0.3)',
                    }}
                    formatter={(value: number, name: string) => [
                      value.toFixed(1),
                      name === 'net' ? 'Net' : name === 'correct' ? 'Doğru' : 'Yanlış',
                    ]}
                  />
                  <Bar dataKey="net" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center analysis-report-empty text-center px-4">
              {hasNoDetailedData ? 'Bu sınav için ders bazlı analiz verisi bulunmuyor.' : 'Ders bazlı veri yok'}
            </div>
          )}
        </div>

        <div className="glass-card p-4">
          <h2 className="analysis-report-section-title">Öncelik Dağılımı</h2>
          {pieData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderRadius: 8,
                      border: '1px solid rgba(148,163,184,0.3)',
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center analysis-report-empty text-center px-4">
              {hasNoDetailedData ? 'Bu sınav için konu bazlı analiz verisi bulunmuyor.' : 'Konu analizi yok'}
            </div>
          )}
        </div>

        <div className="glass-card p-4">
          <h2 className="analysis-report-section-title">Gelişim Grafiği (Son 5 Sınav)</h2>
          {progress && progress.exams.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={progress.exams}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                  <XAxis dataKey="examName" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderRadius: 8,
                      border: '1px solid rgba(148,163,184,0.3)',
                    }}
                    formatter={(value: number) => [value.toFixed(1), 'Puan']}
                  />
                  <Line type="monotone" dataKey="score" stroke="#f97316" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center analysis-report-empty text-center px-4">
              Henüz yeterli sınav verisi yok. Gelişim grafiği için birden fazla sınav sonucu gereklidir.
            </div>
          )}
        </div>
      </div>

      <div className="glass-card p-4 mt-6">
        <h2 className="analysis-report-section-title">Öncelikli Konular (Accordion)</h2>
        {data.topicPriorities.length > 0 ? (
          <div className="space-y-2">
            {(['ONE', 'TWO', 'THREE'] as const).map((level) => {
              const list = data.topicPriorities.filter((t) => t.priorityLevel === level);
              if (list.length === 0) return null;
              const isOpen = accordionOpen === level;
              return (
                <div key={level} className="border border-slate-700 rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setAccordionOpen(isOpen ? null : level)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-slate-800/50 hover:bg-slate-800 transition text-left"
                  >
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        level === 'ONE'
                          ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                          : level === 'TWO'
                            ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/40'
                            : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      }`}
                    >
                      {BADGE_SHORT[level]}
                    </span>
                    <span className="text-sm font-medium text-slate-200">{PRIORITY_LABELS[level]}</span>
                    <span className="text-xs text-slate-500">({list.length} konu)</span>
                    {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </button>
                  {isOpen && (
                    <div className="px-4 py-3 bg-slate-900/30">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-slate-400 text-left border-b border-slate-700">
                              <th className="pb-2 pr-4">Ders</th>
                              <th className="pb-2 pr-4">Konu</th>
                              <th className="pb-2 pr-4 text-center">Soru</th>
                              <th className="pb-2 pr-4 text-center">D</th>
                              <th className="pb-2 pr-4 text-center">Y</th>
                              <th className="pb-2 pr-4 text-center">B</th>
                              <th className="pb-2 pr-4 text-center">Net</th>
                              <th className="pb-2 text-center">Kayıp Puan</th>
                            </tr>
                          </thead>
                          <tbody>
                            {list.map((t, i) => (
                              <tr key={i} className="border-b border-slate-800">
                                <td className="py-2 pr-4">{t.lessonName}</td>
                                <td className="py-2 pr-4">{t.topicName}</td>
                                <td className="py-2 pr-4 text-center">{t.totalQuestion}</td>
                                <td className="py-2 pr-4 text-center">{t.correct}</td>
                                <td className="py-2 pr-4 text-center">{t.wrong}</td>
                                <td className="py-2 pr-4 text-center">{t.empty}</td>
                                <td className="py-2 pr-4 text-center">{t.net.toFixed(2)}</td>
                                <td className="py-2 pr-4 text-center">
                                  {((t.wrong + t.empty) * 1).toFixed(1)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="analysis-report-empty">{hasNoDetailedData ? 'Bu sınav için konu bazlı analiz verisi bulunmuyor.' : 'Henüz konu analizi bulunmuyor.'}</p>
        )}
      </div>
    </div>
  );
};
