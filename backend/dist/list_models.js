"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const https_1 = __importDefault(require("https"));
dotenv_1.default.config();
function listModels() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('❌ GEMINI_API_KEY not found');
        return;
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    console.log('Fetching available models via REST API...');
    https_1.default.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => {
            data += chunk;
        });
        res.on('end', () => {
            try {
                const json = JSON.parse(data);
                if (json.error) {
                    console.error('❌ API Error:', json.error);
                }
                else if (json.models) {
                    console.log('✅ Models fetched successfully. Writing to models.txt');
                    const fs = require('fs');
                    const lines = json.models.map((m) => m.name).join('\n');
                    fs.writeFileSync('src/models.txt', lines);
                }
                else {
                    console.log('Unknown response:', json);
                }
            }
            catch (e) {
                console.error('Error parsing JSON:', e);
                console.log('Raw data:', data);
            }
        });
    }).on('error', (e) => {
        console.error('Request error:', e);
    });
}
listModels();
//# sourceMappingURL=list_models.js.map