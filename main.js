const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, session } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('enable-media-stream');

let mainWindow;
let tray;
let isMuted = false;
let isDeafened = false;
let inRoom = false;

const SERVER_URL = 'https://voicewave-production-289f.up.railway.app';

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

  mainWindow.loadURL(`${SERVER_URL}/app`);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
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
      label: 'Toggle Mute',
      click: () => {
        isMuted = !isMuted;
        if (mainWindow) {
          mainWindow.webContents.send('tray-mute-toggle');
        }
        updateTrayMenu();
      }
    },
    {
      label: 'Toggle Deafen',
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
  autoUpdater.quitAndInstall();
});

ipcMain.on('download-update', () => {
  autoUpdater.downloadUpdate().catch(() => {});
});

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = ['media', 'microphone', 'camera', 'notifications', 'mediaKeySystem'];
    if (allowed.includes(permission)) {
      callback(true);
    } else {
      callback(false);
    }
  });

  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    return true;
  });

  createWindow();
  createTray();
  setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (tray) {
    tray.destroy();
    tray = null;
  }
  app.quit();
});
