const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, session, globalShortcut, desktopCapturer, systemPreferences, shell, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

// Base64-embedded PNG for the loading/error screens — an inline <svg> inside
// a data:text/html URL rendered as a blank white box in testing (some
// Chromium versions don't reliably rasterize inline SVG when the whole page
// itself is a data: URL). A raster <img> data URI has no such edge case.
let cachedLogoDataUri = null;
function getLogoDataUri() {
  if (cachedLogoDataUri) return cachedLogoDataUri;
  try {
    const buf = fs.readFileSync(path.join(__dirname, 'assets', 'icon.png'));
    cachedLogoDataUri = `data:image/png;base64,${buf.toString('base64')}`;
  } catch (e) {
    cachedLogoDataUri = '';
  }
  return cachedLogoDataUri;
}

// ── GPU compatibility flags for older/low-end PCs ──
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('enable-media-stream');
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('disable-software-rasterizer');

// ── Prevent multiple instances ──
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let mainWindow;
let tray;
let isMuted = false;
let isDeafened = false;
let inRoom = false;

const SERVER_URL = 'https://voicewave-7ozn.onrender.com';
// The free-tier host spins down after ~15min idle and can take 30-90s to
// cold-start (occasionally longer under load). The old 6-retry/~45s budget
// gave up before a slow cold-start finished, bounced to the error screen,
// and the user's own "Try Again" click restarted the whole short cycle —
// felt like an infinite loop that never actually connects. This budget
// (9 retries, ~150s of backoff alone, more with each attempt's own network
// time) comfortably outlasts the realistic worst case.
const MAX_RETRIES = 9;
const RETRY_DELAYS = [2000, 3000, 5000, 8000, 12000, 15000, 20000, 25000, 30000];
let currentLoadIsRetrying = false;

