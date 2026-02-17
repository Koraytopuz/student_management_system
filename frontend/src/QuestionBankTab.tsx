/**
 * Soru Bankası Tab Bileşeni
 * Öğretmenin soru eklemesi, düzenlemesi, araması ve AI ile soru üretmesi için
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Plus,
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
  bulkApproveQuestionBankItems,
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
  /** Öğretmenin atandığı sınıflar; verilirse sadece bunlar listelenir */
  allowedGrades?: string[];
  /** Öğretmenin branşındaki dersler; verilirse sadece bunlar listelenir */
  allowedSubjectNames?: string[];
}

const GRADE_LEVELS = ['12', '11', '10', '9', '8', '7', '6', '5', '4'];

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

export function QuestionBankTab({ token, allowedGrades = [], allowedSubjectNames = [] }: QuestionBankTabProps) {
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

  // AI üretim sonrası önizleme: her soru ayrı kartta
  const [generatedPreview, setGeneratedPreview] = useState<QuestionBankItem[] | null>(null);
  const [previewExpandedSolution, setPreviewExpandedSolution] = useState<Set<string>>(new Set());

  // Folder View States
  // Varsayılan: Soru klasörleri (admin menüsüne girince ilk ekran)
  const [viewMode, setViewMode] = useState<'list' | 'folder'>('folder');
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
    const subjItem = subjects.find((s) => (s.name || '').trim() === subject.trim());
    const subjectIdFromQuestion = questionsForFolder.find(
      (q) =>
        q.gradeLevel === grade &&
        (q.subject?.name || '').trim() === subject.trim() &&
        (q.topic || '').trim() === topic.trim()
    )?.subjectId;
    const subjectId = subjItem?.id ?? subjectIdFromQuestion;
    setFilters((prev) => ({
      ...prev,
      page: 1,
      gradeLevel: grade,
      topic: topic,
      subjectId: subjectId || undefined,
    }));
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
    if (allowedNormalized.has('din kültürü') && n.includes('din kültürü')) return true;
    if (allowedNormalized.has('edebiyat') && (n.includes('edebiyat') || n.includes('türk dili'))) return true;
    if (allowedNormalized.has('fen bilimleri') && n.includes('fen')) return true;
    if (allowedNormalized.has('sosyal bilgiler') && n.includes('sosyal')) return true;
    if (allowedNormalized.has('türkçe') && n.includes('türkçe')) return true;
    if (allowedNormalized.has('matematik') && n.includes('matematik')) return true;
    if (allowedNormalized.has('felsefe') && n.includes('felsefe')) return true;
    return false;
  };

  /** Öğretmene gösterilecek sınıflar: sadece atandığı sınıflar veya tümü */
  const displayGradeLevels = useMemo(() => {
    if (!allowedGrades || allowedGrades.length === 0) return GRADE_LEVELS;
    const set = new Set(allowedGrades);
    return GRADE_LEVELS.filter((g) => set.has(g));
  }, [allowedGrades]);

  /** Öğretmene gösterilecek dersler: sadece branşındaki dersler veya tümü */
  const subjectsForDropdowns = useMemo(() => {
    if (!allowedSubjectNames || allowedSubjectNames.length === 0) return filteredSubjects;
    const allowedSet = new Set(allowedSubjectNames.map((n) => n.trim().toLocaleLowerCase('tr-TR')));
    return filteredSubjects.filter((s) => subjectNameMatchesAllowed(s.name, allowedSet));
  }, [filteredSubjects, allowedSubjectNames]);

  const getAvailableSubjectsForGrade = (grade?: string, subjectList = subjectsForDropdowns) => {
    if (!grade) return subjectList;
    const allowed = gradeSubjectsMapping[grade];
    if (!allowed || allowed.length === 0) return subjectList;
    const allowedNormalized = new Set(allowed.map(normalizeText));
    return subjectList.filter((s) => subjectNameMatchesAllowed(s.name, allowedNormalized));
  };

  const availableSubjectsForAi = useMemo(
    () => getAvailableSubjectsForGrade(aiForm.gradeLevel),
    [aiForm.gradeLevel, subjectsForDropdowns],
  );

  const availableSubjectsForForm = useMemo(
    () => getAvailableSubjectsForGrade(formData.gradeLevel),
    [formData.gradeLevel, subjectsForDropdowns],
  );

  const availableSubjectsForFilters = useMemo(
    () => getAvailableSubjectsForGrade(filters.gradeLevel),
    [filters.gradeLevel, subjectsForDropdowns],
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

  // Öğretmen sadece atandığı sınıfları görüyorsa, seçili sınıf geçersizse ilk yetkili sınıfa ayarla
  useEffect(() => {
    if (displayGradeLevels.length === 0) return;
    if (!displayGradeLevels.includes(aiForm.gradeLevel)) {
      setAiForm((p) => ({ ...p, gradeLevel: displayGradeLevels[0] }));
    }
  }, [displayGradeLevels.join(','), aiForm.gradeLevel]);

  useEffect(() => {
    if (displayGradeLevels.length === 0 || !formData.gradeLevel) return;
    if (!displayGradeLevels.includes(formData.gradeLevel)) {
      setFormData((p) => ({ ...p, gradeLevel: displayGradeLevels[0] }));
    }
  }, [displayGradeLevels.join(','), formData.gradeLevel]);

  // Load data (token değişince de liste yüklensin)
  useEffect(() => {
    if (token) loadData();
  }, [filters, token]);

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

  // Filters değiştiğinde veriyi yeniden yükle
  useEffect(() => {
    loadData();
  }, [token, filters]);

  // PDF'ten soru kaydedildiğinde soru bankasını yenile
  useEffect(() => {
    const handleRefresh = () => {
      loadData();
      loadStats();
    };
    window.addEventListener('questionBankRefresh', handleRefresh);
    return () => {
      window.removeEventListener('questionBankRefresh', handleRefresh);
    };
  }, [token]);

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

  const handleBulkApprove = async () => {
    if (!token) return;
    const unapprovedAICount = questions.filter((q) => !q.isApproved && q.source === 'ai').length;
    if (unapprovedAICount === 0) {
      setError('Onaylanacak AI sorusu bulunamadı');
      return;
    }
    if (!window.confirm(`Tüm onaylanmamış AI sorularını (${unapprovedAICount} adet) onaylamak istediğinize emin misiniz?`)) return;
    
    try {
      const result = await bulkApproveQuestionBankItems(token, { source: 'ai' });
      setSuccessMessage(result.message || `${result.count} soru onaylandı`);
      loadData();
      loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Toplu onaylama başarısız');
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
    setGeneratedPreview(null);
    try {
      const result = await generateQuestionBankItems(token, aiForm);
      setSuccessMessage(`${result.questions.length} soru üretildi ve soru bankasına eklendi`);
      setShowAICard(false);
      setGeneratedPreview(result.questions);
      loadData();
      loadStats();
    } catch (err: any) {
      console.error('[QuestionBankTab] AI generation error:', err);
      const errorMsg = err?.response?.data?.error || err?.message || 'AI soru üretimi başarısız';
      const errorDetails = err?.response?.data?.details;
      setError(errorDetails ? `${errorMsg}: ${errorDetails}` : errorMsg);
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
      {/* Header & Stats – premium bar */}
      <div className="qb-premium-header" style={{ marginBottom: '1rem' }}>
        <div className="qb-premium-header-actions" style={{ width: '100%', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              onClick={() => {
                if (viewMode === 'list') {
                  setViewMode('folder');
                } else {
                  setViewMode('list');
                  setFilters({ page: 1, limit: 10 });
                }
              }}
              className={viewMode === 'folder' ? 'primary-btn' : 'ghost-btn'}
              type="button"
              title={viewMode === 'list' ? 'Klasör Görünümü' : 'Liste Görünümü'}
            >
              {viewMode === 'list' ? <Folder className="qb-header-icon w-4 h-4" strokeWidth={1.75} /> : <List className="qb-header-icon w-4 h-4" strokeWidth={1.75} />}
              {viewMode === 'list' ? 'Klasör' : 'Liste'}
            </button>
            {/* Filtreler UI kaldırıldı */}
          </div>
          <div className="qb-premium-stat">
            <span className="qb-premium-stat-value">{stats?.total ?? 0}</span>
            <span className="qb-premium-stat-label">Toplam Soru</span>
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
                    <option value="" className="bg-slate-900">{displayGradeLevels.length === 0 ? 'Yetkili sınıf yok' : 'Sınıf seçin'}</option>
                    {displayGradeLevels.map((g) => (
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
                    <option value="" className="bg-slate-900">{allowedSubjectNames.length > 0 && availableSubjectsForAi.length === 0 ? 'Branşınıza ait ders bulunamadı' : 'Ders Seçiniz'}</option>
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
                <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wider">Soru Tipi</label>
                <div className="relative">
                  <select
                    value={aiForm.questionType}
                    onChange={(e) => setAiForm({ ...aiForm, questionType: e.target.value as 'multiple_choice' | 'true_false' | 'open_ended' })}
                    className="w-full px-4 py-2.5 bg-slate-900/50 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 transition-all appearance-none"
                  >
                    {QUESTION_TYPES.map((t) => (
                      <option key={t.value} value={t.value} className="bg-slate-900">{t.label}</option>
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
                      {displayGradeLevels.map((g) => (
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

      {/* Üretilen sorular önizleme: her soru ayrı kartta, premium görünüm */}
      {generatedPreview && generatedPreview.length > 0 && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-400" />
              Üretilen Sorular ({generatedPreview.length})
            </h3>
            <button
              type="button"
              onClick={() => { setGeneratedPreview(null); setSuccessMessage(null); loadData(); loadStats(); }}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-500 via-pink-500 to-rose-500 hover:from-purple-400 hover:via-pink-400 hover:to-rose-400 text-white text-sm font-semibold transition-all shadow-lg shadow-purple-500/40 hover:shadow-purple-500/60 border border-purple-300/50 flex items-center gap-2"
            >
              <ChevronLeft className="w-4 h-4" />
              Listeye dön
            </button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {generatedPreview.map((q) => {
              const isSolutionOpen = previewExpandedSolution.has(q.id);
              const choicesList = Array.isArray(q.choices) ? q.choices : [];
              return (
                <GlassCard key={q.id} className="p-6 border border-white/10 rounded-2xl overflow-hidden flex flex-col shadow-xl">
                  <p className="text-white/95 text-[15px] leading-relaxed mb-4 whitespace-pre-wrap">{q.text}</p>
                  {q.imageUrl && q.imageUrl.trim() !== '' && (
                    <div className="mb-4 rounded-xl overflow-hidden border border-white/10 bg-black/20 shadow-lg min-h-[120px] flex items-center justify-center">
                      <img 
                        src={q.imageUrl} 
                        alt="Soru görseli" 
                        className="w-full max-h-80 object-contain hidden"
                        onError={(e) => {
                          const img = e.target as HTMLImageElement;
                          img.classList.add('hidden');
                          const parent = img.parentElement;
                          if (parent && !parent.querySelector('.img-fallback')) {
                            const fallback = document.createElement('div');
                            fallback.className = 'img-fallback py-8 px-4 text-center text-white/50 text-sm';
                            fallback.textContent = 'Görsel yüklenemedi (URL geçersiz veya erişilemiyor)';
                            parent.appendChild(fallback);
                          }
                        }}
                        onLoad={(e) => {
                          (e.target as HTMLImageElement).classList.remove('hidden');
                        }}
                      />
                    </div>
                  )}
                  {choicesList.length > 0 && (
                    <ul className="space-y-2 mb-4">
                      {choicesList.map((c, i) => {
                        const letter = String.fromCharCode(65 + i);
                        const isCorrect = (q.correctAnswer || '').toUpperCase().replace(/[^A-E]/g, '') === letter;
                        return (
                          <li
                            key={i}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${isCorrect ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-white/5 text-white/80 border border-white/10'}`}
                          >
                            <span className="font-medium shrink-0">{letter})</span>
                            <span>{c}</span>
                            {isCorrect && <Check className="w-4 h-4 shrink-0 text-emerald-400" />}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {q.correctAnswer && !choicesList.length && (
                    <p className="text-sm text-white/70 mb-4">
                      Doğru cevap: <span className="font-medium text-emerald-400">{q.correctAnswer}</span>
                    </p>
                  )}
                  {q.solutionExplanation && (
                    <div className="mt-auto pt-4 border-t border-white/10">
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewExpandedSolution((prev) => {
                            const next = new Set(prev);
                            if (next.has(q.id)) next.delete(q.id);
                            else next.add(q.id);
                            return next;
                          });
                        }}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-violet-500 hover:from-indigo-400 hover:via-purple-400 hover:to-violet-400 text-white text-sm font-semibold transition-all shadow-md shadow-indigo-500/30 hover:shadow-indigo-500/50 border border-indigo-300/50 hover:border-indigo-200/70 w-full justify-center"
                      >
                        {isSolutionOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        <span>Çözüm Açıklaması</span>
                      </button>
                      {isSolutionOpen && (
                        <p className="mt-3 text-sm text-white/70 leading-relaxed whitespace-pre-wrap rounded-lg bg-white/5 p-3 border border-white/10">
                          {q.solutionExplanation}
                        </p>
                      )}
                    </div>
                  )}
                </GlassCard>
              );
            })}
          </div>
        </div>
      )}

      {/* Filtreler UI kaldırıldı */}

      {/* Questions List or Folder View — premium kart */}
      {viewMode === 'folder' ? (
        <div className="qb-folders-card">
          <div className="qb-folders-card-header">
            <h3 className="qb-folders-card-title">
              <Folder className="qb-folders-card-icon" />
              Soru Klasörleri
            </h3>
          </div>
          <div className="qb-folders-card-body">
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
                  const order = ['12', '11', '10', '9', '8', '7', '6', '5', '4', 'TYT', 'AYT'];
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
            {(stats?.total ?? 0) > 0 && (filters.gradeLevel || filters.subjectId || filters.topic) ? (
              <>
                <p>Seçili filtreye uygun soru bulunamadı</p>
                <p className="text-sm mt-2">Filtreleri temizleyerek tüm {stats?.total} soruyu görebilirsiniz.</p>
                <button
                  type="button"
                  className="primary-btn mt-4"
                  onClick={() => {
                    setLoading(true);
                    setFilters({ page: 1, limit: 10 });
                  }}
                >
                  Filtreleri temizle
                </button>
              </>
            ) : (
              <>
                <p>Henüz soru yok</p>
                <p className="text-sm mt-2">Yukarıdaki butonlarla soru ekleyebilirsiniz</p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {questions.some((q) => !q.isApproved && q.source === 'ai') && (
              <div className="flex items-center justify-between p-4 bg-gradient-to-r from-emerald-500/10 to-green-500/10 rounded-xl border border-emerald-500/30">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-emerald-400" />
                  <div>
                    <p className="text-white font-medium text-sm">
                      {questions.filter((q) => !q.isApproved && q.source === 'ai').length} onaylanmamış AI sorusu var
                    </p>
                    <p className="text-white/60 text-xs mt-0.5">Tümünü tek seferde onaylayabilirsiniz</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleBulkApprove}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-400 hover:to-green-400 text-white text-sm font-semibold transition-all shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 border border-emerald-300/50 flex items-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  Tümünü Onayla
                </button>
              </div>
            )}
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
                    {q.imageUrl && (
                      <div className="mb-2">
                        <img 
                          src={q.imageUrl} 
                          alt="Soru Görseli" 
                          className="max-w-full h-auto max-h-64 rounded-lg border border-white/10" 
                        />
                      </div>
                    )}
                    <p className="text-white font-medium whitespace-pre-wrap">{q.text || '(Soru metni yok)'}</p>
                    {Array.isArray(q.choices) && q.choices.length > 0 && (
                      <div className="mt-2 grid grid-cols-2 gap-1 text-sm text-white/70">
                        {(q.choices as string[]).map((c, i) => (
                          <div key={i} className={`${c === q.correctAnswer || String.fromCharCode(65 + i) === q.correctAnswer ? 'text-green-400' : ''}`}>
                            {String.fromCharCode(65 + i)}) {c || '\u00A0'}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="mt-2 text-sm text-white/50">
                      Konu: {q.topic || '\u00A0'}
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
                  {displayGradeLevels.map((g) => (
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
                <label className="block text-sm text-white/70 mb-1">Soru Tipi</label>
                <select
                  value={aiForm.questionType}
                  onChange={(e) => setAiForm({ ...aiForm, questionType: e.target.value as 'multiple_choice' | 'true_false' | 'open_ended' })}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500"
                >
                  {QUESTION_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
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
