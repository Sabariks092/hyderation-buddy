// Builds the head of each character from the reference artwork and turns it in 2.5D.
//   front layer : hair cap + face + ears + glasses, wrapped around an ellipsoid so it can yaw
//   back layer  : long hair (or the back of the skull) that is drawn behind the body
//   wisps       : fly-away strands
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');
const { decodePNG } = require('../png-util');
const { Img, flood, edt, not, dilate, erode, open, fillHoles, inpaint } = require('./image');

const REF = path.join(__dirname, '..', '..', 'src', 'assets', 'main-reference', 'Five Cheerful Chibi Women with Water Bottles.png');
const Y0 = 90, Y1 = 620;               // vertical crop of the head/hair bitmaps
const INK = [30, 16, 17];
const HAIR_DARK = [38, 31, 35];
let refImg = null;
function ref() {
  if (!refImg) { const r = decodePNG(fs.readFileSync(REF)); refImg = new Img(r.width, r.height, r.pixels); }
  return refImg;
}
const rasterize = (w, h, body) => {
  const out = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`, { font: { loadSystemFonts: false } }).render();
  return new Img(w, h, Buffer.from(out.pixels));  // premultiplied RGBA
};
function over(dst, src) { // premultiplied src over straight dst
  for (let i = 0; i < dst.px.length; i += 4) {
    const a = src.px[i + 3] / 255;
    if (!a) continue;
    const da = dst.px[i + 3] / 255, oa = a + da * (1 - a);
    for (let c = 0; c < 3; c++) dst.px[i + c] = Math.min(255, Math.round((src.px[i + c] + dst.px[i + c] * da * (1 - a)) / oa));
    dst.px[i + 3] = Math.round(oa * 255);
  }
}
const polyMask = (w, h, polys) => {
  const im = rasterize(w, h, polys.map((p) => `<polygon points="${p.map((q) => q.join(',')).join(' ')}" fill="#000"/>`).join(''));
  const m = new Uint8Array(w * h);
  for (let i = 0; i < m.length; i++) m[i] = im.px[i * 4 + 3] > 127 ? 1 : 0;
  return m;
};
const or = (...ms) => ms[0].map((_, i) => (ms.some((m) => m[i]) ? 1 : 0));
const discs = (w, h, list) => { const m = new Uint8Array(w * h); list.forEach(([cx, cy, rx, ry = rx]) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) m[y * w + x] = 1; }); return m; };
function gauss(arr, s) {
  const r = Math.ceil(s * 3), k = [];
  for (let i = -r; i <= r; i++) k.push(Math.exp(-i * i / (2 * s * s)));
  return arr.map((_, i) => { let a = 0, b = 0; for (let j = -r; j <= r; j++) { const v = arr[i + j]; if (v === undefined || v === null) continue; a += v * k[j + r]; b += k[j + r]; } return b ? a / b : 0; });
}

// alpha-matte the pixels of `mask` (keeps soft edges where the art meets the white page)
function cut(src, mask, bg) {
  const { w, h } = src, o = src.clone();
  const dbg = edt(bg, w, h);
  for (let i = 0; i < w * h; i++) {
    const p = i * 4;
    if (!mask[i]) { o.px[p + 3] = 0; continue; }
    if (dbg[i] <= 6) { // edge pixel: unmix ink from white paper
      const a = Math.max(0, Math.min(1, (250 - src.lum(i)) / 200));
      o.px[p] = INK[0]; o.px[p + 1] = INK[1]; o.px[p + 2] = INK[2]; o.px[p + 3] = Math.round(a * 255);
    }
  }
  return o;
}

function plain(src, mask) {
  const o = src.clone();
  for (let i = 0; i < mask.length; i++) if (!mask[i]) o.px[i * 4 + 3] = 0;
  return o;
}

function buildHead(av) {
  const H = av.head, w = av.x1 - av.x0, h = Y1 - Y0, N = w * h;
  const src = ref().crop(av.x0, Y0, w, h);
  const L = ([x, y]) => [x - av.x0, y - Y0];
  const Ld = (a) => [a[0] - av.x0, a[1] - Y0, ...a.slice(2)];
  const cx = av.cx - av.x0;
  // paper
  const seeds = [];
  for (let x = 0; x < w; x++) seeds.push([x, 0]);
  for (let y = 0; y < h; y++) seeds.push([0, y], [w - 1, y]);
  const bg = flood(w, h, seeds, (i) => src.lum(i) > 170 && src.chroma(i) < 22);

  // ---- face
  const eyes = H.eyes.map(L);
  const faceCore = flood(w, h, [[cx, 250 - Y0 + 12], [cx, 395 - Y0]], (i, x, y) => src.lum(i) > 105 && y < (H.chinY || 415) - Y0);
  const eyeD = discs(w, h, eyes.map(([x, y]) => [x, y, 33, 38]));
  const lensD = discs(w, h, (H.lens || []).map(Ld).map(([x, y, r]) => [x, y, r + 2]));
  let face = fillHoles(or(faceCore, eyeD, lensD), w, h);
  face = open(face, w, h, 4);
  // ---- ears
  let ears = new Uint8Array(N);
  H.ears.map(L).forEach(([x, y]) => { ears = or(ears, flood(w, h, [[x, y], [x, y - 6], [x, y + 6]], (i, xx, yy) => src.lum(i) > 105 && src.chroma(i) > 12 && Math.hypot(xx - x, yy - y) < 34)); });
  ears = fillHoles(ears, w, h);
  const extra = discs(w, h, (H.extra || []).map(Ld));
  const boxMask = new Uint8Array(N);
  (H.drops || []).forEach(({ box: [a, b, c, d] }) => { for (let y = b - Y0; y < d - Y0; y++) for (let x = a - av.x0; x < c - av.x0; x++) boxMask[y * w + x] = 1; });
  // enclosed bits of paper (inside loops of hair) are not part of the character
  {
    const guard = or(dilate(or(face, ears, extra), w, h, 8), boxMask), paper = new Uint8Array(N);
    for (let i = 0; i < N; i++) paper[i] = !bg[i] && !guard[i] && src.lum(i) > 215 && src.chroma(i) < 12 ? 1 : 0;
    const seen = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      if (!paper[i] || seen[i]) continue;
      const m = flood(w, h, [[i % w, (i / w) | 0]], (j) => paper[j]);
      let k = 0;
      for (let j = 0; j < N; j++) if (m[j]) { seen[j] = 1; k++; }
      if (k > 45) { const g = dilate(m, w, h, 2); for (let j = 0; j < N; j++) if (g[j] && src.lum(j) > 150 && src.chroma(j) < 30) bg[j] = 1; }
    }
  }
  const fg = not(bg);
  let lower = or(dilate(or(face, ears), w, h, 6), extra);
  dilate.cache = lower;
  (H.boxes || []).forEach(([a, b, c, d]) => { for (let y = b - Y0; y < d - Y0; y++) for (let x = a - av.x0; x < c - av.x0; x++) lower[y * w + x] = 1; });
  // earrings / loose curls become separate sprites that travel with the ear
  const drops = (H.drops || []).map(({ kind, box: [a, b, c, d], at }) => {
    const bx = a - av.x0, by = b - Y0, bw = c - a, bh = d - b;
    const m = new Uint8Array(N), lt = new Uint8Array(N);
    for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) {
      const i = y * w + x;
      if (kind === 'curl') m[i] = fg[i] && src.lum(i) < 120 && !dilate.cache[i] ? 1 : 0;
      else if (kind === 'disc') m[i] = ((x - bx - bw / 2) / (bw / 2)) ** 2 + ((y - by - bh / 2) / (bh / 2)) ** 2 <= 1 ? 1 : 0;
      else lt[i] = src.lum(i) > 165 && src.chroma(i) < 30 ? 1 : 0;
    }
    const mm = kind === 'light' ? dilate(fillHoles(lt, w, h), w, h, 4) : m;
    for (let i = 0; i < N; i++) if (mm[i] && !(face[i])) lower[i] = kind === 'disc' ? 0 : lower[i];
    return { x: bx - 6, y: by - 6, w: bw + 12, h: bh + 12, ax: at[0] - av.x0, ay: at[1] - Y0, b64: (kind === 'curl' ? cut(src, mm, bg) : plain(src, mm)).crop(bx - 6, by - 6, bw + 12, bh + 12).toB64() };
  });
  const solid = open(fg, w, h, 7);
  const capY = H.capY - Y0;
  const front = new Uint8Array(N);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!fg[i]) continue;
    front[i] = y < (H.longHair ? capY : 372 - Y0) ? (solid[i] || lower[i] ? 1 : 0) : (y < 430 - Y0 && lower[i] ? 1 : 0);
  }
  const F = cut(src, front, bg);
  { // outline ring: never let neck / cloth colours bleed into it
    const dbg = edt(bg, w, h);
    for (let i = 0; i < N; i++) if (front[i] && ((i / w) | 0) >= capY && !face[i] && !ears[i] && dbg[i] > 36 && src.lum(i) > 70) for (let c = 0; c < 3; c++) F.px[i * 4 + c] = INK[c];
  }
  // feather the bottom edge of the hair cap into the hair behind
  if (H.longHair) for (let y = capY - 9; y < capY; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (front[i] && !lower[i]) F.px[i * 4 + 3] = Math.round(F.px[i * 4 + 3] * (capY - y) / 10);
  }

  // ---- row-wise ellipsoid (centre + radius)
  const Lx = [], Rx = [];
  let yTop = -1, yBot = 0;
  for (let y = 0; y < h; y++) {
    let a = -1, b = -1;
    for (let x = 0; x < w; x++) if (front[y * w + x]) { if (a < 0) a = x; b = x; }
    if (a >= 0) { if (yTop < 0) yTop = y; yBot = y; Lx.push(a); Rx.push(b); } else { Lx.push(null); Rx.push(null); }
  }
  const C = [], R = [];
  const YE = 296 - Y0, R300 = Math.max(Rx[YE] - cx, cx - Lx[YE]);
  for (let y = 0; y < h; y++) {
    if (Lx[y] === null) { C.push(null); R.push(null); continue; }
    const k = Math.max(0, Math.min(1, (y - (300 - Y0)) / 40));
    C.push(((Lx[y] + Rx[y]) / 2) * (1 - k) + cx * k);
    const el = R300 * Math.sqrt(Math.max(0.05, 1 - Math.pow(Math.max(0, y - YE) / 148, 2)));
    const ext = y > capY ? Math.max(Rx[y] - cx, cx - Lx[y]) + 1 : 0;
    R.push(y <= YE ? (Rx[y] - Lx[y]) / 2 : Math.max(el, ext));
  }
  const SL = gauss(Lx, 1.6), SR = gauss(Rx, 1.6);
  const Cs = gauss(C, 6), Rs = gauss(R, 10).map((v, y) => (R[y] === null ? null : v));

  // ---- expressions
  const variants = { open_smile: F };
  const noEyes = F.clone();
  let em = discs(w, h, eyes.map(([x, y]) => [x, y, 30, 35]));
  if (H.lens) { const inner = discs(w, h, H.lens.map(Ld).map(([x, y, r]) => [x, y, r - 5])); em = em.map((v, i) => (v && inner[i] ? 1 : 0)); }
  // lashes: dark pixels just outside the eye disc
  {
    const wide = discs(w, h, eyes.map(([x, y], k) => [x + (k ? 6 : -6), y - 4, 48, 42]));
    const lim = H.lens ? discs(w, h, H.lens.map(Ld).map(([x, y, r]) => [x, y, r - 5])) : dilate(face, w, h, 1);
    const dark = new Uint8Array(N);
    for (let i = 0; i < N; i++) { const y = (i / w) | 0; if (wide[i] && lim[i] && src.lum(i) < 150 && y > eyes[0][1] - 36) dark[i] = 1; }
    em = or(em, dilate(dark, w, h, 3).map((v, i) => (v && lim[i] && ((i / w) | 0) > eyes[0][1] - 37 ? 1 : 0)));
  }
  inpaint(noEyes, em, 500);
  const eyeSvg = (kind) => eyes.map(([x, y], k) => {
    const o = k ? 1 : -1, q = (dx) => (x + dx * o).toFixed(1);
    if (kind === 'closed') return `<path d="M${q(-23)},${y + 6} Q${x},${y + 24} ${q(25)},${y + 4} l${6 * o},-5 M${q(19)},${y + 11} l${6 * o},5 M${q(11)},${y + 15} l${4 * o},6" fill="none" stroke="#1c0f12" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>`;
    return `<path d="M${q(-24)},${y + 12} Q${x},${y - 24} ${q(25)},${y + 12} l${6 * o},-1" fill="none" stroke="#1c0f12" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`;
  }).join('');
  const [mx, my] = L(H.mouth);
  const noMouth = (im) => {
    const o = im.clone();
    inpaint(o, discs(w, h, [[mx, my + 3, 22, 14]]), 250);
    return o;
  };
  const mouthSvg = (kind) => (kind === 'open'
    ? `<path d="M${mx - 17},${my - 6} Q${mx},${my - 1} ${mx + 17},${my - 6} Q${mx + 14},${my + 18} ${mx},${my + 18} Q${mx - 14},${my + 18} ${mx - 17},${my - 6}Z" fill="#8c2230" stroke="#1e1011" stroke-width="4" stroke-linejoin="round"/><path d="M${mx - 12},${my - 3} Q${mx},${my + 1} ${mx + 12},${my - 3} L${mx + 11},${my + 1} Q${mx},${my + 4} ${mx - 11},${my + 1}Z" fill="#fff"/><ellipse cx="${mx}" cy="${my + 12}" rx="8" ry="4.5" fill="#f47d86"/>`
    : `<ellipse cx="${mx}" cy="${my + 4}" rx="7.5" ry="8.5" fill="#8c2230" stroke="#1e1011" stroke-width="4"/>`);
  for (const e of ['open', 'closed', 'happy']) for (const m of ['smile', 'open', 'o']) {
    const key = `${e}_${m}`;
    if (variants[key]) continue;
    let im = (e === 'open' ? F : noEyes).clone();
    if (m !== 'smile') im = noMouth(im);
    over(im, rasterize(w, h, (e === 'open' ? '' : eyeSvg(e)) + (m === 'smile' ? '' : mouthSvg(m))));
    variants[key] = im;
  }

  // ---- back layer
  let B;
  if (H.longHair) {
    const occ = polyMask(w, h, H.occ.map((p) => p.map(L)));
    const hair = new Uint8Array(N);
    const dropD = dilate(boxMask, w, h, 3);
    const faceD = dilate(or(face, ears), w, h, 3), exD = dilate(extra, w, h, 2);
    for (let i = 0; i < N; i++) hair[i] = fg[i] && !occ[i] && !faceD[i] && !exD[i] && !dropD[i] && (((i / w) | 0) < 400 - Y0 || src.chroma(i) < 70) ? 1 : 0;
    // drop skin / cloth specks left along occluder borders
    const keep = new Uint8Array(N);
    for (let i = 0; i < N; i++) { const p = i * 4, r = src.px[p], g = src.px[p + 1], b = src.px[p + 2]; if (hair[i] && !(r - b > 45 && r > 170 && g > 120 && r - g > 25) && !(b - g > 40)) keep[i] = 1; }
    const pts = H.hairFill.map(L);
    let d = `M${pts[0].join(',')}`;
    for (let i = 0; i < pts.length; i++) { const g = (k) => pts[(k + pts.length) % pts.length]; const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2); d += `C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`; }
    let strands = '';
    for (let k = 0; k < 9; k += 2) {
      const sx = cx - 112 + k * 28, yb = (k % 2 ? 545 : 528) - Y0;
      strands += `<path d="M${sx},${340 - Y0} C${sx + 10},${400 - Y0} ${sx - 14},${450 - Y0} ${sx + 4},${490 - Y0} S${sx - 4},${yb - 10} ${sx + 2},${yb}" fill="none" stroke="#362c31" stroke-width="3" stroke-linecap="round"/>`;
    }
    B = new Img(w, h);
    over(B, rasterize(w, h, `<path d="${d}Z" fill="rgb(${HAIR_DARK})" stroke="rgb(${INK})" stroke-width="6" stroke-linejoin="round"/>${strands}`));
    const hc = cut(src, keep, bg);
    // soften where the real hair meets the painted fill
    const dk = edt(not(keep), w, h), dbg = edt(bg, w, h);
    for (let i = 0; i < N; i++) if (keep[i] && dbg[i] > 100) hc.px[i * 4 + 3] = Math.round(hc.px[i * 4 + 3] * Math.min(1, Math.sqrt(dk[i]) / 5));
    for (let i = 0; i < N; i++) { const a = hc.px[i * 4 + 3] / 255; for (let c = 0; c < 3; c++) hc.px[i * 4 + c] = Math.round(hc.px[i * 4 + c] * a); }
    over(B, hc);
  } else {
    B = new Img(w, h);
    const y = (v) => v - Y0;
    const hw = R300 - 21;
    over(B, rasterize(w, h, `<path d="M${cx - hw * 0.8},${y(270)} C${cx - hw - 4},${y(290)} ${cx - hw},${y(325)} ${cx - hw},${y(336)} C${cx - hw + 2},${y(372)} ${cx - hw * 0.62},${y(400)} ${cx},${y(400)} C${cx + hw * 0.62},${y(400)} ${cx + hw - 2},${y(372)} ${cx + hw},${y(336)} C${cx + hw},${y(325)} ${cx + hw + 4},${y(290)} ${cx + hw * 0.8},${y(270)}Z" fill="#332b30" stroke="rgb(${INK})" stroke-width="6"/><path d="M${cx + hw * 0.8},${y(330)} Q${cx + hw * 0.76},${y(362)} ${cx + hw * 0.45},${y(386)} M${cx - hw * 0.8},${y(330)} Q${cx - hw * 0.76},${y(362)} ${cx - hw * 0.45},${y(386)}" fill="none" stroke="#51464c" stroke-width="3.4" stroke-linecap="round"/>`));
  }
  // ---- wisps
  const wm = new Uint8Array(N);
  if (!H.longHair) for (let i = 0; i < N; i++) if (fg[i] && !front[i] && ((i / w) | 0) < capY) wm[i] = 1;
  const W = cut(src, wm, bg);
  return { av, w, h, cx, C: Cs, R: Rs, yTop, yBot, variants, back: B, wisps: W, drops, Lx: SL, Rx: SR, capY, backB64: B.toB64(), wispsB64: W.toB64() };
}

// turn the front layer by `yaw` degrees (+ = towards screen-left)
function warpFront(hd, key, yaw) {
  const srcI = hd.variants[key], { w, h } = hd;
  if (Math.abs(yaw) < 0.2) return srcI;
  const o = new Img(w, h), t = yaw * Math.PI / 180;
  const s = srcI.px;
  const lead = -Math.sin(t) * 14;
  const al = new Float32Array(w * h);
  for (let y = hd.yTop; y <= hd.yBot; y++) {
    const R = hd.R[y], c = hd.C[y];
    if (!R) continue;
    for (let x = 0; x < w; x++) {
      let edge = 1, f, stretch = 0;
      const xx = x - lead;
      if (y < hd.capY) {
        // hair: keep the drawn silhouette, continue the texture by folding it at the rim
        const l = hd.Lx[y], r = hd.Rx[y];
        edge = Math.max(0, Math.min(1, xx - l + 0.5, r - xx + 0.5));
        if (edge <= 0) continue;
        const u = Math.max(-1, Math.min(1, (xx - c) / R));
        // side away from the viewer: the hair beyond the temple is stretched round to the rim
        const sg = t >= 0 ? 1 : -1, at = Math.abs(t), ao = Math.asin(u) * sg;
        const rim = Math.asin(Math.max(-1, Math.min(1, sg > 0 ? (r - 12 - c) / R : (c - l - 12) / R)));
        const k0 = Math.min(0.86, rim * 0.75), o0 = k0 - at, o1 = Math.PI / 2;
        let a = ao + at;
        if (a > k0) {
          const q = (ao - o0) / (o1 - o0);            // 0..1 over the stretched zone
          const m = (rim - k0) / (o1 - o0);            // mean slope; ease from slope 1
          a = k0 + (o1 - o0) * (m * q + (1 - m) * q * (1 - q) * (1 - q));
          a = Math.min(a, rim); stretch = q;
        }
        f = c + R * Math.sin(a * sg);
      } else {
        const u = (xx - c) / R;
        if (u < -1 || u > 1) continue;
        const a = Math.asin(u) + t;
        if (a > Math.PI / 2 || a < -Math.PI / 2) continue;
        f = c + R * Math.sin(a);
      }
      f = Math.max(0, Math.min(w - 1.001, f));
      const xi = Math.floor(f), fr = f - xi;
      const p = (y * w + xi) * 4, q = p + 4, d = (y * w + x) * 4;
      const a0 = s[p + 3] * (1 - fr), a1 = s[q + 3] * fr, A = a0 + a1;
      if (A < 1) continue;
      for (let k = 0; k < 3; k++) o.px[d + k] = Math.round((s[p + k] * a0 + s[q + k] * a1) / A);
      if (y < hd.capY) {
        // the far side of the hair: calmer texture, and never mirrored skin
        const skin = stretch > 0.06 && o.px[d] - o.px[d + 2] > 40 && o.px[d] > 120;
        const lum = o.px[d] * 0.3 + o.px[d + 1] * 0.59 + o.px[d + 2] * 0.11;
        const k = skin ? 1 : Math.min(1, stretch * 3) * Math.max(0, Math.min(1, (lum - 58) / 30));
        if (k) for (let q2 = 0; q2 < 3; q2++) o.px[d + q2] = Math.round(o.px[d + q2] * (1 - k) + (HAIR_DARK[q2] + 14) * k);
      }
      o.px[d + 3] = Math.round(A * edge);
      al[y * w + x] = A * edge;
    }
  }
  // re-ink the silhouette (the wrap moved the original outline away from the edge)
  const inside = new Uint8Array(w * h);
  for (let i = 0; i < inside.length; i++) inside[i] = al[i] > 128 ? 1 : 0;
  const de = edt(not(inside), w, h), T = 5.6;
  const ramp = Math.min(1, Math.abs(yaw) / 6);
  for (let i = 0; i < inside.length; i++) {
    if (!inside[i]) continue;
    const yy = (i / w) | 0;
    if (Math.abs(yy - hd.capY) < 17 && hd.av.head.longHair) continue;
    const k = Math.max(0, Math.min(1, T - Math.sqrt(de[i]) + 0.5)) * ramp;
    if (!k) continue;
    for (let c = 0; c < 3; c++) o.px[i * 4 + c] = Math.round(o.px[i * 4 + c] * (1 - k) + INK[c] * k);
  }
  return o;
}

// where a point on the head (bitmap coords) ends up after turning; front=false once it is round the corner
function project(hd, x, y, yaw) {
  const t = yaw * Math.PI / 180, R = hd.R[y] || 100, c = hd.C[y] || hd.cx;
  const a = Math.asin(Math.max(-0.98, Math.min(0.98, (x - c) / R))) - t;
  return { x: c + R * Math.sin(a) - Math.sin(t) * 14, front: Math.abs(a) < 1.35 };
}

module.exports = { project, buildHead, warpFront, Y0, INK };
