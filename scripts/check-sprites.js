// Dev check: unpacks the AVIF sprites exactly like the app does and compares them with the PNG sources.
// usage: electron scripts/check-sprites.js [avatarId]
const path = require('path');
const { app, BrowserWindow } = require('electron');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false });
  await win.loadFile(path.join(__dirname, 'check-sprites.html'));
  const rows = await win.webContents.executeJavaScript(`check(${JSON.stringify(process.argv[2] || 'lavender')})`);
  console.log(rows.join('\n'));
  app.exit(0);
}).catch((e) => { console.error(e); app.exit(1); });
