import React, { useState, useCallback } from 'react';
import { Upload, FileText, Play, Loader2, Send } from 'lucide-react';

type OpticalResultStatus = 'idle' | 'sending' | 'sent';

interface OpticalResult {
  id: number;
  studentNo: string;
  studentName: string;
  className: string;
  correct: number;
  incorrect: number;
  blank: number;
  score: number;
  status: OpticalResultStatus;
}

const OpticalScanningPage: React.FC = () => {
  const [answerKeyFile, setAnswerKeyFile] = useState<File | null>(null);
  const [studentOpticsFile, setStudentOpticsFile] = useState<File | null>(null);
  const [isAnswerKeyDragging, setIsAnswerKeyDragging] = useState(false);
  const [isStudentOpticsDragging, setIsStudentOpticsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState<OpticalResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleDrop = useCallback(
    (
      e: React.DragEvent<HTMLDivElement>,
      type: 'answerKey' | 'studentOptics',
    ) => {
      e.preventDefault();
      e.stopPropagation();

      const file = e.dataTransfer.files?.[0];
      if (!file) return;

      if (type === 'answerKey') {
        setAnswerKeyFile(file);
        setIsAnswerKeyDragging(false);
      } else {
        setStudentOpticsFile(file);
        setIsStudentOpticsDragging(false);
      }
    },
    [],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>, type: 'answerKey' | 'studentOptics') => {
      e.preventDefault();
      e.stopPropagation();
      if (type === 'answerKey') {
        if (!isAnswerKeyDragging) setIsAnswerKeyDragging(true);
      } else {
        if (!isStudentOpticsDragging) setIsStudentOpticsDragging(true);
      }
    },
    [isAnswerKeyDragging, isStudentOpticsDragging],
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent<HTMLDivElement>, type: 'answerKey' | 'studentOptics') => {
      e.preventDefault();
      e.stopPropagation();
      if (type === 'answerKey') {
        setIsAnswerKeyDragging(false);
      } else {
        setIsStudentOpticsDragging(false);
      }
    },
    [],
  );

  const handleFileSelect = (file: File | null, type: 'answerKey' | 'studentOptics') => {
    if (!file) return;
    if (type === 'answerKey') {
      setAnswerKeyFile(file);
    } else {
      setStudentOpticsFile(file);
    }
  };

  const readFileAsText = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = (err) => reject(err);
      reader.readAsText(file, 'utf-8');
    });

  const parseAnswerKey = (text: string): Record<string, string[]> => {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const result: Record<string, string[]> = {};

    for (const line of lines) {
      if (!line.includes(':')) continue;
      const [rawSubject, rawAnswers] = line.split(':');
      const subject = rawSubject.trim().toUpperCase();
      const answersStr = (rawAnswers ?? '').replace(/\s+/g, '');
      if (!answersStr) continue;
      result[subject] = answersStr.split('');
    }
    return result;
  };

  const parseStudentOptics = (
    text: string,
    subjectsOrder: string[],
    answerKey: Record<string, string[]>,
  ): OpticalResult[] => {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    // İlk satır başlık ise atla (OGRENCI_NO vb.)
    const dataLines =
      lines.length > 0 && /OGRENCI_NO/i.test(lines[0]) ? lines.slice(1) : lines;

    const results: OpticalResult[] = [];

    dataLines.forEach((line, index) => {
      const parts = line.split('|').map((p) => p.trim()).filter((p) => p.length > 0);
      if (parts.length < 5) return;

      const studentNo = parts[0];
      const name = parts[1];
      const className = parts[2];
      // const booklet = parts[3]; // Şimdilik kullanılmıyor
      const subjectAnswerStrings = parts.slice(4);

      let totalCorrect = 0;
      let totalWrong = 0;
      let totalBlank = 0;

      subjectsOrder.forEach((subject, idx) => {
        const key = answerKey[subject];
        const raw = subjectAnswerStrings[idx] ?? '';
        const answersStr = raw.replace(/\s+/g, '');
        if (!key || !answersStr) {
          // Cevap yoksa tümü boş sayılır
          totalBlank += key ? key.length : 0;
          return;
        }

        const answers = answersStr.split('');
        const maxLen = Math.min(key.length, answers.length);
        for (let i = 0; i < maxLen; i += 1) {
          const correctOpt = key[i];
          const studentOpt = answers[i];
          if (!studentOpt || !/[A-E]/i.test(studentOpt)) {
            totalBlank += 1;
          } else if (studentOpt.toUpperCase() === correctOpt.toUpperCase()) {
            totalCorrect += 1;
          } else {
            totalWrong += 1;
          }
        }

        // Fazladan sorular varsa onları da boş say
        if (key.length > maxLen) {
          totalBlank += key.length - maxLen;
        }
      });

      const net = totalCorrect - totalWrong * 0.25;
      const score = Math.round(net * 5); // ExamResult ile uyumlu basit puanlama

      results.push({
        id: index + 1,
        studentNo,
        studentName: name,
        className,
        correct: totalCorrect,
        incorrect: totalWrong,
        blank: totalBlank,
        score,
        status: 'idle',
      });
    });

    return results;
  };

  const handleAnalyze = async () => {
    if (!answerKeyFile || !studentOpticsFile) {
      setError('Lütfen hem cevap anahtarını hem de öğrenci optik dosyasını seçin.');
      return;
    }

    setError(null);
    setIsAnalyzing(true);

    try {
      const [answerKeyText, opticsText] = await Promise.all([
        readFileAsText(answerKeyFile),
        readFileAsText(studentOpticsFile),
      ]);

      const answerKey = parseAnswerKey(answerKeyText);

      // Beklenen ders sırası: TURKCE, SOSYAL, MATEMATIK, FEN
      const subjectsOrder = ['TURKCE', 'SOSYAL', 'MATEMATIK', 'FEN'];

      const parsedResults = parseStudentOptics(opticsText, subjectsOrder, answerKey);
      setResults(parsedResults);
    } catch (e) {
      console.error('Optical analysis error:', e);
      setError('Dosyalar analiz edilirken bir hata oluştu. Lütfen formatı kontrol edin.');
      setResults([]);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSendResult = (id: number) => {
    setResults((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: 'sending' } : r)),
    );

    setTimeout(() => {
      setResults((prev) =>
        prev.map((r) =>
          r.id === id ? { ...r, status: 'sent' } : r,
        ),
      );
    }, 1000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', color: '#e2e8f0' }}>
      {/* Bölüm A: Dosya Yükleme ve Analiz */}
      <div
        style={{
          borderRadius: 16,
          border: '1px solid rgba(71, 85, 105, 0.7)',
          background: 'linear-gradient(135deg, #0f172a 0%, #020617 50%, #0f172a 100%)',
          padding: '1.5rem',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#f8fafc', margin: 0 }}>
              Optik Form Yükleme ve Analiz
            </h1>
            <p style={{ fontSize: '0.875rem', color: '#94a3b8', margin: '0.375rem 0 0' }}>
              Cevap anahtarını ve öğrenci optik dosyalarını yükleyerek toplu sınav analizini başlatın.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, textAlign: 'right' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                borderRadius: 9999,
                background: 'rgba(16, 185, 129, 0.1)',
                padding: '4px 12px',
                fontSize: 11,
                fontWeight: 500,
                color: '#6ee7b7',
                border: '1px solid rgba(16, 185, 129, 0.4)',
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#34d399',
                  marginRight: 6,
                }}
              />
              Otomatik puanlama aktif
            </span>
            <span style={{ fontSize: 11, color: '#64748b' }}>.txt / .dat formatında dosya yükleyin</span>
          </div>
        </div>

        {error && (
          <div
            style={{
              marginBottom: '1rem',
              borderRadius: 8,
              background: 'rgba(127, 29, 29, 0.4)',
              border: '1px solid rgba(239, 68, 68, 0.6)',
              padding: '8px 12px',
              fontSize: '0.875rem',
              color: '#fecaca',
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          {/* Cevap Anahtarı */}
          <div
            style={{
              border: `2px dashed ${isAnswerKeyDragging ? 'rgba(56, 189, 248, 0.8)' : 'rgba(71, 85, 105, 0.8)'}`,
              borderRadius: 12,
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              background: isAnswerKeyDragging ? 'rgba(2, 6, 23, 0.3)' : 'rgba(15, 23, 42, 0.4)',
              boxShadow: isAnswerKeyDragging ? '0 10px 40px rgba(14, 165, 233, 0.2)' : 'none',
            }}
            onDragOver={(e) => handleDragOver(e, 'answerKey')}
            onDragEnter={(e) => handleDragOver(e, 'answerKey')}
            onDragLeave={(e) => handleDragLeave(e, 'answerKey')}
            onDrop={(e) => handleDrop(e, 'answerKey')}
            onClick={() => {
              const input = document.getElementById(
                'answer-key-input',
              ) as HTMLInputElement | null;
              input?.click();
            }}
          >
            <input
              id="answer-key-input"
              type="file"
              className="hidden"
              accept=".txt,.dat"
              onChange={(e) =>
                handleFileSelect(e.target.files?.[0] ?? null, 'answerKey')
              }
            />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' }}>
              <Upload size={32} style={{ color: '#38bdf8' }} />
              <p style={{ fontSize: '0.875rem', fontWeight: 500, color: '#f8fafc', margin: 0 }}>
                Cevap Anahtarı (.txt, .dat)
              </p>
              <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0 }}>
                Dosyayı buraya bırakın veya tıklayın
              </p>
              {answerKeyFile && (
                <p style={{ marginTop: 4, fontSize: '0.75rem', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: 4, margin: '4px 0 0' }}>
                  <FileText size={16} style={{ color: '#94a3b8' }} />
                  <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {answerKeyFile.name}
                  </span>
                </p>
              )}
            </div>
          </div>

          {/* Öğrenci Optikleri */}
          <div
            style={{
              border: `2px dashed ${isStudentOpticsDragging ? 'rgba(56, 189, 248, 0.8)' : 'rgba(71, 85, 105, 0.8)'}`,
              borderRadius: 12,
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              background: isStudentOpticsDragging ? 'rgba(2, 6, 23, 0.3)' : 'rgba(15, 23, 42, 0.4)',
              boxShadow: isStudentOpticsDragging ? '0 10px 40px rgba(14, 165, 233, 0.2)' : 'none',
            }}
            onDragOver={(e) => handleDragOver(e, 'studentOptics')}
            onDragEnter={(e) => handleDragOver(e, 'studentOptics')}
            onDragLeave={(e) => handleDragLeave(e, 'studentOptics')}
            onDrop={(e) => handleDrop(e, 'studentOptics')}
            onClick={() => {
              const input = document.getElementById(
                'student-optics-input',
              ) as HTMLInputElement | null;
              input?.click();
            }}
          >
            <input
              id="student-optics-input"
              type="file"
              className="hidden"
              accept=".txt,.dat"
              onChange={(e) =>
                handleFileSelect(e.target.files?.[0] ?? null, 'studentOptics')
              }
            />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' }}>
              <Upload size={32} style={{ color: '#38bdf8' }} />
              <p style={{ fontSize: '0.875rem', fontWeight: 500, color: '#f8fafc', margin: 0 }}>
                Öğrenci Optikleri (.dat, .txt)
              </p>
              <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0 }}>
                Dosyayı buraya bırakın veya tıklayın
              </p>
              {studentOpticsFile && (
                <p style={{ marginTop: 4, fontSize: '0.75rem', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: 4, margin: '4px 0 0' }}>
                  <FileText size={16} style={{ color: '#94a3b8' }} />
                  <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {studentOpticsFile.name}
                  </span>
                </p>
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleAnalyze}
          disabled={isAnalyzing}
          style={{
            width: '100%',
            borderRadius: 9999,
            background: 'linear-gradient(90deg, #0ea5e9, #6366f1, #2563eb)',
            color: '#fff',
            fontWeight: 600,
            padding: '0.75rem 1rem',
            boxShadow: '0 10px 40px rgba(14, 165, 233, 0.35)',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            cursor: isAnalyzing ? 'not-allowed' : 'pointer',
            opacity: isAnalyzing ? 0.6 : 1,
          }}
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Analiz yapılıyor...</span>
            </>
          ) : (
            <>
              <Play className="h-5 w-5" />
              <span>Analizi Başlat</span>
            </>
          )}
        </button>
      </div>

      {/* Bölüm B: Sonuç Tablosu */}
      <div
        style={{
          background: 'rgba(2, 6, 23, 0.8)',
          border: '1px solid rgba(30, 41, 59, 1)',
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
        }}
      >
        <div
          style={{
            padding: '1rem 1.5rem',
            borderBottom: '1px solid rgba(30, 41, 59, 1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(2, 6, 23, 0.95)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#f8fafc', margin: 0 }}>
              Analiz Sonuçları
            </h2>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              Öğrenci bazlı doğru / yanlış / net ve puan dağılımlarını inceleyin.
            </span>
          </div>
          <span
            style={{
              fontSize: 11,
              padding: '4px 12px',
              borderRadius: 9999,
              border: '1px solid rgba(51, 65, 85, 1)',
              color: '#cbd5e1',
              background: 'rgba(15, 23, 42, 0.6)',
            }}
          >
            {results.length > 0
              ? `${results.length} öğrenci sonucu`
              : 'Henüz analiz yapılmadı'}
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ minWidth: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#020617' }}>
              <tr>
                {['Öğrenci Adı', 'Sınıf', 'Doğru', 'Yanlış', 'Boş', 'Puan', 'İşlemler'].map((h, i) => (
                  <th
                    key={h}
                    style={{
                      padding: '0.75rem 1rem',
                      textAlign: i === 0 || i === 1 ? 'left' : i === 6 ? 'right' : 'center',
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#cbd5e1',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      borderBottom: '1px solid rgba(30, 41, 59, 1)',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody style={{ background: 'rgba(2, 6, 23, 0.8)' }}>
              {results.map((result) => (
                <tr
                  key={result.id}
                  style={{
                    borderBottom: '1px solid rgba(30, 41, 59, 1)',
                  }}
                >
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', fontWeight: 500, color: '#f8fafc' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span>{result.studentName}</span>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>No: {result.studentNo}</span>
                    </div>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        background: 'rgba(15, 23, 42, 0.6)',
                        color: '#e2e8f0',
                        padding: '4px 8px',
                        borderRadius: 9999,
                        fontSize: 11,
                        border: '1px solid rgba(51, 65, 85, 1)',
                      }}
                    >
                      {result.className}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', textAlign: 'center', color: '#34d399' }}>
                    {result.correct}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', textAlign: 'center', color: '#fb7185' }}>
                    {result.incorrect}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', textAlign: 'center', color: '#cbd5e1' }}>
                    {result.blank}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', textAlign: 'center' }}>
                    <span style={{ fontWeight: 600, color: result.score >= 400 ? '#16a34a' : result.score >= 300 ? '#ca8a04' : '#dc2626' }}>
                      {result.score}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', textAlign: 'right' }}>
                    <button
                      type="button"
                      disabled={result.status !== 'idle'}
                      onClick={() => handleSendResult(result.id)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '4px 12px',
                        borderRadius: 9999,
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        color: '#fff',
                        border: 'none',
                        cursor: result.status !== 'idle' ? 'not-allowed' : 'pointer',
                        background:
                          result.status === 'idle'
                            ? 'linear-gradient(90deg, #10b981, #16a34a)'
                            : 'rgba(51, 65, 85, 0.8)',
                        boxShadow: result.status === 'idle' ? '0 4px 14px rgba(16, 185, 129, 0.35)' : 'none',
                      }}
                    >
                      {result.status === 'idle' && (
                        <>
                          <Send className="h-4 w-4" />
                          <span>Sonucu Gönder</span>
                        </>
                      )}
                      {result.status === 'sending' && <span>Gönderiliyor...</span>}
                      {result.status === 'sent' && <span>Gönderildi</span>}
                    </button>
                  </td>
                </tr>
              ))}
              {results.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      padding: '1.5rem 1rem',
                      textAlign: 'center',
                      fontSize: '0.875rem',
                      color: '#94a3b8',
                    }}
                  >
                    Henüz analiz sonucu yok. Önce üst kısımdan optik dosyaları
                    yükleyip analizi başlatın.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default OpticalScanningPage;

