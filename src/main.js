// Hydration Buddy - main process
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, powerMonitor } = require('electron');
const path = require('path');
const { Store, DEFAULTS } = require('./store');
const DEFAULT_MESSAGES = require('./messages');
const manifest = require('./assets/generated/manifest.json');

const APP_ID = 'com.hydrationbuddy.app';
const LOGIN_NAME = 'HydrationBuddy';
const SIZE_SCALE = { small: 0.6, medium: 0.8, large: 1.0 };
const ASSETS = path.join(__dirname, 'assets', 'generated');

let store, tray, settingsWin = null, overlayWin = null;
let timer = null, nextAt = null, pausedUntil = null, activeReminder = false, locked = false;

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.on('second-instance', () => openSettings());
app.setAppUserModelId(APP_ID);

// ------------------------------------------------------------------ auto start
function applyAutoStart() {
  if (!app.isPackaged) return; // register electron.exe while developing
  app.setLoginItemSettings({
    openAtLogin: !!store.get().autoStart,
    path: process.execPath,
    args: ['--hidden'],
    name: LOGIN_NAME,
  });
}

// ------------------------------------------------------------------ scheduling
function schedule(ms) {
  clearTimeout(timer);
  const s = store.get();
  if (!s.enabled) { nextAt = null; updateTray(); return; }
  const delay = ms ?? Math.max(1, Number(s.intervalMinutes) || 30) * 60 * 1000;
  nextAt = Date.now() + delay;
  timer = setTimeout(onTimer, delay);
  updateTray();
}
function inQuietHours() {
  const q = store.get().quietHours;
  if (!q || !q.enabled) return false;
  const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return (h || 0) * 60 + (m || 0); };
  const now = new Date(), cur = now.getHours() * 60 + now.getMinutes();
  const a = toMin(q.start), b = toMin(q.end);
  return a <= b ? cur >= a && cur < b : cur >= a || cur < b;
}
function onTimer() {
  if (pausedUntil && Date.now() < pausedUntil) return schedule(pausedUntil - Date.now());
  pausedUntil = null;
  if (locked || inQuietHours()) return schedule();
  showReminder(false);
  schedule();
}

// ------------------------------------------------------------------ choosing avatar & message
function messagePool() {
  const s = store.get();
  const custom = (s.customMessages || []).map((m) => String(m).trim()).filter(Boolean);
  const pool = [...(s.useDefaultMessages || !custom.length ? DEFAULT_MESSAGES : []), ...custom];
  return pool.length ? pool : DEFAULT_MESSAGES;
}
function pickNoRepeat(list, last) {
  if (list.length <= 1) return list[0];
  const opts = list.filter((x) => x !== last);
  return opts[Math.floor(Math.random() * opts.length)];
}
function chooseAvatar() {
  const s = store.get(), st = store.state;
  const all = manifest.avatars.map((a) => a.id);
  let enabled = (s.enabledAvatars || []).filter((id) => all.includes(id));
  if (!enabled.length) enabled = all;
  let id;
  if (s.avatarMode === 'fixed' && all.includes(s.fixedAvatar)) id = s.fixedAvatar;
  else if (s.avatarMode === 'sequence') id = enabled[(st.avatarSeq++) % enabled.length];
  else id = pickNoRepeat(enabled, st.lastAvatar);
  st.lastAvatar = id;
  return id;
}
function chooseMessage() {
  const s = store.get(), st = store.state;
  const pool = messagePool();
  let msg;
  if (s.messageMode === 'fixed') msg = pool[Math.min(pool.length - 1, Math.max(0, s.fixedMessage | 0))];
  else if (s.messageMode === 'sequence') msg = pool[(st.messageSeq++) % pool.length];
  else msg = pickNoRepeat(pool, st.lastMessage);
  st.lastMessage = msg;
  return msg;
}

