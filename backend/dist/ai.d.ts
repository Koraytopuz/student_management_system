export interface CallGeminiOptions {
    systemInstruction?: string;
    temperature?: number;
    maxOutputTokens?: number;
}
/**
 * Gemini API ile tek seferlik metin üretimi
 */
export declare function callGemini(userPrompt: string, options?: CallGeminiOptions): Promise<string>;
//# sourceMappingURL=ai.d.ts.map