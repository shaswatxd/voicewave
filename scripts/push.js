const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PUB = path.join(ROOT, 'public');
const SW = path.join(PUB, 'sw.js');
const APP_HTML = path.join(PUB, 'app.html');
const INDEX_HTML = path.join(PUB, 'index.html');
const PKG_PATH = path.join(ROOT, 'package.json');

const log = (msg) => console.log(`\x1b[36m>\x1b[0m ${msg}`);
const ok = (msg) => console.log(`\x1b[32m✓\x1b[0m ${msg}`);
const err = (msg) => console.log(`\x1b[31m✗\x1b[0m ${msg}`);
const info = (msg) => console.log(`\x1b[33m→\x1b[0m ${msg}`);


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
    const baseName = name.replace('.exe', '');
    run(`pkill -f "${baseName}" 2>/dev/null`);
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

  // ── STEP 0: Auto-bump patch version ──
  log('Step 0: Bumping patch version...');
  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
  const [major, minor, patch] = pkg.version.split('.').map(Number);
  const oldVersion = pkg.version;
  const newVersion = `${major}.${minor}.${patch + 1}`;
  pkg.version = newVersion;
  fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  const VERSION = newVersion;
  info(`${oldVersion}  →  ${newVersion}`);
  ok(`Version bumped to ${VERSION}`);

  // ── STEP 1: Kill processes ──
  log('Step 1: Killing running processes...');
  killProcess('VoiceWave.exe');
  killProcess('electron.exe');
  await sleep(1500);
  ok('Processes terminated');

  // ── STEP 2: Clear Electron cache ──
  log('Step 2: Clearing Electron cache...');
  const isWin = process.platform === 'win32';
  if (isWin) {
    const localAppData = process.env.LOCALAPPDATA || '';
    const electronCache = path.join(localAppData, 'VoiceWave');
    const electronCacheAlt = path.join(localAppData, 'voicewave');
    const userData = path.join(localAppData, 'Programs', 'VoiceWave');
    [electronCache, electronCacheAlt].forEach(dir => {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
        ok(`Cleared: ${path.basename(dir)}`);
      }
    });
  }
  ok('Electron cache cleared');

  // ── STEP 3: Clear npm cache ──
  log('Step 3: Clearing npm cache...');
  run('npm cache clean --force');
  ok('npm cache cleared');

  // ── STEP 4: Delete old dist ──
  log('Step 4: Deleting old dist/ folder...');
  deleteFolder(DIST);
  ok('dist/ clean');

  // ── STEP 5: Delete node_modules and reinstall ──
  log('Step 5: Fresh install dependencies...');
  deleteFolder(path.join(ROOT, 'node_modules'));
  run('npm install');
  ok('Dependencies installed');

  // ── STEP 6: Validate all JS files ──
  log('Step 6: Checking all JS files...');
  const jsFiles = [
    path.join(ROOT, 'server.js'),
    path.join(ROOT, 'main.js'),
    path.join(ROOT, 'preload.js'),
    path.join(PUB, 'app.js'),
    path.join(ROOT, 'scripts', 'push.js')
  ];
  let hasErrors = false;
  for (const file of jsFiles) {
    if (!fs.existsSync(file)) {
      err(`Missing: ${path.relative(ROOT, file)}`);
      hasErrors = true;
      continue;
    }
    try {
      const code = fs.readFileSync(file, 'utf8');
      new Function(code);
    } catch (e) {
      err(`Syntax error in ${path.relative(ROOT, file)}: ${e.message}`);
      hasErrors = true;
    }
  }
  if (hasErrors) {
    err('Fix JS errors before publishing!');
    process.exit(1);
  }
  ok('All JS files valid');

  // ── STEP 7: Check HTML files exist ──
  log('Step 7: Checking HTML files...');
  const htmlFiles = [
    path.join(PUB, 'app.html'),
    path.join(PUB, 'index.html')
  ];
  for (const file of htmlFiles) {
    if (!fs.existsSync(file)) {
      err(`Missing: ${path.relative(ROOT, file)}`);
      process.exit(1);
    }
  }
  ok('All HTML files present');

  // ── STEP 8: Check CSS file ──
  log('Step 8: Checking CSS...');
  const cssFile = path.join(PUB, 'app.css');
  if (!fs.existsSync(cssFile)) {
    err('Missing: public/app.css');
    process.exit(1);
  }
  ok('CSS file present');

  // ── STEP 9: Check server starts ──
  log('Step 9: Verifying server starts...');
  let serverOk = false;
  try {
    execSync(`node -e "require('./server.js'); process.exit(0)"`, { timeout: 5000, cwd: ROOT, stdio: 'ignore' });
    serverOk = true;
  } catch (e) {
    if (e.status === 0) serverOk = true;
  }
  if (!serverOk) {
    err('Server failed to start!');
    process.exit(1);
  }
  ok('Server starts OK');

  // ── STEP 10: Check assets ──
  log('Step 10: Checking assets...');
  const assetsDir = path.join(ROOT, 'assets');
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
  const requiredAssets = ['icon.ico', 'icon.png', 'tray.png'];
  for (const asset of requiredAssets) {
    const ap = path.join(assetsDir, asset);
    if (!fs.existsSync(ap)) {
      err(`Missing asset: ${asset}`);
      process.exit(1);
    }
  }
  ok('All assets present');

  // ── STEP 11: Bump version timestamps ──
  log('Step 11: Updating cache-bust versions...');
  const timestamp = Date.now();

  // Patch sw.js
  patchVersion(SW, /voicewave-v[\d.]+/, `voicewave-v${VERSION}`);

  // Patch app.html
  patchVersion(APP_HTML, /app\.css\?v=[\d.]+/, `app.css?v=${VERSION}`);
  patchVersion(APP_HTML, /app\.js\?v=[\d.]+/, `app.js?v=${VERSION}`);
  patchVersion(APP_HTML, /window\.APP_VERSION = '[\d.]+'/, `window.APP_VERSION = '${VERSION}'`);

  // Patch index.html
  patchVersion(INDEX_HTML, /v[\d.]+/g, `v${VERSION}`);
  patchVersion(INDEX_HTML, /VoiceWave-[\d.]+-Setup\.exe/g, `VoiceWave-${VERSION}-Setup.exe`);

  ok(`Version set to ${VERSION}`);

  // ── STEP 12: Generate icons ──
  log('Step 12: Generating icons...');

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

  // ── STEP 13: Build Electron ──
  log('Step 13: Building Electron app...');
  if (process.platform === 'win32') {
    run('npx electron-builder --win --x64 --publish never');
  } else {
    run('npx electron-builder --linux --x64');
  }
  ok('Electron build complete');

  // ── STEP 14: Git push ──
  log('Step 14: Pushing to git...');
  run('git add -A');
  run(`git commit -m "v${VERSION} - publish ${timestamp}"`);
  run('git push origin master --force');
  ok('Pushed to master');

  // ── STEP 15: GitHub Release ──
  log('Step 15: Creating GitHub release...');
  const nulRedirect = process.platform === 'win32' ? '2>nul' : '2>/dev/null';
  run(`gh release delete v${VERSION} -y ${nulRedirect}`);
  const installerPath = path.join(DIST, `VoiceWave-${VERSION}-Setup.exe`);
  const blockmapPath = path.join(DIST, `VoiceWave-${VERSION}-Setup.exe.blockmap`);
  const ymlFiles = fs.readdirSync(DIST).filter(f => f.endsWith('.yml'));
  if (fs.existsSync(installerPath)) {
    const uploadFiles = [installerPath];
    if (fs.existsSync(blockmapPath)) uploadFiles.push(blockmapPath);
    ymlFiles.forEach(f => uploadFiles.push(path.join(DIST, f)));
    const fileArgs = uploadFiles.map(f => `"${f}"`).join(' ');
    run(`gh release create v${VERSION} ${fileArgs} --title "v${VERSION}" --notes "VoiceWave v${VERSION} release"`);
    ok('GitHub release created with installer + update files');
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
