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
  } catch (e) {
    err(`Command failed: ${cmd}`);
    if (e.message) err(e.message);
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
  // Delete invalid tokens from process.env so gh CLI uses keyring credentials
  delete process.env.GH_TOKEN;
  delete process.env.GITHUB_TOKEN;

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
    const updaterCache = path.join(localAppData, 'voicewave-updater');
    const userData = path.join(localAppData, 'Programs', 'VoiceWave');
    [electronCache, electronCacheAlt, updaterCache].forEach(dir => {
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

  // ── STEP 6.5: Dead Code Analysis & Auto-Fix ──
  log('Step 6.5: Scanning for dead code & auto-fixing...');
  const analysisFiles = [
    { path: path.join(ROOT, 'server.js'), env: 'node' },
    { path: path.join(ROOT, 'main.js'), env: 'node' },
    { path: path.join(ROOT, 'preload.js'), env: 'node' },
    { path: path.join(PUB, 'app.js'), env: 'browser' },
  ];

  const BROWSER_GLOBALS = [
    'document', 'window', 'navigator', 'console', 'localStorage', 'sessionStorage',
    'Image', 'FileReader', 'HTMLImageElement', 'RTCPeerConnection', 'RTCSessionDescription',
    'RTCIceCandidate', 'MediaRecorder', 'Blob', 'URL', 'AudioContext', 'webkitAudioContext',
    'Audio', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'fetch',
    'XMLHttpRequest', 'Event', 'CustomEvent', 'MutationObserver', 'requestAnimationFrame',
    'MutationObserver', 'SpeechRecognition', 'webkitSpeechRecognition',
    'io', 'URLSearchParams', 'CSS', 'Intl',
    // Web APIs
    'DOMParser', 'XMLSerializer', 'TextEncoder', 'TextDecoder', 'crypto',
    'matchMedia', 'requestIdleCallback', 'cancelAnimationFrame',
  ];

  const NODE_GLOBALS = [
    'require', 'module', 'exports', '__dirname', '__filename', 'process',
    'Buffer', 'console', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
    'global', 'URL', 'Promise',
  ];

  const ELECTRON_GLOBALS = [
    'contextBridge', 'ipcRenderer',
    'app', 'BrowserWindow', 'Tray', 'Menu', 'ipcMain', 'nativeImage', 'session',
    'autoUpdater',
  ];

  let totalDeadFound = 0;
  let totalAutoFixed = 0;

  for (const file of analysisFiles) {
    let code = fs.readFileSync(file.path, 'utf8');
    const originalCode = code;
    const fileName = path.relative(ROOT, file.path);
    const issues = [];

    const globals = file.env === 'browser'
      ? [...BROWSER_GLOBALS, ...ELECTRON_GLOBALS]
      : [...NODE_GLOBALS, ...ELECTRON_GLOBALS];

    // ── 1. Find unused const/let variables ──
    const varDeclRegex = /^(?:[ \t]*)(const|let)\s+(\w+)\s*=/gm;
    let varMatch;
    while ((varMatch = varDeclRegex.exec(code)) !== null) {
      const keyword = varMatch[1];
      const varName = varMatch[2];
      if (globals.includes(varName)) continue;

      // Count usages of this variable name (word boundary match, excluding the declaration line)
      const declLine = code.substring(0, varMatch.index).split('\n').length;
      const usageRegex = new RegExp(`\\b${varName}\\b`, 'g');
      let usageCount = 0;
      let usageMatch;
      while ((usageMatch = usageRegex.exec(code)) !== null) {
        const usageLine = code.substring(0, usageMatch.index).split('\n').length;
        if (usageLine !== declLine) usageCount++;
      }

      if (usageCount === 0) {
        issues.push({
          type: 'unused-variable',
          severity: 'warning',
          name: varName,
          keyword: keyword,
          line: declLine,
          message: `Unused ${keyword} "${varName}"`
        });
      }
    }

    // ── 2. Find empty function/block bodies ──
    const emptyBlockRegex = /(?:function\s*\([^)]*\)\s*\{\s*\}|=>\s*\{\s*\}|\(\)\s*=>\s*\{\s*\})/g;
    let emptyMatch;
    while ((emptyMatch = emptyBlockRegex.exec(code)) !== null) {
      const line = code.substring(0, emptyMatch.index).split('\n').length;
      // Check if it's a catch block or intentional no-op
      const before = code.substring(Math.max(0, emptyMatch.index - 50), emptyMatch.index);
      if (!before.includes('catch') && !before.includes('/* ignore */')) {
        issues.push({
          type: 'empty-function',
          severity: 'info',
          line: line,
          message: `Empty function body`
        });
      }
    }

    // ── 3. Find redundant ternary (x ? a : a) ──
    const redundantTernaryRegex = /(\w+)\s*\?\s*([^:]+?)\s*:\s*\2/g;
    let ternaryMatch;
    while ((ternaryMatch = redundantTernaryRegex.exec(code)) !== null) {
      const line = code.substring(0, ternaryMatch.index).split('\n').length;
      issues.push({
        type: 'redundant-ternary',
        severity: 'warning',
        line: line,
        message: `Redundant ternary: both branches are identical`
      });
    }

    // ── 4. Find dead code after return/throw/break/continue ──
    const lines = code.split('\n');
    for (let i = 0; i < lines.length - 1; i++) {
      const trimmed = lines[i].trim();
      if (/^(return\b|throw\b|break\b|continue\b)/.test(trimmed) && trimmed.endsWith(';')) {
        const nextTrimmed = lines[i + 1]?.trim();
        if (nextTrimmed && nextTrimmed !== '}' && nextTrimmed !== '' &&
            !nextTrimmed.startsWith('//') && !nextTrimmed.startsWith('/*') &&
            !nextTrimmed.startsWith('case ') && !nextTrimmed.startsWith('default:') &&
            !nextTrimmed.startsWith('catch') && !nextTrimmed.startsWith('finally')) {
          issues.push({
            type: 'unreachable-code',
            severity: 'error',
            line: i + 2,
            message: `Unreachable code after "${trimmed.split('(')[0].split(' ')[0]}"`
          });
        }
      }
    }

    // ── 5. Find duplicate consecutive conditions ──
    for (let i = 0; i < lines.length - 2; i++) {
      const curr = lines[i].trim();
      const next = lines[i + 1]?.trim();
      if (curr.startsWith('if (') && next?.startsWith('if (') && curr === next) {
        issues.push({
          type: 'duplicate-condition',
          severity: 'warning',
          line: i + 2,
          message: `Duplicate consecutive if condition`
        });
      }
    }

    // ── 6. Find var declarations (should be const/let) ──
    const varUsageRegex = /^(?:[ \t]*)(var\s+\w+)/gm;
    let varUsageMatch;
    while ((varUsageMatch = varUsageRegex.exec(code)) !== null) {
      const line = code.substring(0, varUsageMatch.index).split('\n').length;
      issues.push({
        type: 'var-declaration',
        severity: 'warning',
        line: line,
        message: `Use "const" or "let" instead of "var"`
      });
    }

    // ── 7. Find console.log in production code (server.js, main.js) ──
    if (file.env === 'node') {
      const consoleLogRegex = /console\.\w+\(/g;
      let cLogMatch;
      while ((cLogMatch = consoleLogRegex.exec(code)) !== null) {
        const line = code.substring(0, cLogMatch.index).split('\n').length;
        issues.push({
          type: 'console-in-prod',
          severity: 'info',
          line: line,
          message: `Console statement in production code`
        });
      }
    }

    // ── AUTO-FIX ──
    let fixedCount = 0;

    // Fix 1: Remove unused const/let declarations (single-line only)
    for (const issue of issues) {
      if (issue.type === 'unused-variable' && issue.severity === 'warning') {
        const varRegex = new RegExp(`^[ \\t]*${issue.keyword}\\s+${issue.name}\\s*=.*;\\s*$`, 'gm');
        const newCode = code.replace(varRegex, '');
        if (newCode !== code) {
          code = newCode;
          fixedCount++;
        }
      }
    }

    // Fix 2: Replace redundant ternary with single value
    code = code.replace(/(\w+)\s*\?\s*([^:]+?)\s*:\s*\2/g, '$2');

    // Fix 3: Convert var to const (simple cases where value is never reassigned)
    // Skip this - too risky for auto-fix

    // Fix 4: Clean up multiple blank lines (3+ → 2)
    code = code.replace(/\n{3,}/g, '\n\n');

    // Fix 5: Remove trailing whitespace
    code = code.replace(/[ \t]+$/gm, '');

    // Write fixed file
    if (code !== originalCode) {
      fs.writeFileSync(file.path, code, 'utf8');
      totalAutoFixed++;
      ok(`${fileName}: ${fixedCount} issues auto-fixed`);
    }

    const errors = issues.filter(i => i.severity === 'error');
    const warnings = issues.filter(i => i.severity === 'warning');
    const infos = issues.filter(i => i.severity === 'info');

    if (issues.length > 0) {
      info(`${fileName}: ${errors.length} errors, ${warnings.length} warnings, ${infos.length} info`);
      for (const issue of issues) {
        const prefix = issue.severity === 'error' ? '  \x1b[31m✗\x1b[0m' :
                       issue.severity === 'warning' ? '  \x1b[33m⚠\x1b[0m' :
                       '  \x1b[36mℹ\x1b[0m';
        console.log(`${prefix} L${issue.line}: ${issue.message}`);
      }
      totalDeadFound += issues.length;
    } else {
      ok(`${fileName}: clean`);
    }
  }

  if (totalDeadFound > 0) {
    info(`Total: ${totalDeadFound} issues found, ${totalAutoFixed} files auto-fixed`);
  } else {
    ok('No dead code found');
  }

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
    // Redesigned v1.0.58: bolder, higher-contrast glyph (own brand, not a
    // Discord clone) so it still reads clearly at 16x16 tray size, not just
    // at 512x512 — the old design's fine mesh-lines/wordmark turned to mush
    // when scaled down.
    const iconSvg = `<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0a0518" />
          <stop offset="55%" stop-color="#050311" />
          <stop offset="100%" stop-color="#020103" />
        </linearGradient>

        <linearGradient id="border-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#22d3ee" />
          <stop offset="50%" stop-color="#a855f7" />
          <stop offset="100%" stop-color="#22d3ee" />
        </linearGradient>

        <linearGradient id="wave-grad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#e0f7ff" />
          <stop offset="45%" stop-color="#22d3ee" />
          <stop offset="100%" stop-color="#a855f7" />
        </linearGradient>

        <radialGradient id="top-sheen" cx="30%" cy="18%" r="70%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.18" />
          <stop offset="60%" stop-color="#ffffff" stop-opacity="0.03" />
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
        </radialGradient>

        <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="14" result="b1" />
          <feGaussianBlur stdDeviation="28" result="b2" />
          <feMerge>
            <feMergeNode in="b2" />
            <feMergeNode in="b1" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <filter id="soft-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="10" stdDeviation="18" flood-color="#000000" flood-opacity="0.55" />
        </filter>
      </defs>

      <!-- Base squircle: bold gradient border + deep drop shadow for a premium 3D-badge feel -->
      <rect x="6" y="6" width="500" height="500" rx="118" fill="url(#bg-grad)" stroke="url(#border-grad)" stroke-width="7" filter="url(#soft-shadow)" />
      <!-- Glass sheen top-left for depth -->
      <rect x="6" y="6" width="500" height="500" rx="118" fill="url(#top-sheen)" />

      <!-- Ambient glow orbs (large/soft, reads fine at 256px+ — small sizes use the crisp variant below instead) -->
      <circle cx="150" cy="150" r="140" fill="#a855f7" opacity="0.18" filter="url(#glow)" />
      <circle cx="360" cy="360" r="150" fill="#22d3ee" opacity="0.16" filter="url(#glow)" />

      <!-- Bold equalizer-style voice-wave glyph — few thick bars, high contrast -->
      <g filter="url(#glow)">
        <rect x="161" y="216" width="26" height="80" rx="13" fill="url(#wave-grad)" />
        <rect x="202" y="176" width="26" height="160" rx="13" fill="url(#wave-grad)" />
        <rect x="243" y="140" width="26" height="232" rx="13" fill="#ffffff" />
        <rect x="284" y="176" width="26" height="160" rx="13" fill="url(#wave-grad)" />
        <rect x="325" y="216" width="26" height="80" rx="13" fill="url(#wave-grad)" />
      </g>
    </svg>`;

    // Crisp variant for small raster targets (tray icon, small .ico sizes):
    // no blur filters at all — a 512-unit-space Gaussian blur (even at a
    // "subtle" stdDeviation) becomes a smear once downsampled to 16-32px, so
    // small sizes get flat fills and no drop-shadow instead, keeping the
    // equalizer-bar glyph and border crisp and recognizable at tray size.
    const iconSvgCrisp = `<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0a0518" />
          <stop offset="55%" stop-color="#050311" />
          <stop offset="100%" stop-color="#020103" />
        </linearGradient>
        <linearGradient id="border-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#22d3ee" />
          <stop offset="50%" stop-color="#a855f7" />
          <stop offset="100%" stop-color="#22d3ee" />
        </linearGradient>
        <linearGradient id="wave-grad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#e0f7ff" />
          <stop offset="45%" stop-color="#22d3ee" />
          <stop offset="100%" stop-color="#a855f7" />
        </linearGradient>
      </defs>
      <rect x="6" y="6" width="500" height="500" rx="118" fill="url(#bg-grad)" stroke="url(#border-grad)" stroke-width="14" />
      <rect x="153" y="208" width="34" height="96" rx="17" fill="url(#wave-grad)" />
      <rect x="199" y="168" width="34" height="176" rx="17" fill="url(#wave-grad)" />
      <rect x="245" y="128" width="34" height="256" rx="17" fill="#ffffff" />
      <rect x="291" y="168" width="34" height="176" rx="17" fill="url(#wave-grad)" />
      <rect x="337" y="208" width="34" height="96" rx="17" fill="url(#wave-grad)" />
    </svg>`;

    await sharp(Buffer.from(iconSvg)).resize(256, 256).png().toFile(path.join(assetsDir, 'icon.png'));
    ok('icon.png generated (256x256)');

    // Generate tray.png (16x16) — crisp variant, no blur filters to smear at this size
    await sharp(Buffer.from(iconSvgCrisp)).resize(16, 16).png().toFile(path.join(assetsDir, 'tray.png'));
    ok('tray.png generated (16x16)');

    // Generate public/icon.png (512x512 for PWA)
    await sharp(Buffer.from(iconSvg)).resize(512, 512).png().toFile(path.join(PUB, 'icon.png'));
    ok('public/icon.png generated (512x512)');

    // Generate public/icon-192.png (192x192)
    await sharp(Buffer.from(iconSvg)).resize(192, 192).png().toFile(path.join(PUB, 'icon-192.png'));
    ok('public/icon-192.png generated (192x192)');

    // Generate public/icon-512.png (512x512)
    await sharp(Buffer.from(iconSvg)).resize(512, 512).png().toFile(path.join(PUB, 'icon-512.png'));
    ok('public/icon-512.png generated (512x512)');

    // Generate public/icon-maskable.png (512x512)
    await sharp(Buffer.from(iconSvg)).resize(512, 512).png().toFile(path.join(PUB, 'icon-maskable.png'));
    ok('public/icon-maskable.png generated (512x512)');

    // Generate ico (multiple sizes for Windows) — crisp variant for sizes
    // where the glow filter would otherwise smear into an unrecognizable blob
    const sizes = [16, 24, 32, 48, 64, 128, 256];
    const icoBuffers = [];
    for (const size of sizes) {
      const svgSource = size <= 32 ? iconSvgCrisp : iconSvg;
      const buf = await sharp(Buffer.from(svgSource)).resize(size, size).png().toBuffer();
      icoBuffers.push({ size, buf });
    }

    // Build ICO file manually
    const ico = buildICO(icoBuffers);
    fs.writeFileSync(path.join(assetsDir, 'icon.ico'), ico);
    ok('icon.ico generated (7 sizes)');

    // ── Generate HD installer images (BMP, NSIS MUI2 format) ──
    const BUILD = path.join(ROOT, 'build');
    if (!fs.existsSync(BUILD)) fs.mkdirSync(BUILD, { recursive: true });

    // Header banner (150x57) — dark gradient + equalizer bars + "VoiceWave" text
    const headerSvg = `<svg width="150" height="57" viewBox="0 0 150 57" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="hg" x1="0" y1="0" x2="150" y2="57" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#0a0518"/>
          <stop offset="100%" stop-color="#050311"/>
        </linearGradient>
        <linearGradient id="hb" x1="0" y1="0" x2="150" y2="57" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#22d3ee"/>
          <stop offset="50%" stop-color="#a855f7"/>
          <stop offset="100%" stop-color="#22d3ee"/>
        </linearGradient>
        <linearGradient id="hw" x1="0" y1="0" x2="0" y2="57" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#e0f7ff"/>
          <stop offset="45%" stop-color="#22d3ee"/>
          <stop offset="100%" stop-color="#a855f7"/>
        </linearGradient>
      </defs>
      <rect width="150" height="57" fill="url(#hg)"/>
      <rect x="0.5" y="0.5" width="149" height="56" rx="4" stroke="url(#hb)" fill="none"/>
      <!-- Equalizer bars -->
      <g transform="translate(12, 6)">
        <rect x="0" y="14" width="5" height="18" rx="2.5" fill="url(#hw)"/>
        <rect x="8" y="8" width="5" height="30" rx="2.5" fill="url(#hw)"/>
        <rect x="16" y="2" width="5" height="42" rx="2.5" fill="#ffffff"/>
        <rect x="24" y="8" width="5" height="30" rx="2.5" fill="url(#hw)"/>
        <rect x="32" y="14" width="5" height="18" rx="2.5" fill="url(#hw)"/>
      </g>
      <!-- "VoiceWave" text -->
      <text x="56" y="34" font-family="Segoe UI, Arial, sans-serif" font-size="16" font-weight="600" fill="#ffffff" letter-spacing="0.5">Voice</text>
      <text x="100" y="34" font-family="Segoe UI, Arial, sans-serif" font-size="16" font-weight="600" fill="#22d3ee" letter-spacing="0.5">Wave</text>
    </svg>`;

    const headerRaw = await sharp(Buffer.from(headerSvg)).resize(150, 57).raw().toBuffer();
    fs.writeFileSync(path.join(BUILD, 'header.bmp'), pngToBmp(headerRaw, 150, 57));
    ok('build/header.bmp generated (150x57)');

    // Sidebar (164x314) — tall dark panel with centered icon + gradient accent
    const sidebarSvg = `<svg width="164" height="314" viewBox="0 0 164 314" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="sg" x1="0" y1="0" x2="164" y2="314" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#0a0518"/>
          <stop offset="55%" stop-color="#050311"/>
          <stop offset="100%" stop-color="#020103"/>
        </linearGradient>
        <linearGradient id="sb" x1="0" y1="0" x2="164" y2="314" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#22d3ee"/>
          <stop offset="50%" stop-color="#a855f7"/>
          <stop offset="100%" stop-color="#22d3ee"/>
        </linearGradient>
        <linearGradient id="sw" x1="0" y1="0" x2="0" y2="314" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#e0f7ff"/>
          <stop offset="45%" stop-color="#22d3ee"/>
          <stop offset="100%" stop-color="#a855f7"/>
        </linearGradient>
        <radialGradient id="sgr" cx="50%" cy="35%" r="45%">
          <stop offset="0%" stop-color="#a855f7" stop-opacity="0.20"/>
          <stop offset="100%" stop-color="#a855f7" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="164" height="314" fill="url(#sg)"/>
      <!-- Soft glow behind icon -->
      <circle cx="82" cy="130" r="70" fill="url(#sgr)"/>
      <!-- Icon (centered, ~80x80) -->
      <g transform="translate(42, 90)">
        <rect x="0" y="0" width="80" height="80" rx="18" fill="url(#sg)" stroke="url(#sb)" stroke-width="2"/>
        <rect x="12" y="24" width="7" height="32" rx="3.5" fill="url(#sw)"/>
        <rect x="23" y="14" width="7" height="52" rx="3.5" fill="url(#sw)"/>
        <rect x="34" y="6" width="7" height="68" rx="3.5" fill="#ffffff"/>
        <rect x="45" y="14" width="7" height="52" rx="3.5" fill="url(#sw)"/>
        <rect x="56" y="24" width="7" height="32" rx="3.5" fill="url(#sw)"/>
      </g>
      <!-- "VoiceWave" vertical text -->
      <text x="82" y="210" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="15" font-weight="600" fill="#ffffff" letter-spacing="1">VoiceWave</text>
      <!-- Gradient accent line -->
      <rect x="30" y="225" width="104" height="2" rx="1" fill="url(#sb)"/>
      <text x="82" y="248" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="8" fill="#8888aa">Real-time voice chat</text>
    </svg>`;

    const sidebarRaw = await sharp(Buffer.from(sidebarSvg)).resize(164, 314).raw().toBuffer();
    fs.writeFileSync(path.join(BUILD, 'sidebar.bmp'), pngToBmp(sidebarRaw, 164, 314));
    ok('build/sidebar.bmp generated (164x314)');

  } catch (e) {
    err('Icon generation skipped (sharp not available)');
  }

  // ── STEP 13: Build Electron ──
  log('Step 13: Building Electron app...');
  let buildOk = false;
  if (process.platform === 'win32') {
    buildOk = run('node_modules\\.bin\\electron-builder.cmd --win --x64 --publish never');
  } else {
    buildOk = run('./node_modules/.bin/electron-builder --linux --x64');
  }
  if (!buildOk) {
    err('Electron build failed');
    process.exit(1);
  }
  ok('Electron build complete');

  // ── STEP 14: Git push ──
  log('Step 14: Pushing to git...');
  if (!run('git add -A')) {
    err('Git add failed');
    process.exit(1);
  }
  if (!run(`git commit -m "v${VERSION} - publish ${timestamp}"`)) {
    err('Git commit failed');
    process.exit(1);
  }
  if (!run('git push origin master --force')) {
    err('Git push failed');
    process.exit(1);
  }
  ok('Pushed to master');

  // ── STEP 15: GitHub Release ──
  log('Step 15: Creating GitHub release...');
  const nulRedirect = process.platform === 'win32' ? '2>nul' : '2>/dev/null';
  run(`git tag -d v${VERSION} ${nulRedirect}`);
  run(`git push --delete origin v${VERSION} ${nulRedirect}`);
  run(`gh release delete v${VERSION} -y ${nulRedirect}`);
  const installerPath = path.join(DIST, `VoiceWave-${VERSION}-Setup.exe`);
  const blockmapPath = path.join(DIST, `VoiceWave-${VERSION}-Setup.exe.blockmap`);
  const ymlFiles = fs.readdirSync(DIST).filter(f => f.endsWith('.yml'));
  if (fs.existsSync(installerPath)) {
    const uploadFiles = [installerPath];
    if (fs.existsSync(blockmapPath)) uploadFiles.push(blockmapPath);
    ymlFiles.forEach(f => uploadFiles.push(path.join(DIST, f)));
    const fileArgs = uploadFiles.map(f => `"${f}"`).join(' ');
    if (!run(`gh release create v${VERSION} ${fileArgs} --title "v${VERSION}" --notes "VoiceWave v${VERSION} release"`)) {
      err('GitHub release creation failed');
      process.exit(1);
    }
    ok('GitHub release created with installer + update files');
  } else {
    err('Installer not found, skipping GitHub release');
  }

  // ── STEP 16: Post-Publish Cleanup ──
  log('Step 16: Cleaning up workspace...');
  // Keep the dist folder after publish so that built installers/executables remain available.
  // The old dist is cleaned up at the beginning of the next publish run (Step 4).
  // deleteFolder(DIST);
  const roomsFile = path.join(ROOT, 'rooms.json');
  if (fs.existsSync(roomsFile)) {
    log('Deleting rooms.json...');
    fs.unlinkSync(roomsFile);
    ok('rooms.json deleted');
  }
  ok('Workspace clean');

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

// ── BMP conversion helpers (NSIS MUI2 requires BMP for header/sidebar) ──
function pngToBmp(pngBuffer, width, height) {
  const rowSize = Math.ceil((width * 3) / 4) * 4; // rows padded to 4-byte boundary
  const pixelDataSize = rowSize * height;
  const headerSize = 54;
  const buf = Buffer.alloc(headerSize + pixelDataSize);

  // BMP file header (14 bytes)
  buf.write('BM', 0);
  buf.writeUInt32LE(headerSize + pixelDataSize, 2);
  buf.writeUInt32LE(0, 6);
  buf.writeUInt32LE(headerSize, 10);

  // DIB header (BITMAPINFOHEADER, 40 bytes)
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(-height, 22); // negative = top-down
  buf.writeUInt16LE(1, 26);      // color planes
  buf.writeUInt16LE(24, 28);     // bits per pixel
  buf.writeUInt32LE(0, 30);      // no compression
  buf.writeUInt32LE(pixelDataSize, 34);
  buf.writeInt32LE(2835, 38);    // ~72 DPI
  buf.writeInt32LE(2835, 42);
  buf.writeUInt32LE(0, 46);
  buf.writeUInt32LE(0, 50);

  // Copy raw pixel data (sharp raw() gives RGB, BMP expects BGR)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 3;
      const dstIdx = headerSize + y * rowSize + x * 3;
      buf[dstIdx]     = pngBuffer[srcIdx + 2]; // B
      buf[dstIdx + 1] = pngBuffer[srcIdx + 1]; // G
      buf[dstIdx + 2] = pngBuffer[srcIdx];     // R
    }
  }

  return buf;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

main().catch(e => {
  err(e.message);
  process.exit(1);
});
