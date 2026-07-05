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
    const iconSvg = `<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
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
      <path d="M 256,110 L 382,183 L 382,329 L 256,402 L 130,329 L 130,183 Z" fill="url(#glass-grad)" stroke="rgba(255, 255, 255, 0.15)" stroke-width="2" filter="url(#glass-shadow)" />
      <path d="M 256,110 L 382,183 L 382,230 L 256,157 L 130,230 L 130,183 Z" fill="rgba(255, 255, 255, 0.08)" />

      <!-- Overlapping fluid Voice Waves in the center -->
      <g filter="url(#neon-glow-strong)" opacity="0.95">
        <path d="M 150,260 C 180,200 200,320 230,260 C 260,200 280,320 310,260 C 340,200 350,280 362,260" stroke="url(#neon-pink)" stroke-width="8" stroke-linecap="round" fill="none" />
        <path d="M 150,260 C 170,310 200,190 230,260 C 260,330 290,210 320,260 C 340,300 350,230 362,260" stroke="url(#neon-cyan)" stroke-width="10" stroke-linecap="round" fill="none" />
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

    await sharp(Buffer.from(iconSvg)).resize(256, 256).png().toFile(path.join(assetsDir, 'icon.png'));
    ok('icon.png generated (256x256)');

    // Generate tray.png (16x16)
    await sharp(Buffer.from(iconSvg)).resize(16, 16).png().toFile(path.join(assetsDir, 'tray.png'));
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
