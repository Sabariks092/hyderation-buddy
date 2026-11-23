const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('hydra', {
  // settings window
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (patch) => ipcRenderer.invoke('settings:save', patch),
  getDefaults: () => ipcRenderer.invoke('settings:defaults'),
  previewNow: () => ipcRenderer.invoke('reminder:preview'),
  onStatus: (cb) => ipcRenderer.on('status', (_e, s) => cb(s)),
  // overlay window
  onPlay: (cb) => ipcRenderer.on('overlay:play', (_e, job) => cb(job)),
  setInteractive: (on) => ipcRenderer.send('overlay:interactive', on),
  respond: (action) => ipcRenderer.send('overlay:respond', action),
  finished: () => ipcRenderer.send('overlay:finished'),
});
