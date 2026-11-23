// Generates every image the app needs from the procedural character rig:
//   src/assets/generated/<avatar>/<sequence>.png   sprite sheets (8 columns)
//   src/assets/generated/<avatar>/preview.png      full-body standing pose
//   src/assets/generated/<avatar>/portrait.png     head & shoulders portrait
//   src/assets/generated/manifest.json             frame timing + per-frame hip displacement
//   build/icon.png, build/icon.ico, src/assets/generated/tray.png   app + tray icons
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');
const avatars = require('./lib/avatars');
const { drawCharacter } = require('./lib/character');
const { buildSequences, FPS } = require('./lib/motion');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'src', 'assets', 'generated');
const W = 220, H = 300, SCALE = 1.2, COLS = 8;
const FW = Math.round(W * SCALE), FH = Math.round(H * SCALE);

const render = (svg) => new Resvg(svg, { font: { loadSystemFonts: false } }).render().asPng();

function sheetSvg(frames, av, tag) {
  const rows = Math.ceil(frames.length / COLS);
  let body = '';
  frames.forEach((fr, i) => {
    const cx = (i % COLS) * FW, cy = Math.floor(i / COLS) * FH;
    body += `<g transform="translate(${cx},${cy}) scale(${SCALE})">${drawCharacter(fr.pose, av, `${tag}${i}`)}</g>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${COLS * FW}" height="${rows * FH}" viewBox="0 0 ${COLS * FW} ${rows * FH}">${body}</svg>`;
}

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

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const seqs = buildSequences();
  const manifest = {
    version: 1, fps: FPS, frameW: FW, frameH: FH, cols: COLS, scale: SCALE,
    anchorX: 110 * SCALE, groundY: 290 * SCALE,
    avatars: avatars.map((a) => ({ id: a.id, name: a.name, tagline: a.tagline })),
    sequences: {},
  };
  for (const [name, sq] of Object.entries(seqs)) {
    manifest.sequences[name] = {
      file: `${name}.png`, frames: sq.frames.length, loop: !!sq.loop,
      cycleDx: (sq.cycleDx || 0) * SCALE, stepFrames: sq.stepFrames || 0,
      x: sq.frames.map((f) => Math.round(f.x * SCALE * 100) / 100),
    };
  }
  for (const av of avatars) {
    const dir = path.join(OUT, av.id);
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, sq] of Object.entries(seqs)) {
      const t0 = Date.now();
      fs.writeFileSync(path.join(dir, `${name}.png`), render(sheetSvg(sq.frames, av, `${av.id}_${name}_`)));
      process.stdout.write(`${av.id}/${name} (${sq.frames.length}f, ${Date.now() - t0}ms)\n`);
    }
    const still = seqs.idle.frames[0].pose;
    const full = drawCharacter(still, av, `${av.id}_pv`);
    fs.writeFileSync(path.join(dir, 'preview.png'), render(`<svg xmlns="http://www.w3.org/2000/svg" width="${FW}" height="${FH}" viewBox="0 0 ${W} ${H}">${full}</svg>`));
    const face = drawCharacter({ ...still, arms: seqs.wave.frames[20].pose.arms, eyes: 'open', mouth: 'smile' }, av, `${av.id}_pt`);
    fs.writeFileSync(path.join(dir, 'portrait.png'), render(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="40 34 140 140">${face}</svg>`));
  }
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest));
  // icons
  const buildDir = path.join(ROOT, 'build');
  fs.mkdirSync(buildDir, { recursive: true });
  fs.writeFileSync(path.join(buildDir, 'icon.png'), render(iconSvg(512)));
  fs.writeFileSync(path.join(buildDir, 'icon.ico'), makeIco([16, 24, 32, 48, 64, 128, 256].map((size) => ({ size, buf: render(iconSvg(size)) }))));
  fs.writeFileSync(path.join(OUT, 'tray.png'), render(iconSvg(32)));
  fs.writeFileSync(path.join(OUT, 'tray@2x.png'), render(iconSvg(64)));
  fs.writeFileSync(path.join(OUT, 'icon.png'), render(iconSvg(256)));
  console.log('done ->', OUT);
}
main();
