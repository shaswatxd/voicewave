const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  updateMuteState: (muted) => ipcRenderer.send('update-mute-state', muted),
  updateDeafenState: (deafened) => ipcRenderer.send('update-deafen-state', deafened),
  updateRoomState: (inRoom) => ipcRenderer.send('update-room-state', inRoom),
  getScreenSources: () => ipcRenderer.invoke('get-screen-sources'),
  selectScreenSource: (sourceId, withAudio) => ipcRenderer.send('select-screen-source', { sourceId, withAudio }),
  getMicAccessStatus: () => ipcRenderer.invoke('get-mic-access-status'),
  openMicSettings: () => ipcRenderer.send('open-mic-settings'),
  checkForUpdates: () => ipcRenderer.send('check-for-updates'),
  downloadUpdate: () => ipcRenderer.send('download-update'),
  installUpdate: () => ipcRenderer.send('install-update'),
  onUpdateStatus: (callback) => { ipcRenderer.removeAllListeners('update-status'); ipcRenderer.on('update-status', (e, data) => callback(data)); },
  onTrayMuteToggle: (callback) => { ipcRenderer.removeAllListeners('tray-mute-toggle'); ipcRenderer.on('tray-mute-toggle', callback); },
  onTrayDeafenToggle: (callback) => { ipcRenderer.removeAllListeners('tray-deafen-toggle'); ipcRenderer.on('tray-deafen-toggle', callback); },
  onTrayLeaveRoom: (callback) => { ipcRenderer.removeAllListeners('tray-leave-room'); ipcRenderer.on('tray-leave-room', callback); },
  isElectron: true
});
