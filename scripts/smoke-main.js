// Dev smoke test: starts the real app, triggers a reminder and saves screenshots of the overlay
// at several moments plus the settings window, then quits.
const path = require('path');
const fs = require('fs');
const { app, BrowserWindow } = require('electron');
const out = process.env.SMOKE_OUT || path.join(__dirname, '..', 'smoke');
fs.mkdirSync(out, { recursive: true });
app.setPath('userData', path.join(out, 'userdata'));
require('../src/main.js');
const shots = [1500, 3200, 4600, 6500];
app.whenReady().then(() => {
  const wins = () => BrowserWindow.getAllWindows();
  shots.forEach((t, i) => setTimeout(async () => {
    for (const w of wins()) {
      if (!w.isVisible()) continue;
      const img = await w.webContents.capturePage();
      const name = w.getTitle().includes('Settings') ? 'settings' : `overlay_${i}`;
      if (name === 'settings' && i !== 3) continue;
      fs.writeFileSync(path.join(out, `${name}.png`), img.toPNG());
    }
  }, 2500 + t));
  setTimeout(() => { app.isQuitting = true; app.exit(0); }, 2500 + 8000);
});
