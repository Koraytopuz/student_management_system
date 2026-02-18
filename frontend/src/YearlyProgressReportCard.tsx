import React from 'react';
import type { AnnualReportData } from './api';
import { resolveContentUrl } from './api';

interface YearlyProgressReportCardProps {
  reportData: AnnualReportData;
}

export const YearlyProgressReportCard: React.FC<YearlyProgressReportCardProps> = ({
  reportData,
}) => {
  const student = reportData.student;
  const avatarUrl = resolveContentUrl(student.avatarUrl);

  const scorePercent = Math.max(0, Math.min(100, (student.annualScore / 10) * 100));
  const gaugeRadius = 26;
  const gaugeCircumference = 2 * Math.PI * gaugeRadius;
  const gaugeOffset = gaugeCircumference * (1 - scorePercent / 100);

  const qualitativeLevel =
    student.annualScore >= 8.5
      ? 'Üst Düzey'
      : student.annualScore >= 7
        ? 'İyi'
        : 'Gelişim Alanı';

  return (
    <div className="glass-card rounded-2xl overflow-hidden px-6 py-5 space-y-4">
      {/* Üst: Küçük fotoğraf + başlık ve skor */}
      <div className="flex items-start gap-4">
        {/* Avatar solda küçük kutu olarak */}
        <div className="shrink-0">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={student.name}
              style={{
                width: 100,
                height: 100,
                borderRadius: 16,
                objectFit: 'cover',
              }}
            />
          ) : (
            <div
              className="flex items-center justify-center"
              style={{
                width: 100,
                height: 100,
                borderRadius: 16,
                background:
                  'linear-gradient(145deg, color-mix(in srgb, var(--accent-color) 18%, var(--glass-bg)), color-mix(in srgb, var(--glass-bg) 92%, var(--color-surface-soft)))',
                border: '1px solid var(--glass-border)',
              }}
            >
              <span
                className="text-xl font-semibold tracking-tight"
                style={{ color: 'var(--color-text-main)' }}
              >
                {student.name
                  .split(' ')
                  .map((p) => p[0])
                  .join('')
                  .slice(0, 2)}
              </span>
            </div>
          )}
        </div>

        {/* Başlık + skor bloğu */}
        <div className="flex-1 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.2em] text-sky-400 uppercase mb-1">
              Yıllık Gelişim Raporu
            </p>
            <h1
              className="text-xl md:text-2xl font-semibold tracking-tight"
              style={{ color: 'var(--color-text-main)' }}
            >
              Yıl Sonu Gelişim Raporu
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--color-text-main)' }}>
              {student.name} · {student.className}
            </p>
            <p className="text-xs md:text-sm mt-2" style={{ color: 'var(--color-text-muted)' }}>
              Yıl boyu performansının kişiselleştirilmiş özeti.
            </p>
          </div>

          {/* Dairesel genel başarı göstergesi */}
          <div className="annual-report-score-gauge-wrapper">
            <svg
              className="annual-report-score-gauge"
              viewBox="0 0 64 64"
            >
              <circle
                className="annual-report-score-gauge-bg"
                cx="32"
                cy="32"
                r={gaugeRadius}
              />
              <circle
                className="annual-report-score-gauge-fg"
                cx="32"
                cy="32"
                r={gaugeRadius}
                style={{
                  strokeDasharray: gaugeCircumference,
                  strokeDashoffset: gaugeOffset,
                }}
              />
            </svg>
            <div className="annual-report-score-gauge-label">
              <span className="annual-report-score-gauge-value">
                {student.annualScore.toFixed(1).replace('.', ',')}
              </span>
              <span className="annual-report-score-gauge-denom">10 üz.</span>
            </div>
          </div>
        </div>
      </div>

      {/* GENEL BAŞARI PUANI + yüzdelik dilim metni */}
      <div
        className="pt-2 mt-2 flex flex-col gap-1.5"
        style={{ borderTop: '1px solid var(--glass-border)' }}
      >
        <p
          className="text-[11px] font-semibold tracking-[0.18em] uppercase"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Genel Başarı Puanı
        </p>
        <p className="text-xs md:text-sm" style={{ color: 'var(--color-text-main)' }}>
          Tahmini yüzdelik dilim:{' '}
          <span
            className="font-semibold"
            style={{ color: 'color-mix(in srgb, var(--success) 85%, var(--color-text-main))' }}
          >
            %{student.annualRankPercentile}
          </span>
        </p>
        <p className="text-[11px] leading-snug" style={{ color: 'var(--color-text-muted)' }}>
          Bu skor; ders başarıları, dijital efor ve odaklanma metriklerinin birleşimiyle
          hesaplanmış yıllık genel performans indeksidir. Yüzdelik değer, benzer
          öğrenciler arasında yaklaşık konumunu gösteren tahmini bir dilimdir.
        </p>
        {/* Özet seviye etiketi + yatay ilerleme çubuğu */}
        <div className="mt-3 space-y-1.5">
          <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            <span>Genel seviye</span>
            <span
              className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
              style={{
                backgroundColor:
                  qualitativeLevel === 'Üst Düzey'
                    ? 'color-mix(in srgb, var(--success) 18%, transparent)'
                    : qualitativeLevel === 'İyi'
                      ? 'color-mix(in srgb, var(--accent-color) 16%, transparent)'
                      : 'color-mix(in srgb, var(--error) 14%, transparent)',
                color:
                  qualitativeLevel === 'Üst Düzey'
                    ? 'color-mix(in srgb, var(--success) 85%, var(--color-text-main))'
                    : qualitativeLevel === 'İyi'
                      ? 'color-mix(in srgb, var(--accent-color) 85%, var(--color-text-main))'
                      : 'color-mix(in srgb, var(--error) 85%, var(--color-text-main))',
                border: '1px solid var(--glass-border)',
              }}
            >
              {qualitativeLevel}
            </span>
          </div>
          <div
            className="w-full h-2 rounded-full overflow-hidden"
            style={{ background: 'var(--list-row-bg)', border: '1px solid var(--glass-border)' }}
          >
            <div
              className="h-full rounded-full bg-linear-to-r from-emerald-400 via-sky-400 to-indigo-500"
              style={{ width: `${scorePercent}%` }}
            />
          </div>
          <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
            Çubuk, 10 üzerinden genel başarı puanını görsel olarak temsil eder; sağa yaklaştıkça
            öğrencinin yıl sonu performansı artar.
          </p>
        </div>
      </div>
    </div>
  );
};

