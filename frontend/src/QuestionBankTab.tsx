/**
 * Soru Bankası Tab Bileşeni
 * Öğretmenin soru eklemesi, düzenlemesi, araması ve AI ile soru üretmesi için
 */
import { useState, useEffect } from 'react';
import {
  Plus,
  Search,
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
  token: string;
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
  const [searchText, setSearchText] = useState('');

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
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
    count: 3,
  });

  // Load data
  useEffect(() => {
    loadData();
  }, [filters]);

  useEffect(() => {
    loadSubjects();
    loadStats();
  }, []);

  const loadSubjects = async () => {
    try {
      const data = await getSubjectsList(token);
      setSubjects(data);
    } catch (err) {
      console.error('Dersler yüklenemedi:', err);
    }
  };

  const loadStats = async () => {
    try {
      const data = await getQuestionBankStats(token);
      setStats(data);
    } catch (err) {
      console.error('İstatistikler yüklenemedi:', err);
    }
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getQuestionBankList(token, { ...filters, search: searchText || undefined });
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

  const handleSearch = () => {
    setFilters({ ...filters, page: 1, search: searchText });
  };

  const handleFilterChange = (key: keyof QuestionBankSearchParams, value: string | boolean | undefined) => {
    setFilters({ ...filters, page: 1, [key]: value });
  };

  const handlePageChange = (newPage: number) => {
    setFilters({ ...filters, page: newPage });
  };

  const handleOpenAddModal = (question?: QuestionBankItem) => {
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
    } else {
      setEditingQuestion(null);
      setFormData({
        type: 'multiple_choice',
        difficulty: 'medium',
        choices: ['', '', '', '', ''],
      });
    }
    setShowAddModal(true);
  };

  const handleSaveQuestion = async () => {
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
      setShowAddModal(false);
      loadData();
      loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydetme başarısız');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteQuestion = async (id: string) => {
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
    try {
      await approveQuestionBankItem(token, id);
      setSuccessMessage('Soru onaylandı');
      loadData();
      loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Onaylama başarısız');
    }
  };

  const handleGenerateAI = async () => {
    if (!aiForm.subjectId || !aiForm.topic) {
      setError('Lütfen ders ve konu seçin');
      return;
    }

    setAiLoading(true);
    setError(null);
    try {
      const result = await generateQuestionBankItems(token, aiForm);
      setSuccessMessage(`${result.questions.length} soru üretildi`);
      setShowAIModal(false);
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
    <div className="space-y-6">
      {/* Header & Stats */}
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <BookOpen className="w-6 h-6" />
          Soru Bankası
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAIModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:opacity-90 transition"
          >
            <Sparkles className="w-4 h-4" />
            AI ile Üret
          </button>
          <button
            onClick={() => handleOpenAddModal()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            <Plus className="w-4 h-4" />
            Soru Ekle
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <GlassCard className="p-4 text-center">
            <div className="text-3xl font-bold text-white">{stats.total}</div>
            <div className="text-sm text-white/60">Toplam Soru</div>
          </GlassCard>
          <GlassCard className="p-4 text-center">
            <div className="text-3xl font-bold text-green-400">{stats.approved}</div>
            <div className="text-sm text-white/60">Onaylı</div>
          </GlassCard>
          <GlassCard className="p-4 text-center">
            <div className="text-3xl font-bold text-orange-400">{stats.pending}</div>
            <div className="text-sm text-white/60">Onay Bekliyor</div>
          </GlassCard>
          <GlassCard className="p-4 text-center">
            <div className="text-3xl font-bold text-purple-400">{stats.bySource.ai}</div>
            <div className="text-sm text-white/60">AI Üretimi</div>
          </GlassCard>
        </div>
      )}

      {/* Messages */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400">
          <AlertCircle className="w-5 h-5" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}
      {successMessage && (
        <div className="flex items-center gap-2 p-4 bg-green-500/20 border border-green-500/50 rounded-lg text-green-400">
          <CheckCircle className="w-5 h-5" />
          {successMessage}
        </div>
      )}

      {/* Search & Filters */}
      <GlassCard className="p-4">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex-1 min-w-[200px] flex gap-2">
            <input
              type="text"
              placeholder="Soru ara..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-blue-500"
            />
            <button onClick={handleSearch} className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              <Search className="w-5 h-5" />
            </button>
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 border rounded-lg transition ${showFilters ? 'bg-blue-600 border-blue-600 text-white' : 'border-white/20 text-white/70 hover:border-white/40'}`}
          >
            <Filter className="w-4 h-4" />
            Filtreler
          </button>
        </div>

        {showFilters && (
          <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-2 md:grid-cols-4 gap-4">
            <select
              value={filters.subjectId || ''}
              onChange={(e) => handleFilterChange('subjectId', e.target.value || undefined)}
              className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none"
            >
              <option value="">Tüm Dersler</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <select
              value={filters.gradeLevel || ''}
              onChange={(e) => handleFilterChange('gradeLevel', e.target.value || undefined)}
              className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none"
            >
              <option value="">Tüm Sınıflar</option>
              {GRADE_LEVELS.map((g) => (
                <option key={g} value={g}>{g}. Sınıf</option>
              ))}
            </select>
            <select
              value={filters.difficulty || ''}
              onChange={(e) => handleFilterChange('difficulty', e.target.value || undefined)}
              className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none"
            >
              <option value="">Tüm Zorluklar</option>
              {DIFFICULTY_LEVELS.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
            <select
              value={filters.source || ''}
              onChange={(e) => handleFilterChange('source', e.target.value || undefined)}
              className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none"
            >
              <option value="">Tüm Kaynaklar</option>
              <option value="teacher">Öğretmen</option>
              <option value="ai">AI</option>
            </select>
          </div>
        )}
      </GlassCard>

      {/* Questions List */}
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
                        className="p-2 text-green-400 hover:bg-green-500/20 rounded-lg transition"
                        title="Onayla"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => handleOpenAddModal(q)}
                      className="p-2 text-blue-400 hover:bg-blue-500/20 rounded-lg transition"
                      title="Düzenle"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteQuestion(q.id)}
                      className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition"
                      title="Sil"
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
              className="p-2 text-white/70 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-white/70">
              Sayfa {page} / {totalPages} ({total} soru)
            </span>
            <button
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= totalPages}
              className="p-2 text-white/70 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}
      </GlassCard>

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-xl font-bold text-white">
                {editingQuestion ? 'Soruyu Düzenle' : 'Yeni Soru Ekle'}
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-white/60 hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-white/70 mb-1">Ders *</label>
                  <select
                    value={formData.subjectId || ''}
                    onChange={(e) => setFormData({ ...formData, subjectId: e.target.value })}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Seçin</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-white/70 mb-1">Sınıf *</label>
                  <select
                    value={formData.gradeLevel || ''}
                    onChange={(e) => setFormData({ ...formData, gradeLevel: e.target.value })}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Seçin</option>
                    {GRADE_LEVELS.map((g) => (
                      <option key={g} value={g}>{g}. Sınıf</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm text-white/70 mb-1">Konu *</label>
                <input
                  type="text"
                  value={formData.topic || ''}
                  onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  placeholder="Örn: Fonksiyonlar"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-white/70 mb-1">Soru Tipi</label>
                  <select
                    value={formData.type || 'multiple_choice'}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as 'multiple_choice' | 'true_false' | 'open_ended' })}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  >
                    {QUESTION_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-white/70 mb-1">Zorluk</label>
                  <select
                    value={formData.difficulty || 'medium'}
                    onChange={(e) => setFormData({ ...formData, difficulty: e.target.value as 'easy' | 'medium' | 'hard' })}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  >
                    {DIFFICULTY_LEVELS.map((d) => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-white/70 mb-1">Bloom Seviyesi</label>
                  <select
                    value={formData.bloomLevel || ''}
                    onChange={(e) => setFormData({ ...formData, bloomLevel: e.target.value as BloomLevel })}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Seçin</option>
                    {BLOOM_LEVELS.map((b) => (
                      <option key={b.value} value={b.value}>{b.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm text-white/70 mb-1">Soru Metni *</label>
                <textarea
                  value={formData.text || ''}
                  onChange={(e) => setFormData({ ...formData, text: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  placeholder="Soru metnini yazın..."
                />
              </div>
              {formData.type === 'multiple_choice' && (
                <div>
                  <label className="block text-sm text-white/70 mb-1">Şıklar</label>
                  <div className="space-y-2">
                    {(formData.choices || []).map((choice, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-white/60 w-6">{String.fromCharCode(65 + i)})</span>
                        <input
                          type="text"
                          value={choice}
                          onChange={(e) => {
                            const newChoices = [...(formData.choices || [])];
                            newChoices[i] = e.target.value;
                            setFormData({ ...formData, choices: newChoices });
                          }}
                          className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500"
                          placeholder={`Şık ${String.fromCharCode(65 + i)}`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="block text-sm text-white/70 mb-1">Doğru Cevap *</label>
                <input
                  type="text"
                  value={formData.correctAnswer || ''}
                  onChange={(e) => setFormData({ ...formData, correctAnswer: e.target.value })}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  placeholder={formData.type === 'multiple_choice' ? 'A, B, C, D veya E' : 'Doğru cevap'}
                />
              </div>
              <div>
                <label className="block text-sm text-white/70 mb-1">Çözüm Açıklaması</label>
                <textarea
                  value={formData.solutionExplanation || ''}
                  onChange={(e) => setFormData({ ...formData, solutionExplanation: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  placeholder="Çözüm açıklaması (isteğe bağlı)"
                />
              </div>
            </div>
            <div className="p-6 border-t border-white/10 flex justify-end gap-3">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-white/70 hover:text-white transition"
              >
                İptal
              </button>
              <button
                onClick={handleSaveQuestion}
                disabled={loading}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingQuestion ? 'Güncelle' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Generation Modal */}
      {showAIModal && (
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
                  {subjects.map((s) => (
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
      )}
    </div>
  );
}

export default QuestionBankTab;
