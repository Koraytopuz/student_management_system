import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { TrendingUp, TrendingDown, Target, AlertTriangle, CheckCircle } from 'lucide-react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface ExamAnalysisData {
  examResult: {
    id: number;
    score: number;
    totalNet: number;
    percentile: number;
    exam: {
      name: string;
      type: string;
      date: string;
    };
    student: {
      name: string;
    };
    details: {
      lessonName: string;
      correct: number;
      wrong: number;
      empty: number;
      net: number;
    }[];
  };
  priorityAnalysis: {
    priority1: TopicPerformance[];
    priority2: TopicPerformance[];
    priority3: TopicPerformance[];
    totalLostPoints: number;
  };
  rankComparison: {
    currentYear: { year: number; rank: number };
    previousYear: { year: number; rank: number };
    change: number;
  };
  whatIfProjections: {
    priority1: WhatIfProjection;
    priority2: WhatIfProjection;
    priority3: WhatIfProjection;
  };
}

interface TopicPerformance {
  id: number;
  topicName: string;
  lessonName: string;
  totalQuestion: number;
  correct: number;
  wrong: number;
  empty: number;
  net: number;
  lostPoints: number;
  wrongRate: number;
}

interface WhatIfProjection {
  currentScore: number;
  projectedScore: number;
  scoreDifference: number;
  currentRank: number;
  projectedRank: number;
  rankImprovement: number;
  affectedTopics: string[];
}

interface ExamAnalysisReportProps {
  token: string;
  examId?: string;
  studentId?: string;
}

