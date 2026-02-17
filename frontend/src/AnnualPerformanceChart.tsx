import React from 'react';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import type { AnnualReportData } from './api';

interface AnnualPerformanceChartProps {
  reportData: AnnualReportData;
}

export const AnnualPerformanceChart: React.FC<AnnualPerformanceChartProps> = ({
  reportData,
}) => {
  const radarData = reportData.radar;

  const hasData = Array.isArray(radarData) && radarData.length > 0;

  const subjectCount = hasData ? radarData.length : 0;
  const avgStudent =
    hasData && radarData.length > 0
      ? radarData.reduce((acc, r) => acc + (r.student ?? 0), 0) / radarData.length
      : 0;
  const avgClass =
    hasData && radarData.length > 0
      ? radarData.reduce((acc, r) => acc + (r.classAvg ?? 0), 0) / radarData.length
      : 0;
  const avgDelta = avgStudent - avgClass;

  return (
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
          {hasData && (
            <div
              style={{
                marginTop: '0.35rem',
                textAlign: 'right',
                fontSize: '0.7rem',
                color: 'rgba(148,163,184,0.9)',
                lineHeight: 1.3,
              }}
            >
              <div>
                Ortalama fark:{' '}
                <span
                  style={{
                    fontWeight: 600,
                    color: avgDelta >= 0 ? '#4ade80' : '#fecaca',
                  }}
                >
                  {avgDelta >= 0 ? '+' : ''}
                  {avgDelta.toFixed(1)} puan
                </span>
              </div>
              <div>{subjectCount} derste karşılaştırma</div>
            </div>
          )}
        </div>
      </div>
      {hasData ? (
        <div className="annual-report-radar-shell">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} outerRadius="80%">
              <PolarGrid stroke="rgba(148,163,184,0.35)" />
              <PolarAngleAxis
                dataKey="axis"
                tick={{ fill: '#cbd5f5', fontSize: 11 }}
              />
              <PolarRadiusAxis
                angle={30}
                domain={[0, 100]}
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
              {/* Sadece üstte manuel legend kullanıldığı için burada extra legend yok */}
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
      ) : (
        <div className="annual-report-radar-shell flex items-center justify-center text-xs text-slate-400">
          Henüz yeterli deneme sonucu olmadığı için karşılaştırmalı grafik oluşturulamadı.
        </div>
      )}
    </div>
  );
};

