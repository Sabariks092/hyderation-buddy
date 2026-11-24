// End-to-end check of a fresh install launch + a REAL OS mouse click on the reminder bubble.
// 1. fresh profile with a name -> app must start silently (no settings window)
// 2. the first-run greeting appears; we screenshot it
// 3. the real cursor is moved onto "I drank it" and clicked via user32 (a guard window behind
//    the overlay records the click if it falls through)
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { app, BrowserWindow, ipcMain, screen } = require('electron');
const out = process.env.SMOKE_OUT || path.join(__dirname, '..', 'smoke');
fs.rmSync(path.join(out, 'userdata'), { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'userdata'), { recursive: true });
fs.writeFileSync(path.join(out, 'userdata', 'settings.json'), JSON.stringify({ userName: 'Sam', steps: 3 }));
app.setPath('userData', path.join(out, 'userdata'));
require('../src/main.js');
const T0 = Date.now(); const log = (...a) => console.log('[test]', ((Date.now() - T0) / 1000).toFixed(2), ...a);
let responded = null;
ipcMain.on('overlay:respond', (_e, a) => { responded = a; log('overlay responded:', a); });

app.whenReady().then(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(2500);
  const visible = BrowserWindow.getAllWindows().filter((w) => w.isVisible()).map((w) => w.getTitle());
  log('visible windows right after launch:', JSON.stringify(visible));
  // wait for the bubble
  let overlay, rect;
  for (let i = 0; i < 60; i++) {
    await wait(250);
    overlay = BrowserWindow.getAllWindows().find((w) => !w.getTitle().includes('Settings') && w.isVisible() && w.getTitle() !== 'guard');
    if (!overlay) continue;
    rect = await overlay.webContents.executeJavaScript(`(() => { const b = document.getElementById('bubble'); if (b.classList.contains('hidden')) return null; const r = document.getElementById('drank').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, hi: document.getElementById('hiName').textContent, msg: document.getElementById('msg').textContent }; })()`);
    if (rect) break;
  }
  if (!rect) { log('FAIL: bubble never appeared'); return app.exit(1); }
  await wait(600);
  const img = await overlay.webContents.capturePage();
  fs.writeFileSync(path.join(out, 'bubble.png'), img.toPNG());
  log('greeting:', rect.hi, '| message:', rect.msg);
  const px = await overlay.webContents.executeJavaScript(`(() => { const c = document.getElementById('stage'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let k = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 200) k++; return k; })()`);
  const ft = await overlay.webContents.executeJavaScript(`new Promise((res) => { const t = []; let last = performance.now(); const tick = (now) => { t.push(now - last); last = now; if (t.length < 60) requestAnimationFrame(tick); else res({ avg: t.reduce((a, b) => a + b) / t.length, max: Math.max(...t) }); }; requestAnimationFrame(tick); })`);
  log('frame time ms:', JSON.stringify(ft));
  log(px > 5000 ? 'PASS' : 'FAIL', 'character drawn, opaque pixels:', px);
  overlay.webContents.on('console-message', (_e, _l, m) => log('overlay:', m));
  await overlay.webContents.executeJavaScript(`['mousemove','mousedown','mouseup','click'].forEach((t) => document.addEventListener(t, (e) => { if (t !== 'mousemove' || !window.__mv) { window.__mv = t === 'mousemove'; console.log(t, e.clientX, e.clientY, e.target.id || e.target.tagName, Date.now() % 100000); } }, true)); 1`);
  const b = overlay.getBounds();
  // guard window under the overlay to catch fall-through clicks
  const guard = new BrowserWindow({ ...b, frame: false, title: 'guard', show: false, skipTaskbar: true, backgroundColor: '#ffeeee' });
  await guard.loadURL('data:text/html,<title>guard</title><script>document.onmousedown=()=>{document.title="guard-clicked"}</script>');
  guard.showInactive();
  await wait(400);
  const target = { x: Math.round(b.x + rect.x), y: Math.round(b.y + rect.y) };
  const psRun = (body) => new Promise((res) => execFile('powershell', ['-NoProfile', '-Command', `Add-Type @'
using System; using System.Runtime.InteropServices;
public class M { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
[DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
[DllImport("user32.dll")] public static extern void mouse_event(int f,int x,int y,int d,int e); }
'@
[M]::SetProcessDPIAware() | Out-Null; ${body}`], res));
  // closed-loop aim: move, read back the cursor in DIPs, correct
  let phys = screen.dipToScreenPoint(target);
  for (let k = 0; k < 3; k++) {
    await psRun(`[M]::SetCursorPos(${phys.x},${phys.y}) | Out-Null`);
    const cur = screen.getCursorScreenPoint();
    const ex = target.x - cur.x, ey = target.y - cur.y;
    log('aim', k, 'cursor', JSON.stringify(cur), 'target', JSON.stringify(target));
    if (Math.abs(ex) <= 2 && Math.abs(ey) <= 2) break;
    const sf = screen.getDisplayNearestPoint(target).scaleFactor;
    phys = { x: Math.round(phys.x + ex * sf), y: Math.round(phys.y + ey * sf) };
  }
  await wait(300);
  log('click');
  await psRun('[M]::mouse_event(2,0,0,0,0); Start-Sleep -Milliseconds 60; [M]::mouse_event(4,0,0,0,0)');
  await wait(1200);
  log('guard window title after click:', guard.getTitle());
  log(responded === 'drank' ? 'PASS: button click reached the app' : 'FAIL: click did not reach the button');
  await wait(7000);
  const vis = overlay.isVisible();
  log('overlay still visible after walking away:', vis);
  guard.destroy();
  app.exit(responded === 'drank' ? 0 : 1);
});
