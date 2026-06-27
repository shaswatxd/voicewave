const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  updateMuteState: (muted) => ipcRenderer.send('update-mute-state', muted),
  updateDeafenState: (deafened) => ipcRenderer.send('update-deafen-state', deafened),
  updateRoomState: (inRoom) => ipcRenderer.send('update-room-state', inRoom),
  onTrayMuteToggle: (callback) => { ipcRenderer.removeAllListeners('tray-mute-toggle'); ipcRenderer.on('tray-mute-toggle', callback); },
  onTrayDeafenToggle: (callback) => { ipcRenderer.removeAllListeners('tray-deafen-toggle'); ipcRenderer.on('tray-deafen-toggle', callback); },
  onTrayLeaveRoom: (callback) => { ipcRenderer.removeAllListeners('tray-leave-room'); ipcRenderer.on('tray-leave-room', callback); },
  isElectron: true
});
