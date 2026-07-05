const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const ASSETS = path.join(__dirname, '..', 'assets');
const PUB = path.join(__dirname, '..', 'public');

const SVG = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Background Gradient: Deep Space Obsidian -->
    <linearGradient id="bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0c1220"/>
      <stop offset="50%" style="stop-color:#060a12"/>
      <stop offset="100%" style="stop-color:#020408"/>
    </linearGradient>

    <!-- Glossy Border Gradient -->
    <linearGradient id="border-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#22d3ee; stop-opacity:0.8"/>
      <stop offset="30%" style="stop-color:#a855f7; stop-opacity:0.3"/>
      <stop offset="70%" style="stop-color:#ec4899; stop-opacity:0.1"/>
      <stop offset="100%" style="stop-color:#22d3ee; stop-opacity:0.5"/>
    </linearGradient>

    <!-- Wave Gradients -->
    <linearGradient id="wave-cyan" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#06b6d4; stop-opacity:0.8"/>
      <stop offset="50%" style="stop-color:#22d3ee; stop-opacity:1"/>
      <stop offset="100%" style="stop-color:#0891b2; stop-opacity:0.8"/>
    </linearGradient>

    <linearGradient id="wave-purple" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#7c3aed; stop-opacity:0.7"/>
      <stop offset="50%" style="stop-color:#a855f7; stop-opacity:1"/>
      <stop offset="100%" style="stop-color:#c084fc; stop-opacity:0.7"/>
    </linearGradient>

    <linearGradient id="wave-pink" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#db2777; stop-opacity:0.6"/>
      <stop offset="50%" style="stop-color:#ec4899; stop-opacity:0.9"/>
      <stop offset="100%" style="stop-color:#f472b6; stop-opacity:0.6"/>
    </linearGradient>

    <!-- Glow Filter -->
    <filter id="glow-filter" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    
    <!-- Background Glow for Logo -->
    <radialGradient id="center-glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" style="stop-color:#22d3ee; stop-opacity:0.15"/>
      <stop offset="100%" style="stop-color:#a855f7; stop-opacity:0"/>
    </radialGradient>
  </defs>

  <!-- App Icon Base -->
  <rect x="4" y="4" width="504" height="504" rx="120" fill="url(#bg-grad)"/>
  
  <!-- Sleek Glowing Inner Border -->
  <rect x="5" y="5" width="502" height="502" rx="119" fill="none" stroke="url(#border-grad)" stroke-width="3"/>

  <!-- Ambient Center Glow -->
  <circle cx="256" cy="256" r="180" fill="url(#center-glow)" />

  <!-- A dynamic central soundwave structure forming a W shape -->
  <g filter="url(#glow-filter)">
    <!-- Bar -4: Height = 80 -->
    <rect x="112" y="216" width="16" height="80" rx="8" fill="url(#wave-cyan)" />
    
    <!-- Bar -3: Height = 170 -->
    <rect x="146" y="171" width="16" height="170" rx="8" fill="url(#wave-purple)" />
    
    <!-- Bar -2: Height = 110 -->
    <rect x="180" y="201" width="16" height="110" rx="8" fill="url(#wave-pink)" />
    
    <!-- Bar -1: Height = 60 -->
    <rect x="214" y="226" width="16" height="60" rx="8" fill="url(#wave-cyan)" opacity="0.9" />
    
    <!-- Bar 0 (Center Peak): Height = 260 -->
    <rect x="248" y="126" width="16" height="260" rx="8" fill="url(#wave-cyan)" />
    
    <!-- Bar 1: Height = 60 -->
    <rect x="282" y="226" width="16" height="60" rx="8" fill="url(#wave-cyan)" opacity="0.9" />
    
    <!-- Bar 2: Height = 110 -->
    <rect x="316" y="201" width="16" height="110" rx="8" fill="url(#wave-pink)" />
    
    <!-- Bar 3: Height = 170 -->
    <rect x="350" y="171" width="16" height="170" rx="8" fill="url(#wave-purple)" />
    
    <!-- Bar 4: Height = 80 -->
    <rect x="384" y="216" width="16" height="80" rx="8" fill="url(#wave-cyan)" />
  </g>

  <!-- Concentric Rings -->
  <circle cx="256" cy="256" r="210" fill="none" stroke="#22d3ee" stroke-width="1.5" stroke-dasharray="12 24" opacity="0.25" />
  <circle cx="256" cy="256" r="225" fill="none" stroke="#a855f7" stroke-width="1" stroke-dasharray="6 12" opacity="0.15" />
</svg>`;

async function generate() {
  if (!fs.existsSync(ASSETS)) fs.mkdirSync(ASSETS, { recursive: true });

  console.log('Generating icons...');

  await sharp(Buffer.from(SVG)).resize(256, 256).png().toFile(path.join(ASSETS, 'icon.png'));
  console.log('✓ icon.png (256x256)');

  await sharp(Buffer.from(SVG)).resize(16, 16).png().toFile(path.join(ASSETS, 'tray.png'));
  console.log('✓ tray.png (16x16)');

  await sharp(Buffer.from(SVG)).resize(512, 512).png().toFile(path.join(PUB, 'icon.png'));
  console.log('✓ icon.png (512x512)');

  await sharp(Buffer.from(SVG)).resize(192, 192).png().toFile(path.join(PUB, 'icon-192.png'));
  console.log('✓ icon-192.png (192x192)');

  await sharp(Buffer.from(SVG)).resize(512, 512).png().toFile(path.join(PUB, 'icon-512.png'));
  console.log('✓ icon-512.png (512x512)');

  await sharp(Buffer.from(SVG)).resize(512, 512).png().toFile(path.join(PUB, 'icon-maskable.png'));
  console.log('✓ icon-maskable.png (512x512)');

  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const bufs = [];
  for (const s of sizes) {
    bufs.push({ size: s, buf: await sharp(Buffer.from(SVG)).resize(s, s).png().toBuffer() });
  }

  const numImages = bufs.length;
  const header = Buffer.alloc(6 + numImages * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(numImages, 4);

  let dataOffset = 6 + numImages * 16;
  for (let i = 0; i < numImages; i++) {
    const off = 6 + i * 16;
    header.writeUInt8(bufs[i].size === 256 ? 0 : bufs[i].size, off);
    header.writeUInt8(bufs[i].size === 256 ? 0 : bufs[i].size, off + 1);
    header.writeUInt8(0, off + 2);
    header.writeUInt8(0, off + 3);
    header.writeUInt16LE(1, off + 4);
    header.writeUInt16LE(32, off + 6);
    header.writeUInt32LE(bufs[i].buf.length, off + 8);
    header.writeUInt32LE(dataOffset, off + 12);
    dataOffset += bufs[i].buf.length;
  }

  fs.writeFileSync(path.join(ASSETS, 'icon.ico'), Buffer.concat([header, ...bufs.map(b => b.buf)]));
  console.log('✓ icon.ico (7 sizes)');

  console.log('\nAll icons generated!');
}

generate().catch(e => { console.error(e); process.exit(1); });
