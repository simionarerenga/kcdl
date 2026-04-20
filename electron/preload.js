// electron/preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  backupData: (jsonData) => ipcRenderer.invoke('backup-data', jsonData),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  isElectron: true,
});
