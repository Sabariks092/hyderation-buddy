// Small RGBA bitmap helpers (masks are Uint8Array / Float32Array of w*h).
const { encodePNG, crc32 } = require('../png-util');

class Img {
  constructor(w, h, px) { this.w = w; this.h = h; this.px = px || Buffer.alloc(w * h * 4); }
  clone() { return new Img(this.w, this.h, Buffer.from(this.px)); }
  crop(x0, y0, w, h) {
    const o = new Img(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const sx = x + x0, sy = y + y0;
      if (sx < 0 || sy < 0 || sx >= this.w || sy >= this.h) continue;
      this.px.copy(o.px, (y * w + x) * 4, (sy * this.w + sx) * 4, (sy * this.w + sx) * 4 + 4);
    }
    return o;
  }
  lum(i) { return (this.px[i * 4] * 0.3 + this.px[i * 4 + 1] * 0.59 + this.px[i * 4 + 2] * 0.11); }
  chroma(i) { const p = i * 4, a = this.px; return Math.max(a[p], a[p + 1], a[p + 2]) - Math.min(a[p], a[p + 1], a[p + 2]); }
  toB64() { return encodePNG(this.w, this.h, this.px).toString('base64'); }
  toPNG() { return encodePNG(this.w, this.h, this.px); }
}

// 4-connected flood fill from seed points; ok(i) decides if a pixel may be entered
function flood(w, h, seeds, ok) {
  const m = new Uint8Array(w * h), q = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (!m[i] && ok(i, x, y)) { m[i] = 1; q.push(i); }
  };
  seeds.forEach(([x, y]) => push(x, y));
  while (q.length) {
    const i = q.pop(), x = i % w, y = (i - x) / w;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
  return m;
}

// squared euclidean distance to the nearest set pixel (Felzenszwalb)
function edt(mask, w, h) {
  const INF = 1e12, f = new Float64Array(w * h);
  for (let i = 0; i < f.length; i++) f[i] = mask[i] ? 0 : INF;
  const n = Math.max(w, h), g = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  const run = (len) => {
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s;
      do { const r = v[k]; s = ((g[q] + q * q) - (g[r] + r * r)) / (2 * q - 2 * r); } while (s <= z[k] && --k > -1);
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) ** 2 + g[v[k]]; }
  };
  for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) g[y] = f[y * w + x]; run(h); for (let y = 0; y < h; y++) f[y * w + x] = d[y]; }
  for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) g[x] = f[y * w + x]; run(w); for (let x = 0; x < w; x++) f[y * w + x] = d[x]; }
  return f;
}
const not = (m) => m.map((v) => (v ? 0 : 1));
function dilate(m, w, h, r) { const d = edt(m, w, h), o = new Uint8Array(w * h); for (let i = 0; i < o.length; i++) o[i] = d[i] <= r * r ? 1 : 0; return o; }
function erode(m, w, h, r) { return not(dilate(not(m), w, h, r)); }
const open = (m, w, h, r) => dilate(erode(m, w, h, r), w, h, r);
const close = (m, w, h, r) => erode(dilate(m, w, h, r), w, h, r);
function fillHoles(m, w, h) {
  const seeds = [];
  for (let x = 0; x < w; x++) seeds.push([x, 0], [x, h - 1]);
  for (let y = 0; y < h; y++) seeds.push([0, y], [w - 1, y]);
  return not(flood(w, h, seeds, (i) => !m[i]));
}

// replace masked pixels with a smooth diffusion of the surrounding colours
function inpaint(img, mask, iters = 400, minLum = 160) {
  const { w, h } = img, idx = [];
  for (let i = 0; i < mask.length; i++) if (mask[i]) idx.push(i);
  const valid = new Uint8Array(w * h); // dark neighbours (outlines) do not bleed in
  for (let i = 0; i < w * h; i++) valid[i] = mask[i] || (img.px[i * 4 + 3] > 200 && img.lum(i) > minLum) ? 1 : 0;
  const f = new Float32Array(w * h * 3);
  for (let i = 0; i < w * h; i++) for (let c = 0; c < 3; c++) f[i * 3 + c] = img.px[i * 4 + c];
  const s = [0, 0, 0]; let k = 0;
  idx.forEach((i) => [i - 1, i + 1, i - w, i + w].forEach((j) => { if (!mask[j] && valid[j]) { k++; for (let c = 0; c < 3; c++) s[c] += f[j * 3 + c]; } }));
  idx.forEach((i) => { for (let c = 0; c < 3; c++) f[i * 3 + c] = s[c] / Math.max(1, k); });
  for (let t = 0; t < iters; t++) for (const i of idx) {
    let q = 0, r = 0, g = 0, b = 0;
    for (const j of [i - 1, i + 1, i - w, i + w]) if (valid[j]) { q++; r += f[j * 3]; g += f[j * 3 + 1]; b += f[j * 3 + 2]; }
    if (q) { f[i * 3] = r / q; f[i * 3 + 1] = g / q; f[i * 3 + 2] = b / q; }
  }
  idx.forEach((i) => { for (let c = 0; c < 3; c++) img.px[i * 4 + c] = Math.round(f[i * 3 + c]); });
}

// PNG with per-row filters (much smaller than unfiltered for sprite sheets)
function encodeSmallPNG(w, h, px) {
  const zlib = require('zlib'), st = w * 4, raw = Buffer.alloc(h * (st + 1));
  const row = [0, 1, 2, 3, 4].map(() => Buffer.alloc(st));
  for (let y = 0; y < h; y++) {
    const o = y * st, sum = [0, 0, 0, 0, 0];
    for (let i = 0; i < st; i++) {
      const v = px[o + i], a = i >= 4 ? px[o + i - 4] : 0, b = y ? px[o + i - st] : 0, c = y && i >= 4 ? px[o + i - st - 4] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pr = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c];
      for (let k = 0; k < 5; k++) { const q = (v - pr[k]) & 255; row[k][i] = q; sum[k] += q < 128 ? q : 256 - q; }
    }
    const best = sum.indexOf(Math.min(...sum));
    raw[y * (st + 1)] = best;
    row[best].copy(raw, y * (st + 1) + 1);
  }
  const u32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32BE(v >>> 0); return b; };
  const chunk = (t, d) => { const body = Buffer.concat([Buffer.from(t), d]); return Buffer.concat([u32(d.length), body, u32(crc32(body))]); };
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', Buffer.concat([u32(w), u32(h), Buffer.from([8, 6, 0, 0, 0])])), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

module.exports = { encodeSmallPNG, Img, flood, edt, not, dilate, erode, open, close, fillHoles, inpaint };
