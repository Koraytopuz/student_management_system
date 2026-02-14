/**
 * Soru Bankası Tab Bileşeni
 * Öğretmenin soru eklemesi, düzenlemesi, araması ve AI ile soru üretmesi için
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Plus,
  Filter,
  Sparkles,
  Check,
  X,
  Edit,
  Trash2,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Brain,
  Loader2,
  AlertCircle,
  CheckCircle,
  Wand2,
  Folder,
  FolderOpen,
  List,
  ChevronDown,
} from 'lucide-react';
import { GlassCard } from './components/DashboardPrimitives';
import {
  getQuestionBankList,
  getQuestionBankStats,
  createQuestionBankItem,
  updateQuestionBankItem,
  deleteQuestionBankItem,
  approveQuestionBankItem,
  generateQuestionBankItems,
  getSubjectsList,
} from './api';
import type {
  QuestionBankItem,
  QuestionBankStats,
  QuestionBankSearchParams,
  QuestionBankCreatePayload,
  SubjectItem,
  BloomLevel,
} from './api';


interface QuestionBankTabProps {
  token: string | null;
}

const BLOOM_LEVELS: { value: BloomLevel; label: string }[] = [
  { value: 'hatirlama', label: 'Hatırlama' },
  { value: 'anlama', label: 'Anlama' },
  { value: 'uygulama', label: 'Uygulama' },
  { value: 'analiz', label: 'Analiz' },
  { value: 'degerlendirme', label: 'Değerlendirme' },
  { value: 'yaratma', label: 'Yaratma' },
];

const GRADE_LEVELS = ['4', '5', '6', '7', '8', '9', '10', '11', '12'];

/**
 * Sınıf -> Ders eşlemesi (cascading dropdown)
 * Not: Bu listeler "gösterilebilecek" dersleri sınırlar. Backenden gelen ders listesi,
 * isim eşleşmesine göre filtrelenir.
 */
const gradeSubjectsMapping: Record<string, string[]> = {
  // İlköğretim
  '4': ['Türkçe', 'Matematik', 'Fen Bilimleri', 'Sosyal Bilgiler', 'İngilizce', 'Din Kültürü'],
  '5': ['Türkçe', 'Matematik', 'Fen Bilimleri', 'Sosyal Bilgiler', 'İngilizce', 'Din Kültürü'],
  '6': ['Türkçe', 'Matematik', 'Fen Bilimleri', 'Sosyal Bilgiler', 'İngilizce', 'Din Kültürü'],
  '7': ['Türkçe', 'Matematik', 'Fen Bilimleri', 'Sosyal Bilgiler', 'İngilizce', 'Din Kültürü'],
  '8': ['Türkçe', 'Matematik', 'Fen Bilimleri', 'Sosyal Bilgiler', 'İngilizce', 'Din Kültürü'],

  // Lise (9-10) / TYT
  '9': ['Türkçe', 'Matematik', 'Fizik', 'Kimya', 'Biyoloji', 'Tarih', 'Coğrafya', 'Felsefe', 'Din Kültürü'],
  '10': ['Türkçe', 'Matematik', 'Fizik', 'Kimya', 'Biyoloji', 'Tarih', 'Coğrafya', 'Felsefe', 'Din Kültürü'],
  TYT: ['Türkçe', 'Matematik', 'Fizik', 'Kimya', 'Biyoloji', 'Tarih', 'Coğrafya', 'Felsefe', 'Din Kültürü'],

  // Lise (11-12) / AYT
  '11': ['Edebiyat', 'Matematik', 'Fizik', 'Kimya', 'Biyoloji', 'Tarih', 'Coğrafya', 'Felsefe', 'Din Kültürü'],
  '12': ['Edebiyat', 'Matematik', 'Fizik', 'Kimya', 'Biyoloji', 'Tarih', 'Coğrafya', 'Felsefe', 'Din Kültürü'],
  AYT: ['Edebiyat', 'Matematik', 'Fizik', 'Kimya', 'Biyoloji', 'Tarih', 'Coğrafya', 'Felsefe', 'Din Kültürü'],
};

const DIFFICULTY_LEVELS = [
  { value: 'easy', label: 'Kolay' },
  { value: 'medium', label: 'Orta' },
  { value: 'hard', label: 'Zor' },
];

const QUESTION_TYPES = [
  { value: 'multiple_choice', label: 'Çoktan Seçmeli' },
  { value: 'true_false', label: 'Doğru/Yanlış' },
  { value: 'open_ended', label: 'Açık Uçlu' },
];

