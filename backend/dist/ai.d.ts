export interface CallGeminiOptions {
    systemInstruction?: string;
    temperature?: number;
    maxOutputTokens?: number;
    responseMimeType?: string;
}
/**
 * Gemini API ile tek seferlik metin üretimi
 */
export declare function callGemini(userPrompt: string, options?: CallGeminiOptions): Promise<string>;
//# sourceMappingURL=ai.d.ts.map