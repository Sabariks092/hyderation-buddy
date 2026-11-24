// Repeated real-mouse click test: plays several reminders in a row and clicks a bubble button in
// each with the OS cursor. A guard window behind the reminder records clicks that fall through.
// usage: electron scripts/smoke-clicks.js   (env: ROUNDS=drank,snooze,close,...  SMOKE_OUT=dir)
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const { app, BrowserWindow, ipcMain, screen } = require('electron');
const out = process.env.SMOKE_OUT || path.join(__dirname, '..', 'smoke');
const ud = path.join(out, 'userdata');
fs.rmSync(ud, { recursive: true, force: true });
fs.mkdirSync(ud, { recursive: true });
fs.writeFileSync(path.join(ud, 'settings.json'), JSON.stringify({ userName: 'Sam KS', steps: 3, size: 'large', sound: false, firstRunDone: true, autoStart: false, autoLaunch: true, autoDismissSeconds: 25, enabled: false }));
app.setPath('userData', ud);
require('../src/main.js');
const T0 = Date.now(), log = (...a) => console.log('[test]', ((Date.now() - T0) / 1000).toFixed(2), ...a);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let responded = null;
ipcMain.on('overlay:respond', (_e, a) => { responded = a; });

// one long-lived PowerShell that drives the real mouse
const ps = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', '-'], { stdio: ['pipe', 'pipe', 'inherit'] });
let buf = '', waiter = null;
ps.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (l.startsWith('>>') && waiter) { const w = waiter; waiter = null; w(l.slice(2)); } } });
const run = (cmd) => new Promise((r) => { waiter = r; ps.stdin.write(`${cmd}\n`); });
const cs = path.join(os.tmpdir(), `hbmouse${process.pid}.cs`);
fs.writeFileSync(cs, `using System; using System.Runtime.InteropServices; using System.Text;
public class M { public struct P { public int X; public int Y; }
[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
[DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
[DllImport("user32.dll")] public static extern bool GetCursorPos(out P p);
[DllImport("user32.dll")] public static extern void mouse_event(int f,int x,int y,int d,int e);
[DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(P p);
[DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h,int f);
[DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h,int i);
[DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
public static string At(){ P p; GetCursorPos(out p); IntPtr h=GetAncestor(WindowFromPoint(p),2); var s=new StringBuilder(200); GetWindowText(h,s,200); return "hwnd="+h+" title='"+s+"' ex=0x"+GetWindowLong(h,-20).ToString("X"); }
public static string Pos(){ P p; GetCursorPos(out p); return p.X+","+p.Y; } }`);

app.whenReady().then(async () => {
  await run(`Add-Type -Path '${cs}'; [void][M]::SetProcessDPIAware(); Write-Output '>>ok'`);
  const home = await run(`Write-Output ('>>' + [M]::Pos())`);
  await wait(1500);
  const rounds = (process.env.ROUNDS || 'drank,drank,snooze,drank,close').split(',');
  const guard = new BrowserWindow({ width: 10, height: 10, frame: false, title: 'guard', show: false, skipTaskbar: true, focusable: false, backgroundColor: '#dfeaf2' });
  guard.setAlwaysOnTop(true, 'floating');
  await guard.loadURL('data:text/html,<title>guard</title><script>document.onmousedown=()=>{document.title="guard-clicked"}</script>');
  // the window that owns the bubble
  const findBubble = async () => {
    for (const w of BrowserWindow.getAllWindows()) {
      if (w === guard || w.isDestroyed() || !w.isVisible()) continue;
      const r = await w.webContents.executeJavaScript(`(() => { const b = document.getElementById('bubble'); if (!b || b.classList.contains('hidden')) return null; const o = {}; for (const id of ['drank','snooze','close']) { const r = document.getElementById(id).getBoundingClientRect(); o[id] = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; } return o; })()`).catch(() => null);
      if (r) return { w, r };
    }
    return null;
  };
  let pass = 0;
  for (let k = 0; k < rounds.length; k++) {
    const what = rounds[k];
    responded = null;
    const any = BrowserWindow.getAllWindows().find((w) => w !== guard);
    await any.webContents.executeJavaScript('window.hydra.previewNow()');
    let f = null;
    for (let i = 0; i < 80 && !f; i++) { await wait(150); f = await findBubble(); }
    if (!f) { log(`round ${k + 1} ${what}: FAIL bubble never appeared`); continue; }
    await wait(900);
    f = await findBubble();
    if (!f) { log(`round ${k + 1} ${what}: FAIL bubble vanished`); continue; }
    const b = f.w.getBounds();
    const d = screen.getDisplayMatching(b).workArea;
    guard.setBounds({ x: d.x + d.width - 1000, y: d.y + d.height - 600, width: 1000, height: 600 });
    guard.showInactive();
    const t = screen.dipToScreenPoint({ x: Math.round(b.x + f.r[what].x), y: Math.round(b.y + f.r[what].y) });
    // approach like a hand would, then click
    for (let i = 6; i >= 0; i--) { await run(`[void][M]::SetCursorPos(${t.x - i * 22}, ${t.y - i * 12}); Write-Output '>>ok'`); await wait(25); }
    await wait(250);
    const at = await run(`Write-Output ('>>' + [M]::At())`);
    await run(`[M]::mouse_event(2,0,0,0,0); Start-Sleep -Milliseconds 70; [M]::mouse_event(4,0,0,0,0); Write-Output '>>ok'`);
    await wait(700);
    const want = what === 'close' ? 'dismiss' : what;
    const ok = responded === want;
    if (ok) pass++;
    log(`round ${k + 1} ${what}: ${ok ? 'PASS' : 'FAIL'} responded=${responded} guard=${guard.getTitle()} under cursor: ${at}`);
    if (k === 0) fs.writeFileSync(path.join(out, 'bubble.png'), (await f.w.webContents.capturePage()).toPNG());
    guard.hide();
    await guard.webContents.executeJavaScript('document.title="guard"');
    await run(`[void][M]::SetCursorPos(${home.split(',').join(', ')}); Write-Output '>>ok'`);
    if (!ok) await f.w.webContents.executeJavaScript(`document.getElementById('close').click()`).catch(() => {});
    // wait until she has walked away
    for (let i = 0; i < 60; i++) { await wait(200); if (!BrowserWindow.getAllWindows().some((w) => w !== guard && w.isVisible())) break; }
    await wait(500);
  }
  log(`${pass}/${rounds.length} clicks reached the button`);
  ps.stdin.end();
  fs.rmSync(cs, { force: true });
  app.exit(pass === rounds.length ? 0 : 1);
});
