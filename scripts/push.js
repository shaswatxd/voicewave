const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PUB = path.join(ROOT, 'public');
const SW = path.join(PUB, 'sw.js');
const APP_HTML = path.join(PUB, 'app.html');
const INDEX_HTML = path.join(PUB, 'index.html');
const VERSION = require(path.join(ROOT, 'package.json')).version;

const log = (msg) => console.log(`\x1b[36m>\x1b[0m ${msg}`);
const ok = (msg) => console.log(`\x1b[32m✓\x1b[0m ${msg}`);
const err = (msg) => console.log(`\x1b[31m✗\x1b[0m ${msg}`);

function run(cmd, opts = {}) {
  try {
    execSync(cmd, { stdio: 'inherit', cwd: ROOT, ...opts });
    return true;
  } catch {
    return false;
  }
}

function killProcess(name) {
  const isWin = process.platform === 'win32';
  if (isWin) {
    run(`taskkill /F /IM ${name} /T 2>nul`);
  } else {
    run(`pkill -f ${name} 2>/dev/null`);
  }
}

function deleteFolder(folder) {
  if (fs.existsSync(folder)) {
    log(`Deleting ${path.basename(folder)}/`);
    fs.rmSync(folder, { recursive: true, force: true });
    ok(`${path.basename(folder)}/ deleted`);
  }
}

function patchVersion(filePath, pattern, replacement) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');
  const newContent = content.replace(pattern, replacement);
  if (content !== newContent) {
    fs.writeFileSync(filePath, newContent, 'utf8');
    ok(`Patched ${path.basename(filePath)}`);
  }
}

async function main() {
  console.log('\n\x1b[1m\x1b[35m╔══════════════════════════════════╗');
  console.log('║      VoiceWave Publish Script    ║');
  console.log('╚══════════════════════════════════╝\x1b[0m\n');

  // ── STEP 1: Kill processes ──
  log('Step 1: Killing running processes...');
  killProcess('VoiceWave.exe');
  killProcess('electron.exe');
  await sleep(1500);
  ok('Processes terminated');

  // ── STEP 2: Clear npm cache ──
  log('Step 2: Clearing npm cache...');
  run('npm cache clean --force');
  ok('npm cache cleared');

  // ── STEP 3: Delete old dist ──
  log('Step 3: Deleting old dist/ folder...');
  deleteFolder(DIST);
  ok('dist/ clean');

  // ── STEP 4: Delete node_modules and reinstall ──
  log('Step 4: Fresh install dependencies...');
  deleteFolder(path.join(ROOT, 'node_modules'));
  run('npm install');
  ok('Dependencies installed');

  // ── STEP 5: Bump version timestamps ──
  log('Step 5: Updating cache-bust versions...');
  const timestamp = Date.now();

  // Patch sw.js
  patchVersion(SW, /voicewave-v[\d.]+/, `voicewave-v${VERSION}`);

  // Patch app.html
  patchVersion(APP_HTML, /app\.css\?v=[\d.]+/, `app.css?v=${VERSION}`);
  patchVersion(APP_HTML, /app\.js\?v=[\d.]+/, `app.js?v=${VERSION}`);

  // Patch index.html
  patchVersion(INDEX_HTML, /v[\d.]+/g, `v${VERSION}`);

  ok(`Version set to ${VERSION}`);

  // ── STEP 6: Generate icons ──
  log('Step 6: Generating icons...');
  const assetsDir = path.join(ROOT, 'assets');
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

  try {
    const sharp = require('sharp');

    // Generate icon.png (256x256)
    const iconSvg = `<svg width="256" height="256" xmlns="http://www.w3.org/2000/svg">
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

    await sharp(Buffer.from(iconSvg)).resize(256, 256).png().toFile(path.join(assetsDir, 'icon.png'));
    ok('icon.png generated (256x256)');

    // Generate tray.png (16x16)
    await sharp(Buffer.from(iconSvg)).resize(16, 16).png().toFile(path.join(assetsDir, 'tray.png'));
    ok('tray.png generated (16x16)');

    // Generate public/icon.png (512x512 for PWA)
    await sharp(Buffer.from(iconSvg)).resize(512, 512).png().toFile(path.join(PUB, 'icon.png'));
    ok('public/icon.png generated (512x512)');

    // Generate ico (multiple sizes for Windows)
    const sizes = [16, 24, 32, 48, 64, 128, 256];
    const icoBuffers = [];
    for (const size of sizes) {
      const buf = await sharp(Buffer.from(iconSvg)).resize(size, size).png().toBuffer();
      icoBuffers.push({ size, buf });
    }

    // Build ICO file manually
    const ico = buildICO(icoBuffers);
    fs.writeFileSync(path.join(assetsDir, 'icon.ico'), ico);
    ok('icon.ico generated (7 sizes)');

  } catch (e) {
    err('Icon generation skipped (sharp not available)');
  }

  // ── STEP 7: Build Electron ──
  log('Step 7: Building Electron app...');
  if (process.platform === 'win32') {
    run('npx electron-builder --win --x64');
  } else {
    run('npx electron-builder --linux --x64');
  }
  ok('Electron build complete');

  // ── STEP 8: Git push ──
  log('Step 8: Pushing to git...');
  run('git add -A');
  run(`git commit -m "v${VERSION} - publish ${timestamp}"`);
  run('git push origin master --force');
  ok('Pushed to master');

  // ── STEP 9: GitHub Release ──
  log('Step 9: Creating GitHub release...');
  run(`gh release delete v${VERSION} -y 2>nul`);
  const installerPath = path.join(DIST, `VoiceWave-${VERSION}-Setup.exe`);
  if (fs.existsSync(installerPath)) {
    run(`gh release create v${VERSION} "${installerPath}" --title "v${VERSION}" --notes "VoiceWave v${VERSION} release"`);
    ok('GitHub release created');
  } else {
    err('Installer not found, skipping GitHub release');
  }

  // ── DONE ──
  console.log('\n\x1b[1m\x1b[32m╔══════════════════════════════════╗');
  console.log('║       Publish Complete! ✓        ║');
  console.log('╚══════════════════════════════════╝\x1b[0m\n');
}

function buildICO(images) {
  const numImages = images.length;
  const header = Buffer.alloc(6 + numImages * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(numImages, 4);

  let dataOffset = 6 + numImages * 16;
  for (let i = 0; i < numImages; i++) {
    const img = images[i];
    const offset = 6 + i * 16;
    header.writeUInt8(img.size === 256 ? 0 : img.size, offset);
    header.writeUInt8(img.size === 256 ? 0 : img.size, offset + 1);
    header.writeUInt8(0, offset + 2);
    header.writeUInt8(0, offset + 3);
    header.writeUInt16LE(1, offset + 4);
    header.writeUInt16LE(32, offset + 6);
    header.writeUInt32LE(img.buf.length, offset + 8);
    header.writeUInt32LE(dataOffset, offset + 12);
    dataOffset += img.buf.length;
  }

  return Buffer.concat([header, ...images.map(i => i.buf)]);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

main().catch(e => {
  err(e.message);
  process.exit(1);
});
