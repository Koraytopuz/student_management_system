import React, { useMemo } from 'react';

// ---- Types ----

export interface TopicRow {
  id: string;
  subject: string;
  topic: string;
  questionCount: number;
  lgsPercent: number;
  acquiredScore: number;
  lostScore: number;
}

export interface SubjectAnalysisData {
  studentName: string;
  reportDate: string; // ISO string veya hazır formatlı tarih
  topics: TopicRow[];
}

interface SubjectAnalysisReportProps {
  data: SubjectAnalysisData;
}

// ---- Helpers ----

const getPercentBg = (row: TopicRow): string => {
  if (row.questionCount === 0) return 'bg-[#d98880]'; // Tahmini
  const p = row.lgsPercent;
  if (p < 20) return 'bg-[#7d66a8]';
  if (p < 40) return 'bg-[#d35400]';
  if (p < 60) return 'bg-[#f7dc6f]';
  return 'bg-[#e67e22]';
};

const SubjectAnalysisReport: React.FC<SubjectAnalysisReportProps> = ({ data }) => {
  const totals = useMemo(
    () =>
      data.topics.reduce(
        (acc, row) => {
          acc.questionCount += row.questionCount;
          acc.acquiredScore += row.acquiredScore;
          acc.lostScore += row.lostScore;
          return acc;
        },
        { questionCount: 0, acquiredScore: 0, lostScore: 0 },
      ),
    [data.topics],
  );

  const formattedDate = useMemo(
    () => new Date(data.reportDate).toLocaleDateString('tr-TR'),
    [data.reportDate],
  );

  return (
    <div className="w-full bg-white text-slate-800 rounded-xl shadow-lg border border-slate-200 print:shadow-none print:border-none">
      {/* Başlık */}
      <header className="text-center">
        <div className="bg-[#c0392b] text-white font-bold text-sm py-2 tracking-[0.15em] uppercase print:bg-[#c0392b]">
          KONU GRUBU ANALİZİ
        </div>
      </header>

      {/* Tablo */}
      <section className="px-4 pt-4 pb-2 overflow-x-auto">
        <table className="w-full text-[11px] border-collapse print:break-inside-avoid">
          <thead>
            <tr>
              <th className="border border-slate-300 bg-[#5da0c8] text-white px-2 py-1 text-left font-semibold">
                DERS
              </th>
              <th className="border border-slate-300 bg-[#5da0c8] text-white px-2 py-1 text-left font-semibold">
                KONU GRUBU
              </th>
              <th className="border border-slate-300 bg-[#5da0c8] text-white px-2 py-1 text-center font-semibold">
                SORU SAYISI
              </th>
              <th className="border border-slate-300 bg-[#5da0c8] text-white px-2 py-1 text-center font-semibold">
                YÜZDE LGS
              </th>
              <th
                className="border border-slate-300 bg-[#5da0c8] text-white px-2 py-1 text-center font-semibold"
                colSpan={2}
              >
                LGS-PUAN
              </th>
            </tr>
            <tr>
              <th className="border border-slate-300 bg-[#5da0c8] text-white px-2 py-0.5 text-xs font-semibold text-left">
                &nbsp;
              </th>
              <th className="border border-slate-300 bg-[#5da0c8] text-white px-2 py-0.5 text-xs font-semibold text-left">
                &nbsp;
              </th>
              <th className="border border-slate-300 bg-[#5da0c8] text-white px-2 py-0.5 text-xs font-semibold text-center">
                &nbsp;
              </th>
              <th className="border border-slate-300 bg-[#5da0c8] text-white px-2 py-0.5 text-xs font-semibold text-center">
                &nbsp;
              </th>
              <th className="border border-slate-300 bg-[#5da0c8] text-white px-2 py-0.5 text-xs font-semibold text-center">
                ALINAN
              </th>
              <th className="border border-slate-300 bg-[#5da0c8] text-white px-2 py-0.5 text-xs font-semibold text-center">
                KAYIP
              </th>
            </tr>
          </thead>
          <tbody>
            {data.topics.map((row) => {
              const rowBg = row.questionCount === 0 ? 'bg-[#f2dbdb]' : 'bg-white';
              const percentBg = getPercentBg(row);
              return (
                <tr
                  key={row.id}
                  className={`${rowBg} break-inside-avoid`}
                  style={{ breakInside: 'avoid' }}
                >
                  <td className="border border-slate-300 px-2 py-1 whitespace-nowrap">
                    {row.subject}
                  </td>
                  <td className="border border-slate-300 px-2 py-1 whitespace-nowrap">
                    {row.topic}
                  </td>
                  <td className="border border-slate-300 px-2 py-1 text-center">
                    {row.questionCount}
                  </td>
                  <td
                    className={`border border-slate-300 px-2 py-1 text-center text-slate-900 ${percentBg}`}
                  >
                    {row.lgsPercent.toFixed(2)}
                  </td>
                  <td className="border border-slate-300 px-2 py-1 text-center">
                    {row.acquiredScore.toFixed(2)}
                  </td>
                  <td className="border border-slate-300 px-2 py-1 text-center">
                    {row.lostScore.toFixed(2)}
                  </td>
                </tr>
              );
            })}

            {/* TOPLAM satırı */}
            <tr className="bg-slate-100 font-semibold">
              <td className="border border-slate-300 px-2 py-1 text-left">TOPLAM</td>
              <td className="border border-slate-300 px-2 py-1 text-left">TÜM DERSLER</td>
              <td className="border border-slate-300 px-2 py-1 text-center">
                {totals.questionCount}
              </td>
              <td className="border border-slate-300 px-2 py-1 text-center">&nbsp;</td>
              <td className="border border-slate-300 px-2 py-1 text-center">
                {totals.acquiredScore.toFixed(2)}
              </td>
              <td className="border border-slate-300 px-2 py-1 text-center">
                {totals.lostScore.toFixed(2)}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Önemli Bilgilendirme Kutusu */}
      <section className="px-4 pb-4 mt-4 break-inside-avoid" style={{ breakInside: 'avoid' }}>
        <div className="border border-blue-200 bg-blue-50 rounded-md p-3 text-[11px] leading-relaxed">
          <div className="font-bold text-xs text-blue-900 mb-1 uppercase tracking-wide">
            ÖNEMLİ BİLGİLENDİRME
          </div>
          <p className="text-slate-700">
            Yukarıda belirtilen pembe renkli satırlardaki konu gruplarına ilişkin soruların mevcut
            analizinizde sınav sorusu olarak gelmediği tespit edilmiştir. Bu durumun LGS puan
            hesaplamasına etkilerini dengelemek amacıyla, yapay zeka mevcut netleriniz doğrultusunda
            bir puan tahmini oluşturmuştur. Ancak, bu konu gruplarına ilişkin eksikleriniz öneri
            kapsamına alınmamış olup yalnızca puan hesaplaması sürecine dahil edilmiştir.
          </p>
          <div className="mt-2 text-[10px] text-right text-slate-500">
            {data.studentName} · {formattedDate}
          </div>
        </div>
      </section>
    </div>
  );
};

