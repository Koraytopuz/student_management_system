
import fs from 'fs';
import https from 'https';
import path from 'path';

const fontUrl = 'https://cdnjs.cloudflare.com/ajax/libs/roboto-fontface/0.10.0/fonts/roboto/Roboto-Regular.ttf';
const destPath = path.join(__dirname, 'assets', 'fonts', 'Roboto-Regular.ttf');

console.log(`Downloading font from ${fontUrl} to ${destPath}...`);

const file = fs.createWriteStream(destPath);

https.get(fontUrl, (response) => {
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
    fs.unlink(destPath, () => { });
    console.error(`Error downloading font: ${err.message}`);
});
