const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, session, globalShortcut } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

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

const SERVER_URL = 'https://voicewave-production-289f.up.railway.app';
const MAX_RETRIES = 3;
const RETRY_DELAY = 3000;

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
  .logo {
    width: 80px; height: 80px; margin: 0 auto 24px;
    background: linear-gradient(135deg, #22d3ee, #a855f7);
    border-radius: 20px; display: flex; align-items: center; justify-content: center;
    font-size: 36px; font-weight: bold; color: #000;
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
  <div class="logo">W</div>
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
  <button onclick="window.location.reload()">Try Again</button><br>
  <button class="quit-btn" onclick="window.close()">Quit</button>
</div></body></html>`;
}

// ── Load server URL with retry ──
function loadWithRetry(win, url, attempt = 1) {
  win.loadURL(url).catch((err) => {
    if (attempt < MAX_RETRIES) {
      // Update loading screen status
      win.webContents.executeJavaScript(`
        try {
          document.getElementById('status').textContent = 'Retrying... (${attempt}/${MAX_RETRIES})';
        } catch(e) {}
      `).catch(() => {});
      setTimeout(() => loadWithRetry(win, url, attempt + 1), RETRY_DELAY);
    } else {
      // All retries failed — show error page
      win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getErrorHTML(err.message || 'Server unreachable'))}`);
    }
  });
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
      spellcheck: false
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
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getErrorHTML(`${errorDescription} (code: ${errorCode})`))}`);
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
    trayIcon = nativeImage.createFromPath(iconPath);
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

// ── AUTO UPDATER ──
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

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

  autoUpdater.on('error', () => {
    if (mainWindow) mainWindow.webContents.send('update-status', { status: 'error' });
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
    const allowed = ['media', 'microphone', 'camera', 'notifications', 'mediaKeySystem', 'audioCapture'];
    if (allowed.includes(permission)) {
      callback(true);
    } else {
      callback(false);
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