// ── Loading screen HTML ──
function getLoadingHTML() {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>VoiceWave</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #060a12;
    color: #e2e8f0;
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    display: flex; align-items: center; justify-content: center;
    height: 100vh; overflow: hidden;
    -webkit-app-region: drag;
  }
  .container { text-align: center; animation: fadeIn 0.5s ease; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
  .logo-img {
    width: 80px; height: 80px; margin: 0 auto 24px;
    display: block; border-radius: 18px;
    animation: pulse 2s ease-in-out infinite;
  }
  @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
  h1 { font-size: 28px; font-weight: 700; margin-bottom: 8px;
    background: linear-gradient(135deg, #22d3ee, #a855f7);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  .status { color: #94a3b8; font-size: 14px; margin-bottom: 32px; }
  .spinner {
    width: 40px; height: 40px; margin: 0 auto;
    border: 3px solid rgba(34, 211, 238, 0.15);
    border-top-color: #22d3ee; border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .error-msg { display: none; color: #f87171; margin-top: 16px; font-size: 13px; }
</style></head>
<body><div class="container">
  <img class="logo-img" src="${getLogoDataUri()}" alt="VoiceWave">
  <h1>VoiceWave</h1>
  <p class="status" id="status">Connecting to server...</p>
  <div class="spinner" id="spinner"></div>
  <p class="error-msg" id="error"></p>
</div></body></html>`;
}

// ── Error page HTML ──
function getErrorHTML(errorMsg) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>VoiceWave - Connection Error</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #060a12; color: #e2e8f0;
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    display: flex; align-items: center; justify-content: center;
    height: 100vh; overflow: hidden;
    -webkit-app-region: drag;
  }
  .container { text-align: center; max-width: 420px; padding: 20px; animation: fadeIn 0.5s ease; }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  .icon { font-size: 56px; margin-bottom: 20px; }
  h1 { font-size: 22px; font-weight: 700; margin-bottom: 8px; color: #f87171; }
  .msg { color: #94a3b8; font-size: 14px; line-height: 1.6; margin-bottom: 24px; }
  .detail { color: #64748b; font-size: 12px; margin-bottom: 24px; background: rgba(255,255,255,0.03);
    padding: 12px 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06); word-break: break-all; }
  button {
    -webkit-app-region: no-drag;
    background: linear-gradient(135deg, #22d3ee, #a855f7); color: #000;
    border: none; padding: 12px 32px; border-radius: 10px; font-size: 14px;
    font-weight: 600; cursor: pointer; transition: transform 0.15s, opacity 0.15s;
  }
  button:hover { transform: scale(1.03); opacity: 0.9; }
  button:active { transform: scale(0.97); }
  .quit-btn { background: transparent; color: #64748b; margin-top: 12px; padding: 8px 20px;
    border: 1px solid rgba(255,255,255,0.08); }
</style></head>
<body><div class="container">
  <div class="icon">⚠️</div>
  <h1>Can't Connect</h1>
  <p class="msg">VoiceWave couldn't reach the server. This usually means you're offline or the server is down.</p>
  <div class="detail">${errorMsg}</div>
  <button onclick="location.href='${SERVER_URL}/app'">Try Again</button><br>
  <button class="quit-btn" onclick="window.close()">Quit</button>
</div></body></html>`;
}

// ── Load server URL with retry ──
function loadWithRetry(win, url, attempt = 1) {
  currentLoadIsRetrying = true;
  // Render's edge can hold the connection open and eventually respond
  // successfully after 30-90s on a cold dyno — no loadURL rejection ever
  // fires in that case, so there's nothing for .catch() to react to. This
  // watchdog keeps the user honestly informed while that's happening.
  const watchdog = setTimeout(() => {
    win.webContents.executeJavaScript(`
      try { document.getElementById('status').textContent = 'Server is waking up — this can take up to a minute…'; } catch(e) {}
    `).catch(() => {});
  }, 6000);
  const watchdogLong = setTimeout(() => {
    win.webContents.executeJavaScript(`
      try { document.getElementById('status').textContent = 'Still waking up — free-tier cold starts can take up to 2 minutes…'; } catch(e) {}
    `).catch(() => {});
  }, 35000);

  win.loadURL(url).then(() => {
    currentLoadIsRetrying = false;
  }).catch((err) => {
    if (attempt < MAX_RETRIES) {
      win.webContents.executeJavaScript(`
        try {
          document.getElementById('status').textContent = 'Retrying... (${attempt}/${MAX_RETRIES})';
        } catch(e) {}
      `).catch(() => {});
      setTimeout(() => loadWithRetry(win, url, attempt + 1), RETRY_DELAYS[attempt - 1]);
    } else {
      // All retries failed — show error page
      currentLoadIsRetrying = false;
      win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getErrorHTML(err.message || 'Server unreachable'))}`);
    }
  }).finally(() => { clearTimeout(watchdog); clearTimeout(watchdogLong); });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
      allowRunningInsecureContent: false,
      spellcheck: false,
      // Chromium throttles renderer timers (setInterval/rAF) when the window
      // is unfocused or hidden — that includes alt-tab and "minimize to
      // tray". Without this, the 100ms speaking-indicator poll freezes even
      // though WebRTC audio (separate threads) keeps flowing fine.
      backgroundThrottling: false
    },
    backgroundColor: '#060a12',
    show: false
  });

  // Show loading screen first, then load the actual app
  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getLoadingHTML())}`);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // Now try loading the actual server URL
    loadWithRetry(mainWindow, `${SERVER_URL}/app`);
  });

  // Handle page load failures (network errors, DNS failures, etc.)
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    // Ignore aborted loads (e.g. user navigated away) and data: URLs
    if (errorCode === -3 || validatedURL.startsWith('data:')) return;
    // loadWithRetry fires on this same failure via its own .catch() — if
    // it's mid-attempt, let IT decide (retry or show the error page) instead
    // of both handlers racing to navigate and flickering error→loading→error.
    if (currentLoadIsRetrying) return;
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getErrorHTML(`${errorDescription} (code: ${errorCode})`))}`);
  });

  // The error page's "Try Again" button does a plain navigation to the app
  // URL — intercept it and route through loadWithRetry instead of a single
  // bare attempt, so a manual retry gets the same backoff/runway as the
  // initial launch rather than bouncing straight back to the error page.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url === `${SERVER_URL}/app`) {
      event.preventDefault();
      mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getLoadingHTML())}`);
      loadWithRetry(mainWindow, url);
    }
  });

  // Handle certificate errors (common on corporate networks)
  mainWindow.webContents.on('certificate-error', (event, url, error, certificate, callback) => {
    event.preventDefault();
    callback(true);
  });

  mainWindow.on('close', (e) => {
    if (tray) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── Focus existing window if second instance is launched ──
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray.png');
  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 32, height: 32 });
  } catch {
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('VoiceWave');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open VoiceWave',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: isMuted ? 'Unmute' : 'Mute',
      click: () => {
        isMuted = !isMuted;
        if (mainWindow) {
          mainWindow.webContents.send('tray-mute-toggle');
        }
        updateTrayMenu();
      }
    },
    {
      label: isDeafened ? 'Undeafen' : 'Deafen',
      click: () => {
        isDeafened = !isDeafened;
        if (mainWindow) {
          mainWindow.webContents.send('tray-deafen-toggle');
        }
        updateTrayMenu();
      }
    },
    { type: 'separator' },
    {
      label: 'Leave Room',
      click: () => {
        if (mainWindow) {
          mainWindow.webContents.send('tray-leave-room');
        }
      },
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        tray.destroy();
        tray = null;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function updateTrayMenu() {
  if (!tray) return;
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open VoiceWave',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: isMuted ? 'Unmute' : 'Mute',
      click: () => {
        isMuted = !isMuted;
        if (mainWindow) mainWindow.webContents.send('tray-mute-toggle');
        updateTrayMenu();
      }
    },
    {
      label: isDeafened ? 'Undeafen' : 'Deafen',
      click: () => {
        isDeafened = !isDeafened;
        if (mainWindow) mainWindow.webContents.send('tray-deafen-toggle');
        updateTrayMenu();
      }
    },
    { type: 'separator' },
    {
      label: 'Leave Room',
      click: () => {
        if (mainWindow) mainWindow.webContents.send('tray-leave-room');
      },
      enabled: inRoom
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        tray.destroy();
        tray = null;
        app.quit();
      }
    }
  ]);
  tray.setContextMenu(contextMenu);
}

ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.on('update-mute-state', (event, muted) => {
  isMuted = muted;
  updateTrayMenu();
});

