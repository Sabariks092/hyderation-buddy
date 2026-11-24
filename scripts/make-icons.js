// Makes every logo / icon file from the one source picture:
//   src/assets/Water Timer Notification Icon.png
// -> src/assets/generated/{icon,tray,tray@2x}.png (mirrored to assets/generated), build/icon.png, build/icon.ico
// usage: node scripts/make-icons.js      (also run by generate-assets.js)
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'src', 'assets', 'Water Timer Notification Icon.png');
const OUTS = [path.join(ROOT, 'src', 'assets', 'generated'), path.join(ROOT, 'assets', 'generated')];

const png = (size) => sharp(SOURCE).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toBuffer();

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

async function makeIcons() {
  const build = path.join(ROOT, 'build');
  fs.mkdirSync(build, { recursive: true });
  fs.writeFileSync(path.join(build, 'icon.png'), await png(512));
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  fs.writeFileSync(path.join(build, 'icon.ico'), makeIco(await Promise.all(sizes.map(async (size) => ({ size, buf: await png(size) })))));
  for (const [name, size] of [['tray.png', 32], ['tray@2x.png', 64], ['icon.png', 256]]) {
    const buf = await png(size);
    for (const o of OUTS) { fs.mkdirSync(o, { recursive: true }); fs.writeFileSync(path.join(o, name), buf); }
  }
}
module.exports = { makeIcons };
if (require.main === module) makeIcons().then(() => console.log('icons done')).catch((e) => { console.error(e); process.exit(1); });
