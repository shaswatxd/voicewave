const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const ASSETS = path.join(__dirname, '..', 'assets');
const PUB = path.join(__dirname, '..', 'public');

const SVG = `<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Background Gradient: Deep Space Midnight Purple to Dark Blue -->
    <linearGradient id="bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#040209" />
      <stop offset="50%" stop-color="#0B071E" />
      <stop offset="100%" stop-color="#020105" />
    </linearGradient>
    
    <!-- Neon Pink to Purple Gradient -->
    <linearGradient id="neon-pink" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#FF2E93" />
      <stop offset="100%" stop-color="#A100FF" />
    </linearGradient>
    
    <!-- Neon Cyan to Blue Gradient -->
    <linearGradient id="neon-cyan" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#00F0FF" />
      <stop offset="100%" stop-color="#0066FF" />
    </linearGradient>

    <!-- Accent Coral/Gold Gradient -->
    <linearGradient id="accent-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FF5E00" />
      <stop offset="100%" stop-color="#FF9E00" />
    </linearGradient>

    <!-- Glowing Border Gradient -->
    <linearGradient id="border-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#00F0FF" stop-opacity="0.8" />
      <stop offset="35%" stop-color="#FF2E93" stop-opacity="0.2" />
      <stop offset="70%" stop-color="#A100FF" stop-opacity="0.1" />
      <stop offset="100%" stop-color="#00F0FF" stop-opacity="0.6" />
    </linearGradient>

    <!-- Glassmorphic Card Gradient -->
    <linearGradient id="glass-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.1" />
      <stop offset="120%" stop-color="#FFFFFF" stop-opacity="0.01" />
    </linearGradient>

    <!-- Filters for High-Quality Neon Glows -->
    <filter id="neon-glow-strong" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="16" result="blur1" />
      <feGaussianBlur stdDeviation="32" result="blur2" />
      <feMerge>
        <feMergeNode in="blur2" />
        <feMergeNode in="blur1" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>

    <filter id="neon-glow-subtle" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="8" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>

    <filter id="glass-shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="24" stdDeviation="28" flood-color="#000000" flood-opacity="0.75" />
    </filter>
  </defs>

  <!-- Base squircle shape -->
  <rect x="2" y="2" width="508" height="508" rx="124" fill="url(#bg-grad)" stroke="url(#border-grad)" stroke-width="4" />

  <!-- Background Orbs for atmospheric lighting -->
  <circle cx="160" cy="160" r="180" fill="#FF2E93" opacity="0.12" filter="url(#neon-glow-strong)" />
  <circle cx="350" cy="350" r="200" fill="#00F0FF" opacity="0.1" filter="url(#neon-glow-strong)" />

  <!-- Outer orbital/constellation tracks (WebRTC P2P Mesh feeling) -->
  <g opacity="0.3" filter="url(#neon-glow-subtle)">
    <circle cx="256" cy="256" r="200" stroke="url(#neon-cyan)" stroke-width="1.5" stroke-dasharray="8 20" />
    <circle cx="256" cy="256" r="170" stroke="url(#neon-pink)" stroke-width="1" stroke-dasharray="4 12" />
  </g>

  <!-- P2P Mesh nodes connecting the outer ring -->
  <g opacity="0.6">
    <circle cx="256" cy="56" r="6" fill="#00F0FF" filter="url(#neon-glow-subtle)" />
    <line x1="256" y1="56" x2="156" y2="120" stroke="url(#neon-cyan)" stroke-width="1" stroke-dasharray="4 4" />
    
    <circle cx="156" cy="120" r="5" fill="#FF2E93" filter="url(#neon-glow-subtle)" />
    <line x1="156" y1="120" x2="96" y2="256" stroke="url(#neon-pink)" stroke-width="1" stroke-dasharray="4 4" />

    <circle cx="96" cy="256" r="5" fill="#A100FF" filter="url(#neon-glow-subtle)" />
    
    <circle cx="416" cy="256" r="5" fill="#00F0FF" filter="url(#neon-glow-subtle)" />
    <line x1="416" y1="256" x2="356" y2="120" stroke="url(#neon-cyan)" stroke-width="1" stroke-dasharray="4 4" />
    <line x1="356" y1="120" x2="256" y2="56" stroke="url(#neon-pink)" stroke-width="1" stroke-dasharray="4 4" />

    <circle cx="356" cy="120" r="5" fill="#FF2E93" filter="url(#neon-glow-subtle)" />
  </g>

  <!-- Central Glassmorphic Hexagonal Shield (Sophisticated framing) -->
  <!-- Glass Shield -->
  <path d="M 256,110 L 382,183 L 382,329 L 256,402 L 130,329 L 130,183 Z" fill="url(#glass-grad)" stroke="rgba(255, 255, 255, 0.15)" stroke-width="2" filter="url(#glass-shadow)" />
  <!-- Glossy Highlight on Glass Shield -->
  <path d="M 256,110 L 382,183 L 382,230 L 256,157 L 130,230 L 130,183 Z" fill="rgba(255, 255, 255, 0.08)" />

  <!-- Overlapping fluid Voice Waves in the center -->
  <g filter="url(#neon-glow-strong)" opacity="0.95">
    <!-- Pink Wave (Back) -->
    <path d="M 150,260 C 180,200 200,320 230,260 C 260,200 280,320 310,260 C 340,200 350,280 362,260" stroke="url(#neon-pink)" stroke-width="8" stroke-linecap="round" fill="none" />
    <!-- Cyan Wave (Front) -->
    <path d="M 150,260 C 170,310 200,190 230,260 C 260,330 290,210 320,260 C 340,300 350,230 362,260" stroke="url(#neon-cyan)" stroke-width="10" stroke-linecap="round" fill="none" />
    <!-- Purple/Gold Highlight Center (Floating nodes representing voice peaks) -->
    <circle cx="230" cy="260" r="6" fill="#FFFFFF" filter="url(#neon-glow-subtle)" />
    <circle cx="320" cy="260" r="4" fill="#FF9E00" filter="url(#neon-glow-subtle)" />
    <circle cx="170" cy="285" r="4" fill="#00F0FF" filter="url(#neon-glow-subtle)" />
  </g>

  <!-- Sleek Logo Text (VoiceWave) integrated in icon at bottom -->
  <text x="256" y="375" fill="#FFFFFF" font-family="'Segoe UI', 'Outfit', sans-serif" font-size="16" font-weight="700" letter-spacing="4" text-anchor="middle" opacity="0.8">VOICEWAVE</text>

  <!-- Accent sparkles/particles -->
  <g filter="url(#neon-glow-subtle)">
    <polygon points="360,150 364,154 368,150 364,146" fill="#00F0FF" />
    <polygon points="150,330 152,332 154,330 152,328" fill="#FF2E93" />
    <circle cx="370" cy="310" r="3" fill="#FF9E00" />
    <circle cx="140" cy="160" r="2.5" fill="#00F0FF" />
  </g>
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