ipcMain.on('update-deafen-state', (event, deafened) => {
  isDeafened = deafened;
  updateTrayMenu();
});

ipcMain.on('update-room-state', (event, inRoomState) => {
  inRoom = inRoomState;
  updateTrayMenu();
});

// ── SCREEN SHARE (desktop only) ──
// Holds the source the user picked in the renderer's custom picker,
// consumed by setDisplayMediaRequestHandler when getDisplayMedia() is called.
let pendingScreenShare = null; // { sourceId, withAudio }

ipcMain.handle('get-screen-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: 180 },
    fetchWindowIcons: true
  });
  return sources.map(s => ({
    id: s.id,
    name: s.name,
    isScreen: s.id.startsWith('screen'),
    thumbnail: s.thumbnail.isEmpty() ? null : s.thumbnail.toDataURL(),
    appIcon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : null
  }));
});

ipcMain.on('select-screen-source', (event, payload) => {
  pendingScreenShare = payload; // { sourceId, withAudio }
});

// OS-level notification (renderer stays informed even when minimized to tray)
ipcMain.on('show-notification', (event, { title, body }) => {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, icon: path.join(__dirname, 'assets', 'icon.png') });
  n.on('click', () => {
    if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
  });
  n.show();
});

// Windows mic privacy status — lets the renderer show a helpful hint
ipcMain.handle('get-mic-access-status', () => {
  try {
    return systemPreferences.getMediaAccessStatus('microphone');
  } catch {
    return 'unknown';
  }
});

