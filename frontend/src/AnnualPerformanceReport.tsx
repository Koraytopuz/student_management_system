import React from 'react';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts';
import { CalendarDays, Clock, PlayCircle, HelpCircle, Download } from 'lucide-react';

type SubjectKey = 'matematik' | 'fen' | 'turkce' | 'sosyal' | 'yabanci';

interface AnnualPerformanceReportProps {
  studentName?: string;
  className?: string;
}

type Topic = {
  id: string;
  name: string;
  correct: number;
  incorrect: number;
  masteryPercent: number;
};

type Subject = {
  id: SubjectKey;
  label: string;
  topics: Topic[];
};

const mockData = {
  student: {
    name: 'Deneme Öğrenci',
    className: '8/A',
    avatarUrl: '',
    annualScore: 8.4,
    annualRankPercentile: 92,
  },
  radar: [
    {
      axis: 'Matematik',
      student: 88,
      classAvg: 74,
    },
    {
      axis: 'Fen',
      student: 84,
      classAvg: 78,
    },
    {
      axis: 'Türkçe',
      student: 91,
      classAvg: 82,
    },
    {
      axis: 'Sosyal',
      student: 79,
      classAvg: 76,
    },
    {
      axis: 'Yabancı Dil',
      student: 86,
      classAvg: 80,
    },
  ],
  subjects: [
    {
      id: 'matematik',
      label: 'Matematik',
      topics: [
        { id: 'fractions', name: 'Kesirler & Oran-Orantı', correct: 124, incorrect: 18, masteryPercent: 87 },
        { id: 'equations', name: 'Denklemler & Eşitsizlikler', correct: 96, incorrect: 24, masteryPercent: 80 },
        { id: 'geometry', name: 'Geometri Temelleri', correct: 52, incorrect: 28, masteryPercent: 65 },
      ],
    },
    {
      id: 'fen',
      label: 'Fen Bilimleri',
      topics: [
        { id: 'physics', name: 'Fizik – Kuvvet & Hareket', correct: 88, incorrect: 12, masteryPercent: 88 },
        { id: 'chemistry', name: 'Kimya – Madde & Isı', correct: 76, incorrect: 19, masteryPercent: 80 },
        { id: 'biology', name: 'Biyoloji – Hücre & Sistemler', correct: 64, incorrect: 32, masteryPercent: 67 },
      ],
    },
    {
      id: 'turkce',
      label: 'Türkçe',
      topics: [
        { id: 'grammar', name: 'Dil Bilgisi', correct: 110, incorrect: 10, masteryPercent: 92 },
        { id: 'reading', name: 'Paragraf & Okuma', correct: 140, incorrect: 18, masteryPercent: 89 },
        { id: 'writing', name: 'Yazılı Anlatım', correct: 44, incorrect: 21, masteryPercent: 68 },
      ],
    },
    {
      id: 'sosyal',
      label: 'Sosyal Bilgiler',
      topics: [
        { id: 'history', name: 'Tarih & Kronoloji', correct: 62, incorrect: 18, masteryPercent: 78 },
        { id: 'geography', name: 'Coğrafya & Harita', correct: 54, incorrect: 16, masteryPercent: 77 },
      ],
    },
    {
      id: 'yabanci',
      label: 'Yabancı Dil',
      topics: [
        { id: 'vocab', name: 'Kelime Bilgisi', correct: 72, incorrect: 14, masteryPercent: 84 },
        { id: 'grammar', name: 'Dil Bilgisi', correct: 60, incorrect: 20, masteryPercent: 75 },
        { id: 'listening', name: 'Dinleme & Konuşma', correct: 38, incorrect: 22, masteryPercent: 63 },
      ],
    },
  ] as Subject[],
  digitalEffort: {
    attendanceRate: 93,
    focusHours: 126,
    videoMinutes: 1835,
    solvedQuestions: 4820,
  },
  coachNote:
    'Bu yıl özellikle sayısal derslerde büyük ivme kazandın. Yaz döneminde Geometri pratiklerine odaklanırsan hedefine ulaşman çok daha olası görünüyor. Kısa ama düzenli tekrarlarla dikkat pencerelerini verimli kullanmaya devam et.',
};

