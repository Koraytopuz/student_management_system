import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../../AuthContext';
import { getApiBaseUrl, getSubjectsList, type SubjectItem } from '../../api';

type ParsedQuestion = {
  question_text: string;
  options: string[];
  correct_option?: string | null;
  difficulty?: string;
  topic: string;
};

interface ParsePdfResponse {
  success: boolean;
  data?: ParsedQuestion[];
  error?: string;
}

export const QuestionParserPage: React.FC = () => {
  const { token } = useAuth();

  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<ParsedQuestion[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(false);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [gradeLevel, setGradeLevel] = useState<string>('11');
  const [topic, setTopic] = useState<string>('');
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const loadSubjects = async () => {
      try {
        setSubjectsLoading(true);
        const list = await getSubjectsList(token);
        if (!cancelled) {
          // Aynı ders ismi birden fazla geldiyse tekilleştir
          const byName = new Map<string, SubjectItem>();
          list.forEach((s) => {
            const key = s.name.trim().toLowerCase();
            if (!byName.has(key)) {
              byName.set(key, s);
            }
          });
          const deduped = Array.from(byName.values());

          setSubjects(deduped);
          if (deduped.length > 0 && !selectedSubjectId) {
            setSelectedSubjectId(deduped[0].id);
          }
        }
      } catch {
        if (!cancelled) {
          // Sessizce yoksay – hata mesajını genel error alanında göstermek istemiyoruz
        }
      } finally {
        if (!cancelled) {
          setSubjectsLoading(false);
        }
      }
    };

    loadSubjects();

    return () => {
      cancelled = true;
    };
  }, [token, selectedSubjectId]);

  const handleFileSelect = (selected: File | null) => {
    if (!selected) return;
    if (selected.type !== 'application/pdf') {
      setError('Lütfen yalnızca PDF dosyası yükleyin.');
      setFile(null);
      return;
    }
    setError(null);
    setFile(selected);
  };

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const droppedFile = e.dataTransfer.files?.[0];
      if (droppedFile) {
        handleFileSelect(droppedFile);
      }
    },
    [],
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  }, [isDragging]);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleAnalyze = async () => {
    if (!file) {
      setError('Lütfen önce bir PDF dosyası seçin.');
      return;
    }
    if (!token) {
      setError('Bu işlemi kullanmak için giriş yapmalısınız.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const baseUrl = getApiBaseUrl();

      const response = await axios.post<ParsePdfResponse>(
        `${baseUrl}/api/ai/parse-pdf`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.data.success || !Array.isArray(response.data.data)) {
        setError(
          response.data.error ??
          'Yapay zeka yanıtı beklenmedik formatta döndü. Lütfen tekrar deneyin.',
        );
        setQuestions([]);
        return;
      }

      setQuestions(response.data.data);

      // Eğer öğretmen üstte "Konu Başlığı" alanını doldurmadıysa ve
      // AI her soru için bir topic ürettiyse, ilk dolu topic'i otomatik
      // olarak alanına yazalım. Böylece konu başlığı boş gibi görünmez.
      if (!topic.trim()) {
        const firstTopic = response.data.data.find(
          (q) => typeof q.topic === 'string' && q.topic.trim().length > 0,
        )?.topic;
        if (firstTopic && firstTopic.trim().length > 0) {
          setTopic(firstTopic.trim());
        }
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const serverData = err.response?.data as ParsePdfResponse | undefined;
        const message =
          serverData?.error ??
          err.message ??
          'PDF analiz edilirken bir hata oluştu.';
        setError(message);
      } else {
        const message =
          err instanceof Error ? err.message : 'PDF analiz edilirken bir hata oluştu.';
        setError(message);
      }
      setQuestions([]);
    } finally {
      setIsLoading(false);
    }
  };

  const difficultyBadgeClass = (difficulty: string | null | undefined): string => {
    const value = (difficulty ?? '').toString().trim().toLowerCase();
    if (value === 'kolay') return 'badge badge-success';
    if (value === 'orta') return 'badge badge-warning';
    if (value === 'zor') return 'badge badge-error';
    return 'badge';
  };

  const handleSaveAll = async () => {
    if (!token) {
      setError('Bu işlemi kullanmak için giriş yapmalısınız.');
      return;
    }
    if (questions.length === 0) {
      setError('Önce bir PDF analiz edin ve soruları görüntüleyin.');
      return;
    }
    if (!selectedSubjectId || !gradeLevel || !topic.trim()) {
      setError('Lütfen ders, sınıf seviyesi ve konu başlığını doldurun.');
      return;
    }

    setSaveLoading(true);
    setSaveMessage(null);
    setError(null);

    try {
      const baseUrl = getApiBaseUrl();
      const payload = {
        subjectId: selectedSubjectId,
        gradeLevel,
        topic: topic.trim(),
        questions,
      };

      const response = await axios.post<{
        success: boolean;
        saved?: number;
        error?: string;
      }>(`${baseUrl}/api/ai/save-parsed-questions`, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.data.success) {
        setError(response.data.error ?? 'Sorular veritabanına kaydedilemedi.');
        return;
      }

      const savedCount = response.data.saved ?? questions.length;
      setSaveMessage(`${savedCount} soru başarıyla soru bankasına kaydedildi.`);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const serverMessage =
          (err.response?.data as { error?: string } | undefined)?.error ?? err.message;
        setError(serverMessage || 'Sorular kaydedilirken bir hata oluştu.');
      } else {
        const message =
          err instanceof Error ? err.message : 'Sorular kaydedilirken bir hata oluştu.';
        setError(message);
      }
    } finally {
      setSaveLoading(false);
    }
  };

  return (
    <div className="question-parser-page">
      <div className="question-parser-header">
        <div>
          <div className="eyebrow">AI Soru Bankası Ayrıştırıcı</div>
          <h1>PDF Soru Bankası Yükle</h1>
          <p>
            PDF test kitaplarındaki çoktan seçmeli soruları Google Gemini ile otomatik olarak
            ayrıştırın. Sorular, şıklar, doğru cevap ve konu başlığı olarak
            yapılandırılmış biçimde elde edilir.
          </p>
        </div>
      </div>

      <div className="question-parser-body">
        <div className="question-parser-panel">
          <div
            className={`question-parser-dropzone${isDragging ? ' is-dragging' : ''}`}
            onDragOver={handleDragOver}
            onDragEnter={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="question-parser-dropzone-inner">
              <p className="dropzone-title">
                PDF dosyanızı buraya sürükleyin veya aşağıdan seçin
              </p>
              <p className="dropzone-subtitle">
                Yalnızca tek bir PDF sayfası veya sayfa kırpılmış PDF yüklemeniz önerilir.
              </p>

              <div className="dropzone-actions">
                <label className="ghost-btn" style={{ cursor: 'pointer' }}>
                  Dosya Seç
                  <input
                    type="file"
                    accept="application/pdf"
                    style={{ display: 'none' }}
                    onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
                  />
                </label>
                {file && (
                  <span className="selected-file">
                    Seçilen dosya: <strong>{file.name}</strong>
                  </span>
                )}
              </div>

              <p className="dropzone-hint">
                Dosya boyutu en fazla 250 MB olmalıdır. Net taranmış veya dijital PDF&apos;ler daha
                iyi sonuç verir.
              </p>
            </div>
          </div>

          <div className="question-parser-actions">
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={isLoading || !file}
            >
              {isLoading ? (
                <span className="analyze-loading">
                  <Loader2 className="spinner" size={18} />
                  <span>Yapay Zeka Analiz Ediyor...</span>
                </span>
              ) : (
                'Analiz Et'
              )}
            </button>
          </div>

          {error && (
            <div className="question-parser-error">
              {error}
            </div>
          )}
        </div>

        <div className="question-parser-results">
          <div className="question-parser-results-header">
            <h2>Çıktı Önizleme</h2>
            <p>
              Ayrıştırılan soruları inceleyin. Uygun ders, sınıf seviyesi ve konu
              başlığını seçerek soruları doğrudan soru bankasına kaydedebilirsiniz.
            </p>
          </div>

          {questions.length === 0 && !isLoading && !error && (
            <div className="empty-state">
              Henüz soru ayrıştırılmadı. Önce bir PDF yükleyip &quot;Analiz Et&quot; butonuna
              tıklayın.
            </div>
          )}

          {questions.length > 0 && (
            <>
              <div className="card" style={{ marginBottom: '1rem' }}>
                <h3 style={{ marginBottom: '0.75rem', fontSize: '1rem', fontWeight: 600 }}>
                  Soru Bankası Ayarları
                </h3>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: '0.75rem',
                    marginBottom: '0.75rem',
                  }}
                >
                  <div>
                    <label className="field-label">
                      Ders
                      <select
                        value={selectedSubjectId}
                        onChange={(e) => setSelectedSubjectId(e.target.value)}
                        className="field-input"
                        disabled={subjectsLoading}
                      >
                        {subjects.length === 0 && (
                          <option value="">Ders bulunamadı</option>
                        )}
                        {subjects.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div>
                    <label className="field-label">
                      Sınıf / Seviye
                      <select
                        value={gradeLevel}
                        onChange={(e) => setGradeLevel(e.target.value)}
                        className="field-input"
                      >
                        {['4', '5', '6', '7', '8', '9', '10', '11', '12', 'LGS', 'TYT', 'AYT'].map(
                          (g) => (
                            <option key={g} value={g}>
                              {g}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                  </div>

                  <div>
                    <label className="field-label">
                      Konu Başlığı
                      <input
                        type="text"
                        className="field-input"
                        placeholder="Örn: Paragrafta Anlam"
                        value={topic}
                        onChange={(e) => setTopic(e.target.value)}
                      />
                    </label>
                  </div>
                </div>
                <p style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                  Öğrenci soru havuzunda bu ders ve konu başlığı altında yeni sorular
                  görünecektir (örneğin: TYT Türkçe &raquo; Paragrafta Anlam).
                </p>
              </div>

              <div className="question-grid">
                {questions.map((q, index) => (
                  <div key={index} className="card question-card">
                    <div className="question-card-header">
                      <div className="question-card-labels">
                        <span className="badge">
                          {q.topic || 'Konu belirtilmedi'}
                        </span>
                      </div>
                      <span className="question-index">Soru {index + 1}</span>
                    </div>

                    <div className="question-text">
                      {q.question_text}
                    </div>

                    {Array.isArray(q.options) && q.options.length > 0 && (
                      <ul className="question-options">
                        {q.options.map((opt, idx) => (
                          <li key={idx}>{opt}</li>
                        ))}
                      </ul>
                    )}

                    {q.correct_option && (
                      <div className="question-meta">
                        <span className="badge badge-success">
                          Doğru cevap: {q.correct_option}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="question-parser-footer">
                <div className="question-parser-footer-actions">
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={handleSaveAll}
                    disabled={
                      saveLoading ||
                      questions.length === 0 ||
                      !selectedSubjectId ||
                      !gradeLevel ||
                      !topic.trim()
                    }
                  >
                    {saveLoading ? 'Kaydediliyor...' : 'Tümünü Veritabanına Kaydet'}
                  </button>

                  {saveMessage && (
                    <div className="question-parser-success">
                      {saveMessage}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

