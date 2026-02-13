import React, { useMemo } from 'react';

export interface PriorityTopic {
  id: string;
  subject: string;
  topic: string;
  question: number;
  correct: number;
  wrong: number;
  empty: number;
  net: number;
  lostScore: number;
  successPercent: number;
}

export interface ThirdPriorityData {
  studentName: string;
  reportDate: string;
  targetScore: number;
  scoreIncrease: number;
  topics: PriorityTopic[];
}

interface ThirdPriorityReportProps {
  data: ThirdPriorityData;
}

const getPercentClass = (p: number): string => {
  if (p <= 40) {
    // düşük başarı
    return 'bg-[#8e44ad] text-white';
  }
  if (p <= 70) {
    // orta başarı
    return 'bg-[#f39c12] text-black';
  }
  // yüksek başarı
  return 'bg-[#27ae60] text-white';
};

const ThirdPriorityReport: React.FC<ThirdPriorityReportProps> = ({ data }) => {
  const totals = useMemo(
    () =>
      data.topics.reduce(
        (acc, row) => {
          acc.question += row.question;
          acc.correct += row.correct;
          acc.wrong += row.wrong;
          acc.empty += row.empty;
          acc.net += row.net;
          acc.lostScore += row.lostScore;
          return acc;
        },
        { question: 0, correct: 0, wrong: 0, empty: 0, net: 0, lostScore: 0 },
      ),
    [data.topics],
  );

  const totalPercent =
    totals.question > 0 ? (totals.net / totals.question) * 100 : 0;

  const formattedDate = useMemo(
    () => new Date(data.reportDate).toLocaleDateString('tr-TR'),
    [data.reportDate],
  );

  return (
    <div className="w-full bg-white text-slate-800 rounded-xl shadow-lg border border-slate-200 print:shadow-none print:border-none">
      {/* Üst Bilgi Kutusu */}
      <section className="px-4 pt-4 pb-2 print:break-inside-avoid" style={{ breakInside: 'avoid' }}>
        <div className="bg-[#d35400] text-white font-bold text-xs md:text-sm text-center py-2 rounded-t-md tracking-[0.16em] uppercase print:bg-[#d35400]">
          3. ÖNCELİKLİ (DESTEKLEYİCİ) KONULAR BİTİRİLDİĞİNDE ULAŞILACAK PUANLAR
        </div>
        <div className="border border-t-0 border-slate-200 rounded-b-md bg-slate-50 p-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-2">
            <div className="border border-[#e67e22] rounded-md bg-white px-4 py-3">
              <div className="text-[11px] font-semibold text-[#d35400] tracking-[0.16em] uppercase">
                TAHMİNİ ARTIŞ
              </div>
              <div className="mt-1 text-2xl font-extrabold text-slate-900">
                +{data.scoreIncrease.toFixed(1)}
              </div>
            </div>
            <div className="border border-[#f39c12] rounded-md bg-white px-4 py-3">
              <div className="text-[11px] font-semibold text-[#d35400] tracking-[0.16em] uppercase">
                HEDEF LGS PUANI
              </div>
              <div className="mt-1 text-2xl font-extrabold text-slate-900">
                {data.targetScore.toFixed(1)}
              </div>
            </div>
          </div>
          <p className="mt-1 text-[11px] text-slate-600 leading-relaxed">
            Bu gruptaki konular güçlendirildiğinde puanın yaklaşık{' '}
            <span className="font-semibold text-[#d35400]">
              {data.scoreIncrease.toFixed(1)}
            </span>{' '}
            puan artarak, tahmini puanın{' '}
            <span className="font-semibold text-[#d35400]">
              {data.targetScore.toFixed(1)}
            </span>{' '}
            seviyesine yaklaşacağı öngörülmektedir.
          </p>
        </div>
      </section>

      {/* Konu Listesi Tablosu */}
      <section className="px-4 pb-4 print:break-inside-avoid" style={{ breakInside: 'avoid' }}>
        <div className="bg-[#d35400] text-white font-bold text-xs md:text-sm text-center py-2 rounded-t-md tracking-[0.16em] uppercase print:bg-[#d35400]">
          3. ÖNCELİKLİ KONU LİSTESİ
        </div>
        <div className="border border-t-0 border-slate-200 rounded-b-md overflow-x-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr>
                <th
                  rowSpan={2}
                  className="border border-slate-300 bg-[#e67e22] text-white px-2 py-2 text-left font-semibold"
                >
                  DERS
                </th>
                <th
                  rowSpan={2}
                  className="border border-slate-300 bg-[#e67e22] text-white px-2 py-2 text-left font-semibold"
                >
                  KONU
                </th>
                <th
                  colSpan={5}
                  className="border border-slate-300 bg-[#e67e22] text-white px-2 py-2 text-center font-semibold"
                >
                  TOPLAM
                </th>
                <th
                  rowSpan={2}
                  className="border border-slate-300 bg-[#e67e22] text-white px-2 py-2 text-center font-semibold"
                >
                  KAYIP PUAN
                </th>
                <th
                  rowSpan={2}
                  className="border border-slate-300 bg-[#e67e22] text-white px-2 py-2 text-center font-semibold"
                >
                  YÜZDE
                </th>
              </tr>
              <tr>
                <th className="border border-slate-300 bg-[#e67e22] text-white px-2 py-1 text-center font-semibold">
                  SORU
                </th>
                <th className="border border-slate-300 bg-[#e67e22] text-white px-2 py-1 text-center font-semibold">
                  DOĞRU
                </th>
                <th className="border border-slate-300 bg-[#e67e22] text-white px-2 py-1 text-center font-semibold">
                  YANLIŞ
                </th>
                <th className="border border-slate-300 bg-[#e67e22] text-white px-2 py-1 text-center font-semibold">
                  BOŞ
                </th>
                <th className="border border-slate-300 bg-[#e67e22] text-white px-2 py-1 text-center font-semibold">
                  NET
                </th>
              </tr>
            </thead>
            <tbody>
              {data.topics.map((row) => (
                <tr
                  key={row.id}
                  className="break-inside-avoid"
                  style={{ breakInside: 'avoid' }}
                >
                  <td className="border border-slate-300 px-2 py-1 text-left whitespace-nowrap">
                    {row.subject}
                  </td>
                  <td className="border border-slate-300 px-2 py-1 text-left whitespace-nowrap">
                    {row.topic}
                  </td>
                  <td className="border border-slate-300 px-2 py-1 text-center">
                    {row.question}
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

              {/* Dip Toplam */}
              <tr className="bg-[#f39c12] font-semibold print:bg-[#f39c12]">
                <td className="border border-slate-300 px-2 py-1 text-left" colSpan={2}>
                  TOPLAM
                </td>
                <td className="border border-slate-300 px-2 py-1 text-center">
                  {totals.question}
                </td>
                <td className="border border-slate-300 px-2 py-1 text-center">
                  {totals.correct}
                </td>
                <td className="border border-slate-300 px-2 py-1 text-center">
                  {totals.wrong}
                </td>
                <td className="border border-slate-300 px-2 py-1 text-center">
                  {totals.empty}
                </td>
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
        </div>
      </section>

      {/* Footer */}
      <footer className="px-4 pb-3 border-t border-slate-200 flex justify-between text-[10px] text-slate-500 font-semibold uppercase tracking-[0.16em]">
        <span>{data.studentName}</span>
        <span>{formattedDate}</span>
        <span>3. ÖNCELİK RAPORU</span>
      </footer>
    </div>
  );
};

export default ThirdPriorityReport;

// Örnek kullanım için mock data:
/*
export const mockThirdPriorityData: ThirdPriorityData = {
  studentName: 'ESLEM YÜCEL',
  reportDate: '2026-02-12T00:00:00.000Z',
  targetScore: 337.3,
  scoreIncrease: 34.0,
  topics: [
    {
      id: '1',
      subject: 'MATEMATİK 8.SINIF',
      topic: 'ÜSLÜ İFADELER',
      question: 47,
      correct: 13,
      wrong: 14,
      empty: 20,
      net: 8.33,
      lostScore: 10.37,
      successPercent: 17.72,
    },
    {
      id: '2',
      subject: 'FEN BİLİMLERİ 8.SINIF',
      topic: 'MEVSİMLER VE İKLİM',
      question: 25,
      correct: 9,
      wrong: 7,
      empty: 9,
      net: 3.33,
      lostScore: 7.07,
      successPercent: 13.2,
    },
    {
      id: '3',
      subject: 'FEN BİLİMLERİ 8.SINIF',
      topic: 'DNA VE GENETİK KOD',
      question: 21,
      correct: 6,
      wrong: 9,
      empty: 6,
      net: 1.5,
      lostScore: 9.5,
      successPercent: 28.57,
    },
  ],
};
*/

