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

// ---- Types ----

export interface CourseRow {
  courseName: string;
  questionCount: number;
  correct: number;
  wrong: number;
  empty: number;
  net: number;
  lostScore: number;
  successPercent: number;
}

export interface CourseAnalysisData {
  studentName: string;
  reportDate: string; // ISO veya hazır tarih string
  courses: CourseRow[];
}

interface CourseAnalysisReportProps {
  data: CourseAnalysisData;
}

// ---- Helpers ----

const getPercentClass = (percent: number): string => {
  if (percent < 20) return 'bg-[#6c5ce7] text-white';
  if (percent < 40) return 'bg-[#e17055] text-white';
  if (percent < 60) return 'bg-[#ffeaa7] text-black';
  return 'bg-[#fdcb6e] text-black';
};

const CourseAnalysisReport: React.FC<CourseAnalysisReportProps> = ({ data }) => {
  const totals = useMemo(
    () =>
      data.courses.reduce(
        (acc, row) => {
          acc.questionCount += row.questionCount;
          acc.correct += row.correct;
          acc.wrong += row.wrong;
          acc.empty += row.empty;
          acc.net += row.net;
          acc.lostScore += row.lostScore;
          return acc;
        },
        {
          questionCount: 0,
          correct: 0,
          wrong: 0,
          empty: 0,
          net: 0,
          lostScore: 0,
        },
      ),
    [data.courses],
  );

  const totalPercent =
    totals.questionCount > 0 ? (totals.net / totals.questionCount) * 100 : 0;

  const formattedDate = useMemo(
    () => new Date(data.reportDate).toLocaleDateString('tr-TR'),
    [data.reportDate],
  );

  return (
    <div className="w-full bg-white text-slate-800 rounded-xl shadow-lg border border-slate-200 print:shadow-none print:border-none">
      {/* Başlık */}
      <header className="text-center">
        <div className="bg-[#c0392b] text-white font-bold text-sm py-2 tracking-[0.15em] uppercase print:bg-[#c0392b]">
          DERS ANALİZİ
        </div>
      </header>

      {/* Tablo */}
      <section className="px-4 pt-4 pb-2 overflow-x-auto print:break-inside-avoid" style={{ breakInside: 'avoid' }}>
        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr>
              <th
                rowSpan={2}
                className="border border-slate-300 bg-[#2980b9] text-white px-3 py-2 text-left font-semibold"
              >
                DERS ANALİZİ
              </th>
              <th
                colSpan={5}
                className="border border-slate-300 bg-[#2980b9] text-white px-3 py-2 text-center font-semibold"
              >
                TOPLAM
              </th>
              <th
                rowSpan={2}
                className="border border-slate-300 bg-[#2980b9] text-white px-3 py-2 text-center font-semibold"
              >
                KAYIP PUAN
              </th>
              <th
                rowSpan={2}
                className="border border-slate-300 bg-[#2980b9] text-white px-3 py-2 text-center font-semibold"
              >
                YÜZDE
              </th>
            </tr>
            <tr>
              <th className="border border-slate-300 bg-[#2980b9] text-white px-2 py-1 text-center font-semibold">
                SORU
              </th>
              <th className="border border-slate-300 bg-[#2980b9] text-white px-2 py-1 text-center font-semibold">
                DOĞRU
              </th>
              <th className="border border-slate-300 bg-[#2980b9] text-white px-2 py-1 text-center font-semibold">
                YANLIŞ
              </th>
              <th className="border border-slate-300 bg-[#2980b9] text-white px-2 py-1 text-center font-semibold">
                BOŞ
              </th>
              <th className="border border-slate-300 bg-[#2980b9] text-white px-2 py-1 text-center font-semibold">
                NET
              </th>
            </tr>
          </thead>
          <tbody>
            {data.courses.map((row) => (
              <tr key={row.courseName} className="break-inside-avoid" style={{ breakInside: 'avoid' }}>
                <td className="border border-slate-300 px-2 py-1 whitespace-nowrap">
                  {row.courseName}
                </td>
                <td className="border border-slate-300 px-2 py-1 text-center">
                  {row.questionCount}
                </td>
                <td className="border border-slate-300 px-2 py-1 text-center">
                  {row.correct}
                </td>
                <td className="border border-slate-300 px-2 py-1 text-center">
                  {row.wrong}
                </td>
                <td className="border border-slate-300 px-2 py-1 text-center">
                  {row.empty}
                </td>
                <td className="border border-slate-300 px-2 py-1 text-center">
                  {row.net.toFixed(2)}
                </td>
                <td className="border border-slate-300 px-2 py-1 text-center">
                  {row.lostScore.toFixed(2)}
                </td>
                <td
                  className={`border border-slate-300 px-2 py-1 text-center font-semibold ${getPercentClass(
                    row.successPercent,
                  )}`}
                >
                  {row.successPercent.toFixed(2)}
                </td>
              </tr>
            ))}

            {/* TOPLAM satırı */}
            <tr className="bg-[#74b9ff] font-semibold print:bg-[#74b9ff]">
              <td className="border border-slate-300 px-2 py-1 text-left">TOPLAM</td>
              <td className="border border-slate-300 px-2 py-1 text-center">
                {totals.questionCount}
              </td>
              <td className="border border-slate-300 px-2 py-1 text-center">{totals.correct}</td>
              <td className="border border-slate-300 px-2 py-1 text-center">{totals.wrong}</td>
              <td className="border border-slate-300 px-2 py-1 text-center">{totals.empty}</td>
              <td className="border border-slate-300 px-2 py-1 text-center">
                {totals.net.toFixed(2)}
              </td>
              <td className="border border-slate-300 px-2 py-1 text-center">
                {totals.lostScore.toFixed(2)}
              </td>
              <td
                className={`border border-slate-300 px-2 py-1 text-center ${getPercentClass(
                  totalPercent,
                )}`}
              >
                {totalPercent.toFixed(2)}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Grafik Alanı */}
      <section
        className="px-4 pb-4 mt-4 print:break-inside-avoid"
        style={{ breakInside: 'avoid' }}
      >
        <div className="w-full border border-slate-200 rounded-md mb-2 py-1 bg-slate-50">
          <h3 className="text-xs font-bold text-slate-700 text-center tracking-[0.18em]">
            DERS ANALİZ YÜZDESİ
          </h3>
        </div>
        <div className="w-full h-64 border border-slate-200 rounded-md bg-white">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data.courses}
              margin={{ top: 20, right: 16, left: 0, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
              <XAxis
                dataKey="courseName"
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
              <Bar
                dataKey="successPercent"
                fill="#a2c4d9"
                stroke="#000000"
                strokeWidth={0.5}
              >
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
        <div className="mt-2 text-[10px] text-right text-slate-500 italic">
          {data.studentName} · {formattedDate}
        </div>
      </section>
    </div>
  );
};

