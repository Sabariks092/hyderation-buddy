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

const ROOT = path.join(__dirname, '..');
const OUTS = [path.join(ROOT, 'src', 'assets', 'generated'), path.join(ROOT, 'assets', 'generated')];
const FW = 264, FH = 360, COLS = 8, ANCHOR_X = 132, GROUND_Y = 348;
const SCALE = 0.457;              // reference pixels -> sprite pixels
const SS = 2;                     // supersampling
const BORDER = 3.6;               // white sticker border (sprite pixels)

const svgPng = (svg) => new Resvg(svg, { font: { loadSystemFonts: false } }).render().asPng();
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

// ---------------------------------------------------------------- icons
function iconSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fd3ff"/><stop offset="1" stop-color="#1f8ee0"/></linearGradient></defs>
  <path d="M50 6 C50 6 18 44 18 64 A32 32 0 0 0 82 64 C82 44 50 6 50 6Z" fill="url(#g)" stroke="#155f9c" stroke-width="4" stroke-linejoin="round"/>
  <ellipse cx="35" cy="52" rx="6" ry="11" fill="#fff" opacity="0.55" transform="rotate(25 35 52)"/>
  <circle cx="40" cy="66" r="4.2" fill="#143a5c"/><circle cx="60" cy="66" r="4.2" fill="#143a5c"/>
  <circle cx="41.4" cy="64.6" r="1.4" fill="#fff"/><circle cx="61.4" cy="64.6" r="1.4" fill="#fff"/>
  <path d="M44 75 Q50 80 56 75" fill="none" stroke="#143a5c" stroke-width="3" stroke-linecap="round"/>
  <ellipse cx="33" cy="73" rx="4.5" ry="2.6" fill="#ff9fb0" opacity="0.7"/><ellipse cx="67" cy="73" rx="4.5" ry="2.6" fill="#ff9fb0" opacity="0.7"/>
</svg>`;
}
// ICO container with embedded PNG images
function makeIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4);
  const dir = Buffer.alloc(16 * pngs.length);
  let offset = 6 + dir.length;
  pngs.forEach(({ size, buf }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o); dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt8(0, o + 2); dir.writeUInt8(0, o + 3);
    dir.writeUInt16LE(1, o + 4); dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(buf.length, o + 8); dir.writeUInt32LE(offset, o + 12);
    offset += buf.length;
  });
  return Buffer.concat([header, dir, ...pngs.map((p) => p.buf)]);
}

function writeShared() {
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
  const build = path.join(ROOT, 'build');
  fs.mkdirSync(build, { recursive: true });
  fs.writeFileSync(path.join(build, 'icon.png'), svgPng(iconSvg(512)));
  fs.writeFileSync(path.join(build, 'icon.ico'), makeIco([16, 24, 32, 48, 64, 128, 256].map((size) => ({ size, buf: svgPng(iconSvg(size)) }))));
  writeAll('tray.png', svgPng(iconSvg(32)));
  writeAll('tray@2x.png', svgPng(iconSvg(64)));
  writeAll('icon.png', svgPng(iconSvg(256)));
}

async function main() {
  if (process.argv[2] === '--worker') return generateAvatar(avatars.find((a) => a.id === process.argv[3]));
  const want = process.argv.slice(2), list = want.length ? avatars.filter((a) => want.includes(a.id)) : avatars;
  if (!list.length) throw new Error(`no such avatar: ${want.join(', ')}`);
  await Promise.all(list.map((av) => new Promise((res, rej) => {
    fork(__filename, ['--worker', av.id]).on('exit', (code) => (code ? rej(new Error(`${av.id} failed`)) : res()));
  })));
  writeShared();
  console.log('done ->', OUTS.join(', '));
}
main().catch((e) => { console.error(e); process.exit(1); });