export default SubjectAnalysisReport;

// Örnek kullanım için mock data:
/*
const mockSubjectAnalysis: SubjectAnalysisData = {
  studentName: 'Ali 12. Sınıf Sayısal 1',
  reportDate: '2026-02-12T00:00:00.000Z',
  topics: [
    {
      id: '1',
      subject: 'TÜRKÇE 8. SINIF',
      topic: 'DİL BİLGİSİ',
      questionCount: 20,
      lgsPercent: 59.25,
      acquiredScore: 8.82,
      lostScore: 8.82,
    },
    {
      id: '2',
      subject: 'TÜRKÇE 8. SINIF',
      topic: 'PARAGRAF',
      questionCount: 40,
      lgsPercent: 60.0,
      acquiredScore: 16.31,
      lostScore: 11.59,
    },
    {
      id: '3',
      subject: 'İNK. TARİHİ VE ATA.',
      topic: '1.DÖNEM',
      questionCount: 20,
      lgsPercent: 46.65,
      acquiredScore: 4.94,
      lostScore: 5.06,
    },
    {
      id: '4',
      subject: 'DİN KÜLTÜRÜ 8. SINIF',
      topic: '1.DÖNEM',
      questionCount: 47,
      lgsPercent: 60.3,
      acquiredScore: 7.52,
      lostScore: 4.95,
    },
    {
      id: '5',
      subject: 'İNGİLİZCE 8. SINIF',
      topic: '2.DÖNEM',
      questionCount: 0,
      lgsPercent: 36.4,
      acquiredScore: 2.15,
      lostScore: 3.76,
    },
  ],
};
*/

