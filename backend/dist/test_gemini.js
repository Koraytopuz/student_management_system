"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const genai_1 = require("@google/genai");
dotenv_1.default.config();
async function testGemini() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('❌ GEMINI_API_KEY not found in environment');
        process.exit(1);
    }
    console.log('✅ Found API Key');
    const client = new genai_1.GoogleGenAI({ apiKey });
    const modelName = 'gemini-3.0-flash-preview';
    console.log(`Testing model: ${modelName}...`);
    try {
        // @ts-ignore - The project uses (genAi as any) so we mimic that structure or try standard usage
        // Accessing models.generateContent as per the project's pattern
        const response = await client.models.generateContent({
            model: modelName,
            contents: [
                {
                    role: 'user',
                    parts: [{ text: 'Hello, are you working?' }]
                }
            ],
        });
        console.log('✅ Response received successfully!');
        console.log('Response:', JSON.stringify(response, null, 2));
    }
    catch (error) {
        console.error('❌ Error testing Gemini API:');
        if (error.status)
            console.error('Status:', error.status);
        if (error.message)
            console.error('Message:', error.message);
        else
            console.error(error);
    }
}
testGemini();
//# sourceMappingURL=test_gemini.js.map