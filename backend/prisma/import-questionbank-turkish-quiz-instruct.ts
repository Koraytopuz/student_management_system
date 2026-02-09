import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import https from 'https';
import { URL } from 'url';

/**
 * HuggingFace: Kamyar-zeinalipour/Turkish-Quiz-Instruct
 *
 * Bu script, ilgili dataset'ten soruları çekip QuestionBank tablosuna import eder.
 *
 * ÖNEMLİ NOTLAR
 *  - Aynı script'i birden fazla kez çalıştırırsanız, sorular tekrar eklenir (şu an için
 *    duplicate engelleme yok). Gerçek import öncesi test veritabanında denemeniz önerilir.
 *  - Dataset sütunları:
 *      - content            : Metin / pasaj
 *      - multiple_questions : \"Question 1: ... Choices: ... Right Answer: ...\" formatında 1..N soru
 *      - short_questions    : Kısa soru-cevap versiyonu (şimdilik kullanılmıyor)
 *      - subject            : Ders adı (örn. \"Kimya\", \"Tarih\")
 *      - subsubtopic        : Alt konu başlığı
 *
 * Çalıştırma örneği:
 *   npx tsx prisma/import-questionbank-turkish-quiz-instruct.ts
 *
 * Ortam değişkenleri (isteğe bağlı):
 *   HF_DATASET_NAME   : Varsayılan 'Kamyar-zeinalipour/Turkish-Quiz-Instruct'
 *   HF_DATASET_CONFIG : Varsayılan 'default'
 *   HF_DATASET_SPLIT  : Varsayılan 'train'
 *   IMPORT_GRADE_LEVEL: Varsayılan '9'
 */

const DATASET_NAME = process.env.HF_DATASET_NAME ?? 'Kamyar-zeinalipour/Turkish-Quiz-Instruct';
const DATASET_CONFIG = process.env.HF_DATASET_CONFIG ?? 'default';
const DATASET_SPLIT = process.env.HF_DATASET_SPLIT ?? 'train';
const DEFAULT_GRADE_LEVEL = process.env.IMPORT_GRADE_LEVEL ?? '9';
const PAGE_SIZE = 100;

const HF_BASE_URL = 'https://datasets-server.huggingface.co';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
// questionBank modeli IDE cache'lerinde görünmeyebildiği için türü gevşek tutuyoruz
const prisma = new PrismaClient({ adapter }) as any;

interface TurkishQuizRow {
  content: string;
  multiple_questions: string;
  short_questions: string;
  subject: string;
  subsubtopic: string;
}

interface HuggingFaceRowsResponse {
  rows: Array<{
    row_idx: number;
    row: TurkishQuizRow;
  }>;
  num_rows_total: number;
  num_rows_per_page: number;
  partial: boolean;
}

interface ParsedQuestion {
  text: string;
  choices: string[];
  correctAnswer: string; // 'A' | 'B' | ...
}

function buildRowsUrl(offset: number, length: number): string {
  const url = new URL(HF_BASE_URL + '/rows');
  url.searchParams.set('dataset', DATASET_NAME);
  url.searchParams.set('config', DATASET_CONFIG);
  url.searchParams.set('split', DATASET_SPLIT);
  url.searchParams.set('offset', String(offset));
  url.searchParams.set('length', String(length));
  return url.toString();
}

function fetchJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`Request failed with status ${res.statusCode} for ${url}`));
          return;
        }

        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on('end', () => {
          try {
            const body = Buffer.concat(chunks).toString('utf8');
            const json = JSON.parse(body) as T;
            resolve(json);
          } catch (err) {
            reject(err);
          }
        });
      })
      .on('error', (err) => reject(err));
  });
}

/**
 * \"Question 1: ... Choices: A. xxx, B. yyy, C. zzz\\nRight Answer: ...\" formatından
 * çoktan seçmeli soruları parse eder.
 */
