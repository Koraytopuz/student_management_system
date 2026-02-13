import React from 'react';
import { CalendarDays, Clock, PlayCircle, HelpCircle, Download } from 'lucide-react';

import type { AnnualReportData } from './api';
import { YearlyProgressReportCard } from './YearlyProgressReportCard';
import { AnnualPerformanceChart } from './AnnualPerformanceChart';

// Use types from API or keep local aliases
type SubjectKey = 'matematik' | 'fen' | 'turkce' | 'sosyal' | 'yabanci';

interface AnnualPerformanceReportProps {
  reportData?: AnnualReportData | null;
}

// ... existing types if needed, or rely on AnnualReportData ...

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
  reportData,
}) => {
  const [openSubjectId, setOpenSubjectId] = React.useState<string | null>('matematik');

  const data = reportData || null;

  if (!data) {
    return (
      <div className="p-8 text-center text-slate-400">
        Veri yükleniyor veya rapor bulunamadı.
      </div>
    );
  }

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  // Progress bar helper – tüm barları 0–100 aralığında tut
  const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

  // Section 03 · Dijital Efor bar yüzdeleri
  const attendancePercent = clampPercent(data.digitalEffort.attendanceRate);

  // Hedefe göre normalize (örnek hedefler: 80 odak saati, 3000 video dk, 5000 soru)
  const focusPercent = clampPercent((data.digitalEffort.focusHours / 80) * 100);
  const videoPercent = clampPercent((data.digitalEffort.videoMinutes / 3000) * 100);
  const solvedQuestionsPercent = clampPercent(
    (data.digitalEffort.solvedQuestions / 5000) * 100,
  );

  // Ders bazlı özet tablo verisi (PDF'lerdeki gibi ders-toplam-doğru-yanlış-boş-%)
  const subjectSummaries = data.subjects.map((subject) => {
    const totals = subject.topics.reduce(
      (acc: { total: number; correct: number; incorrect: number; blank: number }, t) => {
        const correct = typeof t.correct === 'number' ? t.correct : 0;
        const incorrect = typeof t.incorrect === 'number' ? t.incorrect : 0;
        const blank = typeof t.blank === 'number' ? t.blank : 0;
        const total = correct + incorrect + blank;
        acc.correct += correct;
        acc.incorrect += incorrect;
        acc.blank += blank;
        acc.total += total;
        return acc;
      },
      { total: 0, correct: 0, incorrect: 0, blank: 0 },
    );

    const correctPercent = totals.total > 0 ? (totals.correct / totals.total) * 100 : 0;

    return {
      id: subject.id,
      label: subject.label,
      ...totals,
      correctPercent,
    };
  });

  // Boş sorulara odaklan kartı için konu bazlı boş soru listesi
  const blankTopicRows = data.subjects.flatMap((subject) =>
    subject.topics
      .filter((t) => t.blank && t.blank > 0)
      .map((t) => {
        const total = t.correct + t.incorrect + t.blank;
        return {
          subjectId: subject.id,
          subjectLabel: subject.label,
          topicId: t.id,
          topicName: t.name,
          blank: t.blank,
          correct: t.correct,
          incorrect: t.incorrect,
          total,
          blankPercent: total > 0 ? (t.blank / total) * 100 : 0,
        };
      }),
  );

  blankTopicRows.sort((a, b) => b.blank - a.blank || b.blankPercent - a.blankPercent);
  const topBlankTopics = blankTopicRows.slice(0, 6);
  const totalBlankAll = blankTopicRows.reduce((acc, row) => acc + row.blank, 0);

  return (
    <div className="annual-report-page">
      <div className="annual-report-print">
        {/* HEADER / KİMLİK KARTI */}
        <section className="annual-report-header">
          <YearlyProgressReportCard reportData={data} />
        </section>

        {/* ÜST GRID: RADAR + DİJİTAL EFOR */}
        <section className="annual-report-top-grid">
          {/* RADAR CHART */}
          <AnnualPerformanceChart reportData={data} />

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
                    Canlı ders
                  </span>
                </div>
                <div className="annual-report-effort-body">
                  <p className="annual-report-effort-value">
                    {data.digitalEffort.attendanceRate}
                    <span className="annual-report-effort-unit">%</span>
                  </p>
                  <p className="annual-report-effort-caption">Katıldığı canlı ders oranı</p>
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
                    {data.digitalEffort.focusHours}
                    <span className="annual-report-effort-unit">saat</span>
                  </p>
                  <p className="annual-report-effort-caption">Toplam pomodoro odak süresi</p>
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
                    {formatMinutesToHhMm(data.digitalEffort.videoMinutes)}
                  </p>
                  <p className="annual-report-effort-caption">İzlenen toplam ders videosu</p>
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
                    {data.digitalEffort.solvedQuestions.toLocaleString('tr-TR')}
                  </p>
                  <p className="annual-report-effort-caption">Çözülen toplam soru sayısı</p>
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

            {subjectSummaries.length > 0 && (
              <div className="annual-report-subject-summary">
                <div className="annual-report-subject-summary-title">
                  Ders Bazlı Genel Özet
                </div>
                <div className="annual-report-subject-summary-table-wrapper">
                  <table className="annual-report-subject-summary-table">
                    <thead>
                      <tr>
                        <th>Ders</th>
                        <th>Toplam</th>
                        <th>Doğru</th>
                        <th>Yanlış</th>
                        <th>Boş</th>
                        <th>Doğru %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subjectSummaries.map((s) => (
                        <tr key={s.id}>
                          <td>{s.label}</td>
                          <td>{s.total}</td>
                          <td>{s.correct}</td>
                          <td>{s.incorrect}</td>
                          <td>{s.blank}</td>
                          <td>{s.total > 0 ? s.correctPercent.toFixed(1) : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="annual-report-subject-tabs">
              {data.subjects.map((subject) => {
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
              {data.subjects.map((subject) => {
                const isOpen = openSubjectId === subject.id;
                const subjectAvg =
                  subject.topics.length > 0
                    ? subject.topics.reduce((acc, t) => acc + t.masteryPercent, 0) /
                      subject.topics.length
                    : 0;
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
                          const blankCount = (topic as any).blank ?? 0;
                          const total = topic.correct + topic.incorrect + blankCount || 1;
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
                                    Doğru: {topic.correct} · Yanlış: {topic.incorrect} · Boş:{' '}
                                    {blankCount}
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
                                  <span>Doğru / Yanlış / Boş dağılımı</span>
                                  <span>
                                    {correctRatio.toFixed(0)}% doğru ·{' '}
                                    {(total > 0
                                      ? ((topic.incorrect / total) * 100).toFixed(0)
                                      : '0')}
                                    % yanlış ·{' '}
                                    {(total > 0
                                      ? ((blankCount / total) * 100).toFixed(0)
                                      : '0')}
                                    % boş
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
              <p className="annual-report-coach-text">{data.coachNote}</p>
              <p className="annual-report-coach-meta">
                Not: Bu yorum, yıl boyunca toplanan performans ve efor verilerine göre yapay zeka koç
                tarafından otomatik üretilmiştir.
              </p>
            </div>
          </div>
        </section>

        {/* DETAYLI SINAV ANALİZİ – EK SAYFA (TABLOLAR) */}
        {data.subjects.length > 0 && (
          <section className="annual-report-detail-section">
            <div className="glass-card annual-report-card annual-report-card--detail">
              <div className="annual-report-card-header">
                <div>
                  <p className="annual-report-eyebrow">
                    Ek Sayfa · Detaylı Sınav Analizi
                  </p>
                  <h2 className="annual-report-card-title">
                    Ders ve Konu Bazlı Soru Analizi
                  </h2>
                  <p className="annual-report-card-helper">
                    Her ders için; konu bazında kaç soru çözüldüğü, doğru-yanlış-boş dağılımı ve
                    başarı yüzdesi tablo halinde gösterilmiştir. Bu sayfa, PDF çıktısında ayrı bir
                    rapor sayfası olarak kullanılabilir.
                  </p>
                </div>
              </div>

              <div className="annual-report-detail-body">
                {data.subjects.map((subject) => (
                  <div
                    key={subject.id}
                    className="annual-report-detail-subject"
                  >
                    <h3 className="annual-report-detail-subject-title">
                      {subject.label}
                    </h3>
                    <div className="annual-report-detail-table-wrapper">
                      <table className="annual-report-detail-table">
                        <thead>
                          <tr>
                            <th>Konu</th>
                            <th>Toplam</th>
                            <th>Doğru</th>
                            <th>Yanlış</th>
                            <th>Boş</th>
                            <th>Doğru %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {subject.topics.length === 0 && (
                            <tr>
                              <td colSpan={6} className="annual-report-detail-empty-cell">
                                Bu derste henüz analiz edilebilecek deneme verisi bulunmuyor.
                              </td>
                            </tr>
                          )}
                          {subject.topics.map((t) => {
                            const total = t.correct + t.incorrect + t.blank;
                            const correctPercent =
                              total > 0 ? ((t.correct / total) * 100).toFixed(1) : '-';
                            return (
                              <tr key={t.id}>
                                <td>{t.name}</td>
                                <td>{total}</td>
                                <td>{t.correct}</td>
                                <td>{t.incorrect}</td>
                                <td>{t.blank}</td>
                                <td>{correctPercent}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Boş sorulara odaklan kartı */}
            {topBlankTopics.length > 0 && (
              <div className="glass-card annual-report-card annual-report-card--blanks">
                <div className="annual-report-card-header">
                  <div>
                    <p className="annual-report-eyebrow">
                      Odak Alanı · Boş Sorular
                    </p>
                    <h2 className="annual-report-card-title">Boş Sorulara Odaklan</h2>
                    <p className="annual-report-card-helper">
                      Aşağıda, en çok boş bıraktığın konu başlıkları listelenmiştir. Çalışma
                      planını yaparken önce bu konulara kısa konu tekrarı + hedefli mini denemeler
                      eklemen önerilir.
                    </p>
                  </div>
                </div>

                <div className="annual-report-blanks-summary">
                  <span>
                    Toplam boş soru: <strong>{totalBlankAll}</strong>
                  </span>
                  <span className="annual-report-blanks-hint">
                    Hedef: Önce ilk 3–5 konudaki boşları azalt; ardından yanlışlara odaklan.
                  </span>
                </div>

                <div className="annual-report-detail-table-wrapper">
                  <table className="annual-report-detail-table">
                    <thead>
                      <tr>
                        <th>Ders</th>
                        <th>Konu</th>
                        <th>Boş</th>
                        <th>Toplam</th>
                        <th>Boş %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topBlankTopics.map((row) => (
                        <tr key={`${row.subjectId}-${row.topicId}`}>
                          <td>{row.subjectLabel}</td>
                          <td>{row.topicName}</td>
                          <td>{row.blank}</td>
                          <td>{row.total}</td>
                          <td>
                            {row.total > 0 ? row.blankPercent.toFixed(1) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}

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