const getMasteryBadge = (percent: number) => {
  if (percent >= 85) {
    return { label: 'Usta', tone: 'success' as const };
  }
  if (percent >= 50) {
    return { label: 'Gelişiyor', tone: 'warning' as const };
  }
  return { label: 'Destek Lazım', tone: 'danger' as const };
};

const formatMinutesToHhMm = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} dk`;
  if (m === 0) return `${h} sa`;
  return `${h} sa ${m} dk`;
};

export const AnnualPerformanceReport: React.FC<AnnualPerformanceReportProps> = ({
  studentName,
  className,
}) => {
  const [openSubjectId, setOpenSubjectId] = React.useState<SubjectKey | null>('matematik');

  const effectiveStudent = React.useMemo(
    () => ({
      ...mockData.student,
      name: studentName ?? mockData.student.name,
      className: className ?? mockData.student.className,
    }),
    [studentName, className],
  );

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  return (
    <div className="annual-report-page">
      <div className="annual-report-print">
        {/* HEADER / KİMLİK KARTI */}
        <section className="glass-card annual-report-header">
          <div className="annual-report-header-main">
            <div className="annual-report-identity">
              <div className="annual-report-avatar">
                {effectiveStudent.avatarUrl ? (
                  <img
                    src={effectiveStudent.avatarUrl}
                    alt={effectiveStudent.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-3xl lg:text-4xl font-semibold tracking-tight">
                    {effectiveStudent.name
                      .split(' ')
                      .map((p) => p[0])
                      .join('')
                      .slice(0, 2)}
                  </span>
                )}
              </div>
              <div className="annual-report-title-block">
                <p className="annual-report-eyebrow">
                  AnnualPerformanceReport
                </p>
                <h1>Yıl Sonu Gelişim Raporu</h1>
                <p className="annual-report-subtitle">
                  {effectiveStudent.name} · {effectiveStudent.className}
                </p>
                <p className="annual-report-helper">
                  Spotify Wrapped tarzında, yıl boyu performansının kişiselleştirilmiş bir özeti.
                </p>
              </div>
            </div>

            <div className="annual-report-score">
              <div className="annual-report-score-row">
                <div className="annual-report-score-text">
                  <p className="annual-report-score-label">Yıllık Genel Başarı Puanı</p>
                  <div className="annual-report-score-value">
                    <span>{mockData.student.annualScore.toFixed(1)}</span>
                    <span className="annual-report-score-denominator">/10</span>
                  </div>
                </div>
                <div className="annual-report-rank-pill">
                  <div className="annual-report-rank-inner">
                    <span>TOP</span>
                    <strong>{mockData.student.annualRankPercentile}</strong>
                    <span className="annual-report-rank-caption">percentile</span>
                  </div>
                </div>
              </div>
              <p className="annual-report-score-description">
                Bu skor; ders başarıları, dijital efor ve odaklanma metriklerinin birleşimiyle hesaplanmış
                yıllık genel performans indeksidir.
              </p>
            </div>
          </div>
        </section>

        {/* ÜST GRID: RADAR + DİJİTAL EFOR */}
        <section className="annual-report-top-grid">
          {/* RADAR CHART */}
          <div className="glass-card annual-report-card annual-report-card--radar">
            <div className="annual-report-card-header">
              <div>
                <p className="annual-report-eyebrow">
                  Chart 01 · Karşılaştırmalı Analiz
                </p>
                <h2 className="annual-report-card-title">Ders Bazlı Yıllık Performans</h2>
                <p className="annual-report-card-helper">
                  Öğrencinin yıl sonu ders performansı, sınıf ortalaması ile radar grafiği üzerinde
                  karşılaştırmalı olarak gösterilmiştir.
                </p>
              </div>
              <div className="annual-report-legend">
                <span className="annual-report-legend-item">
                  <span className="annual-report-legend-swatch annual-report-legend-swatch--student" />
                  Öğrenci
                </span>
                <span className="annual-report-legend-item">
                  <span className="annual-report-legend-swatch annual-report-legend-swatch--class" />
                  Sınıf Ort.
                </span>
              </div>
            </div>
            <div className="annual-report-radar-shell">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={mockData.radar} outerRadius="80%">
                  <PolarGrid stroke="rgba(148,163,184,0.35)" />
                  <PolarAngleAxis
                    dataKey="axis"
                    tick={{ fill: '#cbd5f5', fontSize: 11 }}
                    tickLine={false}
                  />
                  <PolarRadiusAxis
                    angle={30}
                    domain={[50, 100]}
                    tick={{ fill: 'rgba(148,163,184,0.7)', fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Radar
                    name="Öğrenci"
                    dataKey="student"
                    stroke="#34d399"
                    fill="#34d399"
                    fillOpacity={0.4}
                  />
                  <Radar
                    name="Sınıf Ort."
                    dataKey="classAvg"
                    stroke="rgba(148,163,184,0.9)"
                    fill="rgba(148,163,184,0.45)"
                    fillOpacity={0.2}
                  />
                  <Legend
                    wrapperStyle={{
                      paddingTop: 12,
                      fontSize: 11,
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#020617',
                      borderRadius: 12,
                      border: '1px solid rgba(148,163,184,0.5)',
                      padding: '8px 10px',
                      fontSize: 11,
                    }}
                    labelStyle={{ marginBottom: 4, color: '#e5e7eb' }}
                    formatter={(value: number) => [`${value.toFixed(0)} puan`, '']}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* DİJİTAL EFOR GRIDİ */}
          <div className="glass-card annual-report-card annual-report-card--effort">
            <div>
              <p className="annual-report-eyebrow">
                Section 03 · Dijital Efor
              </p>
              <h2 className="annual-report-card-title">Dijital Efor Özeti</h2>
              <p className="annual-report-card-helper">
                Öğrencinin yıl boyunca platform üzerindeki etkileşimleri.
              </p>
            </div>
            <div className="annual-report-effort-grid">
              <div className="annual-report-effort-item">
                <div className="annual-report-effort-header">
                  <span className="annual-report-effort-label">
                    <span className="annual-report-effort-icon annual-report-effort-icon--emerald">
                      <CalendarDays size={14} />
                    </span>
                    Devamlılık
                  </span>
                  <span className="annual-report-effort-tag annual-report-effort-tag--emerald">
                    Günlük rutine bağlı
                  </span>
                </div>
                <div className="annual-report-effort-body">
                  <p className="annual-report-effort-value">
                    {mockData.digitalEffort.attendanceRate}
                    <span className="annual-report-effort-unit">%</span>
                  </p>
                  <p className="annual-report-effort-caption">Katıldığı canlı ders oranı</p>
                </div>
                <div className="annual-report-effort-bar">
                  <div
                    className="annual-report-effort-bar-fill annual-report-effort-bar-fill--emerald"
                    style={{ width: `${mockData.digitalEffort.attendanceRate}%` }}
                  />
                </div>
              </div>

              <div className="annual-report-effort-item">
                <div className="annual-report-effort-header">
                  <span className="annual-report-effort-label">
                    <span className="annual-report-effort-icon annual-report-effort-icon--sky">
                      <Clock size={14} />
                    </span>
                    Odak Süresi
                  </span>
                </div>
                <div className="annual-report-effort-body">
                  <p className="annual-report-effort-value">
                    {mockData.digitalEffort.focusHours}
                    <span className="annual-report-effort-unit">saat</span>
                  </p>
                  <p className="annual-report-effort-caption">Toplam pomodoro odak süresi</p>
                </div>
                <div className="annual-report-effort-bar">
                  <div
                    className="annual-report-effort-bar-fill annual-report-effort-bar-fill--sky"
                    style={{ width: '82%' }}
                  />
                </div>
              </div>

              <div className="annual-report-effort-item">
                <div className="annual-report-effort-header">
                  <span className="annual-report-effort-label">
                    <span className="annual-report-effort-icon annual-report-effort-icon--fuchsia">
                      <PlayCircle size={14} />
                    </span>
                    Video
                  </span>
                </div>
                <div className="annual-report-effort-body">
                  <p className="annual-report-effort-value">
                    {formatMinutesToHhMm(mockData.digitalEffort.videoMinutes)}
                  </p>
                  <p className="annual-report-effort-caption">İzlenen toplam ders videosu</p>
                </div>
                <div className="annual-report-effort-bar">
                  <div
                    className="annual-report-effort-bar-fill annual-report-effort-bar-fill--fuchsia"
                    style={{ width: '68%' }}
                  />
                </div>
              </div>

              <div className="annual-report-effort-item">
                <div className="annual-report-effort-header">
                  <span className="annual-report-effort-label">
                    <span className="annual-report-effort-icon annual-report-effort-icon--amber">
                      <HelpCircle size={14} />
                    </span>
                    Soru
                  </span>
                </div>
                <div className="annual-report-effort-body">
                  <p className="annual-report-effort-value">
                    {mockData.digitalEffort.solvedQuestions.toLocaleString('tr-TR')}
                  </p>
                  <p className="annual-report-effort-caption">Çözülen toplam soru sayısı</p>
                </div>
                <div className="annual-report-effort-bar">
                  <div
                    className="annual-report-effort-bar-fill annual-report-effort-bar-fill--amber"
                    style={{ width: '90%' }}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* KONU KARNESİ + KOÇ NOTU */}
        <section className="annual-report-bottom-grid">
          {/* KONU KARNESİ */}
          <div className="glass-card annual-report-card annual-report-card--topics">
            <div className="annual-report-card-header">
              <div>
                <p className="annual-report-eyebrow">
                  Section 02 · Konu Karnesi
                </p>
                <h2 className="annual-report-card-title">Konu Bazlı Yeterlilik</h2>
                <p className="annual-report-card-helper">
                  Her ders için alt konu performansı, doğru/yanlış dengesi ve yıl sonu ustalık seviyesi
                  gösterilmektedir.
                </p>
              </div>
            </div>

            <div className="annual-report-subject-tabs">
              {mockData.subjects.map((subject) => {
                const isActive = openSubjectId === subject.id;
                return (
                  <button
                    key={subject.id}
                    type="button"
                    className={[
                      'rounded-full px-3 py-1 border text-xs font-medium transition-colors',
                      isActive
                        ? 'bg-emerald-500/20 border-emerald-400 text-emerald-100'
                        : 'bg-slate-900/60 border-slate-700 text-slate-200 hover:border-slate-500',
                    ].join(' ')}
                    onClick={() =>
                      setOpenSubjectId((prev) => (prev === subject.id ? null : subject.id))
                    }
                  >
                    {subject.label}
                  </button>
                );
              })}
            </div>

            <div className="annual-report-topics-list">
              {mockData.subjects.map((subject) => {
                const isOpen = openSubjectId === subject.id;
                const subjectAvg =
                  subject.topics.reduce((acc, t) => acc + t.masteryPercent, 0) /
                  subject.topics.length;
                return (
                  <div
                    key={subject.id}
                    className="annual-report-subject-group"
                  >
                    <button
                      type="button"
                      className="annual-report-subject-header"
                      onClick={() =>
                        setOpenSubjectId((prev) =>
                          prev === subject.id ? null : (subject.id as SubjectKey),
                        )
                      }
                    >
                      <div className="annual-report-subject-header-main">
                        <div className="annual-report-subject-avatar">
                          {subject.label[0]}
                        </div>
                        <div>
                          <p className="annual-report-subject-title">{subject.label}</p>
                          <p className="annual-report-subject-helper">
                            Ortalama ustalık: {subjectAvg.toFixed(0)}%
                          </p>
                        </div>
                      </div>
                      <div className="annual-report-subject-header-right">
                        <span className="annual-report-subject-toggle-label">
                          {isOpen ? 'Gizle' : 'Detayları aç'}
                        </span>
                        <span
                          className={
                            isOpen
                              ? 'annual-report-subject-toggle annual-report-subject-toggle--open'
                              : 'annual-report-subject-toggle'
                          }
                        >
                          ▸
                        </span>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="annual-report-topic-items">
                        {subject.topics.map((topic) => {
                          const total = topic.correct + topic.incorrect || 1;
                          const correctRatio = (topic.correct / total) * 100;
                          const badge = getMasteryBadge(topic.masteryPercent);

                          const badgeClass =
                            badge.tone === 'success'
                              ? 'annual-report-mastery-badge annual-report-mastery-badge--success'
                              : badge.tone === 'warning'
                                ? 'annual-report-mastery-badge annual-report-mastery-badge--warning'
                                : 'annual-report-mastery-badge annual-report-mastery-badge--danger';

                          return (
                            <div
                              key={topic.id}
                              className="annual-report-topic-row"
                            >
                              <div className="annual-report-topic-header">
                                <div>
                                  <p className="annual-report-topic-title">{topic.name}</p>
                                  <p className="annual-report-topic-helper">
                                    Doğru: {topic.correct} · Yanlış: {topic.incorrect}
                                  </p>
                                </div>
                                <div className="annual-report-topic-badge-col">
                                  <span
                                    className={[
                                      'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold',
                                      badgeClass,
                                    ].join(' ')}
                                  >
                                    <span className="annual-report-mastery-dot" />
                                    {badge.label}
                                    <span className="annual-report-mastery-percent">
                                      {topic.masteryPercent.toFixed(0)}%
                                    </span>
                                  </span>
                                  <span className="annual-report-topic-caption">
                                    Konu karne puanı
                                  </span>
                                </div>
                              </div>

                              <div className="annual-report-topic-stats">
                                <div className="annual-report-topic-stats-header">
                                  <span>Doğru / Yanlış dağılımı</span>
                                  <span>
                                    {correctRatio.toFixed(0)}% doğru ·{' '}
                                    {(100 - correctRatio).toFixed(0)}% yanlış
                                  </span>
                                </div>
                                <div className="annual-report-topic-bar">
                                  <div
                                    className="annual-report-topic-bar-correct"
                                    style={{ width: `${correctRatio}%` }}
                                  />
                                  <div
                                    className="annual-report-topic-bar-incorrect"
                                    style={{ width: `${100 - correctRatio}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* KOÇ NOTU */}
          <div className="glass-card annual-report-card annual-report-card--coach">
            <div>
              <p className="annual-report-eyebrow">
                Section 04 · AI Coach Insight
              </p>
              <h2 className="annual-report-card-title">Koçun Notu & Gelecek Tavsiyesi</h2>
            </div>
            <div className="annual-report-coach-card">
              <div className="annual-report-coach-pill">
                AI
              </div>
              <p className="annual-report-coach-eyebrow">
                Koçun Notu
              </p>
              <p className="annual-report-coach-text">{mockData.coachNote}</p>
              <p className="annual-report-coach-meta">
                Not: Bu yorum, yıl boyunca toplanan performans ve efor verilerine göre yapay zeka koç
                tarafından otomatik üretilmiştir.
              </p>
            </div>
          </div>
        </section>

        {/* FOOTER / PDF İNDİR */}
        <footer className="annual-report-footer print:hidden">
          <p className="annual-report-footer-text">
            Bu rapor; ders istatistikleri, dijital efor ve konu karnesi verilerinin birleşimiyle yıllık
            bir gelişim panoraması sunar.
          </p>
          <button
            type="button"
            onClick={handlePrint}
            className="primary-btn annual-report-download-btn"
          >
            <Download size={14} />
            PDF Olarak İndir
          </button>
        </footer>
      </div>
    </div>
  );
};

