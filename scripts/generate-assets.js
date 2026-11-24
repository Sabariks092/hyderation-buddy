// Generates every image the app needs from the single reference illustration:
//   src/assets/main-reference/Five Cheerful Chibi Women with Water Bottles.png
// The heads are cut from that picture and turned in 2.5D (scripts/rig/head.js); the bodies are a
// jointed rig drawn to match it (scripts/rig/body.js) and posed by scripts/rig/motion.js.
//
// Outputs (src/assets/generated, mirrored to assets/generated):
//   <avatar>/<sequence>.png   sprite sheets (8 columns)
//   <avatar>/preview.png      full-body standing pose
//   <avatar>/portrait.png     head & shoulders portrait
//   manifest.json             frame timing + per-frame hip displacement
//   tray.png, icon.png, build/icon.png, build/icon.ico
//
// usage: node scripts/generate-assets.js [avatarId ...]
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');
const { Resvg } = require('@resvg/resvg-js');
const avatars = require('./rig/avatars');
const { buildHead } = require('./rig/head');
const { drawCharacter, defs } = require('./rig/body');
const { buildSequences, FPS } = require('./rig/motion');
const { edt, encodeSmallPNG } = require('./rig/image');
const { makeIcons } = require('./make-icons');

const ROOT = path.join(__dirname, '..');
const OUTS = [path.join(ROOT, 'src', 'assets', 'generated'), path.join(ROOT, 'assets', 'generated')];
const FW = 264, FH = 360, COLS = 8, ANCHOR_X = 132, GROUND_Y = 348;
const SCALE = 0.457;              // reference pixels -> sprite pixels
const SS = 2;                     // supersampling
const BORDER = 3.6;               // white sticker border (sprite pixels)

// write to a temp file and swap it in: image viewers / editors may keep the old file mapped
function writeSafe(file, buf) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, buf);
  for (let k = 0; ; k++) {
    try { fs.renameSync(tmp, file); return; } catch (e) {
      if (k >= 20) { fs.unlinkSync(tmp); throw e; }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    }
  }
}
function writeAll(rel, buf) { for (const o of OUTS) writeSafe(path.join(o, rel), buf); }

// ---------------------------------------------------------------- one character image
// Renders `body` (rig units) into w x h straight-alpha RGBA with sticker border + soft shadow.
function renderSprite(body, av, w, h, view) {
  const W = w * SS, H = h * SS;
  const r = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${view.join(' ')}">${defs(av)}${body}</svg>`, { font: { loadSystemFonts: false } }).render();
  const px = r.pixels; // premultiplied
  const N = W * H, solid = new Uint8Array(N);
  for (let i = 0; i < N; i++) solid[i] = px[i * 4 + 3] > 110 ? 1 : 0;
  const d = edt(solid, W, H);
  const rad = BORDER * SS, soft = 4 * SS, dy = 2 * SS;
  const acc = new Float32Array(w * h * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, p = i * 4;
    const white = Math.max(0, Math.min(1, rad + 0.5 - Math.sqrt(d[i])));
    const sd = y >= dy ? Math.sqrt(d[i - dy * W]) : 1e6;
    const sh = 0.26 * Math.pow(Math.max(0, Math.min(1, 1 - (sd - rad) / soft)), 2);
    // shadow < white < art (all premultiplied)
    let cr = 16 * sh, cg = 34 * sh, cb = 52 * sh, ca = sh;
    cr = 255 * white + cr * (1 - white); cg = 255 * white + cg * (1 - white); cb = 255 * white + cb * (1 - white); ca = white + ca * (1 - white);
    const a = px[p + 3] / 255;
    cr = px[p] + cr * (1 - a); cg = px[p + 1] + cg * (1 - a); cb = px[p + 2] + cb * (1 - a); ca = a + ca * (1 - a);
    const q = (((y / SS) | 0) * w + ((x / SS) | 0)) * 4;
    acc[q] += cr; acc[q + 1] += cg; acc[q + 2] += cb; acc[q + 3] += ca;
  }
  const out = Buffer.alloc(w * h * 4), k = SS * SS;
  for (let i = 0; i < w * h; i++) {
    const a = acc[i * 4 + 3] / k;
    if (a < 0.004) continue;
    for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.max(0, Math.min(255, Math.round(acc[i * 4 + c] / k / a)));
    out[i * 4 + 3] = Math.round(a * 255);
  }
  return out;
}
const FRAME_VIEW = [-ANCHOR_X / SCALE, -GROUND_Y / SCALE, FW / SCALE, FH / SCALE];

