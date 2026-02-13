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

  const scoreClass = (score: number): string => {
    if (score >= 400) return 'text-green-600 font-semibold';
    if (score >= 300) return 'text-yellow-600 font-semibold';
    return 'text-red-600 font-semibold';
  };

  return (
    <div className="space-y-6">
      {/* Bölüm A: Dosya Yükleme ve Analiz */}
      <div className="bg-white shadow-md rounded-lg p-6">
        <h1 className="text-xl font-semibold text-gray-900 mb-2">
          Optik Form Yükleme ve Analiz
        </h1>
        <p className="text-sm text-gray-600 mb-6">
          Cevap anahtarını ve öğrenci optik dosyalarını yükleyerek toplu sınav analizini
          başlatın.
        </p>
        {error && (
          <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Cevap Anahtarı */}
          <div
            className={`border-2 border-dashed rounded-lg p-4 flex flex-col items-center justify-center cursor-pointer transition ${
              isAnswerKeyDragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:bg-gray-50'
            }`}
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
            <div className="flex flex-col items-center gap-2 text-center">
              <Upload className="h-8 w-8 text-gray-400" />
              <p className="text-sm font-medium text-gray-800">
                Cevap Anahtarı (.txt, .dat)
              </p>
              <p className="text-xs text-gray-500">
                Dosyayı buraya bırakın veya tıklayın
              </p>
              {answerKeyFile && (
                <p className="mt-1 text-xs text-gray-600 flex items-center gap-1">
                  <FileText className="h-4 w-4" />
                  <span className="truncate max-w-[200px]">
                    {answerKeyFile.name}
                  </span>
                </p>
              )}
            </div>
          </div>

          {/* Öğrenci Optikleri */}
          <div
            className={`border-2 border-dashed rounded-lg p-4 flex flex-col items-center justify-center cursor-pointer transition ${
              isStudentOpticsDragging
                ? 'border-blue-400 bg-blue-50'
                : 'border-gray-300 hover:bg-gray-50'
            }`}
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
            <div className="flex flex-col items-center gap-2 text-center">
              <Upload className="h-8 w-8 text-gray-400" />
              <p className="text-sm font-medium text-gray-800">
                Öğrenci Optikleri (.dat, .txt)
              </p>
              <p className="text-xs text-gray-500">
                Dosyayı buraya bırakın veya tıklayın
              </p>
              {studentOpticsFile && (
                <p className="mt-1 text-xs text-gray-600 flex items-center gap-1">
                  <FileText className="h-4 w-4" />
                  <span className="truncate max-w-[200px]">
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
          className="w-full bg-blue-600 text-white font-semibold py-3 rounded-lg hover:bg-blue-700 transition flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Yükleniyor...</span>
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
      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Analiz Sonuçları</h2>
          <span className="text-xs text-gray-500">
            {results.length > 0
              ? `${results.length} öğrenci sonucu`
              : 'Henüz analiz yapılmadı'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Öğrenci Adı
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Sınıf
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Doğru
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Yanlış
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Boş
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Puan
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  İşlemler
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {results.map((result) => (
                <tr
                  key={result.id}
                  className="hover:bg-gray-50 transition border-b border-gray-200"
                >
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    <div className="flex flex-col">
                      <span>{result.studentName}</span>
                      <span className="text-xs text-gray-500">
                        No: {result.studentNo}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className="inline-flex items-center bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs">
                      {result.className}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-center text-green-700">
                    {result.correct}
                  </td>
                  <td className="px-4 py-3 text-sm text-center text-red-700">
                    {result.incorrect}
                  </td>
                  <td className="px-4 py-3 text-sm text-center text-gray-700">
                    {result.blank}
                  </td>
                  <td className="px-4 py-3 text-sm text-center">
                    <span className={scoreClass(result.score)}>
                      {result.score}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    <button
                      type="button"
                      disabled={result.status !== 'idle'}
                      onClick={() => handleSendResult(result.id)}
                      className={`inline-flex items-center gap-1 px-3 py-1 rounded text-sm text-white transition ${
                        result.status === 'idle'
                          ? 'bg-green-500 hover:bg-green-600'
                          : 'bg-gray-400 cursor-not-allowed'
                      }`}
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
                    className="px-4 py-6 text-center text-sm text-gray-500"
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