// ------------------------------------------------------------------ overlay
function overlayBounds(scale) {
  const point = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(point);
  const wa = display.workArea;
  const width = Math.min(wa.width, Math.round(980 * Math.max(scale, 0.7)));
  const height = Math.min(wa.height, Math.round(manifest.frameH * scale + 190));
  return { x: wa.x + wa.width - width, y: wa.y + wa.height - height, width, height };
}
function ensureOverlay() {
  if (overlayWin && !overlayWin.isDestroyed()) return overlayWin;
  overlayWin = new BrowserWindow({
    width: 900, height: 500, show: false, frame: false, transparent: true, resizable: false,
    movable: false, minimizable: false, maximizable: false, skipTaskbar: true, focusable: false,
    alwaysOnTop: true, hasShadow: false, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  overlayWin.setAlwaysOnTop(true, 'screen-saver');
  overlayWin.setIgnoreMouseEvents(true, { forward: true });
  overlayWin.loadFile(path.join(__dirname, 'overlay', 'overlay.html'));
  overlayWin.on('closed', () => { overlayWin = null; activeReminder = false; });
  return overlayWin;
}
function showReminder(isPreview) {
  if (activeReminder) return;
  activeReminder = true;
  const s = store.get();
  const scale = SIZE_SCALE[s.size] || 0.8;
  const job = {
    avatar: chooseAvatar(),
    message: chooseMessage(),
    steps: Math.max(1, Math.min(12, s.steps | 0 || 5)),
    scale,
    autoDismissSeconds: Math.max(0, Number(s.autoDismissSeconds) || 0),
    snoozeMinutes: s.snoozeMinutes,
    sound: !!s.sound,
    preview: !!isPreview,
    today: store.todayCount(),
  };
  store.saveState();
  const win = ensureOverlay();
  win.setBounds(overlayBounds(scale));
  const send = () => { win.showInactive(); win.webContents.send('overlay:play', job); };
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', send); else send();
}
function hideOverlay() {
  activeReminder = false;
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.setIgnoreMouseEvents(true, { forward: true });
    overlayWin.hide();
  }
}

ipcMain.on('overlay:interactive', (_e, on) => {
  if (overlayWin && !overlayWin.isDestroyed()) overlayWin.setIgnoreMouseEvents(!on, { forward: true });
});
ipcMain.on('overlay:respond', (_e, action) => {
  if (action === 'drank') { store.addDrink(); schedule(); }
  else if (action === 'snooze') schedule(Math.max(1, Number(store.get().snoozeMinutes) || 10) * 60 * 1000);
  sendStatus();
});
ipcMain.on('overlay:finished', hideOverlay);

// ------------------------------------------------------------------ settings window
function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.show(); settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 900, height: 760, minWidth: 720, minHeight: 600, show: false, autoHideMenuBar: true,
    title: 'Hydration Buddy – Settings', icon: path.join(ASSETS, 'icon.png'), backgroundColor: '#f3f8fc',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  settingsWin.loadFile(path.join(__dirname, 'settings', 'settings.html'));
  settingsWin.once('ready-to-show', () => settingsWin.show());
  settingsWin.on('closed', () => { settingsWin = null; });
}
function status() {
  return { nextAt, pausedUntil, today: store.todayCount(), enabled: store.get().enabled, isPackaged: app.isPackaged };
}
function sendStatus() {
  if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('status', status());
  updateTray();
}
ipcMain.handle('settings:get', () => ({ settings: store.get(), manifest: { avatars: manifest.avatars }, defaultMessages: DEFAULT_MESSAGES, status: status() }));
ipcMain.handle('settings:defaults', () => DEFAULTS);
ipcMain.handle('settings:save', (_e, patch) => {
  const before = store.get();
  const after = store.set(patch || {});
  if (before.autoStart !== after.autoStart) applyAutoStart();
  if (before.intervalMinutes !== after.intervalMinutes || before.enabled !== after.enabled) schedule();
  sendStatus();
  return after;
});
ipcMain.handle('reminder:preview', () => { showReminder(true); return true; });

// ------------------------------------------------------------------ tray
function fmtTime(t) { return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
function updateTray() {
  if (!tray) return;
  const s = store.get();
  const paused = pausedUntil && Date.now() < pausedUntil;
  const tip = !s.enabled ? 'Hydration Buddy – reminders off'
    : paused ? `Hydration Buddy – paused until ${fmtTime(pausedUntil)}`
      : nextAt ? `Hydration Buddy – next reminder at ${fmtTime(nextAt)}` : 'Hydration Buddy';
  tray.setToolTip(`${tip}\nGlasses today: ${store.todayCount()}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: nextAt && s.enabled ? `Next reminder: ${fmtTime(paused ? pausedUntil : nextAt)}` : 'Reminders are off', enabled: false },
    { label: `Glasses today: ${store.todayCount()}`, enabled: false },
    { type: 'separator' },
    { label: 'Remind me now', click: () => showReminder(true) },
    { label: 'I just drank water 💧', click: () => { store.addDrink(); schedule(); sendStatus(); } },
    paused
      ? { label: 'Resume reminders', click: () => { pausedUntil = null; schedule(); } }
      : { label: 'Pause for 1 hour', enabled: s.enabled, click: () => { pausedUntil = Date.now() + 3600e3; schedule(3600e3); } },
    { label: s.enabled ? 'Turn reminders off' : 'Turn reminders on', click: () => { store.set({ enabled: !s.enabled }); schedule(); sendStatus(); } },
    { type: 'separator' },
    { label: 'Settings…', click: openSettings },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]));
}
function createTray() {
  const img = nativeImage.createFromPath(path.join(ASSETS, 'tray.png'));
  img.addRepresentation({ scaleFactor: 2, buffer: require('fs').readFileSync(path.join(ASSETS, 'tray@2x.png')) });
  tray = new Tray(img);
  tray.on('click', openSettings);
  updateTray();
}

// ------------------------------------------------------------------ lifecycle
app.whenReady().then(() => {
  store = new Store();
  const s = store.get();
  const first = !s.firstRunDone;
  if (first) store.set({ firstRunDone: true, autoStart: true });
  applyAutoStart();
  createTray();
  ensureOverlay();
  schedule();
  powerMonitor.on('lock-screen', () => { locked = true; });
  powerMonitor.on('unlock-screen', () => { locked = false; });
  powerMonitor.on('resume', () => schedule());
  const hidden = process.argv.includes('--hidden');
  if (first) {
    openSettings();
    setTimeout(() => showReminder(true), 2500); // say hello right after installation
  } else if (!hidden) openSettings();
  setInterval(updateTray, 60 * 1000);
});
app.on('window-all-closed', (e) => { /* keep running in the tray */ });
