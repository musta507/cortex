const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('cortexApp', {
  isApp: true,
  readDatos: () => ipcRenderer.invoke('cx:readDatos'),
  info: () => ipcRenderer.invoke('cx:info'),
  openFolder: p => ipcRenderer.invoke('cx:openFolder', p),
});