export default CourseAnalysisReport;

// Örnek kullanım için mock data:
/*
export const mockCourseAnalysis: CourseAnalysisData = {
  studentName: 'ESLEM YÜCEL',
  reportDate: '2026-02-12T00:00:00.000Z',
  courses: [
    {
      courseName: 'TÜRKÇE 8.SINIF',
      questionCount: 99,
      correct: 68,
      wrong: 28,
      empty: 3,
      net: 58.66,
      lostScore: 27.41,
      successPercent: 59.25,
    },
    {
      courseName: 'İNK. TARİHİ VE ATA.',
      questionCount: 20,
      correct: 12,
      wrong: 8,
      empty: 0,
      net: 9.33,
      lostScore: 3.06,
      successPercent: 46.65,
    },
    {
      courseName: 'DİN KÜLTÜRÜ 8.SINIF',
      questionCount: 47,
      correct: 33,
      wrong: 14,
      empty: 0,
      net: 28.34,
      lostScore: 3.08,
      successPercent: 60.3,
    },
    {
      courseName: 'İNGİLİZCE 8.SINIF',
      questionCount: 91,
      correct: 37,
      wrong: 39,
      empty: 15,
      net: 21.61,
      lostScore: 6.81,
      successPercent: 28.58,
    },
    {
      courseName: 'MATEMATİK 8.SINIF',
      questionCount: 95,
      correct: 22,
      wrong: 38,
      empty: 35,
      net: 9.33,
      lostScore: 55.97,
      successPercent: 9.82,
    },
    {
      courseName: 'FEN BİLİMLERİ 8.SINIF',
      questionCount: 25,
      correct: 11,
      wrong: 12,
      empty: 2,
      net: 7.0,
      lostScore: 41.48,
      successPercent: 28.0,
    },
  ],
};
*/