function generateAvatar(av) {
  const hd = buildHead(av), seqs = buildSequences();
  for (const [name, sq] of Object.entries(seqs)) {
    const t0 = Date.now(), n = sq.frames.length, rows = Math.ceil(n / COLS);
    const W = COLS * FW, sheet = Buffer.alloc(W * rows * FH * 4);
    sq.frames.forEach((fr, i) => {
      const s = renderSprite(drawCharacter(fr.pose, av, hd, `f${i}_`), av, FW, FH, FRAME_VIEW);
      const x0 = (i % COLS) * FW, y0 = Math.floor(i / COLS) * FH;
      for (let y = 0; y < FH; y++) s.copy(sheet, ((y0 + y) * W + x0) * 4, y * FW * 4, (y + 1) * FW * 4);
    });
    writeAll(`${av.id}/${name}.png`, encodeSmallPNG(W, rows * FH, sheet));
    console.log(`  ${av.id}/${name}.png (${n} frames, ${Date.now() - t0}ms)`);
  }
  const still = seqs.idle.frames[0].pose;
  writeAll(`${av.id}/preview.png`, encodeSmallPNG(FW, FH, renderSprite(drawCharacter(still, av, hd, 'pv'), av, FW, FH, FRAME_VIEW)));
  const bun = av.id === 'pearl', size = bun ? 400 : 350;
  writeAll(`${av.id}/portrait.png`, encodeSmallPNG(256, 256, renderSprite(drawCharacter(still, av, hd, 'pt'), av, 256, 256, [-size / 2, (bun ? 105 : 140) - 805, size, size])));
}

async function writeShared() {
  const seqs = buildSequences();
  const manifest = {
    version: 1, fps: FPS, frameW: FW, frameH: FH, cols: COLS, scale: 1.2, anchorX: ANCHOR_X, groundY: GROUND_Y,
    avatars: avatars.map((a) => ({ id: a.id, name: a.name, tagline: a.tagline })), sequences: {},
  };
  for (const [name, sq] of Object.entries(seqs)) {
    manifest.sequences[name] = {
      file: `${name}.avif`, frames: sq.frames.length, loop: !!sq.loop,
      cycleDx: (sq.cycleDx || 0) * SCALE, stepFrames: sq.stepFrames || 0,
      x: sq.frames.map((f) => Math.round(f.x * SCALE * 100) / 100),
    };
  }
  writeAll('manifest.json', JSON.stringify(manifest, null, 2));
  // logo / tray / installer icons come from src/assets/Water Timer Notification Icon.png
  await makeIcons();
}

async function main() {
  if (process.argv[2] === '--worker') return generateAvatar(avatars.find((a) => a.id === process.argv[3]));
  const want = process.argv.slice(2), list = want.length ? avatars.filter((a) => want.includes(a.id)) : avatars;
  if (!list.length) throw new Error(`no such avatar: ${want.join(', ')}`);
  await Promise.all(list.map((av) => new Promise((res, rej) => {
    fork(__filename, ['--worker', av.id]).on('exit', (code) => (code ? rej(new Error(`${av.id} failed`)) : res()));
  })));
  await writeShared();
  console.log('done ->', OUTS.join(', '));
}
main().catch((e) => { console.error(e); process.exit(1); });
