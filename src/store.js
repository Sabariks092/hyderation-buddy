// Tiny JSON settings store kept in the user's app-data folder.
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULTS = {
  enabled: true,
  intervalMinutes: 30,
  autoStart: true,
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
    this.state = this._read(this.stateFile, { lastAvatar: null, lastMessage: null, avatarSeq: 0, messageSeq: 0, stats: { date: '', count: 0 } });
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
  addDrink() {
    const d = new Date().toDateString();
    if (this.state.stats.date !== d) this.state.stats = { date: d, count: 0 };
    this.state.stats.count++;
    this.saveState();
    return this.state.stats.count;
  }
}
module.exports = { Store, DEFAULTS };
