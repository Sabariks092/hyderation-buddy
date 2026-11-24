const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('hydra', {
  // settings window
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (patch) => ipcRenderer.invoke('settings:save', patch),
  getDefaults: () => ipcRenderer.invoke('settings:defaults'),
  previewNow: () => ipcRenderer.invoke('reminder:preview'),
  getStatus: () => ipcRenderer.invoke('status:get'),
  resetToday: () => ipcRenderer.invoke('stats:resetToday'),
  onStatus: (cb) => ipcRenderer.on('status', (_e, s) => cb(s)),
  // overlay window
  onPlay: (cb) => ipcRenderer.on('overlay:play', (_e, job) => cb(job)),
  onLeave: (cb) => ipcRenderer.on('overlay:leave', (_e, action) => cb(action)),
  onHover: (cb) => ipcRenderer.on('overlay:hover', (_e, on) => cb(on)),
  showBubble: (anchor) => ipcRenderer.send('overlay:showBubble', anchor),
  hideBubble: () => ipcRenderer.send('overlay:hideBubble'),
  // bubble window
  onBubbleJob: (cb) => ipcRenderer.on('bubble:job', (_e, job) => cb(job)),
  onBubbleShow: (cb) => ipcRenderer.on('bubble:show', () => cb()),
  onBubbleHide: (cb) => ipcRenderer.on('bubble:hide', () => cb()),
  bubbleReady: (size) => ipcRenderer.send('bubble:ready', size),
  bubbleHover: (on) => ipcRenderer.send('bubble:hover', on),
  respond: (action) => ipcRenderer.send('overlay:respond', action),
  finished: () => ipcRenderer.send('overlay:finished'),
});
