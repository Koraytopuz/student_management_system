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

  return (
    <div className="glass-card flex flex-row gap-4 items-stretch rounded-2xl overflow-hidden">
      {/* Sol: Fotoğraf / avatar bloğu */}
      <div className="w-1/3 min-h-[180px] md:min-h-[220px] bg-slate-900/70 flex items-center justify-center rounded-r-none">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={student.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-3xl lg:text-4xl font-semibold tracking-tight text-slate-50">
            {student.name
              .split(' ')
              .map((p) => p[0])
              .join('')
              .slice(0, 2)}
          </span>
        )}
      </div>

      {/* Sağ: Metin + skor bloğu */}
      <div className="w-2/3 flex flex-col justify-center px-6 py-5 space-y-3 rounded-l-none">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.2em] text-sky-400 uppercase mb-1">
            Yıllık Gelişim Raporu
          </p>
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-slate-50">
            Yıl Sonu Gelişim Raporu
          </h1>
          <p className="text-sm text-slate-300 mt-1">
            {student.name} · {student.className}
          </p>
          <p className="text-xs md:text-sm text-slate-400 mt-2">
            Yıl boyu performansının kişiselleştirilmiş özeti.
          </p>
        </div>

        {/* GENEL BAŞARI PUANI + percentile */}
        <div className="pt-2 border-t border-slate-800/80 mt-2 flex flex-col gap-2">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-slate-400 uppercase">
            Genel Başarı Puanı
          </p>
          <div className="flex items-baseline gap-3">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl md:text-5xl font-semibold tracking-tight text-slate-50">
                {student.annualScore.toFixed(1)}
              </span>
              <span className="text-sm font-medium text-slate-400">/10</span>
            </div>
            <div className="ml-auto inline-flex items-center rounded-full bg-emerald-500/10 px-3 py-1">
              <span className="text-[11px] font-semibold tracking-wide text-emerald-200 mr-1">
                TOP
              </span>
              <span className="text-sm font-semibold text-emerald-300">
                {student.annualRankPercentile}
              </span>
              <span className="ml-1 text-[10px] uppercase tracking-wide text-emerald-200/80">
                percentile
              </span>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 leading-snug">
            Bu skor; ders başarıları, dijital efor ve odaklanma metriklerinin birleşimiyle
            hesaplanmış yıllık genel performans indeksidir.
          </p>
        </div>
      </div>
    </div>
  );
};