const ExamAnalysisReport: React.FC<ExamAnalysisReportProps> = ({ token, examId: propExamId, studentId: propStudentId }) => {
  const { examId: paramExamId, studentId: paramStudentId } = useParams<{ examId: string; studentId: string }>();
  
  const examId = propExamId || paramExamId;
  const studentId = propStudentId || paramStudentId;

  const [data, setData] = useState<ExamAnalysisData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalysis();
  }, [examId, studentId]);

  const fetchAnalysis = async () => {
    try {
      const response = await fetch(
        `http://localhost:4000/api/exams/${examId}/analysis/${studentId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const analysisData = await response.json();
      setData(analysisData);
    } catch (error) {
      console.error('Error fetching analysis:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-gray-600 dark:text-gray-400">Analiz yükleniyor...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-red-600">Analiz verisi bulunamadı</div>
      </div>
    );
  }

  const { examResult, priorityAnalysis, rankComparison, whatIfProjections } = data;

  // Prepare chart data
  const lessonChartData = examResult.details.map((detail) => ({
    name: detail.lessonName,
    net: detail.net,
    doğru: detail.correct,
    yanlış: detail.wrong,
    boş: detail.empty,
  }));

  const priorityPieData = [
    { name: '1. Öncelik', value: priorityAnalysis.priority1.length, color: '#ef4444' },
    { name: '2. Öncelik', value: priorityAnalysis.priority2.length, color: '#f59e0b' },
    { name: '3. Öncelik', value: priorityAnalysis.priority3.length, color: '#10b981' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            {examResult.exam.name} - Detaylı Analiz
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            {examResult.student.name} • {new Date(examResult.exam.date).toLocaleDateString('tr-TR')}
          </p>
          <div className="mt-4 flex gap-6">
            <div>
              <span className="text-sm text-gray-600 dark:text-gray-400">Toplam Net:</span>
              <span className="ml-2 text-2xl font-bold text-blue-600 dark:text-blue-400">
                {examResult.totalNet.toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-sm text-gray-600 dark:text-gray-400">Puan:</span>
              <span className="ml-2 text-2xl font-bold text-purple-600 dark:text-purple-400">
                {examResult.score.toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-sm text-gray-600 dark:text-gray-400">Yüzdelik:</span>
              <span className="ml-2 text-2xl font-bold text-green-600 dark:text-green-400">
                %{examResult.percentile.toFixed(1)}
              </span>
            </div>
          </div>
        </div>

        {/* Rank Comparison Card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Target className="text-blue-600" />
            Sıralama Karşılaştırması
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 text-gray-700 dark:text-gray-300">Yıl</th>
                  <th className="text-left py-3 px-4 text-gray-700 dark:text-gray-300">Tahmini Sıralama</th>
                  <th className="text-left py-3 px-4 text-gray-700 dark:text-gray-300">Değişim</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-3 px-4 text-gray-900 dark:text-white">
                    {rankComparison.currentYear.year} YKS (Simülasyon)
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-2xl font-bold text-gray-900 dark:text-white">
                      {rankComparison.currentYear.rank.toLocaleString('tr-TR')}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    {rankComparison.change > 0 ? (
                      <div className="flex items-center gap-2 text-red-600">
                        <TrendingUp size={20} />
                        <span>+{rankComparison.change.toLocaleString('tr-TR')} (Kötüleşme)</span>
                      </div>
                    ) : rankComparison.change < 0 ? (
                      <div className="flex items-center gap-2 text-green-600">
                        <TrendingDown size={20} />
                        <span>{rankComparison.change.toLocaleString('tr-TR')} (İyileşme)</span>
                      </div>
                    ) : (
                      <span className="text-gray-500">Değişim yok</span>
                    )}
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 text-gray-900 dark:text-white">
                    {rankComparison.previousYear.year} YKS (Gerçek)
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-2xl font-bold text-gray-700 dark:text-gray-300">
                      {rankComparison.previousYear.rank.toLocaleString('tr-TR')}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-gray-500 dark:text-gray-400">-</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* What-If Projection Card */}
        <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg shadow-lg p-6 text-white">
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            💡 Potansiyel Gelişim
          </h2>
          <div className="space-y-3">
            <p className="text-lg">
              Sadece <span className="font-bold text-yellow-300">1. Öncelikli</span> konuları halletseydin:
            </p>
            <div className="flex items-baseline gap-3">
              <span className="text-sm">Puanın:</span>
              <span className="text-3xl font-bold line-through opacity-75">
                {whatIfProjections.priority1.currentScore.toFixed(1)}
              </span>
              <span className="text-sm">→</span>
              <span className="text-4xl font-bold text-yellow-300">
                {whatIfProjections.priority1.projectedScore.toFixed(1)}
              </span>
              <span className="text-sm text-green-300">
                (+{whatIfProjections.priority1.scoreDifference.toFixed(1)} puan)
              </span>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="text-sm">Sıralaman:</span>
              <span className="text-2xl font-bold">
                {whatIfProjections.priority1.currentRank.toLocaleString('tr-TR')}
              </span>
              <span className="text-sm">→</span>
              <span className="text-3xl font-bold text-green-300">
                {whatIfProjections.priority1.projectedRank.toLocaleString('tr-TR')}
              </span>
              <span className="text-sm text-green-300">
                ({whatIfProjections.priority1.rankImprovement.toLocaleString('tr-TR')} sıra iyileşme)
              </span>
            </div>
          </div>
        </div>

        {/* Priority Sections */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Priority 1 */}
          <PriorityBlock
            level={1}
            title="1. Öncelik (Acil)"
            topics={priorityAnalysis.priority1}
            color="red"
          />

          {/* Priority 2 */}
          <PriorityBlock
            level={2}
            title="2. Öncelik"
            topics={priorityAnalysis.priority2}
            color="yellow"
          />

          {/* Priority 3 */}
          <PriorityBlock
            level={3}
            title="3. Öncelik"
            topics={priorityAnalysis.priority3}
            color="green"
          />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Lesson Net Chart */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Ders Bazlı Netler
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={lessonChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="net" fill="#3b82f6" name="Net" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Priority Distribution */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Öncelik Dağılımı
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={priorityPieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.name}: ${entry.value}`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {priorityPieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

// Priority Block Component
interface PriorityBlockProps {
  level: 1 | 2 | 3;
  title: string;
  topics: TopicPerformance[];
  color: 'red' | 'yellow' | 'green';
}

const PriorityBlock: React.FC<PriorityBlockProps> = ({ level, title, topics, color }) => {
  const colorClasses = {
    red: {
      bg: 'bg-red-50 dark:bg-red-900/20',
      border: 'border-red-500',
      text: 'text-red-700 dark:text-red-300',
      icon: <AlertTriangle className="text-red-500" />,
    },
    yellow: {
      bg: 'bg-yellow-50 dark:bg-yellow-900/20',
      border: 'border-yellow-500',
      text: 'text-yellow-700 dark:text-yellow-300',
      icon: <Target className="text-yellow-500" />,
    },
    green: {
      bg: 'bg-green-50 dark:bg-green-900/20',
      border: 'border-green-500',
      text: 'text-green-700 dark:text-green-300',
      icon: <CheckCircle className="text-green-500" />,
    },
  };

  const classes = colorClasses[color];

  return (
    <div className={`${classes.bg} border-2 ${classes.border} rounded-lg p-5`}>
      <h3 className={`text-lg font-bold ${classes.text} mb-4 flex items-center gap-2`}>
        {classes.icon}
        {title}
      </h3>
      
      {topics.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Bu öncelikte konu yok</p>
      ) : (
        <div className="space-y-3">
          {topics.map((topic) => (
            <div
              key={topic.id}
              className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm"
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white text-sm">
                    {topic.lessonName}
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">{topic.topicName}</p>
                </div>
                <span className={`text-sm font-bold ${classes.text}`}>
                  -{topic.lostPoints.toFixed(1)} puan
                </span>
              </div>
              <div className="flex gap-2 text-xs text-gray-600 dark:text-gray-400">
                <span>D: {topic.correct}</span>
                <span>Y: {topic.wrong}</span>
                <span>B: {topic.empty}</span>
                <span className="ml-auto font-medium">
                  Yanlış: %{(topic.wrongRate * 100).toFixed(0)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ExamAnalysisReport;
