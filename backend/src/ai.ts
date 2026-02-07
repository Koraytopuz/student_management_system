/**
 * Paylaşılan Gemini AI yardımcı fonksiyonları
 * Otomatik soru üretimi, değerlendirme, özetleme vb. için kullanılır
 */
import { GoogleGenAI } from '@google/genai';

const USER_CONFIGURED_MODEL = process.env.GEMINI_MODEL?.trim();
const FALLBACK_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-flash-latest',
  'gemini-1.5-flash-latest',
];

function getModelCandidates(): string[] {
  if (USER_CONFIGURED_MODEL) return [USER_CONFIGURED_MODEL];
  return FALLBACK_MODELS;
}

function extractResponseText(response: unknown): string | null {
  if (!response || typeof response !== 'object') return null;
  const maybeText = (response as { text?: string | (() => string) }).text;
  if (typeof maybeText === 'function') {
    try {
      const value = maybeText();
      if (typeof value === 'string' && value.trim()) return value.trim();
    } catch {
      // ignore
    }
  } else if (typeof maybeText === 'string' && maybeText.trim()) {
    return maybeText.trim();
  }
  const candidates = (response as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
    .candidates;
  if (Array.isArray(candidates) && candidates.length > 0) {
    const parts = candidates[0]?.content?.parts;
    if (Array.isArray(parts)) {
      const joined = parts
        .map((part) => (part?.text ?? '').trim())
        .filter(Boolean)
        .join('\n');
      if (joined.trim()) return joined.trim();
    }
  }
  return null;
}

export interface CallGeminiOptions {
  systemInstruction?: string;
  temperature?: number;
  maxOutputTokens?: number;
}

/**
 * Gemini API ile tek seferlik metin üretimi
 */
export async function callGemini(
  userPrompt: string,
  options: CallGeminiOptions = {},
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Yapay zeka servisi şu an kullanılamıyor. Lütfen yönetici ile iletişime geçin.');
  }

  const genAi = new GoogleGenAI({ apiKey });
  const models = getModelCandidates();
  const { systemInstruction, temperature = 0.5, maxOutputTokens = 2048 } = options;

  let lastError: unknown = null;
  for (const model of models) {
    try {
      const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
      if (systemInstruction) {
        contents.push({ role: 'user', parts: [{ text: systemInstruction }] });
      }
      contents.push({ role: 'user', parts: [{ text: userPrompt }] });

      const response = await genAi.models.generateContent({
        model,
        contents,
        generationConfig: {
          temperature,
          maxOutputTokens,
        },
      } as Parameters<typeof genAi.models.generateContent>[0]);

      const text = extractResponseText(response);
      if (text) return text;
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('unknown model')) {
        continue;
      }
      throw err;
    }
  }
  throw lastError ?? new Error('Yapay zeka yanıt veremedi');
}
