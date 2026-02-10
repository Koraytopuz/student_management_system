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

export const AnnualPerformanceReport: React.FC = () => {
  const [openSubjectId, setOpenSubjectId] = React.useState<SubjectKey | null>('matematik');

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  return (
    <div className="annual-report-page min-h-screen w-full bg-slate-950/90 text-slate-50 flex items-stretch justify-center py-10 px-4 print:bg-white print:text-slate-900">
      <div className="annual-report-print max-w-6xl w-full grid gap-6 lg:gap-8 auto-rows-max">
        {/* HEADER / KİMLİK KARTI */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500/10 via-indigo-500/10 to-sky-500/10 border border-slate-700/60 shadow-[0_40px_120px_rgba(15,23,42,0.9)] backdrop-blur-2xl p-6 lg:p-8 print:shadow-none print:border-slate-200 print:bg-white">
          <div className="pointer-events-none absolute inset-0 opacity-60 mix-blend-screen">
            <div className="absolute -top-32 -left-16 h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl" />
            <div className="absolute -bottom-40 -right-24 h-96 w-96 rounded-full bg-indigo-500/30 blur-3xl" />
          </div>

          <div className="relative flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
            <div className="flex items-start gap-5">
              <div className="relative h-20 w-20 lg:h-24 lg:w-24 rounded-3xl bg-slate-900/80 border border-emerald-400/40 shadow-[0_18px_45px_rgba(16,185,129,0.55)] flex items-center justify-center overflow-hidden">
                {mockData.student.avatarUrl ? (
                  <img
                    src={mockData.student.avatarUrl}
                    alt={mockData.student.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-3xl lg:text-4xl font-semibold tracking-tight">
                    {mockData.student.name
                      .split(' ')
                      .map((p) => p[0])
                      .join('')
                      .slice(0, 2)}
                  </span>
                )}
                <span className="absolute -bottom-2 -right-2 rounded-full bg-emerald-500 text-[0.65rem] font-semibold px-2 py-1 shadow-lg">
                  {mockData.student.className}
                </span>
              </div>
              <div className="space-y-2">
                <p className="uppercase tracking-[0.35em] text-[0.68rem] text-emerald-300/80">
                  AnnualPerformanceReport
                </p>
                <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight">
                  Yıl Sonu Gelişim Raporu
                </h1>
                <p className="text-sm text-slate-300/80">
                  {mockData.student.name} · {mockData.student.className}
                </p>
                <p className="text-xs text-slate-400">
                  Spotify Wrapped tarzında, yıl boyu performansının kişiselleştirilmiş bir özeti.
                </p>
              </div>
            </div>

            <div className="flex flex-col items-end gap-4">
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-[0.7rem] uppercase tracking-[0.25em] text-slate-300/80">
                    Yıllık Genel Başarı Puanı
                  </p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl lg:text-5xl font-semibold">
                      {mockData.student.annualScore.toFixed(1)}
                    </span>
                    <span className="text-sm text-slate-300/80">/10</span>
                  </div>
                </div>
                <div className="relative h-16 w-16 rounded-full bg-slate-900/80 border border-slate-600 flex items-center justify-center">
                  <div className="absolute inset-[3px] rounded-full bg-gradient-to-br from-emerald-500/40 via-cyan-400/30 to-indigo-500/50 blur-[1px]" />
                  <div className="relative flex flex-col items-center text-[0.65rem] font-semibold">
                    <span className="text-slate-200/90">TOP</span>
                    <span className="text-lg">{mockData.student.annualRankPercentile}</span>
                    <span className="text-slate-300/80 text-[0.6rem]">percentile</span>
                  </div>
                </div>
              </div>
              <p className="text-xs text-slate-300/80 max-w-xs text-right">
                Bu skor; ders başarıları, dijital efor ve odaklanma metriklerinin birleşimiyle hesaplanmış
                yıllık genel performans indeksidir.
              </p>
            </div>
          </div>
        </section>

        {/* ÜST GRID: RADAR + DİJİTAL EFOR */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-7">
          {/* RADAR CHART */}
          <div className="lg:col-span-2 rounded-3xl bg-slate-950/70 border border-slate-800/80 shadow-[0_32px_80px_rgba(15,23,42,0.9)] backdrop-blur-2xl p-5 lg:p-6 print:border-slate-200 print:bg-white print:shadow-none">
            <div className="flex items-center justify-between mb-4 gap-3">
              <div>
                <p className="uppercase tracking-[0.3em] text-[0.65rem] text-slate-400">
                  Chart 01 · Karşılaştırmalı Analiz
                </p>
                <h2 className="text-lg lg:text-xl font-semibold mt-1">Ders Bazlı Yıllık Performans</h2>
                <p className="text-xs text-slate-400 mt-1 max-w-md">
                  Öğrencinin yıl sonu ders performansı, sınıf ortalaması ile radar grafiği üzerinde
                  karşılaştırmalı olarak gösterilmiştir.
                </p>
              </div>
              <div className="hidden sm:flex items-center gap-3 text-[0.7rem] text-slate-300/80">
                <span className="inline-flex items-center gap-1">
                  <span className="h-1.5 w-5 rounded-full bg-emerald-400" />
                  Öğrenci
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-1.5 w-5 rounded-full bg-slate-500/70" />
                  Sınıf Ort.
                </span>
              </div>
            </div>
            <div className="h-72 lg:h-80 -mx-2">
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
          <div className="rounded-3xl bg-slate-950/70 border border-slate-800/80 shadow-[0_32px_80px_rgba(15,23,42,0.9)] backdrop-blur-2xl p-5 flex flex-col gap-4 print:border-slate-200 print:bg-white print:shadow-none">
            <div>
              <p className="uppercase tracking-[0.3em] text-[0.65rem] text-slate-400">
                Section 03 · Dijital Efor
              </p>
              <h2 className="text-lg font-semibold mt-1">Dijital Efor Özeti</h2>
              <p className="text-xs text-slate-400 mt-1">
                Öğrencinin yıl boyunca platform üzerindeki etkileşimleri.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-1 text-xs sm:text-sm">
              <div className="group rounded-2xl border border-slate-700/80 bg-slate-900/70 px-3 py-3 flex flex-col gap-2 shadow-[0_14px_30px_rgba(15,23,42,0.75)]">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[0.7rem] text-slate-300/90 uppercase tracking-[0.18em]">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
                      <CalendarDays size={14} />
                    </span>
                    Devamlılık
                  </span>
                  <span className="text-[0.7rem] text-emerald-300 bg-emerald-500/10 border border-emerald-500/40 rounded-full px-2 py-0.5">
                    Günlük rutine bağlı
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <p className="text-xl font-semibold">
                    {mockData.digitalEffort.attendanceRate}
                    <span className="text-xs text-slate-400 ml-1">%</span>
                  </p>
                  <p className="text-[0.7rem] text-slate-400">Katıldığı canlı ders oranı</p>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-emerald-300 to-emerald-200"
                    style={{ width: `${mockData.digitalEffort.attendanceRate}%` }}
                  />
                </div>
              </div>

              <div className="group rounded-2xl border border-slate-700/80 bg-slate-900/70 px-3 py-3 flex flex-col gap-2 shadow-[0_14px_30px_rgba(15,23,42,0.75)]">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[0.7rem] text-slate-300/90 uppercase tracking-[0.18em]">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-sky-500/20 text-sky-300">
                      <Clock size={14} />
                    </span>
                    Odak Süresi
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <p className="text-xl font-semibold">
                    {mockData.digitalEffort.focusHours}
                    <span className="text-xs text-slate-400 ml-1">saat</span>
                  </p>
                  <p className="text-[0.7rem] text-slate-400">Toplam pomodoro odak süresi</p>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-sky-400 via-cyan-300 to-emerald-200"
                    style={{ width: '82%' }}
                  />
                </div>
              </div>

              <div className="group rounded-2xl border border-slate-700/80 bg-slate-900/70 px-3 py-3 flex flex-col gap-2 shadow-[0_14px_30px_rgba(15,23,42,0.75)]">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[0.7rem] text-slate-300/90 uppercase tracking-[0.18em]">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-fuchsia-500/20 text-fuchsia-300">
                      <PlayCircle size={14} />
                    </span>
                    Video
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <p className="text-xl font-semibold">
                    {formatMinutesToHhMm(mockData.digitalEffort.videoMinutes)}
                  </p>
                  <p className="text-[0.7rem] text-slate-400">İzlenen toplam ders videosu</p>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-fuchsia-400 via-pink-300 to-rose-200"
                    style={{ width: '68%' }}
                  />
                </div>
              </div>

              <div className="group rounded-2xl border border-slate-700/80 bg-slate-900/70 px-3 py-3 flex flex-col gap-2 shadow-[0_14px_30px_rgba(15,23,42,0.75)]">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[0.7rem] text-slate-300/90 uppercase tracking-[0.18em]">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/20 text-amber-300">
                      <HelpCircle size={14} />
                    </span>
                    Soru
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <p className="text-xl font-semibold">
                    {mockData.digitalEffort.solvedQuestions.toLocaleString('tr-TR')}
                  </p>
                  <p className="text-[0.7rem] text-slate-400">Çözülen toplam soru sayısı</p>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-400 via-orange-300 to-lime-200"
                    style={{ width: '90%' }}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* KONU KARNESİ + KOÇ NOTU */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-7 items-start">
          {/* KONU KARNESİ */}
          <div className="lg:col-span-2 rounded-3xl bg-slate-950/70 border border-slate-800/80 shadow-[0_32px_80px_rgba(15,23,42,0.9)] backdrop-blur-2xl p-5 lg:p-6 space-y-4 print:border-slate-200 print:bg-white print:shadow-none">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="uppercase tracking-[0.3em] text-[0.65rem] text-slate-400">
                  Section 02 · Konu Karnesi
                </p>
                <h2 className="text-lg lg:text-xl font-semibold mt-1">Konu Bazlı Yeterlilik</h2>
                <p className="text-xs text-slate-400 mt-1 max-w-xl">
                  Her ders için alt konu performansı, doğru/yanlış dengesi ve yıl sonu ustalık seviyesi
                  gösterilmektedir.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mt-1 text-xs">
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

            <div className="mt-3 space-y-3">
              {mockData.subjects.map((subject) => {
                const isOpen = openSubjectId === subject.id;
                const subjectAvg =
                  subject.topics.reduce((acc, t) => acc + t.masteryPercent, 0) /
                  subject.topics.length;
                return (
                  <div
                    key={subject.id}
                    className="rounded-2xl border border-slate-800 bg-slate-900/75 overflow-hidden"
                  >
                    <button
                      type="button"
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
                      onClick={() =>
                        setOpenSubjectId((prev) =>
                          prev === subject.id ? null : (subject.id as SubjectKey),
                        )
                      }
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-2xl bg-slate-800/90 flex items-center justify-center text-xs font-semibold text-slate-100">
                          {subject.label[0]}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{subject.label}</p>
                          <p className="text-[0.7rem] text-slate-400">
                            Ortalama ustalık: {subjectAvg.toFixed(0)}%
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="inline-flex items-center gap-1 text-[0.7rem] text-slate-300">
                          {isOpen ? 'Gizle' : 'Detayları aç'}
                        </span>
                        <span
                          className={[
                            'h-7 w-7 inline-flex items-center justify-center rounded-full border border-slate-700 text-slate-200 text-xs transition-transform',
                            isOpen ? 'rotate-90' : '',
                          ].join(' ')}
                        >
                          ▸
                        </span>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="border-t border-slate-800/80 bg-slate-950/70 px-4 py-3 space-y-3">
                        {subject.topics.map((topic) => {
                          const total = topic.correct + topic.incorrect || 1;
                          const correctRatio = (topic.correct / total) * 100;
                          const badge = getMasteryBadge(topic.masteryPercent);

                          const badgeClass =
                            badge.tone === 'success'
                              ? 'bg-emerald-500/15 border-emerald-400/60 text-emerald-100'
                              : badge.tone === 'warning'
                                ? 'bg-amber-500/15 border-amber-400/60 text-amber-100'
                                : 'bg-rose-500/10 border-rose-400/60 text-rose-100';

                          return (
                            <div
                              key={topic.id}
                              className="rounded-xl border border-slate-800/80 bg-slate-900/70 px-3 py-2.5 space-y-2"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-medium">{topic.name}</p>
                                  <p className="text-[0.7rem] text-slate-400">
                                    Doğru: {topic.correct} · Yanlış: {topic.incorrect}
                                  </p>
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                  <span
                                    className={[
                                      'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold',
                                      badgeClass,
                                    ].join(' ')}
                                  >
                                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                                    {badge.label}
                                    <span className="text-[0.65rem] opacity-80">
                                      {topic.masteryPercent.toFixed(0)}%
                                    </span>
                                  </span>
                                  <span className="text-[0.7rem] text-slate-400">
                                    Konu karne puanı
                                  </span>
                                </div>
                              </div>

                              <div className="space-y-1">
                                <div className="flex justify-between text-[0.68rem] text-slate-400">
                                  <span>Doğru / Yanlış dağılımı</span>
                                  <span>
                                    {correctRatio.toFixed(0)}% doğru ·{' '}
                                    {(100 - correctRatio).toFixed(0)}% yanlış
                                  </span>
                                </div>
                                <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden flex">
                                  <div
                                    className="h-full bg-emerald-400"
                                    style={{ width: `${correctRatio}%` }}
                                  />
                                  <div
                                    className="h-full bg-rose-500/80"
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
          <div className="rounded-3xl bg-slate-950/70 border border-slate-800/80 shadow-[0_32px_80px_rgba(15,23,42,0.9)] backdrop-blur-2xl p-5 flex flex-col gap-4 print:border-slate-200 print:bg-white print:shadow-none">
            <div>
              <p className="uppercase tracking-[0.3em] text-[0.65rem] text-slate-400">
                Section 04 · AI Coach Insight
              </p>
              <h2 className="text-lg font-semibold mt-1">Koçun Notu & Gelecek Tavsiyesi</h2>
            </div>
            <div className="relative rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 via-slate-950/90 to-slate-950/95 px-4 py-3 text-sm leading-relaxed text-slate-100 shadow-[0_20px_60px_rgba(16,185,129,0.45)] print:border-emerald-500/40 print:bg-emerald-50 print:text-slate-900">
              <div className="absolute -top-4 left-4 h-8 w-8 rounded-2xl bg-emerald-500 text-slate-950 flex items-center justify-center text-xs font-semibold shadow-lg print:hidden">
                AI
              </div>
              <p className="mt-2 text-[0.8rem] uppercase tracking-[0.25em] text-emerald-300/80 print:text-emerald-700">
                Koçun Notu
              </p>
              <p className="mt-2">{mockData.coachNote}</p>
              <p className="mt-3 text-[0.7rem] text-emerald-300/80 print:text-emerald-700/90">
                Not: Bu yorum, yıl boyunca toplanan performans ve efor verilerine göre yapay zeka koç
                tarafından otomatik üretilmiştir.
              </p>
            </div>
          </div>
        </section>

        {/* FOOTER / PDF İNDİR */}
        <footer className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mt-2 text-[0.75rem] text-slate-400 print:hidden">
          <p>
            Bu rapor; ders istatistikleri, dijital efor ve konu karnesi verilerinin birleşimiyle yıllık
            bir gelişim panoraması sunar.
          </p>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/80 px-4 py-2 text-xs font-semibold text-slate-50 shadow-[0_18px_40px_rgba(15,23,42,0.9)] hover:border-emerald-400 hover:text-emerald-100 hover:bg-slate-900/90 transition-colors"
          >
            <Download size={14} />
            PDF Olarak İndir
          </button>
        </footer>
      </div>
    </div>
  );
};