function parseMultipleQuestionsBlock(block: string): ParsedQuestion[] {
  const results: ParsedQuestion[] = [];

  const regex =
    /Question\s+\d+:\s*([\s\S]*?)\nChoices:\s*([\s\S]*?)\nRight Answer:\s*([^\n]+)\s*/g;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(block)) !== null) {
    const questionTextRaw = match[1] ?? '';
    const choicesRaw = match[2] ?? '';
    const rightAnswerRaw = match[3] ?? '';

    const questionText = questionTextRaw.trim().replace(/\s+/g, ' ');
    const rightAnswerText = rightAnswerRaw.trim();

    if (!questionText) continue;

    // Choices: 'A. foo, B. bar, C. baz' benzeri
    const rawChoices = choicesRaw
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);

    const cleanChoices = rawChoices
      .map((c) => c.replace(/^[A-Z]\s*[).]\s*/i, '').trim())
      .filter(Boolean);

    if (cleanChoices.length === 0) {
      // En azından soru metnini kaydedelim
      results.push({
        text: questionText,
        choices: [],
        correctAnswer: rightAnswerText || 'A',
      });
      continue;
    }

    // Doğru cevabın index'ini bulmaya çalış
    let correctIndex = cleanChoices.findIndex(
      (choice) =>
        choice === rightAnswerText ||
        choice.includes(rightAnswerText) ||
        rightAnswerText.includes(choice),
    );

    if (correctIndex < 0) {
      // Fall-back: Eğer cevap içinde \"A.\", \"B.\" vb. geçiyorsa ona göre ata
      const letterMatch = rightAnswerText.match(/[A-E]/i);
      if (letterMatch) {
        const letter = letterMatch[0].toUpperCase();
        const idxFromLetter = letter.charCodeAt(0) - 65;
        if (idxFromLetter >= 0 && idxFromLetter < cleanChoices.length) {
          correctIndex = idxFromLetter;
        }
      }
    }

    if (correctIndex < 0) {
      // Hâlâ bulunamadıysa, ilk şıkkı doğru kabul et
      correctIndex = 0;
    }

    const correctLetter = String.fromCharCode(65 + correctIndex);

    results.push({
      text: questionText,
      choices: cleanChoices,
      correctAnswer: correctLetter,
    });
  }

  return results;
}

async function importDataset() {
  console.log('QuestionBank import başlıyor...');
  console.log(
    `Dataset: ${DATASET_NAME} (config=${DATASET_CONFIG}, split=${DATASET_SPLIT}), gradeLevel=${DEFAULT_GRADE_LEVEL}`,
  );

  let offset = 0;
  let importedQuestions = 0;

  // İlk istekle toplam satır sayısını öğren
  const firstPageUrl = buildRowsUrl(offset, PAGE_SIZE);
  const firstPage = await fetchJson<HuggingFaceRowsResponse>(firstPageUrl);

  const totalRows = firstPage.num_rows_total;
  console.log(`Toplam satır sayısı: ${totalRows}`);

  async function processPage(page: HuggingFaceRowsResponse) {
    for (const rowWrapper of page.rows) {
      const row = rowWrapper.row;
      const subjectName = (row.subject || '').trim();
      const subsubtopic = (row.subsubtopic || '').trim();

      if (!subjectName) {
        console.warn(
          `Satır ${rowWrapper.row_idx}: subject alanı boş, soru atlandı.`,
        );
        continue;
      }

      const subject = await prisma.subject.findFirst({
        where: {
          name: {
            equals: subjectName,
            mode: 'insensitive',
          },
        },
      });

      if (!subject) {
        console.warn(
          `Satır ${rowWrapper.row_idx}: Subject '${subjectName}' bulunamadı, soru(lar) atlandı.`,
        );
        continue;
      }

      const parsedQuestions = parseMultipleQuestionsBlock(
        row.multiple_questions || '',
      );

      if (parsedQuestions.length === 0) {
        console.warn(
          `Satır ${rowWrapper.row_idx}: multiple_questions parse edilemedi, satır atlandı.`,
        );
        continue;
      }

      for (const pq of parsedQuestions) {
        try {
          await prisma.questionBank.create({
            data: {
              subjectId: subject.id,
              gradeLevel: DEFAULT_GRADE_LEVEL,
              topic: subsubtopic || 'Genel',
              subtopic: null,
              kazanimKodu: null,
              text: pq.text,
              type: 'multiple_choice',
              choices: pq.choices.length ? pq.choices : null,
              correctAnswer: pq.correctAnswer,
              distractorReasons: null,
              solutionExplanation: null,
              difficulty: 'medium',
              bloomLevel: null,
              estimatedMinutes: null,
              source: 'import',
              createdByTeacherId: null,
              isApproved: false,
              approvedByTeacherId: null,
              qualityScore: null,
              usageCount: 0,
              tags: [subjectName, subsubtopic].filter(Boolean),
            },
          });
          importedQuestions += 1;
        } catch (error) {
          // Tek tek soruların hatası import'u durdurmasın
          console.error(
            `Satır ${rowWrapper.row_idx} için soru import edilirken hata:`,
            (error as Error).message,
          );
        }
      }
    }
  }

  // İlk sayfayı işle
  await processPage(firstPage);
  offset += PAGE_SIZE;

  // Kalan sayfalar
  while (offset < totalRows) {
    const url = buildRowsUrl(offset, PAGE_SIZE);
    console.log(`Sayfa import ediliyor: offset=${offset}`);
    // eslint-disable-next-line no-await-in-loop
    const page = await fetchJson<HuggingFaceRowsResponse>(url);
    // eslint-disable-next-line no-await-in-loop
    await processPage(page);
    offset += PAGE_SIZE;
  }

  console.log(`Import tamamlandı. Eklenen soru sayısı: ${importedQuestions}`);
}

async function main() {
  try {
    await importDataset();
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Import sırasında hata:', err);
  process.exit(1);
});

