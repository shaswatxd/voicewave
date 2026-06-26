const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const ASSETS = path.join(__dirname, '..', 'assets');
const PUB = path.join(__dirname, '..', 'public');

const SVG = `<svg width="256" height="256" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#22d3ee"/>
      <stop offset="100%" style="stop-color:#a855f7"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" rx="48" fill="url(#g)"/>
  <text x="128" y="145" font-size="120" fill="#000" text-anchor="middle" font-family="Arial" font-weight="bold">W</text>
  <text x="128" y="200" font-size="32" fill="#000" text-anchor="middle" font-family="Arial" font-weight="600" opacity="0.7">VoiceWave</text>
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
