import React from 'react';

export interface AnalysisData {
  studentName: string;
  subjectNets: {
    turkce: number;
    inkilap: number;
    din: number;
    ingilizce: number;
    matematik: number;
    fen: number;
    total: number;
  };
  currentStatus: { puan: number; percentile: number };
  priorityTopics: {
    total: number;
    levels: { level1: number; level2: number; level3: number };
  };
  projections: {
    current: { puan: number; percentile: number };
    level1: { puan: number; percentile: number };
    level2: { puan: number; percentile: number };
    level3: { puan: number; percentile: number };
  };
}

const StudentAnalysisReport: React.FC<{ data: AnalysisData }> = ({ data }) => {
  const getBadge = () => {
    if (data.currentStatus.puan >= data.projections.level3.puan)
      return { text: 'Efsane', color: 'bg-yellow-500', icon: '🏆' };
    if (data.currentStatus.puan >= data.projections.level2.puan)
      return { text: 'Yıldız', color: 'bg-blue-500', icon: '⭐' };
    if (data.currentStatus.puan >= data.projections.level1.puan)
      return { text: 'Gelişimci', color: 'bg-green-500', icon: '📈' };
    return null;
  };

  const badge = getBadge();

  return (
    <div className="max-w-4xl mx-auto bg-white p-8 shadow-2xl border border-gray-100 my-10 relative rounded-2xl">
      {badge && (
        <div
          className={`absolute top-4 right-4 ${badge.color} text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2`}
        >
          <span>{badge.icon}</span>
          <span className="font-bold text-sm tracking-wide uppercase">
            {badge.text} Rozeti Kazandın!
          </span>
        </div>
      )}

      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-800 uppercase tracking-tight">
          Analiz Önsöz &amp; Sonuçlar
        </h2>
        <p className="text-sm text-gray-600">
          Sayın <strong>{data.studentName}</strong>, performans analizine göre güncel durumun
          aşağıdadır.
        </p>
      </div>

      {/* Net Ortalamaları Tablosu */}
      <section className="mb-8 overflow-hidden rounded-lg border border-gray-200">
        <div className="bg-[#a53d38] text-white text-center py-2 font-bold">
          LGS Branş Netleri
        </div>
        <div className="grid grid-cols-7 text-center text-[11px] font-semibold divide-x divide-gray-200 bg-gray-50 border-b border-gray-200">
          <div className="p-2">Türkçe</div>
          <div className="p-2">İnk.</div>
          <div className="p-2">Din</div>
          <div className="p-2">İng.</div>
          <div className="p-2">Mat.</div>
          <div className="p-2">Fen</div>
          <div className="p-2 text-red-600 font-bold uppercase">Toplam</div>
        </div>
        <div className="grid grid-cols-7 text-center text-sm divide-x divide-gray-200">
          <div className="p-2">{data.subjectNets.turkce.toFixed(2)}</div>
          <div className="p-2">{data.subjectNets.inkilap.toFixed(2)}</div>
          <div className="p-2">{data.subjectNets.din.toFixed(2)}</div>
          <div className="p-2">{data.subjectNets.ingilizce.toFixed(2)}</div>
          <div className="p-2">{data.subjectNets.matematik.toFixed(2)}</div>
          <div className="p-2">{data.subjectNets.fen.toFixed(2)}</div>
          <div className="p-2 font-bold">{data.subjectNets.total.toFixed(2)}</div>
        </div>
      </section>

      {/* 7 Konu Odak Noktası */}
      <div className="flex flex-col md:flex-row items-center justify-around gap-12 my-12 py-8 bg-slate-50 rounded-2xl">
        <div className="text-center">
          <div className="w-40 h-40 rounded-full border-4 border-white shadow-xl flex flex-col items-center justify-center bg-white">
            <span className="text-[10px] text-gray-400 font-bold">TOPLAM</span>
            <div className="text-4xl font-black text-red-600 leading-none">
              {data.priorityTopics.total}
            </div>
            <span className="text-[10px] text-gray-400 font-bold">KONU</span>
          </div>
          <p className="mt-4 text-[11px] font-medium text-slate-500 italic max-w-[150px]">
            Daha başarılı olman için tespit edilen eksikler.
          </p>
        </div>

        <div className="flex flex-col gap-3 w-64">
          {(['level1', 'level2', 'level3'] as const).map((key, idx) => {
            const value = data.priorityTopics.levels[key];
            return (
              <div
                key={key}
                className="flex items-center gap-3 bg-white p-2 rounded-lg shadow-sm border border-gray-100"
              >
                <span
                  className={`w-3 h-3 rounded-full ${
                    idx === 0 ? 'bg-purple-500' : idx === 1 ? 'bg-cyan-500' : 'bg-orange-400'
                  }`}
                />
                <span className="text-xs font-bold text-slate-700 flex-1">
                  {idx + 1}. Öncelik
                </span>
                <span className="bg-slate-100 px-3 py-1 rounded-md font-bold text-xs">
                  {value} Konu
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tahmin ve Hedef Tablosu */}
      <section className="rounded-lg border border-gray-200 overflow-hidden">
        <div className="bg-[#0070c0] text-white text-center py-2 font-bold text-xs uppercase italic">
          Öğrenince Ulaşabileceğin Hedefler
        </div>
        <table className="w-full text-center text-xs">
          <thead className="bg-gray-100 font-bold border-b border-gray-200">
            <tr>
              <th className="p-3" />
              <th className="p-3">MEVCUT</th>
              <th className="p-3">1. ÖNCELİK</th>
              <th className="p-3">2. ÖNCELİK</th>
              <th className="p-3">3. ÖNCELİK</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            <tr>
              <td className="p-3 font-bold bg-gray-50">LGS PUAN</td>
              <td className="p-3 font-semibold">{data.projections.current.puan.toFixed(1)}</td>
              <td className="p-3 text-blue-600 font-bold">
                {data.projections.level1.puan.toFixed(1)}
              </td>
              <td className="p-3 text-blue-600 font-bold">
                {data.projections.level2.puan.toFixed(1)}
              </td>
              <td className="p-3 text-blue-600 font-bold">
                {data.projections.level3.puan.toFixed(1)}
              </td>
            </tr>
            <tr>
              <td className="p-3 font-bold bg-gray-50">YÜZDELİK</td>
              <td className="p-3 text-gray-500">% {data.projections.current.percentile.toFixed(2)}</td>
              <td className="p-3 text-green-600 font-bold">
                % {data.projections.level1.percentile.toFixed(2)}
              </td>
              <td className="p-3 text-green-600 font-bold">
                % {data.projections.level2.percentile.toFixed(2)}
              </td>
              <td className="p-3 text-green-600 font-bold">
                % {data.projections.level3.percentile.toFixed(2)}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <footer className="mt-8 pt-4 border-t border-gray-100 flex justify-between text-[10px] text-gray-400 font-bold uppercase tracking-widest">
        <span>{data.studentName}</span>
        <span>Skytech Yazılım Raporlama</span>
      </footer>
    </div>
  );
};

export default StudentAnalysisReport;

