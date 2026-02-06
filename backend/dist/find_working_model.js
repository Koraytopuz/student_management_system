"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const genai_1 = require("@google/genai");
dotenv_1.default.config();
const modelsToTest = [
    'gemini-2.0-flash',
    'gemini-2.0-flash-001',
    'gemini-2.5-flash',
    'gemini-flash-latest',
    'gemini-1.5-flash-latest' // Backup
];
async function testModels() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('❌ GEMINI_API_KEY not found');
        return;
    }
    const client = new genai_1.GoogleGenAI({ apiKey });
    console.log('🧪 Testing models...');
    for (const model of modelsToTest) {
        process.stdout.write(`Testing ${model}... `);
        try {
            const response = await client.models.generateContent({
                model: model,
                contents: [
                    { role: 'user', parts: [{ text: 'Hi' }] }
                ],
            });
            console.log('✅ SUCCESS');
            console.log(`🎉 working model found: ${model}`);
            // return; // Don't return, let's see which others work too
        }
        catch (e) {
            console.log('❌ FAILED');
            // console.error(e.message);
        }
    }
}
testModels();
//# sourceMappingURL=find_working_model.js.map