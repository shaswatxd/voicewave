const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } = require('electron');
const path = require('path');

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
      webSecurity: true
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

app.whenReady().then(() => {
  createWindow();
  createTray();

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
