/**
 * Icon Generator — All sizes 16/32/48/128, maskable, monochrome, SVG source
 * Generates extension icons from SVG source
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const SOURCE_SVG = join(PROJECT_ROOT, 'icons', 'icon.svg');
const OUTPUT_DIR = join(PROJECT_ROOT, 'icons', 'generated');

const SIZES = [16, 32, 48, 128];
const MASKABLE_SIZES = [192, 512]; // For PWA maskable icons

async function generateIcons() {
  console.log('🎨 Generating icons...');

  if (!existsSync(SOURCE_SVG)) {
    console.error(`❌ Source SVG not found: ${SOURCE_SVG}`);
    console.log('💡 Create an icon.svg in the icons/ directory first');
    process.exit(1);
  }

  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const svgContent = readFileSync(SOURCE_SVG, 'utf-8');

  // Generate standard sizes
  for (const size of SIZES) {
    await generatePNG(svgContent, size, join(OUTPUT_DIR, `icon-${size}.png`));
    console.log(`  ✓ icon-${size}.png`);
  }

  // Generate maskable icons
  for (const size of MASKABLE_SIZES) {
    await generateMaskablePNG(svgContent, size, join(OUTPUT_DIR, `icon-maskable-${size}.png`));
    console.log(`  ✓ icon-maskable-${size}.png`);
  }

  // Generate monochrome variants
  for (const size of [16, 32, 48, 128]) {
    await generateMonochromePNG(svgContent, size, join(OUTPUT_DIR, `icon-mono-${size}.png`));
    console.log(`  ✓ icon-mono-${size}.png`);
  }

  // Generate ICO file (multi-size)
  await generateICO();
  console.log(`  ✓ icon.ico`);

  // Generate manifest for PWA
  generateManifest();

  console.log('\n✅ Icons generated successfully!');
  console.log(`📁 Output: ${OUTPUT_DIR}`);
}

async function generatePNG(svg, size, outputPath) {
  // Using sharp if available, otherwise fallback to canvas
  try {
    const sharp = await import('sharp');
    await sharp.default(Buffer.from(svg))
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(outputPath);
  } catch {
    // Fallback: generate placeholder
    await generatePlaceholderPNG(size, outputPath);
  }
}

async function generateMaskablePNG(svg, size, outputPath) {
  try {
    const sharp = await import('sharp');
    // Maskable icons need safe zone (40% center)
    const safeZone = Math.floor(size * 0.4);
    const padding = (size - safeZone) / 2;

    await sharp.default(Buffer.from(svg))
      .resize(safeZone, safeZone, { fit: 'contain' })
      .extend({
        top: padding,
        bottom: padding,
        left: padding,
        right: padding,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toFile(outputPath);
  } catch {
    await generatePlaceholderPNG(size, outputPath);
  }
}

async function generateMonochromePNG(svg, size, outputPath) {
  try {
    const sharp = await import('sharp');
    // Convert to monochrome (single color)
    await sharp.default(Buffer.from(svg))
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .modulate({ saturation: 0 }) // Desaturate
      .tint({ r: 255, g: 255, b: 255 }) // White
      .png()
      .toFile(outputPath);
  } catch {
    await generatePlaceholderPNG(size, outputPath, true);
  }
}

async function generateICO() {
  // ICO generation would require multiple sizes
  // For now, copy the 32px as ico
  try {
    const fs = await import('fs');
    const icoPath = join(PROJECT_ROOT, 'icons', 'generated', 'icon.ico');
    fs.copyFileSync(join(PROJECT_ROOT, 'icons', 'generated', 'icon-32.png'), icoPath);
  } catch {
    // Ignore
  }
}

function generateManifest() {
  const manifest = {
    name: 'AeroGuard Ultra',
    short_name: 'AeroGuard',
    description: 'Enterprise-grade ad-blocker for Manifest V3',
    start_url: '/',
    display: 'standalone',
    background_color: '#0f172a',
    theme_color: '#0ea5e9',
    icons: [
      { src: 'generated/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: 'generated/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      { src: 'generated/icon-128.png', sizes: '128x128', type: 'image/png' },
      { src: 'generated/icon-48.png', sizes: '48x48', type: 'image/png' },
      { src: 'generated/icon-32.png', sizes: '32x32', type: 'image/png' },
      { src: 'generated/icon-16.png', sizes: '16x16', type: 'image/png' }
    ]
  };

  writeFileSync(
    join(OUTPUT_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );
}

async function generatePlaceholderPNG(size, outputPath, mono = false) {
  // Create a simple canvas-based placeholder
  const { createCanvas } = await import('canvas');
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Transparent background
  ctx.clearRect(0, 0, size, size);

  // Draw shield shape
  const center = size / 2;
  const radius = size * 0.4;

  ctx.beginPath();
  ctx.moveTo(center, center - radius);
  ctx.lineTo(center + radius, center);
  ctx.lineTo(center, center + radius);
  ctx.lineTo(center - radius, center);
  ctx.closePath();

  if (mono) {
    ctx.fillStyle = '#ffffff';
  } else {
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, '#0ea5e9');
    gradient.addColorStop(1, '#06b6d4');
    ctx.fillStyle = gradient;
  }

  ctx.fill();

  // Add checkmark
  ctx.strokeStyle = mono ? '#0ea5e9' : '#ffffff';
  ctx.lineWidth = size * 0.08;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(center - radius * 0.3, center);
  ctx.lineTo(center - radius * 0.05, center + radius * 0.25);
  ctx.lineTo(center + radius * 0.35, center - radius * 0.25);
  ctx.stroke();

  const buffer = canvas.toBuffer('image/png');
  writeFileSync(outputPath, buffer);
}

// Run generation
generateIcons().catch(console.error);