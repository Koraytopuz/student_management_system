
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

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

    const client = new GoogleGenAI({ apiKey });

    console.log('🧪 Testing models...');

    for (const model of modelsToTest) {
        process.stdout.write(`Testing ${model}... `);
        try {
            const response = await (client as any).models.generateContent({
                model: model,
                contents: [
                    { role: 'user', parts: [{ text: 'Hi' }] }
                ],
            });
            console.log('✅ SUCCESS');
            console.log(`🎉 working model found: ${model}`);
            // return; // Don't return, let's see which others work too
        } catch (e: any) {
            console.log('❌ FAILED');
            // console.error(e.message);
        }
    }
}

testModels();
