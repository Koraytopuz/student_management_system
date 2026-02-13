import React, { useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { apiRequest, getStudentPerformanceReport, type AnnualReportData } from './api';
import { YearlyProgressReportCard } from './YearlyProgressReportCard';
import { AnnualPerformanceChart } from './AnnualPerformanceChart';

interface StudentSummary {
  id: string;
  name: string;
  email: string;
  gradeLevel?: string;
}

export const AdminReports: React.FC = () => {
  const { token } = useAuth();

  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [selectedGrade, setSelectedGrade] = useState<string>('');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [reportData, setReportData] = useState<AnnualReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    apiRequest<StudentSummary[]>('/admin/students', {}, token)
      .then((list) => {
        setStudents(list);
        if (list.length > 0 && !selectedStudentId) {
          const firstGrade = list[0].gradeLevel ?? '';
          setSelectedGrade(firstGrade);
          const firstInGrade = list.find((s) => s.gradeLevel === firstGrade) ?? list[0];
          setSelectedStudentId(firstInGrade.id);
        }
      })
      .catch((e) => {
        setError((e as Error).message);
      });
  }, [token]);

  useEffect(() => {
    if (!token || !selectedStudentId) {
      setReportData(null);
      return;
    }
    setLoading(true);
    getStudentPerformanceReport(token, selectedStudentId)
      .then((data) => setReportData(data))
      .catch(() => setReportData(null))
      .finally(() => setLoading(false));
  }, [token, selectedStudentId]);

  if (!token) {
    return <div className="p-8 text-center text-slate-400">Önce yönetici olarak giriş yapmalısınız.</div>;
  }

  // Benzersiz sınıf listesi (örn. "9", "10", "11", "12", "Mezun")
  const gradeOptions = Array.from(
    new Set(
      students
        .map((s) => s.gradeLevel)
        .filter((g): g is string => Boolean(g)),
    ),
  ).sort((a, b) => {
    if (a === 'Mezun') return 1;
    if (b === 'Mezun') return -1;
    return Number(a) - Number(b);
  });

  const filteredStudents =
    selectedGrade && gradeOptions.includes(selectedGrade)
      ? students.filter((s) => s.gradeLevel === selectedGrade)
      : students;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="glass-card p-4 flex flex-col gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-50">Yıllık Gelişim Raporları</h1>
          <p className="text-sm text-slate-400">
            Bir öğrenci seçerek yıllık performans kartını ve radar grafiğini görüntüleyin.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <label className="text-sm text-slate-300 flex flex-col gap-1 w-full sm:w-48">
            Sınıf Seçin
            <select
              value={selectedGrade}
              onChange={(e) => {
                const grade = e.target.value;
                setSelectedGrade(grade);
                const byGrade = grade
                  ? students.filter((s) => s.gradeLevel === grade)
                  : students;
                setSelectedStudentId(byGrade[0]?.id ?? '');
              }}
              className="rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              {gradeOptions.length === 0 && <option value="">Sınıf bulunamadı</option>}
              {gradeOptions.length > 0 && !selectedGrade && (
                <option value="">Sınıf seçin…</option>
              )}
              {gradeOptions.map((g) => (
                <option key={g} value={g}>
                  {g === 'Mezun' ? 'Mezun' : `${g}. Sınıf`}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm text-slate-300 flex flex-col gap-1 w-full sm:w-80">
            Öğrenci Seçin
            <select
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              {filteredStudents.length === 0 && <option value="">Bu sınıfta öğrenci yok</option>}
              {filteredStudents.length > 0 && !selectedStudentId && (
                <option value="">Öğrenci seçin…</option>
              )}
              {filteredStudents.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.gradeLevel ? `· ${s.gradeLevel}. Sınıf` : ''}
                </option>
              ))}
            </select>
          </label>
          {error && <span className="text-xs text-red-400">{error}</span>}
        </div>
      </div>

      {loading && (
        <div className="glass-card p-6 text-sm text-slate-300">Rapor verileri yükleniyor...</div>
      )}

      {!loading && reportData && (
        <div className="space-y-6">
          <YearlyProgressReportCard reportData={reportData} />
          <AnnualPerformanceChart reportData={reportData} />
        </div>
      )}
    </div>
  );
};

