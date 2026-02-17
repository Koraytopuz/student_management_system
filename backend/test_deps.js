try {
    console.log('Testing pdfExtractor.service.ts import...');
    // We need to register ts-node to require .ts files, or just check dependencies manually.
    // Since we are running node, we can't require .ts directly without register.
    // But we can check if the dependencies it needs are present.

    const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
    console.log('pdfjs-dist legacy build loaded successfully');

    const canvas = require('canvas');
    console.log('canvas loaded successfully');

    // Check if we can create a canvas factory like in the service
    const { createCanvas } = canvas;
    const c = createCanvas(100, 100);
    const ctx = c.getContext('2d');
    console.log('Canvas context created successfully');

} catch (e) {
    console.error('Service dependency check failed:', e);
}
