/**
 * Icon Generator for AeroGuard
 * Generates PNG icons in all required sizes from SVG source
 * Run with: node generate-icons.js
 */

const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

const sizes = [16, 32, 48, 128];
const outputDir = path.join(__dirname);

// SVG source (same as icon.svg)
const svgContent = `<svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#3498db;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#2980b9;stop-opacity:1" />
    </linearGradient>
    <linearGradient id="shield" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#ffffff;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#ecf0f1;stop-opacity:1" />
    </linearGradient>
    <linearGradient id="cross" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#e74c3c;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#c0392b;stop-opacity:1" />
    </linearGradient>
  </defs>
  <!-- Background -->
  <rect width="128" height="128" rx="24" fill="url(#bg)"/>
  <!-- Shield -->
  <path d="M24 16 L104 16 L104 72 C104 94 94 110 64 112 C34 110 24 94 24 72 Z" fill="url(#shield)" stroke="#bdc3c7" stroke-width="1"/>
  <!-- Cross (X) -->
  <line x1="48" y1="40" x2="80" y2="72" stroke="url(#cross)" stroke-width="6" stroke-linecap="round"/>
  <line x1="80" y1="40" x2="48" y2="72" stroke="url(#cross)" stroke-width="6" stroke-linecap="round"/>
  <!-- Glossy highlight -->
  <path d="M28 20 L100 20 L100 50 C100 65 90 78 64 80 C38 78 28 65 28 50 Z" fill="rgba(255,255,255,0.15)"/>
</svg>`;

async function generateIcons() {
  console.log('🎨 AeroGuard - Icon Generator');
  console.log('=====================================\n');

  // Create canvas for each size
  for (const size of sizes) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    // Scale factor
    const scale = size / 128;

    // Draw background gradient
    const bgGradient = ctx.createLinearGradient(0, 0, size, size);
    bgGradient.addColorStop(0, '#3498db');
    bgGradient.addColorStop(1, '#2980b9');
    ctx.fillStyle = bgGradient;
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, size * 0.1875); // rx = 24 * scale
    ctx.fill();

    // Draw shield
    const shieldGradient = ctx.createLinearGradient(0, 0, size, size);
    shieldGradient.addColorStop(0, '#ffffff');
    shieldGradient.addColorStop(1, '#ecf0f1');

    ctx.fillStyle = shieldGradient;
    ctx.strokeStyle = '#bdc3c7';
    ctx.lineWidth = Math.max(1, scale);

    const shieldPath = new Path2D();
    const s = size;
    shieldPath.moveTo(24 * scale, 16 * scale);
    shieldPath.lineTo(104 * scale, 16 * scale);
    shieldPath.lineTo(104 * scale, 72 * scale);
    shieldPath.bezierCurveTo(
      104 * scale, 94 * scale,
      94 * scale, 110 * scale,
      64 * scale, 112 * scale
    );
    shieldPath.bezierCurveTo(
      34 * scale, 110 * scale,
      24 * scale, 94 * scale,
      24 * scale, 72 * scale
    );
    shieldPath.closePath();

    ctx.fill(shieldPath);
    ctx.stroke(shieldPath);

    // Draw cross (X)
    const crossGradient = ctx.createLinearGradient(0, 0, size, size);
    crossGradient.addColorStop(0, '#e74c3c');
    crossGradient.addColorStop(1, '#c0392b');

    ctx.strokeStyle = crossGradient;
    ctx.lineWidth = Math.max(1.5, 6 * scale);
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(48 * scale, 40 * scale);
    ctx.lineTo(80 * scale, 72 * scale);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(80 * scale, 40 * scale);
    ctx.lineTo(48 * scale, 72 * scale);
    ctx.stroke();

    // Draw glossy highlight
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    const highlightPath = new Path2D();
    highlightPath.moveTo(28 * scale, 20 * scale);
    highlightPath.lineTo(100 * scale, 20 * scale);
    highlightPath.lineTo(100 * scale, 50 * scale);
    highlightPath.bezierCurveTo(
      100 * scale, 65 * scale,
      90 * scale, 78 * scale,
      64 * scale, 80 * scale
    );
    highlightPath.bezierCurveTo(
      38 * scale, 78 * scale,
      28 * scale, 65 * scale,
      28 * scale, 50 * scale
    );
    highlightPath.closePath();
    ctx.fill(highlightPath);

    // Save as PNG
    const outputPath = path.join(outputDir, `icon-${size}.png`);
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(outputPath, buffer);

    console.log(`✅ Generated: icon-${size}.png (${size}x${size})`);
  }

  // Also generate a favicon.ico with multiple sizes
  await generateFavicon();

  console.log('\n🎉 All icons generated successfully!');
  console.log('\nFiles created:');
  sizes.forEach(size => {
    console.log(`  - icon-${size}.png`);
  });
  console.log('  - favicon.ico');
}

async function generateFavicon() {
  // Create a canvas with multiple sizes for ICO
  // We'll just use the 32x32 as favicon for simplicity
  const canvas = createCanvas(32, 32);
  const ctx = canvas.getContext('2d');
  const scale = 32 / 128;

  // Background
  const bgGradient = ctx.createLinearGradient(0, 0, 32, 32);
  bgGradient.addColorStop(0, '#3498db');
  bgGradient.addColorStop(1, '#2980b9');
  ctx.fillStyle = bgGradient;
  ctx.beginPath();
  ctx.roundRect(0, 0, 32, 32, 6);
  ctx.fill();

  // Shield
  const shieldGradient = ctx.createLinearGradient(0, 0, 32, 32);
  shieldGradient.addColorStop(0, '#ffffff');
  shieldGradient.addColorStop(1, '#ecf0f1');
  ctx.fillStyle = shieldGradient;
  ctx.strokeStyle = '#bdc3c7';
  ctx.lineWidth = 1;

  const shieldPath = new Path2D();
  shieldPath.moveTo(6, 4);
  shieldPath.lineTo(26, 4);
  shieldPath.lineTo(26, 18);
  shieldPath.bezierCurveTo(26, 23.5, 23.5, 27.5, 16, 28);
  shieldPath.bezierCurveTo(8.5, 27.5, 6, 23.5, 6, 18);
  shieldPath.closePath();
  ctx.fill(shieldPath);
  ctx.stroke(shieldPath);

  // Cross
  const crossGradient = ctx.createLinearGradient(0, 0, 32, 32);
  crossGradient.addColorStop(0, '#e74c3c');
  crossGradient.addColorStop(1, '#c0392b');
  ctx.strokeStyle = crossGradient;
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(12, 10);
  ctx.lineTo(20, 18);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(20, 10);
  ctx.lineTo(12, 18);
  ctx.stroke();

  // Save as PNG (can be renamed to .ico for basic use)
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(outputDir, 'favicon.ico'), buffer);
  console.log('✅ Generated: favicon.ico (32x32)');
}

// Run if executed directly
if (require.main === module) {
  generateIcons().catch(console.error);
}

module.exports = { generateIcons };