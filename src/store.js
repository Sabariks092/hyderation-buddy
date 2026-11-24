// Tiny JSON settings store kept in the user's app-data folder.
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULTS = {
  enabled: true,
  intervalMinutes: 30,
  autoStart: true,            // start with Windows
  autoLaunch: true,           // launch silently in the tray (no window) and start reminding
  userName: '',
  quietHours: { enabled: false, start: '22:00', end: '08:00' },
  avatarMode: 'random',        // random | sequence | fixed
  fixedAvatar: 'lavender',
  enabledAvatars: ['lavender', 'ruby', 'scarlet', 'pearl', 'mint'],
  messageMode: 'random',       // random | sequence | fixed
  fixedMessage: 0,
  useDefaultMessages: true,
  customMessages: [],
  steps: 5,
  size: 'medium',              // small | medium | large
  autoDismissSeconds: 45,      // 0 = stay until clicked
  snoozeMinutes: 10,
  sound: true,
  firstRunDone: false,
};

class Store {
  constructor() {
    this.file = path.join(app.getPath('userData'), 'settings.json');
    this.stateFile = path.join(app.getPath('userData'), 'state.json');
    this.data = this._read(this.file, DEFAULTS);
    this.state = this._read(this.stateFile, { lastAvatar: null, lastMessage: null, avatarSeq: 0, messageSeq: 0, stats: { date: '', count: 0 }, history: {} });
  }
  _read(file, defaults) {
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      return { ...JSON.parse(JSON.stringify(defaults)), ...raw };
    } catch { return JSON.parse(JSON.stringify(defaults)); }
  }
  _write(file, obj) {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file + '.tmp', JSON.stringify(obj, null, 2));
      fs.renameSync(file + '.tmp', file);
    } catch (e) { console.error('save failed', e); }
  }
  get() { return this.data; }
  set(patch) { this.data = { ...this.data, ...patch }; this._write(this.file, this.data); return this.data; }
  saveState() { this._write(this.stateFile, this.state); }
  todayCount() {
    const d = new Date().toDateString();
    return this.state.stats.date === d ? this.state.stats.count : 0;
  }
  // `stats` is today's running count; `history` keeps one total per day ("YYYY-MM-DD") for the dashboard
  _setToday(count) {
    const now = new Date();
    this.state.stats = { date: now.toDateString(), count };
    const h = { ...(this.state.history || {}), [dayKey(now)]: count };
    const keep = Object.keys(h).sort().slice(-HISTORY_DAYS);
    this.state.history = Object.fromEntries(keep.map((k) => [k, h[k]]));
    this.saveState();
    return count;
  }
  addDrink() { return this._setToday(this.todayCount() + 1); }
  resetToday() { return this._setToday(0); }
  // the last `days` days, oldest first, ending today
  history(days = 7) {
    const h = this.state.history || {}, out = [], now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      out.push({ date: dayKey(d), count: i === 0 ? this.todayCount() : Math.max(0, h[dayKey(d)] | 0) });
    }
    return out;
  }
}
const HISTORY_DAYS = 366;
function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
module.exports = { Store, DEFAULTS };
