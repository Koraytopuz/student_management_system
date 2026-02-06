"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const https_1 = __importDefault(require("https"));
const path_1 = __importDefault(require("path"));
const fontUrl = 'https://cdnjs.cloudflare.com/ajax/libs/roboto-fontface/0.10.0/fonts/roboto/Roboto-Regular.ttf';
const destPath = path_1.default.join(__dirname, 'assets', 'fonts', 'Roboto-Regular.ttf');
console.log(`Downloading font from ${fontUrl} to ${destPath}...`);
const file = fs_1.default.createWriteStream(destPath);
https_1.default.get(fontUrl, (response) => {
    if (response.statusCode !== 200) {
        console.error(`Failed to download font: status code ${response.statusCode}`);
        return;
    }
    response.pipe(file);
    file.on('finish', () => {
        file.close();
        console.log('✅ Font downloaded successfully!');
    });
}).on('error', (err) => {
    fs_1.default.unlink(destPath, () => { });
    console.error(`Error downloading font: ${err.message}`);
});
//# sourceMappingURL=download_font.js.map