"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.callGemini = callGemini;
/**
 * Paylaşılan Gemini AI yardımcı fonksiyonları
 * Otomatik soru üretimi, değerlendirme, özetleme vb. için kullanılır
 */
const genai_1 = require("@google/genai");
const USER_CONFIGURED_MODEL = (_a = process.env.GEMINI_MODEL) === null || _a === void 0 ? void 0 : _a.trim();
const FALLBACK_MODELS = [
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-flash-latest',
    'gemini-1.5-flash-latest',
];
function getModelCandidates() {
    if (USER_CONFIGURED_MODEL)
        return [USER_CONFIGURED_MODEL];
    return FALLBACK_MODELS;
}
function extractResponseText(response) {
    var _a, _b;
    if (!response || typeof response !== 'object')
        return null;
    const maybeText = response.text;
    if (typeof maybeText === 'function') {
        try {
            const value = maybeText();
            if (typeof value === 'string' && value.trim())
                return value.trim();
        }
        catch {
            // ignore
        }
    }
    else if (typeof maybeText === 'string' && maybeText.trim()) {
        return maybeText.trim();
    }
    const candidates = response
        .candidates;
    if (Array.isArray(candidates) && candidates.length > 0) {
        const parts = (_b = (_a = candidates[0]) === null || _a === void 0 ? void 0 : _a.content) === null || _b === void 0 ? void 0 : _b.parts;
        if (Array.isArray(parts)) {
            const joined = parts
                .map((part) => { var _a; return ((_a = part === null || part === void 0 ? void 0 : part.text) !== null && _a !== void 0 ? _a : '').trim(); })
                .filter(Boolean)
                .join('\n');
            if (joined.trim())
                return joined.trim();
        }
    }
    return null;
}
/**
 * Gemini API ile tek seferlik metin üretimi
 */
async function callGemini(userPrompt, options = {}) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('Yapay zeka servisi şu an kullanılamıyor. Lütfen yönetici ile iletişime geçin.');
    }
    const genAi = new genai_1.GoogleGenAI({ apiKey });
    const models = getModelCandidates();
    const { systemInstruction, temperature = 0.5, maxOutputTokens = 2048 } = options;
    let lastError = null;
    for (const model of models) {
        try {
            const contents = [];
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
            });
            const text = extractResponseText(response);
            if (text)
                return text;
        }
        catch (err) {
            lastError = err;
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('unknown model')) {
                continue;
            }
            throw err;
        }
    }
    throw lastError !== null && lastError !== void 0 ? lastError : new Error('Yapay zeka yanıt veremedi');
}
//# sourceMappingURL=ai.js.map