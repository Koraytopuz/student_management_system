import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface ExamScore {
  examName: string;
  score: number;
}

export interface SubjectRow {
  subjectName: string;
  questionCount: number;
  nets: number[]; // Her sınav için net değeri (sıralama examNames ile aynı)
  average: number; // Dersin ortalama neti (tek sınavsa mevcut net)
}

export interface GraphData {
  subjectName: string;
  successPercent: number; // 0–100 arası başarı yüzdesi
}

export interface ReportData {
  studentName: string;
  reportDate: string; // '2026-02-12' veya hazır formatlanmış metin
  lgsScore: number;
  percentile: number;
  examNames: string[];
  subjects: SubjectRow[];
  graphData: GraphData[];
}

interface ExamResultReportProps {
  data: ReportData;
}

const ExamResultReport: React.FC<ExamResultReportProps> = ({ data }) => {
  const { examNames, subjects } = data;

  // Alt toplam satırı için her sınavın toplam neti
  const examTotals = useMemo(() => {
    return examNames.map((_, examIdx) =>
      subjects.reduce((sum, subject) => {
        const v = subject.nets[examIdx];
        return sum + (Number.isFinite(v) ? v : 0);
      }, 0),
    );
  }, [examNames, subjects]);

  const totalQuestionCount = useMemo(
    () => subjects.reduce((sum, s) => sum + s.questionCount, 0),
    [subjects],
  );

  const totalAverage = useMemo(
    () =>
      subjects.length > 0
        ? subjects.reduce((sum, s) => sum + (Number.isFinite(s.average) ? s.average : 0), 0) /
          subjects.length
        : 0,
    [subjects],
  );

  return (
    <div className="w-full bg-white text-slate-800 rounded-xl shadow-lg border border-slate-200 print:shadow-none print:border-none">
      {/* Üst Başlıklar */}
      <header className="text-center">
        <div className="bg-[#c0392b] text-white font-bold text-sm py-2 tracking-[0.15em] uppercase print:bg-[#c0392b]">
          NETLER VE PUANLAR
        </div>
        <div className="bg-[#2980b9] text-white font-semibold text-xs py-1 tracking-[0.18em] uppercase print:bg-[#2980b9]">
          NETLER-BRANŞ
        </div>
      </header>

      {/* Ana Tablo */}
      <section className="px-4 py-4 overflow-x-auto">
        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr>
              {/* LGS sütununun üst boşluğu */}
              <th className="w-10 border border-slate-300 bg-[#c0392b]" />
              <th className="border border-slate-300 bg-slate-100 px-2 py-1 text-left font-semibold">
                DERS ANALİZİ
              </th>
              <th className="border border-slate-300 bg-slate-100 px-2 py-1 text-center font-semibold">
                SORU SAYISI
              </th>
              {examNames.map((name) => (
                <th
                  key={name}
                  className="border border-slate-300 bg-slate-100 px-1 py-1 text-center font-semibold"
                >
                  <div className="flex justify-center items-end h-16">
                    <span className="inline-block transform -rotate-90 origin-bottom text-[10px] leading-tight">
                      {name}
                    </span>
                  </div>
                </th>
              ))}
              <th className="border border-slate-300 bg-slate-100 px-2 py-1 text-center font-semibold">
                ORTALAMA
              </th>
            </tr>
          </thead>
          <tbody>
            {subjects.map((subject, rowIdx) => {
              const isFirstRow = rowIdx === 0;
              return (
                <tr key={subject.subjectName}>
                  {/* Dikey LGS sütunu: ilk satırda tüm satırları kapsar */}
                  {isFirstRow && (
                    <td
                      rowSpan={subjects.length + 1}
                      className="border border-slate-300 bg-[#c0392b] text-white font-bold text-[11px] text-center align-middle"
                    >
                      <div className="flex items-center justify-center h-full">
                        <span className="transform -rotate-90 tracking-[0.25em]">LGS</span>
                      </div>
                    </td>
                  )}
                  <td className="border border-slate-300 px-2 py-1">{subject.subjectName}</td>
                  <td className="border border-slate-300 px-2 py-1 text-center">
                    {subject.questionCount}
                  </td>
                  {examNames.map((_, examIdx) => {
                    const v = subject.nets[examIdx];
                    const text = Number.isFinite(v) ? v.toFixed(2) : '-';
                    return (
                      <td
                        key={`${subject.subjectName}-${examIdx}`}
                        className="border border-slate-300 px-2 py-1 text-center"
                      >
                        {text}
                      </td>
                    );
                  })}
                  <td className="border border-slate-300 px-2 py-1 text-center font-semibold">
                    {Number.isFinite(subject.average) ? subject.average.toFixed(2) : '-'}
                  </td>
                </tr>
              );
            })}

            {/* TOPLAM satırı */}
            <tr className="bg-slate-100 font-semibold">
              <td className="border border-slate-300 px-2 py-1 text-left">TOPLAM</td>
              <td className="border border-slate-300 px-2 py-1 text-center">
                {totalQuestionCount}
              </td>
              {examTotals.map((tot, examIdx) => (
                <td
                  key={`total-${examIdx}`}
                  className="border border-slate-300 px-2 py-1 text-center"
                >
                  {tot.toFixed(2)}
                </td>
              ))}
              <td className="border border-slate-300 px-2 py-1 text-center">
                {totalAverage.toFixed(2)}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Başarı Yüzdesi Grafiği */}
      <section className="px-6 pb-4">
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-[0.18em] mb-2">
          BAŞARI YÜZDESİ
        </h3>
        <div className="w-full h-64 bg-white border border-slate-200 rounded-lg">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.graphData} margin={{ top: 20, right: 16, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
              <XAxis
                dataKey="subjectName"
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={{ stroke: '#9ca3af' }}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => `${v}`}
                tickLine={false}
                axisLine={{ stroke: '#9ca3af' }}
              />
              <Tooltip
                formatter={(value: number) => [`${value.toFixed(1)}%`, 'Başarı']}
                labelFormatter={(label) => `Ders: ${label}`}
              />
              <Bar dataKey="successPercent" fill="#2980b9">
                <LabelList
                  dataKey="successPercent"
                  position="top"
                  formatter={(value: number) => `${value.toFixed(0)}%`}
                  className="text-[10px]"
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Ders Ortalamaları ve Puanlar */}
      <section className="px-4 pb-4 space-y-4">
        {/* LGS Ders Ortalamaları */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="bg-[#2980b9] text-white text-center py-2 text-xs font-bold uppercase tracking-[0.18em] print:bg-[#2980b9]">
            LGS DERS ORTALAMALARI
          </div>
          <table className="w-full text-center text-[11px] border-t border-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-2 py-1">Türkçe</th>
                <th className="px-2 py-1">İnk. Tarihi ve At.</th>
                <th className="px-2 py-1">Din Kültürü</th>
                <th className="px-2 py-1">Yabancı Dil</th>
                <th className="px-2 py-1">Matematik</th>
                <th className="px-2 py-1">Fen Bilimleri</th>
                <th className="px-2 py-1 text-red-600 font-semibold">TOPLAM</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-2 py-1">{subjects.find((s) => s.subjectName === 'Türkçe')?.average.toFixed(2) ?? '-'}</td>
                <td className="px-2 py-1">
                  {subjects
                    .find((s) => s.subjectName === 'İnkılap Tarihi ve Atatürkçülük')
                    ?.average.toFixed(2) ?? '-'}
                </td>
                <td className="px-2 py-1">
                  {subjects.find((s) => s.subjectName === 'Din Kültürü')?.average.toFixed(2) ??
                    '-'}
                </td>
                <td className="px-2 py-1">
                  {subjects.find((s) => s.subjectName === 'İngilizce')?.average.toFixed(2) ??
                    '-'}
                </td>
                <td className="px-2 py-1">
                  {subjects.find((s) => s.subjectName === 'Matematik')?.average.toFixed(2) ??
                    '-'}
                </td>
                <td className="px-2 py-1">
                  {subjects.find((s) => s.subjectName === 'Fen Bilimleri')?.average.toFixed(2) ??
                    '-'}
                </td>
                <td className="px-2 py-1 font-semibold">{totalAverage.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Puanlar Kutusu */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="bg-slate-50 text-center py-1 text-[11px] font-semibold tracking-[0.2em] uppercase">
            PUANLAR
          </div>
          <div className="grid grid-cols-2 text-[12px]">
            <div className="border-r border-slate-200">
              <div className="bg-slate-100 text-center py-1 font-semibold text-[11px]">
                LGS PUANI
              </div>
              <div className="py-2 text-center font-bold text-lg text-[#c0392b]">
                {data.lgsScore.toFixed(3)}
              </div>
            </div>
            <div>
              <div className="bg-slate-100 text-center py-1 font-semibold text-[11px]">
                YÜZDELİK DİLİM
              </div>
              <div className="py-2 text-center font-bold text-lg text-[#2980b9]">
                % {data.percentile.toFixed(2)}
              </div>
            </div>
          </div>
          <div className="px-4 py-2 text-[10px] text-slate-500 text-right italic">
            {new Date(data.reportDate).toLocaleDateString('tr-TR')}
          </div>
        </div>
      </section>
    </div>
  );
};

export default ExamResultReport;

