const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

function decodePNG(buf) {
  let pos = 8, width, height, colorType;
  const idatChunks = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    if (type === 'IHDR') {
      width = buf.readUInt32BE(pos + 8);
      height = buf.readUInt32BE(pos + 12);
      colorType = buf[pos + 17];
    } else if (type === 'IDAT') idatChunks.push(buf.subarray(pos + 8, pos + 8 + len));
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  const pixels = Buffer.alloc(width * height * 4);
  let srcPos = 0;
  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const prevRow = Buffer.alloc(stride), curRow = Buffer.alloc(stride);
  function paeth(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
  }
  for (let y = 0; y < height; y++) {
    const filter = raw[srcPos++];
    for (let x = 0; x < stride; x++) {
      const b = raw[srcPos++];
      const left = x >= bpp ? curRow[x - bpp] : 0, up = prevRow[x], upLeft = x >= bpp ? prevRow[x - bpp] : 0;
      let val = 0;
      if (filter === 0) val = b;
      else if (filter === 1) val = (b + left) & 0xff;
      else if (filter === 2) val = (b + up) & 0xff;
      else if (filter === 3) val = (b + Math.floor((left + up) / 2)) & 0xff;
      else if (filter === 4) val = (b + paeth(left, up, upLeft)) & 0xff;
      curRow[x] = val;
    }
    curRow.copy(prevRow);
    for (let x = 0; x < width; x++) {
      const dstIdx = (y * width + x) * 4;
      pixels[dstIdx] = curRow[x * bpp];
      pixels[dstIdx + 1] = curRow[x * bpp + 1];
      pixels[dstIdx + 2] = curRow[x * bpp + 2];
      pixels[dstIdx + 3] = bpp === 4 ? curRow[x * bpp + 3] : 255;
    }
  }
  return { width, height, pixels };
}

// CRC32 table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  crcTable[n] = c;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function encodePNG(width, height, pixels) {
  const stride = width * 4;
  const raw = Buffer.alloc(height * (1 + stride));
  let dstPos = 0;
  for (let y = 0; y < height; y++) {
    raw[dstPos++] = 0; // filter 0
    pixels.copy(raw, dstPos, y * stride, (y + 1) * stride);
    dstPos += stride;
  }
  const idatData = zlib.deflateSync(raw, { level: 9 });

  const chunk = (type, data) => {
    const len = data ? data.length : 0;
    const b = Buffer.alloc(12 + len);
    b.writeUInt32BE(len, 0);
    b.write(type, 4, 4, 'ascii');
    if (data) data.copy(b, 8);
    const c = crc32(b.subarray(4, 8 + len));
    b.writeUInt32BE(c, 8 + len);
    return b;
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idatData),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

module.exports = { decodePNG, encodePNG, crc32 };

if (require.main === module) {
  const ref = decodePNG(fs.readFileSync('src/assets/main-reference/Five Cheerful Chibi Women with Water Bottles.png'));
  console.log('Decoded reference image:', ref.width, 'x', ref.height);
}
