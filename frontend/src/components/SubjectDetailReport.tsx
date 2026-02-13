import React, { useMemo } from 'react';

export interface TopicDetail {
  topicName: string;
  questionCount: number;
  correct: number;
  wrong: number;
  empty: number;
  net: number;
  lostScore: number;
  percent: number;
}

export interface SubjectBlock {
  subjectName: string;
  topics: TopicDetail[];
}

export interface SubjectDetailData {
  studentName: string;
  reportDate: string;
  subjects: SubjectBlock[];
}

interface SubjectDetailReportProps {
  data: SubjectDetailData;
}

const getPercentClass = (percent: number): string => {
  if (percent < 0) return 'bg-[#6c5ce7] text-white';
  if (percent < 20) return 'bg-[#c0392b] text-white';
  if (percent < 40) return 'bg-[#e67e22] text-white';
  if (percent < 60) return 'bg-[#f1c40f] text-black';
  if (percent < 80) return 'bg-[#2ecc71] text-black';
  return 'bg-[#27ae60] text-white';
};

const SubjectDetailReport: React.FC<SubjectDetailReportProps> = ({ data }) => {
  const formattedDate = useMemo(
    () => new Date(data.reportDate).toLocaleDateString('tr-TR'),
    [data.reportDate],
  );

  return (
    <div className="w-full bg-white text-slate-800 rounded-xl shadow-lg border border-slate-200 print:shadow-none print:border-none">
      {data.subjects.map((subject) => {
        const totals = subject.topics.reduce(
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
        );
        const totalPercent =
          totals.questionCount > 0 ? (totals.net / totals.questionCount) * 100 : 0;

        return (
          <section
            key={subject.subjectName}
            className="mt-4 px-4 pb-4 print:break-inside-avoid"
            style={{ breakInside: 'avoid' }}
          >
            {/* Ders Başlığı */}
            <div className="bg-[#c0392b] text-white font-bold text-sm py-2 text-center tracking-[0.12em] uppercase rounded-t-md print:bg-[#c0392b]">
              {subject.subjectName}
            </div>

            {/* Tablo */}
            <div className="overflow-x-auto border border-slate-200 border-t-0 rounded-b-md">
              <table className="w-full text-[11px] border-collapse">
                <thead>
                  <tr>
                    <th
                      rowSpan={2}
                      className="border border-slate-300 bg-[#2980b9] text-white px-3 py-2 text-left font-semibold"
                    >
                      KONU
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
                  {subject.topics.map((row) => (
                    <tr
                      key={row.topicName}
                      className="break-inside-avoid"
                      style={{ breakInside: 'avoid' }}
                    >
                      <td className="border border-slate-300 px-2 py-1 text-left whitespace-nowrap">
                        {row.topicName}
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
                          row.percent,
                        )}`}
                      >
                        {row.percent.toFixed(2)}
                      </td>
                    </tr>
                  ))}

                  {/* TOPLAM satırı */}
                  <tr className="bg-[#5da0c8] text-white font-semibold print:bg-[#5da0c8]">
                    <td className="border border-slate-300 px-2 py-1 text-left">TOPLAM</td>
                    <td className="border border-slate-300 px-2 py-1 text-center">
                      {totals.questionCount}
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
        );
      })}

      {/* Alt Footer */}
      <footer className="mt-4 px-4 py-2 border-t border-slate-200 flex justify-between text-[10px] text-slate-500 font-semibold uppercase tracking-[0.18em]">
        <span>{data.studentName}</span>
        <span>{formattedDate}</span>
        <span>Sayfa</span>
      </footer>
    </div>
  );
};

export default SubjectDetailReport;

// Örnek kullanım için mock data:
/*
export const mockSubjectDetailData: SubjectDetailData = {
  studentName: 'ESLEM YÜCEL',
  reportDate: '2026-02-12T00:00:00.000Z',
  subjects: [
    {
      subjectName: 'FEN BİLİMLERİ 8.SINIF',
      topics: [
        {
          topicName: 'MADDE VE ENDÜSTRİ',
          questionCount: 20,
          correct: 4,
          wrong: 1,
          empty: 3,
          net: 3.0,
          lostScore: 19.65,
          percent: 40.0,
        },
        {
          topicName: 'MEVSİMLER VE İKLİM',
          questionCount: 30,
          correct: 21,
          wrong: 4,
          empty: 5,
          net: 19.0,
          lostScore: 5.0,
          percent: 63.33,
        },
      ],
    },
    {
      subjectName: 'İNGİLİZCE 8.SINIF',
      topics: [
        {
          topicName: 'FRIENDSHIP',
          questionCount: 15,
          correct: 9,
          wrong: 3,
          empty: 3,
          net: 8.25,
          lostScore: 3.75,
          percent: 55.0,
        },
        {
          topicName: 'TEEN LIFE',
          questionCount: 15,
          correct: 5,
          wrong: 6,
          empty: 4,
          net: 3.0,
          lostScore: 7.0,
          percent: 33.33,
        },
      ],
    },
    {
      subjectName: 'MATEMATİK 8.SINIF',
      topics: [
        {
          topicName: 'ÜSLÜ İFADELER',
          questionCount: 20,
          correct: 13,
          wrong: 4,
          empty: 3,
          net: 12.0,
          lostScore: 6.0,
          percent: 60.0,
        },
        {
          topicName: 'MEVSİMLER VE İKLİM',
          questionCount: 15,
          correct: 2,
          wrong: 8,
          empty: 5,
          net: 0.0,
          lostScore: 13.0,
          percent: 13.33,
        },
      ],
    },
    {
      subjectName: 'DİN KÜLTÜRÜ 8.SINIF',
      topics: [
        {
          topicName: 'KAZA VE KADER',
          questionCount: 12,
          correct: 9,
          wrong: 2,
          empty: 1,
          net: 8.5,
          lostScore: 1.5,
          percent: 70.83,
        },
        {
          topicName: 'ZEKAT VE SADAKA',
          questionCount: 15,
          correct: 7,
          wrong: 5,
          empty: 3,
          net: 5.75,
          lostScore: 4.25,
          percent: 46.67,
        },
      ],
    },
  ],
};
*/

