import React, { useState, useEffect } from 'react';
import { GlassCard } from '../../components/DashboardPrimitives';
import { FileText, Calendar, TrendingUp, ChevronRight, Clock } from 'lucide-react';
import ExamAnalysisReport from './ExamAnalysisReport';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

interface StudentExamListProps {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
  onSolveExam?: (examId: number) => void;
}

interface AssignedExam {
  id: number;
  name: string;
  type: string;
  date: string;
  questionCount: number;
}

interface ExamResultSummary {
  id: number; // ExamResult ID
  score: number;
  totalNet: number;
  percentile: number;
  exam: {
    id: number;
    name: string;
    type: string;
    date: string;
  };
}

export const StudentExamList: React.FC<StudentExamListProps> = ({ token, user, onSolveExam }) => {
  const [assignedExams, setAssignedExams] = useState<AssignedExam[]>([]);
  const [examResults, setExamResults] = useState<ExamResultSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedExam, setSelectedExam] = useState<ExamResultSummary | null>(null);

  useEffect(() => {
    fetchExamResults();
    fetchAssignedExams();
  }, [token, user.id]);

  const fetchAssignedExams = async () => {
    try {
      const response = await fetch(
        `${API_BASE}/api/student/exams`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (response.ok) {
        const data = await response.json();
        // Backend returns { exams: [...] }
        const list = data.exams || (Array.isArray(data) ? data : []);
        setAssignedExams(list);
      } else {
        console.error('Failed to fetch assigned exams:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Error fetching assigned exams:', error);
      setAssignedExams([]);
    }
  };

  const fetchExamResults = async () => {
    try {
      const response = await fetch(
        `${API_BASE}/api/student/exam-results/${user.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (response.ok) {
        const data = await response.json();
        setExamResults(data);
      }
    } catch (error) {
      console.error('Error fetching exam results:', error);
    } finally {
      setLoading(false);
    }
  };

  if (selectedExam) {
    return (
      <div className="space-y-4">
        <button 
          onClick={() => setSelectedExam(null)}
          className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
        >
          <ChevronRight className="rotate-180" size={16} />
          Sınav Listesine Dön
        </button>
        {/* Pass user.id directly since we are viewing the logged-in student's report */}
        <ExamAnalysisReport 
          token={token} 
          examId={selectedExam.exam.id.toString()} 
          studentId={user.id} 
        />
      </div>
    );
  }

  return (
    <GlassCard
      className="exam-list-card"
      title="Sınav Sonuçlarım ve Analizler"
      subtitle="Girdiğin sınavların sonuçlarını ve analizlerini burada görebilirsin"
    >
      <div className="space-y-6">

      {/* Bekleyen Sınavlar - Sınıfa atanmış, henüz sonuç girilmemiş */}
      {assignedExams.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-3 flex items-center gap-2">
            <Clock size={16} />
            Sınıfıma Atanan Sınavlar ({assignedExams.length})
          </h3>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {assignedExams.map((exam) => (
              <GlassCard key={exam.id} className="opacity-90">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                    <FileText className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-gray-900 dark:text-white text-sm line-clamp-1">{exam.name}</h4>
                    <span className="text-[10px] font-medium px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-300">
                      {exam.type.replace('_', ' ')}
                    </span>
                    <div className="flex items-center gap-1.5 mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                      <Calendar size={12} />
                      {new Date(exam.date).toLocaleDateString('tr-TR')}
                    </div>
                    <div className="mt-3 flex gap-2">
                       {onSolveExam && (
                         <button
                           onClick={() => onSolveExam(exam.id)}
                           className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex-1"
                         >
                           Sınavı Başlat
                         </button>
                       )}
                    </div>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        </div>
      )}

      {/* Sınav Sonuçları */}
      <div>
        <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-3">Sınav Sonuçlarım</h3>
        {loading ? (
        <div className="text-center py-12 text-gray-500">Yükleniyor...</div>
      ) : examResults.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700">
          <FileText className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">Henüz sınav sonucu yok</h3>
          <p className="mt-1 text-sm text-gray-500">Girdiğin sınavların sonuçları burada listelenecek.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {examResults.map((result) => (
            <div key={result.id} onClick={() => setSelectedExam(result)} className="cursor-pointer hover:border-blue-500/50 transition-colors">
              <GlassCard>
                <div className="flex justify-between items-start mb-4">
                  <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <span className="text-xs font-medium px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-gray-600 dark:text-gray-300">
                    {result.exam.type.replace('_', ' ')}
                  </span>
                </div>
                
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1 line-clamp-1">
                  {result.exam.name}
                </h3>
                
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-4">
                  <Calendar size={14} />
                  <span>{new Date(result.exam.date).toLocaleDateString('tr-TR')}</span>
                </div>
                
                <div className="grid grid-cols-3 gap-2 pt-4 border-t border-gray-100 dark:border-gray-700">
                  <div className="text-center">
                    <div className="text-xs text-gray-500 mb-1">Net</div>
                    <div className="font-bold text-gray-900 dark:text-white">{result.totalNet}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-500 mb-1">Puan</div>
                    <div className="font-bold text-blue-600">{result.score.toFixed(1)}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-500 mb-1">Sıralama</div>
                    <div className="font-bold text-purple-600 flex items-center justify-center gap-1">
                      <TrendingUp size={12} />
                      {result.percentile.toFixed(1)}%
                    </div>
                  </div>
                </div>
              </GlassCard>
            </div>
          ))}
        </div>
      )}
      </div>
      </div>
    </GlassCard>
  );
};
