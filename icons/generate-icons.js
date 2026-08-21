// Icon generation script - run with: node generate-icons.js
// Requires: npm install canvas (optional, can use browser to generate)

const fs = require('fs');
const path = require('path');

// Simple SVG to PNG conversion using canvas
// Run this in browser console or with Node.js + canvas package

const sizes = [16, 32, 48, 128];

// If running in Node.js with canvas
try {
  const { createCanvas } = require('canvas');

  sizes.forEach(size => {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, size, size);

    // Shield shape
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(size/2, size*0.04);
    ctx.lineTo(size*0.125, size*0.21);
    ctx.lineTo(size*0.125, size*0.71);
    ctx.bezierCurveTo(size*0.125, size*0.94, size*0.5, size*0.98, size/2, size*0.96);
    ctx.bezierCurveTo(size*0.875, size*0.98, size*0.875, size*0.94, size*0.875, size*0.71);
    ctx.lineTo(size*0.875, size*0.21);
    ctx.closePath();
    ctx.fill();

    // Inner accent
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.moveTo(size/2, size*0.12);
    ctx.lineTo(size*0.3, size*0.3);
    ctx.lineTo(size*0.3, size*0.62);
    ctx.bezierCurveTo(size*0.3, size*0.8, size/2, size*0.85, size/2, size*0.83);
    ctx.bezierCurveTo(size*0.7, size*0.85, size*0.7, size*0.8, size*0.7, size*0.62);
    ctx.lineTo(size*0.7, size*0.3);
    ctx.closePath();
    ctx.fill();

    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(path.join(__dirname, `icon-${size}.png`), buffer);
    console.log(`Generated icon-${size}.png`);
  });

  console.log('All icons generated successfully!');
} catch (e) {
  console.log('Canvas not available, please run in browser or install canvas: npm install canvas');
  console.log('Alternative: Open generate-icons.html in browser to generate icons');
}