export function QuestionBankTab({ token }: QuestionBankTabProps) {
  const [questions, setQuestions] = useState<QuestionBankItem[]>([]);
  const [stats, setStats] = useState<QuestionBankStats | null>(null);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  
  // Filters
  const [filters, setFilters] = useState<QuestionBankSearchParams>({
    page: 1,
    limit: 10,
  });
  const [showFilters, setShowFilters] = useState(false);

  // Modal states
  // Modal/Card states
  const [showAddCard, setShowAddCard] = useState(false);
  const [showAICard, setShowAICard] = useState(false);
  const aiCardRef = useRef<HTMLDivElement>(null);
  const addCardRef = useRef<HTMLDivElement>(null);
  const [editingQuestion, setEditingQuestion] = useState<QuestionBankItem | null>(null);
  
  // Form data
  const [formData, setFormData] = useState<Partial<QuestionBankCreatePayload>>({
    type: 'multiple_choice',
    difficulty: 'medium',
    choices: ['', '', '', '', ''],
  });
  
  // AI generation
  const [aiLoading, setAiLoading] = useState(false);
  const [aiForm, setAiForm] = useState({
    subjectId: '',
    gradeLevel: '9',
    topic: '',
    difficulty: 'medium' as 'easy' | 'medium' | 'hard',
    bloomLevel: 'uygulama' as BloomLevel,
    questionType: 'multiple_choice' as 'multiple_choice' | 'true_false' | 'open_ended',
    count: 10,
  });

  // Folder View States
  const [viewMode, setViewMode] = useState<'list' | 'folder'>('list');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [questionsForFolder, setQuestionsForFolder] = useState<QuestionBankItem[]>([]);
  const [folderStructureLoading, setFolderStructureLoading] = useState(false);

  // Klasör yapısı: dosya görünümünde tüm başlıkları göstermek için tüm sorular kullanılır
  const folderStructure = useMemo(() => {
    const structure: Record<string, Record<string, Record<string, number>>> = {};
    const source = questionsForFolder.length > 0 ? questionsForFolder : questions;

    source.forEach((q) => {
      const grade = q.gradeLevel;
      const subject = q.subject?.name || 'Diğer';
      const topic = q.topic || 'Diğer';

      if (!structure[grade]) structure[grade] = {};
      if (!structure[grade][subject]) structure[grade][subject] = {};
      if (!structure[grade][subject][topic]) structure[grade][subject][topic] = 0;

      structure[grade][subject][topic]++;
    });

    return structure;
  }, [questions, questionsForFolder]);

  const toggleFolder = (id: string) => {
    const next = new Set(expandedFolders);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setExpandedFolders(next);
  };

  const [selectedTopicPath, setSelectedTopicPath] = useState<{ grade: string; subject: string; topic: string } | null>(null);

  const handleTopicSelect = (grade: string, subject: string, topic: string) => {
    setSelectedTopicPath({ grade, subject, topic });
    setFilters({
      ...filters,
      gradeLevel: grade,
      topic: topic,
    });
    const subjItem = subjects.find(s => s.name === subject);
    if (subjItem) {
      setFilters(prev => ({ ...prev, subjectId: subjItem.id }));
    }
    setViewMode('list');
  };

  const filteredSubjects = useMemo(() => {
    const seen = new Set<string>();
    return subjects.filter((s) => {
      const name = (s.name || '').trim();
      const key = name.toLowerCase();
      if (!name) return false;
      if (key === 'psikoloji') return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [subjects]);

  const normalizeText = (value: string) => value.trim().toLocaleLowerCase('tr-TR');

  const subjectNameMatchesAllowed = (subjectName: string, allowedNormalized: Set<string>) => {
    const n = normalizeText(subjectName);
    if (allowedNormalized.has(n)) return true;

    // Yaygın isim varyasyonlarını yakala
    if (allowedNormalized.has('din kültürü') && n.includes('din kültürü')) return true;
    if (allowedNormalized.has('edebiyat') && (n.includes('edebiyat') || n.includes('türk dili'))) return true;
    if (allowedNormalized.has('fen bilimleri') && n.includes('fen')) return true;
    if (allowedNormalized.has('sosyal bilgiler') && n.includes('sosyal')) return true;
    if (allowedNormalized.has('türkçe') && n.includes('türkçe')) return true;
    if (allowedNormalized.has('matematik') && n.includes('matematik')) return true;
    if (allowedNormalized.has('felsefe') && n.includes('felsefe')) return true;

    return false;
  };

  const getAvailableSubjectsForGrade = (grade?: string) => {
    if (!grade) return filteredSubjects;
    const allowed = gradeSubjectsMapping[grade];
    if (!allowed || allowed.length === 0) return filteredSubjects;
    const allowedNormalized = new Set(allowed.map(normalizeText));
    return filteredSubjects.filter((s) => subjectNameMatchesAllowed(s.name, allowedNormalized));
  };

  const availableSubjectsForAi = useMemo(
    () => getAvailableSubjectsForGrade(aiForm.gradeLevel),
    [aiForm.gradeLevel, filteredSubjects],
  );

  const availableSubjectsForForm = useMemo(
    () => getAvailableSubjectsForGrade(formData.gradeLevel),
    [formData.gradeLevel, filteredSubjects],
  );

  const availableSubjectsForFilters = useMemo(
    () => getAvailableSubjectsForGrade(filters.gradeLevel),
    [filters.gradeLevel, filteredSubjects],
  );

  // Cascading behavior: sınıf değişince uyumsuz ders seçimini temizle
  useEffect(() => {
    if (!aiForm.subjectId) return;
    if (!availableSubjectsForAi.some((s) => s.id === aiForm.subjectId)) {
      setAiForm((p) => ({ ...p, subjectId: '' }));
    }
  }, [aiForm.subjectId, availableSubjectsForAi]);

  useEffect(() => {
    if (!formData.subjectId) return;
    if (!availableSubjectsForForm.some((s) => s.id === formData.subjectId)) {
      setFormData((p) => ({ ...p, subjectId: '' }));
    }
  }, [formData.subjectId, availableSubjectsForForm]);

  useEffect(() => {
    if (!filters.subjectId) return;
    if (!availableSubjectsForFilters.some((s) => s.id === filters.subjectId)) {
      setFilters((p) => ({ ...p, page: 1, subjectId: undefined }));
    }
  }, [filters.subjectId, availableSubjectsForFilters]);

  // Load data
  useEffect(() => {
    loadData();
  }, [filters]);

  // Dosya (klasör) görünümünde tüm sınıf/ders/konu başlıklarını göstermek için tüm soruları yükle
  useEffect(() => {
    if (!token || viewMode !== 'folder') return;
    let cancelled = false;
    setFolderStructureLoading(true);
    getQuestionBankList(token, { page: 1, limit: 2000 })
      .then((data) => {
        if (!cancelled) {
          setQuestionsForFolder(data.questions);
        }
      })
      .catch(() => {
        if (!cancelled) setQuestionsForFolder([]);
      })
      .finally(() => {
        if (!cancelled) setFolderStructureLoading(false);
      });
    return () => { cancelled = true; };
  }, [token, viewMode]);

  useEffect(() => {
    loadSubjects();
    loadStats();
  }, []);

  const loadSubjects = async () => {
    if (!token) return;
    try {
      const data = await getSubjectsList(token);
      setSubjects(data);
    } catch (err) {
      console.error('Dersler yüklenemedi:', err);
    }
  };

  const loadStats = async () => {
    if (!token) return;
    try {
      const data = await getQuestionBankStats(token);
      setStats(data);
    } catch (err) {
      console.error('İstatistikler yüklenemedi:', err);
    }
  };

  const loadData = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getQuestionBankList(token, filters);
      setQuestions(data.questions);
      setPage(data.pagination.page);
      setTotalPages(data.pagination.totalPages);
      setTotal(data.pagination.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sorular yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key: keyof QuestionBankSearchParams, value: string | boolean | undefined) => {
    setFilters({ ...filters, page: 1, [key]: value });
  };

  const handlePageChange = (newPage: number) => {
    setFilters({ ...filters, page: newPage });
  };

  const toggleAddCard = (question?: QuestionBankItem) => {
    if (question) {
      setEditingQuestion(question);
      setFormData({
        subjectId: question.subjectId,
        gradeLevel: question.gradeLevel,
        topic: question.topic,
        subtopic: question.subtopic,
        text: question.text,
        type: question.type,
        choices: question.choices || ['', '', '', '', ''],
        correctAnswer: question.correctAnswer,
        solutionExplanation: question.solutionExplanation,
        difficulty: question.difficulty,
        bloomLevel: question.bloomLevel,
        tags: question.tags,
      });
      setShowAddCard(true);
      setTimeout(() => {
        addCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    } else {
      if (showAddCard && !editingQuestion) {
        setShowAddCard(false);
      } else {
        setEditingQuestion(null);
        setFormData({
          type: 'multiple_choice',
          difficulty: 'medium',
          choices: ['', '', '', '', ''],
        });
        setShowAddCard(true);
        setTimeout(() => {
          addCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
    }
  };

  const handleSaveQuestion = async () => {
    if (!token) {
      setError('Oturum süresi dolmuş olabilir. Lütfen sayfayı yenileyin.');
      return;
    }
    if (!formData.subjectId || !formData.gradeLevel || !formData.topic || !formData.text || !formData.correctAnswer) {
      setError('Lütfen zorunlu alanları doldurun');
      return;
    }

    setLoading(true);
    try {
      if (editingQuestion) {
        await updateQuestionBankItem(token, editingQuestion.id, formData as QuestionBankCreatePayload);
        setSuccessMessage('Soru güncellendi');
      } else {
        await createQuestionBankItem(token, formData as QuestionBankCreatePayload);
        setSuccessMessage('Soru eklendi');
      }
      setShowAddCard(false);
      loadData();
      loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydetme başarısız');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteQuestion = async (id: string) => {
    if (!token) return;
    if (!window.confirm('Bu soruyu silmek istediğinize emin misiniz?')) return;
    
    try {
      await deleteQuestionBankItem(token, id);
      setSuccessMessage('Soru silindi');
      loadData();
      loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Silme başarısız');
    }
  };

  const handleApproveQuestion = async (id: string) => {
    if (!token) return;
    try {
      await approveQuestionBankItem(token, id);
      setSuccessMessage('Soru onaylandı');
      loadData();
      loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Onaylama başarısız');
    }
  };

  const toggleAICard = () => {
    setShowAICard(!showAICard);
    if (!showAICard) {
      setTimeout(() => {
        aiCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  };

  const handleGenerateAI = async () => {
    if (!token) {
      setError('Oturum yok.');
      return;
    }
    if (!aiForm.subjectId || !aiForm.topic) {
      setError('Lütfen ders ve konu seçin');
      return;
    }

    setAiLoading(true);
    setError(null);
    try {
      const result = await generateQuestionBankItems(token, aiForm);
      setSuccessMessage(`${result.questions.length} soru üretildi`);
      setShowAICard(false);
      loadData();
      loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI soru üretimi başarısız');
    } finally {
      setAiLoading(false);
    }
  };

  const getDifficultyBadge = (difficulty: string) => {
    const colors: Record<string, string> = {
      easy: 'bg-green-500/20 text-green-400',
      medium: 'bg-yellow-500/20 text-yellow-400',
      hard: 'bg-red-500/20 text-red-400',
    };
    const labels: Record<string, string> = {
      easy: 'Kolay',
      medium: 'Orta',
      hard: 'Zor',
    };
    return <span className={`px-2 py-0.5 rounded text-xs ${colors[difficulty] || ''}`}>{labels[difficulty]}</span>;
  };

  const getSourceBadge = (source: string, isApproved: boolean) => {
    if (source === 'ai') {
      return (
        <span className={`px-2 py-0.5 rounded text-xs flex items-center gap-1 ${isApproved ? 'bg-purple-500/20 text-purple-400' : 'bg-orange-500/20 text-orange-400'}`}>
          <Sparkles className="w-3 h-3" />
          {isApproved ? 'AI (Onaylı)' : 'AI (Bekliyor)'}
        </span>
      );
    }
    return <span className="px-2 py-0.5 rounded text-xs bg-blue-500/20 text-blue-400">Öğretmen</span>;
  };

  // Auto-hide success message
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  return (
    <div className="questionbank-page space-y-6">
      {/* Header & Stats */}
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <BookOpen className="w-6 h-6" />
          Soru Bankası
        </h2>
        <div className="flex gap-4 items-center">
          <button
             onClick={() => setViewMode(viewMode === 'list' ? 'folder' : 'list')}
             className="qb-header-btn qb-header-btn--ghost"
             type="button"
             title={viewMode === 'list' ? 'Klasör Görünümü' : 'Liste Görünümü'}
          >
            {viewMode === 'list' ? <Folder className="qb-icon-premium w-4 h-4" /> : <List className="qb-icon-premium w-4 h-4" />}
          </button>
          <button
            onClick={toggleAICard}
            className={`qb-header-btn qb-header-btn--purple ${showAICard ? 'qb-header-btn--active' : ''}`}
            type="button"
          >
            <Sparkles className="qb-icon-premium w-3.5 h-3.5" />
            AI ile Üret
          </button>
          <button
            onClick={() => setShowFilters(!showFilters)}
            type="button"
            className={`qb-header-btn qb-header-btn--ghost ${showFilters ? 'qb-header-btn--active' : ''}`}
            title="Sınıf, ders ve konu ile filtrele"
          >
            <Filter className="qb-icon-premium w-4 h-4" />
            Filtreler
          </button>
          <div className="flex items-center gap-1 px-4 py-2 rounded-xl bg-white/5 border border-white/10 shrink-0">
            <span className="text-xl font-bold text-white tabular-nums">{stats?.total ?? 0}</span>
            <span className="text-sm text-white/60">&nbsp;Toplam Soru</span>
          </div>
        </div>
      </div>

      {/* AI Generation Card (Expandable) */}
      {showAICard && (
        <div ref={aiCardRef} className="animate-in fade-in slide-in-from-top-4 duration-300 mb-6">
          <GlassCard className="p-6 border-purple-500/30 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 via-pink-500 to-indigo-500"></div>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Brain className="w-5 h-5 text-purple-400" />
                AI ile Soru Üretme Sihirbazı
              </h3>
              <button 
                onClick={() => setShowAICard(false)}
                type="button"
                className="qb-icon-btn qb-icon-btn--blue"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wider">Sınıf Seviyesi</label>
                <div className="relative">
                  <select
                    value={aiForm.gradeLevel}
                    onChange={(e) => setAiForm({ ...aiForm, gradeLevel: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-900/50 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 transition-all appearance-none"
                  >
                    {GRADE_LEVELS.map((g) => (
                      <option key={g} value={g} className="bg-slate-900">{g}. Sınıf</option>
                    ))}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/30">
                    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wider">Ders Seçin</label>
                <div className="relative">
                  <select
                    value={aiForm.subjectId}
                    onChange={(e) => setAiForm({ ...aiForm, subjectId: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-900/50 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 transition-all appearance-none"
                  >
                    <option value="" className="bg-slate-900">Ders Seçiniz</option>
                    {availableSubjectsForAi.map((s) => (
                      <option key={s.id} value={s.id} className="bg-slate-900">{s.name}</option>
                    ))}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/30">
                    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wider">Konu Başlığı</label>
                <input
                  type="text"
                  value={aiForm.topic}
                  onChange={(e) => setAiForm({ ...aiForm, topic: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-900/50 border border-white/10 rounded-xl text-white text-sm placeholder-white/30 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 transition-all"
                  placeholder="Örn: Limit ve Süreklilik"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wider">Zorluk Seviyesi</label>
                <div className="qb-diff-group" role="group" aria-label="Zorluk seviyesi">
                  {DIFFICULTY_LEVELS.map((d) => {
                    const isActive = aiForm.difficulty === d.value;
                    
                    return (
                      <button
                        key={d.value}
                        onClick={() => setAiForm({ ...aiForm, difficulty: d.value as any })}
                        className={[
                          'qb-diff-btn',
                          d.value === 'easy' ? 'qb-diff-btn--easy' : '',
                          d.value === 'medium' ? 'qb-diff-btn--medium' : '',
                          d.value === 'hard' ? 'qb-diff-btn--hard' : '',
                          isActive ? 'qb-diff-btn--active' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        aria-pressed={isActive}
                        type="button"
                      >
                        {d.label.toUpperCase()}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wider">Bloom Taksonomisi</label>
                <div className="relative">
                  <select
                    value={aiForm.bloomLevel}
                    onChange={(e) => setAiForm({ ...aiForm, bloomLevel: e.target.value as BloomLevel })}
                    className="w-full px-4 py-2.5 bg-slate-900/50 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 transition-all appearance-none"
                  >
                    {BLOOM_LEVELS.map((b) => (
                      <option key={b.value} value={b.value} className="text-black">{b.label}</option>
                    ))}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/30">
                    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wider">Soru Sayısı</label>
                <div className="relative">
                  <select
                    value={aiForm.count}
                    onChange={(e) => setAiForm({ ...aiForm, count: Number(e.target.value) })}
                    className="w-full px-4 py-2 bg-slate-900/50 border border-white/10 rounded-xl text-white text-xs focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 transition-all appearance-none"
                  >
                    {[10, 20, 30, 40].map((n) => (
                      <option key={n} value={n} className="text-black">{n} Soru</option>
                    ))}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/30">
                    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-white/5 flex justify-end gap-5">
              <button
                onClick={() => setShowAICard(false)}
                type="button"
                className="qb-btn qb-btn--ghost"
              >
                Vazgeç
              </button>
              <button
                onClick={handleGenerateAI}
                disabled={aiLoading}
                type="button"
                className="qb-btn qb-btn--primary qb-btn--purple"
              >
                {aiLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Üretiliyor...</span>
                  </>
                ) : (
                  <>
                    <Wand2 className="w-3.5 h-3.5 group-hover:rotate-12 transition-transform" />
                    <span>Soruları Oluştur</span>
                  </>
                )}
              </button>
            </div>
          </GlassCard>
        </div>
      )}

      {/* Add/Edit Card (Expandable) */}
      {showAddCard && (
        <div ref={addCardRef} className="animate-in fade-in slide-in-from-top-4 duration-300 mb-6">
          <GlassCard className="p-6 border-blue-500/30 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 to-cyan-600"></div>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-400" />
                {editingQuestion ? 'Soruyu Düzenle' : 'Yeni Soru Ekle'}
              </h3>
              <button
                onClick={() => setShowAddCard(false)}
                type="button"
                className="qb-icon-btn qb-icon-btn--blue"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1.5 uppercase tracking-wider">Ders Seçin</label>
                  <div className="relative">
                    <select
                      value={formData.subjectId || ''}
                      onChange={(e) => setFormData({ ...formData, subjectId: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-900/50 border border-white/10 rounded-lg text-white text-xs focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all appearance-none"
                    >
                      <option value="" className="bg-slate-900">Seçin</option>
                      {availableSubjectsForForm.map((s) => (
                        <option key={s.id} value={s.id} className="text-black">{s.name}</option>
                      ))}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/30">
                      <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1.5 uppercase tracking-wider">Sınıf Seviyesi</label>
                  <div className="relative">
                    <select
                      value={formData.gradeLevel || ''}
                      onChange={(e) => setFormData({ ...formData, gradeLevel: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-900/50 border border-white/10 rounded-lg text-white text-xs focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all appearance-none"
                    >
                      <option value="" className="bg-slate-900">Seçin</option>
                      {GRADE_LEVELS.map((g) => (
                        <option key={g} value={g} className="text-black">{g}. Sınıf</option>
                      ))}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/30">
                      <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5 uppercase tracking-wider">Konu Başlığı</label>
                <input
                  type="text"
                  value={formData.topic || ''}
                  onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-900/50 border border-white/10 rounded-lg text-white text-xs placeholder-white/30 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all"
                  placeholder="Örn: Fonksiyonlar"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1.5 uppercase tracking-wider">Soru Tipi</label>
                  <div className="relative">
                    <select
                      value={formData.type || 'multiple_choice'}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value as 'multiple_choice' | 'true_false' | 'open_ended' })}
                      className="w-full px-3 py-2 bg-slate-900/50 border border-white/10 rounded-lg text-white text-xs focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all appearance-none"
                    >
                      {QUESTION_TYPES.map((t) => (
                        <option key={t.value} value={t.value} className="text-black">{t.label}</option>
                      ))}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/30">
                      <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1.5 uppercase tracking-wider">Zorluk</label>
                  <div className="qb-diff-group" role="group" aria-label="Zorluk seviyesi">
                    {DIFFICULTY_LEVELS.map((d) => {
                      const isActive = formData.difficulty === d.value;
                      
                      return (
                        <button
                          key={d.value}
                          onClick={() => setFormData({ ...formData, difficulty: d.value as any })}
                          className={[
                            'qb-diff-btn',
                            d.value === 'easy' ? 'qb-diff-btn--easy' : '',
                            d.value === 'medium' ? 'qb-diff-btn--medium' : '',
                            d.value === 'hard' ? 'qb-diff-btn--hard' : '',
                            isActive ? 'qb-diff-btn--active' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          aria-pressed={isActive}
                          type="button"
                        >
                          {d.label.toUpperCase()}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1.5 uppercase tracking-wider">Bloom Seviyesi</label>
                  <div className="relative">
                    <select
                      value={formData.bloomLevel || ''}
                      onChange={(e) => setFormData({ ...formData, bloomLevel: e.target.value as BloomLevel })}
                      className="w-full px-3 py-2 bg-slate-900/50 border border-white/10 rounded-lg text-white text-xs focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all appearance-none"
                    >
                      <option value="" className="bg-slate-900">Seçin</option>
                      {BLOOM_LEVELS.map((b) => (
                        <option key={b.value} value={b.value} className="text-black">{b.label}</option>
                      ))}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/30">
                      <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5 uppercase tracking-wider">Soru Metni</label>
                <textarea
                  value={formData.text || ''}
                  onChange={(e) => setFormData({ ...formData, text: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 bg-slate-900/50 border border-white/10 rounded-lg text-white text-xs placeholder-white/30 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all resize-none"
                  placeholder="Soru metnini yazın..."
                />
              </div>

              {formData.type === 'multiple_choice' && (
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1.5 uppercase tracking-wider">Şıklar</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {(formData.choices || []).map((choice, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-white/40 w-4 text-xs font-medium text-center">{String.fromCharCode(65 + i)}</span>
                        <input
                          type="text"
                          value={choice}
                          onChange={(e) => {
                            const newChoices = [...(formData.choices || [])];
                            newChoices[i] = e.target.value;
                            setFormData({ ...formData, choices: newChoices });
                          }}
                          className="flex-1 px-3 py-1.5 bg-slate-900/50 border border-white/10 rounded-lg text-white text-xs focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all"
                          placeholder={`${String.fromCharCode(65 + i)} Şıkkı`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5 uppercase tracking-wider">Doğru Cevap</label>
                <input
                  type="text"
                  value={formData.correctAnswer || ''}
                  onChange={(e) => setFormData({ ...formData, correctAnswer: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-900/50 border border-white/10 rounded-lg text-white text-xs placeholder-white/30 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all"
                  placeholder={formData.type === 'multiple_choice' ? 'Örn: A' : 'Doğru cevap'}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5 uppercase tracking-wider">Çözüm Açıklaması</label>
                <textarea
                  value={formData.solutionExplanation || ''}
                  onChange={(e) => setFormData({ ...formData, solutionExplanation: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 bg-slate-900/50 border border-white/10 rounded-lg text-white text-xs placeholder-white/30 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all resize-none"
                  placeholder="Çözüm açıklaması (isteğe bağlı)"
                />
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-white/5 flex justify-end gap-5">
              <button
                onClick={() => setShowAddCard(false)}
                disabled={loading}
                type="button"
                className="qb-btn qb-btn--ghost"
              >
                Vazgeç
              </button>
              <button
                onClick={handleSaveQuestion}
                disabled={loading}
                type="button"
                className="qb-btn qb-btn--primary qb-btn--blue"
              >
                {loading && <Loader2 className="w-3 h-3 animate-spin" />}
                {editingQuestion ? 'Güncelle' : 'Kaydet'}
              </button>
            </div>
          </GlassCard>
        </div>
      )}
      {/* Messages */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {successMessage && (
        <div className="flex items-center gap-2 p-4 bg-green-500/20 border border-green-500/50 rounded-lg text-green-400">
          <CheckCircle className="w-5 h-5" />
          {successMessage}
        </div>
      )}

      {/* Filtreler: Sınıf, Ders, Konu (header'da Filtreler ile açılır) */}
      {showFilters && (
        <div className="flex flex-wrap gap-4 items-center p-4 rounded-xl bg-white/5 border border-white/10">
          <select
            value={filters.gradeLevel || ''}
            onChange={(e) => handleFilterChange('gradeLevel', e.target.value || undefined)}
            className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500/50 text-sm"
          >
            <option value="">Tüm Sınıflar</option>
            {GRADE_LEVELS.map((g) => (
              <option key={g} value={g}>{g}. Sınıf</option>
            ))}
          </select>
          <select
            value={filters.subjectId || ''}
            onChange={(e) => handleFilterChange('subjectId', e.target.value || undefined)}
            className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500/50 text-sm"
          >
            <option value="">Tüm Dersler</option>
            {availableSubjectsForFilters.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Konu başlığı..."
            value={filters.topic || ''}
            onChange={(e) => handleFilterChange('topic', e.target.value || undefined)}
            className="px-3 py-2 min-w-[160px] bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-blue-500/50 text-sm"
          />
        </div>
      )}

      {/* Questions List or Folder View — FolderTree: VS Code style, space-y-1, no mb on li */}
      {viewMode === 'folder' ? (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm max-h-[75vh] overflow-y-auto">
          <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50 sticky top-0 z-10 backdrop-blur-sm">
            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              <Folder className="w-5 h-5 text-indigo-500" />
              Soru Klasörleri
            </h3>
          </div>
          <div className="p-5">
            {folderStructureLoading ? (
              <div className="text-center py-12 text-gray-500 flex flex-col items-center gap-2">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                <p className="text-sm">Klasör yapısı yükleniyor…</p>
              </div>
            ) : Object.keys(folderStructure).length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Folder className="w-12 h-12 mx-auto mb-3 text-gray-200" />
                <p className="text-sm">Klasörlenecek içerik bulunamadı</p>
              </div>
            ) : (
              <ul className="flex flex-col gap-3">
                {Object.entries(folderStructure).sort((a, b) => {
                  const order = ['4', '5', '6', '7', '8', '9', '10', '11', '12', 'TYT', 'AYT'];
                  return order.indexOf(a[0]) - order.indexOf(b[0]);
                }).map(([grade, subjects]) => {
                  const gradeTotal = Object.values(subjects).reduce((acc, topics) => acc + Object.values(topics).reduce((a, b) => a + b, 0), 0);
                  const isGradeOpen = expandedFolders.has(grade);
                  return (
                    <li key={grade}>
                      <button
                        type="button"
                        onClick={() => toggleFolder(grade)}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-200 group ${
                          isGradeOpen 
                            ? 'bg-indigo-50/80 border-indigo-100 text-indigo-900 shadow-sm' 
                            : 'bg-white border-gray-100 text-gray-600 hover:border-gray-200 hover:shadow-sm'
                        }`}
                      >
                        <span className={`p-1.5 rounded-lg transition-colors ${isGradeOpen ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-400 group-hover:bg-gray-200 group-hover:text-gray-600'}`}>
                          {isGradeOpen ? <FolderOpen className="w-4 h-4" /> : <Folder className="w-4 h-4" />}
                        </span>
                        <span className="flex-1 font-medium text-left">{grade}. Sınıf</span>
                        <span className="px-2 py-0.5 text-xs font-medium rounded-md bg-white/50 text-gray-500 border border-gray-100">
                          {gradeTotal}
                        </span>
                        {isGradeOpen ? <ChevronDown className="w-4 h-4 text-indigo-400" /> : <ChevronRight className="w-4 h-4 text-gray-300" />}
                      </button>
                      
                      {isGradeOpen && (
                        <div className="mt-3 ml-4 pl-4 border-l-2 border-dashed border-gray-100 flex flex-col gap-2">
                          {Object.entries(subjects).sort().map(([subject, topics]) => {
                            const subjectTotal = Object.values(topics).reduce((a, b) => a + b, 0);
                            const subjectId = `${grade}-${subject}`;
                            const isSubjectOpen = expandedFolders.has(subjectId);
                            return (
                              <div key={subjectId}>
                                <button
                                  type="button"
                                  onClick={() => toggleFolder(subjectId)}
                                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                                    isSubjectOpen
                                      ? 'bg-indigo-50/50 text-indigo-800 font-medium'
                                      : 'text-gray-600 hover:bg-gray-50'
                                  }`}
                                >
                                  {isSubjectOpen ? <ChevronDown className="w-3.5 h-3.5 text-indigo-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-300" />}
                                  <span className="truncate flex-1 text-left">{subject}</span>
                                  <span className="text-xs text-gray-400">{subjectTotal}</span>
                                </button>
                                
                                {isSubjectOpen && (
                                  <div className="mt-1 ml-5 flex flex-col gap-1">
                                    {Object.entries(topics).sort().map(([topic, count]) => {
                                      const isSelected = selectedTopicPath?.grade === grade && selectedTopicPath?.subject === subject && selectedTopicPath?.topic === topic;
                                      return (
                                        <button
                                          key={topic}
                                          type="button"
                                          onClick={() => handleTopicSelect(grade, subject, topic)}
                                          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all border mb-1 mx-1 ${
                                            isSelected 
                                              ? 'bg-blue-50 text-blue-700 border-blue-100 font-medium shadow-sm' 
                                              : 'text-gray-500 border-transparent hover:bg-gray-50 hover:text-gray-700'
                                          }`}
                                        >
                                          <div className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-blue-500' : 'bg-gray-300'}`} />
                                          <span className="truncate flex-1 text-left">{topic}</span>
                                          <span className="text-xs text-gray-400">{count}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <GlassCard className="p-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          </div>
        ) : questions.length === 0 ? (
          <div className="text-center py-12 text-white/60">
            <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Henüz soru yok</p>
            <p className="text-sm mt-2">Yukarıdaki butonlarla soru ekleyebilirsiniz</p>
          </div>
        ) : (
          <div className="space-y-4">
            {questions.map((q) => (
              <div key={q.id} className="p-4 bg-white/5 rounded-lg border border-white/10 hover:border-white/20 transition">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex flex-wrap gap-2 mb-2">
                      <span className="px-2 py-0.5 rounded text-xs bg-blue-500/20 text-blue-400">
                        {q.subject?.name || 'Ders'}
                      </span>
                      <span className="px-2 py-0.5 rounded text-xs bg-white/10 text-white/70">
                        {q.gradeLevel}. Sınıf
                      </span>
                      {getDifficultyBadge(q.difficulty)}
                      {getSourceBadge(q.source, q.isApproved)}
                    </div>
                    <p className="text-white font-medium">{q.text}</p>
                    {q.choices && (
                      <div className="mt-2 grid grid-cols-2 gap-1 text-sm text-white/70">
                        {(q.choices as string[]).map((c, i) => (
                          <div key={i} className={`${c === q.correctAnswer || String.fromCharCode(65 + i) === q.correctAnswer ? 'text-green-400' : ''}`}>
                            {String.fromCharCode(65 + i)}) {c}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="mt-2 text-sm text-white/50">
                      Konu: {q.topic}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {!q.isApproved && q.source === 'ai' && (
                      <button
                        onClick={() => handleApproveQuestion(q.id)}
                        title="Onayla"
                        type="button"
                        className="qb-icon-btn qb-icon-btn--success"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => toggleAddCard(q)}
                      title="Düzenle"
                      type="button"
                      className="qb-icon-btn qb-icon-btn--blue"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteQuestion(q.id)}
                      title="Sil"
                      type="button"
                      className="qb-icon-btn qb-icon-btn--danger"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 mt-6 pt-4 border-t border-white/10">
            <button
              onClick={() => handlePageChange(page - 1)}
              disabled={page <= 1}
              type="button"
              className="qb-icon-btn qb-icon-btn--subtle"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-white/70">
              Sayfa {page} / {totalPages} ({total} soru)
            </span>
            <button
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= totalPages}
              type="button"
              className="qb-icon-btn qb-icon-btn--subtle"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}
      </GlassCard>
      )}



      {/* AI Generation Modal */}
      {/* {showAIModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-xl w-full max-w-md">
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Brain className="w-6 h-6 text-purple-400" />
                AI ile Soru Üret
              </h3>
              <button onClick={() => setShowAIModal(false)} className="text-white/60 hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm text-white/70 mb-1">Ders *</label>
                <select
                  value={aiForm.subjectId}
                  onChange={(e) => setAiForm({ ...aiForm, subjectId: e.target.value })}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="">Seçin</option>
                  {availableSubjectsForAi.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-white/70 mb-1">Sınıf</label>
                <select
                  value={aiForm.gradeLevel}
                  onChange={(e) => setAiForm({ ...aiForm, gradeLevel: e.target.value })}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500"
                >
                  {GRADE_LEVELS.map((g) => (
                    <option key={g} value={g}>{g}. Sınıf</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-white/70 mb-1">Konu *</label>
                <input
                  type="text"
                  value={aiForm.topic}
                  onChange={(e) => setAiForm({ ...aiForm, topic: e.target.value })}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  placeholder="Örn: İkinci Dereceden Denklemler"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-white/70 mb-1">Zorluk</label>
                  <select
                    value={aiForm.difficulty}
                    onChange={(e) => setAiForm({ ...aiForm, difficulty: e.target.value as 'easy' | 'medium' | 'hard' })}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  >
                    {DIFFICULTY_LEVELS.map((d) => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-white/70 mb-1">Soru Sayısı</label>
                  <select
                    value={aiForm.count}
                    onChange={(e) => setAiForm({ ...aiForm, count: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  >
                    {[1, 2, 3, 4, 5, 10].map((n) => (
                      <option key={n} value={n}>{n} soru</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm text-white/70 mb-1">Bloom Seviyesi</label>
                <select
                  value={aiForm.bloomLevel}
                  onChange={(e) => setAiForm({ ...aiForm, bloomLevel: e.target.value as BloomLevel })}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500"
                >
                  {BLOOM_LEVELS.map((b) => (
                    <option key={b.value} value={b.value}>{b.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="p-6 border-t border-white/10 flex justify-end gap-3">
              <button
                onClick={() => setShowAIModal(false)}
                className="px-4 py-2 text-white/70 hover:text-white transition"
              >
                İptal
              </button>
              <button
                onClick={handleGenerateAI}
                disabled={aiLoading}
                className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:opacity-90 transition disabled:opacity-50"
              >
                {aiLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Üretiliyor...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Üret
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )} */}
    </div>
  );
}

export default QuestionBankTab;