// One click to the exact OS panel instead of "go dig through Settings yourself"
ipcMain.on('open-mic-settings', () => {
  const deepLink = process.platform === 'darwin'
    ? 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone'
    : 'ms-settings:privacy-microphone';
  shell.openExternal(deepLink).catch(() => {});
});

// ── AUTO UPDATER ──
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.logger = console;
autoUpdater.requestHeaders = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  'Pragma': 'no-cache'
};
autoUpdater.setFeedURL({
  provider: 'github',
  owner: 'shaswatxd',
  repo: 'voicewave',
  releaseType: 'release'
});

function setupAutoUpdater() {
  autoUpdater.on('checking-for-update', () => {
    if (mainWindow) mainWindow.webContents.send('update-status', { status: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    if (mainWindow) mainWindow.webContents.send('update-status', { status: 'available', version: info.version });
  });

  autoUpdater.on('update-not-available', () => {
    if (mainWindow) mainWindow.webContents.send('update-status', { status: 'up-to-date' });
  });

  autoUpdater.on('download-progress', (progress) => {
    if (mainWindow) mainWindow.webContents.send('update-status', { status: 'downloading', percent: Math.round(progress.percent) });
  });

  autoUpdater.on('update-downloaded', () => {
    if (mainWindow) mainWindow.webContents.send('update-status', { status: 'ready' });
  });

  autoUpdater.on('error', (err) => {
    console.error('[VoiceWave] AutoUpdater Error:', err);
    if (mainWindow) mainWindow.webContents.send('update-status', { status: 'error', message: err ? err.message : 'Unknown error' });
  });

  setTimeout(() => { autoUpdater.checkForUpdates().catch(() => {}); }, 5000);
}

ipcMain.on('check-for-updates', () => {
  autoUpdater.checkForUpdates().catch(() => {});
});

ipcMain.on('install-update', () => {
  setImmediate(() => {
    autoUpdater.quitAndInstall(false, false);
    setTimeout(() => { app.exit(0); }, 2000);
  });
});

ipcMain.on('download-update', () => {
  autoUpdater.downloadUpdate().catch(() => {});
});

// ── Catch unhandled errors (prevent silent crashes) ──
process.on('uncaughtException', (err) => {
  console.error('[VoiceWave] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[VoiceWave] Unhandled Rejection:', reason);
});

app.whenReady().then(() => {
  // Grant all media-related permissions automatically
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const allowed = ['media', 'microphone', 'camera', 'notifications', 'mediaKeySystem', 'audioCapture', 'display-capture'];
    if (allowed.includes(permission)) {
      callback(true);
    } else {
      callback(false);
    }
  });

  // Serve getDisplayMedia() with the source the user picked in our custom picker.
  // 'loopback' captures system audio (Windows only).
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      const pick = pendingScreenShare;
      pendingScreenShare = null;
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
      let source = pick ? sources.find(s => s.id === pick.sourceId) : null;
      if (!source) source = sources.find(s => s.id.startsWith('screen')) || sources[0];
      if (!source) return callback({});
      const wantAudio = pick ? !!pick.withAudio : false;
      callback({ video: source, audio: (wantAudio && process.platform === 'win32') ? 'loopback' : undefined });
    } catch (err) {
      console.error('[VoiceWave] DisplayMedia handler error:', err);
      callback({});
    }
  });

  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    // Allow all permission checks (especially media/microphone)
    return true;
  });

  // Handle media access requests from the renderer (Chromium-level)
  session.defaultSession.setDevicePermissionHandler((details) => {
    // Allow all device access (microphone, camera, etc.)
    return true;
  });

  createWindow();
  createTray();
  setupAutoUpdater();

  // Register Global Hotkeys
  globalShortcut.register('CommandOrControl+Shift+M', () => {
    if (mainWindow) mainWindow.webContents.send('tray-mute-toggle');
  });
  globalShortcut.register('CommandOrControl+Shift+D', () => {
    if (mainWindow) mainWindow.webContents.send('tray-deafen-toggle');
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  if (tray) {
    tray.destroy();
    tray = null;
  }
  app.quit();
});
