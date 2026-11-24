// Packs the generated sprite sheets (PNG) into small animated AVIF files so the installer stays
// small: AV1 compresses the frames against each other, which a sprite sheet cannot do.
// The app unpacks each file back into a sprite sheet when it loads (src/sprites.js).
// The PNG sheets stay on disk as the source; only the .avif files are packaged (package.json "files").
//
// usage: node scripts/to-avif.js [avatarId ...]      (CRF=<n> to change quality, lower = better)
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const sharp = require('sharp');
const ffmpeg = require('ffmpeg-static');

const DIR = path.join(__dirname, '..', 'src', 'assets', 'generated');
const manifest = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
const { frameW: FW, frameH: FH, cols: COLS, fps: FPS } = manifest;
const CRF = Number(process.env.CRF) || 13;
const EDGE = [16, 34, 52]; // colour of the soft shadow that rims every sprite

async function encode(avatar, name, frames) {
  const src = path.join(DIR, avatar, `${name}.png`), out = path.join(DIR, avatar, `${name}.avif`);
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  // sheet -> frame after frame; invisible pixels get the rim colour so lossy edges cannot pick up a wrong tint
  const video = Buffer.alloc(FW * FH * 4 * frames);
  for (let i = 0; i < frames; i++) {
    const x0 = (i % COLS) * FW, y0 = Math.floor(i / COLS) * FH;
    for (let y = 0; y < FH; y++) {
      const from = ((y0 + y) * info.width + x0) * 4;
      data.copy(video, (i * FH + y) * FW * 4, from, from + FW * 4);
    }
  }
  for (let p = 0; p < video.length; p += 4) {
    if (video[p + 3] === 0) { video[p] = EDGE[0]; video[p + 1] = EDGE[1]; video[p + 2] = EDGE[2]; }
  }
  const enc = ['-c:v', 'libaom-av1', '-crf', String(CRF), '-b:v', '0', '-cpu-used', '3', '-row-mt', '1', '-g', '300'];
  const args = ['-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${FW}x${FH}`, '-r', String(FPS), '-i', '-',
    '-filter_complex', '[0:v]split[c0][a0];[c0]format=gbrp,scale=out_color_matrix=bt709:out_range=full,format=yuv444p[c];[a0]alphaextract,format=gray[a]',
    '-map', '[c]', '-map', '[a]', ...enc,
    '-color_range', 'pc', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'iec61966-2-1',
    '-f', 'avif', out];
  await new Promise((res, rej) => {
    const p = spawn(ffmpeg, args, { stdio: ['pipe', 'inherit', 'inherit'] });
    p.on('error', rej);
    p.on('exit', (code) => (code ? rej(new Error(`ffmpeg failed for ${avatar}/${name}`)) : res()));
    p.stdin.on('error', () => {});
    p.stdin.end(video);
  });
  return [fs.statSync(src).size, fs.statSync(out).size];
}

(async () => {
  const want = process.argv.slice(2);
  const list = manifest.avatars.filter((a) => !want.length || want.includes(a.id));
  let before = 0, after = 0;
  const jobs = [];
  for (const av of list) for (const [name, sq] of Object.entries(manifest.sequences)) jobs.push([av.id, name, sq.frames]);
  const workers = Array.from({ length: Math.max(1, Math.min(6, require('os').cpus().length - 1)) }, async () => {
    for (let j; (j = jobs.shift());) {
      const [a, b] = await encode(...j);
      before += a; after += b;
      console.log(`  ${j[0]}/${j[1]}.avif  ${(b / 1024).toFixed(0)} KB`);
    }
  });
  await Promise.all(workers);
  console.log(`sprite sheets: ${(before / 1048576).toFixed(1)} MB png -> ${(after / 1048576).toFixed(1)} MB avif (crf ${CRF})`);
})().catch((e) => { console.error(e); process.exit(1); });
