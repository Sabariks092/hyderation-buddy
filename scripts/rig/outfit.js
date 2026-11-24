// Neck, torso and clothes. The torso is a stack of elliptical sections, so every detail is placed
// on the surface and moves correctly when the body turns.
const { DEG, clamp, lerp, n, smoothPath } = require('../lib/util');
const { HIP, GROUND_REF } = require('./dims');
const { INK, P, S, E, pts, mix, along } = require('./ink');

const Y = (refY) => refY - GROUND_REF - HIP;        // reference y -> offset from the hip joint
const X = (c, u, z, yo) => -(u + Math.max(0, -yo) * c.tanL) * c.sinp + z * c.cosp;
function sec(c, refY) {
  const s = c.av.sections;
  if (refY <= s[0][0]) return [s[0][1], s[0][2]];
  for (let i = 1; i < s.length; i++) if (refY <= s[i][0]) { const t = (refY - s[i - 1][0]) / (s[i][0] - s[i - 1][0]); return [lerp(s[i - 1][1], s[i][1], t), lerp(s[i - 1][2], s[i][2], t)]; }
  const l = s[s.length - 1]; return [l[1], l[2]];
}
const halfW = (c, refY) => { const [W, D] = sec(c, refY); return Math.hypot(W * c.cosp, D * c.sinp); };
const mid = (c, refY) => X(c, 0, 0, Y(refY));
const yy = (c, refY) => c.hipY + Y(refY) - (refY < 500 ? (c.pose.breath || 0) * 1.6 * (500 - refY) / 70 : 0);
function surf(c, refY, a, k = 1) { // point on the clothes; a = angle from the front, + = her left
  const [W, D] = sec(c, refY), r = a * DEG;
  const u = D * k * Math.cos(r), z = W * k * Math.sin(r);
  return { x: X(c, u, z, Y(refY)), y: yy(c, refY), vis: u * c.cosp + z * c.sinp };
}

// ---------------------------------------------------------------- prints
function rose(x, y, k) { return `<g><ellipse cx="${n(x + 8 * k)}" cy="${n(y + 6 * k)}" rx="${4.4 * k}" ry="${2 * k}" fill="#5d7a3c" transform="rotate(30 ${n(x + 8 * k)} ${n(y + 6 * k)})"/><circle cx="${n(x)}" cy="${n(y)}" r="${6.6 * k}" fill="#f08a8e" stroke="#8f1e2b" stroke-width="${2.2 * k}"/><circle cx="${n(x)}" cy="${n(y)}" r="${2.8 * k}" fill="#c22a3a" stroke="#8f1e2b" stroke-width="${1.4 * k}"/></g>`; }
function flower(x, y, k, col) { let o = ''; for (let i = 0; i < 5; i++) { const a = (i * 72 - 90) * DEG; o += `<circle cx="${n(x + Math.cos(a) * 5.4 * k)}" cy="${n(y + Math.sin(a) * 5.4 * k)}" r="${n(4.4 * k)}" fill="${col}"/>`; } return o + `<circle cx="${n(x)}" cy="${n(y)}" r="${n(3 * k)}" fill="#fff8e8"/>`; }
const FC = ['#3f7de0', '#fdbb2c', '#f0444f'];
const FLOWERS = [[486, 0, 0], [468, 24, 0], [520, 3, 1], [549, 24, 2], [541, -33, 0], [577, -8, 2], [615, -20, 1], [642, 6, 1], [652, 34, 1], [652, -40, 2], [640, -55, 0], [640, 60, 0], [560, 80, 2], [600, 95, 0], [520, 100, 1], [640, 110, 2], [560, -80, 1], [600, -100, 2], [520, -110, 0], [640, -115, 1], [580, 140, 1], [620, 150, 0], [580, -150, 2], [620, 180, 2]];
const ROSES = [[457, -22], [488, 6], [526, -24], [552, -44], [558, -2], [588, -4], [608, -14], [614, -50], [640, -16], [634, 14], [624, 48], [656, 36], [649, -48], [520, 70], [560, 85], [600, 100], [640, 90], [520, -80], [570, -90], [620, -100], [650, 130], [590, 150], [540, 130], [640, -145], [590, -140], [480, 60], [480, -60]];
function print(c) {
  let o = '';
  if (c.av.print === 'flowers') FLOWERS.forEach(([ry, a, k]) => { const p = surf(c, ry, a); if (p.vis > 4) o += flower(p.x, p.y, 1.02, FC[k]); });
  if (c.av.print === 'roses') ROSES.forEach(([ry, a]) => { const p = surf(c, ry, a); if (p.vis > 4) o += rose(p.x, p.y, 1); });
  return o;
}

// ---------------------------------------------------------------- silhouette
function torsoPath(c, legs) {
  const secs = c.av.sections, last = secs[secs.length - 1][0], skirt = last > 630;
  const L = [], R = [];
  let spreadL = 0, spreadR = 0;
  if (skirt) { // the hem opens over the stride
    const hy = c.hipY + Y(last), xs = [];
    legs.forEach((g) => { const sg = hy <= g.K[1] ? [g.H, g.K] : [g.K, g.A]; const t = clamp((hy - sg[0][1]) / Math.max(1, sg[1][1] - sg[0][1]), 0, 1); xs.push(lerp(sg[0][0], sg[1][0], t)); });
    const w = halfW(c, last), m = mid(c, last);
    spreadL = Math.min(0, Math.min(...xs) - 30 - (m - w)); spreadR = Math.max(0, Math.max(...xs) + 30 - (m + w));
  }
  const sway = (c.pose.hairSway || 0) * 0.35;
  secs.forEach(([ry]) => {
    const k = Math.pow(clamp((ry - 520) / (last - 520), 0, 1), 1.4);
    const m = mid(c, ry) + sway * k, w = halfW(c, ry), y = yy(c, ry);
    L.push([m - w + spreadL * k, y]); R.push([m + w + spreadR * k, y]);
  });
  const sag = c.av.hemSag, b0 = L[L.length - 1], b1 = R[R.length - 1];
  const r2 = smoothPath([...R].reverse(), false).replace('M', 'L');
  return { d: `${smoothPath(L, false)}Q${n((b0[0] + b1[0]) / 2)},${n(b0[1] + sag * 2)} ${n(b1[0])},${n(b1[1])}${r2}Z` };
}
function seamLine(c, ry, sag = 9, color = INK, w = 4.4, a0 = -180, a1 = 176, extra = '') {
  const p = [];
  for (let a = a0; a <= a1; a += 8) { const q = surf(c, ry, a); if (q.vis > -2) p.push([q.x, q.y + sag * clamp(q.vis / sec(c, ry)[1], 0, 1)]); }
  p.sort((a, b) => a[0] - b[0]);
  return p.length > 2 ? S(smoothPath(p, false), color, w, extra) : '';
}
function neck(c) {
  const x0 = mid(c, 428), x1 = mid(c, 405) - c.sinp * 3, y0 = yy(c, 436), y1 = yy(c, 398), s = c.av.skin;
  return P(`M${n(x1 - 17)},${n(y1)} L${n(x0 - 18)},${n(y0)} Q${n(x0)},${n(y0 + 8)} ${n(x0 + 18)},${n(y0)} L${n(x1 + 17)},${n(y1)}Z`, s.base) + `<path d="M${n(x1 - 15)},${n(y1)} L${n(x0 - 15)},${n(yy(c, 419))} Q${n(x0)},${n(yy(c, 429))} ${n(x0 + 15)},${n(yy(c, 419))} L${n(x1 + 15)},${n(y1)}Z" fill="${s.shade}" opacity="0.75"/>`;
}

// ---------------------------------------------------------------- torso
function torso(c, legs) {
  const av = c.av, t = av.top, T = torsoPath(c, legs), id = c.clip(), cf = c.cf;
  const last = av.sections[av.sections.length - 1][0];
  const F = (ry) => surf(c, ry, 0);
  let inner = '';
  if (t.bare) { // skin above the smocked edge
    inner += `<rect x="-220" y="${n(yy(c, 410))}" width="440" height="${n(yy(c, 462) - yy(c, 410))}" fill="${av.skin.base}"/>`;
    const yb = yy(c, 459), m = mid(c, 459), hw = halfW(c, 459) + 10;
    let zig = `M${n(m - hw)},${n(yb)}`; for (let x = -hw; x < hw; x += 7) zig += 'q3.5,6 7,0';
    inner += `<path d="${zig} V${n(yy(c, 480))} H${n(m - hw)}Z" fill="${t.color}"/>` + S(zig, INK, 4.4);
    const cl = surf(c, 444, -30), cr = surf(c, 444, 30);
    inner += S(`M${n(cl.x - 12)},${n(cl.y + 2)} Q${n(cl.x)},${n(cl.y + 4)} ${n(cl.x + 10)},${n(cl.y + 5)} M${n(cr.x + 12)},${n(cr.y + 2)} Q${n(cr.x)},${n(cr.y + 4)} ${n(cr.x - 10)},${n(cr.y + 5)}`, av.skin.shade, 2.6);
    for (let r = 0, ry = 474; ry < 574; ry += 10, r++) { let d = ''; for (let a = -84 + (r % 2) * 6; a <= 84; a += 12) { const q = surf(c, ry, a); if (q.vis > 4) d += `M${n(q.x - 2.5)},${n(q.y)}l5,1.6`; } if (d) inner += S(d, t.line, 1.8, 'opacity="0.5"'); }
    inner += seamLine(c, 500, 5, t.line, 2.6) + seamLine(c, 522, 5, t.line, 2.8);
    [-70, -35, 0, 35, 70].forEach((a) => { const p0 = surf(c, 526, a), p1 = surf(c, 562, a); if (p1.vis > 2) inner += S(`M${n(p0.x)},${n(p0.y + 4)}L${n(p1.x)},${n(p1.y)}`, t.line, 2.4, 'opacity="0.45"'); });
  }
  inner += print(c);
  // soft shading on the side away from the light, rim light on the other
  const sx = (ry) => mid(c, ry) + halfW(c, ry) * 0.72, lx = (ry) => mid(c, ry) - halfW(c, ry) * 0.86;
  const y0 = t.bare ? 466 : 440;
  inner += `<path d="M${n(sx(y0))},${n(yy(c, y0))} L${n(sx(525))},${n(yy(c, 525))} L${n(sx(last))},${n(yy(c, last + 12))} h120 V${n(yy(c, y0))}Z" fill="${t.shade}" opacity="0.4"/>`;
  inner += S(`M${n(lx(540))},${n(yy(c, 540))} L${n(lx(last))},${n(yy(c, last - 4))}`, t.light, 6, 'opacity="0.7"');
  if (t.kind === 'kurta' || t.kind === 'dress') {
    [-28, 4, 34].forEach((a) => { const p0 = surf(c, 590, a), p1 = surf(c, last - 8, a * 1.1); if (p1.vis > 2) inner += S(`M${n(p0.x)},${n(p0.y)}L${n(p1.x)},${n(p1.y)}`, t.line, 2.6, 'opacity="0.4"'); });
    if (!av.cardigan) inner += seamLine(c, last - 16, 8, t.line, 2, -180, 176, 'opacity="0.45"');
  }
  if (av.seam) inner += seamLine(c, av.seam, 9, INK, 4.6);
  if (av.id === 'pearl') inner += seamLine(c, 602, 5, INK, 4.4, -50, 50) + seamLine(c, 499, 4, t.line, 2.4, -40, 40);
  if (av.id === 'ruby') inner += seamLine(c, 500, 5, t.line, 2.2) + seamLine(c, 526, 6, t.line, 2.6);
  if (t.kind === 'shirt') {
    const f0 = F(452), f1 = F(594), bl = 8 * c.cosp;
    inner += S(`M${n(f0.x + bl)},${n(f0.y + 8)} Q${n(F(520).x + bl)},${n(yy(c, 520))} ${n(f1.x + bl)},${n(f1.y + 8)}`, t.line, 3);
    [480, 521, 549].forEach((ry) => { const q = surf(c, ry, 0); inner += E(q.x, q.y, 4.6 * cf, 4.6, '#eef9e8', 0, t.line, 2.4); });
    const pk = surf(c, 480, 44);
    if (pk.vis > 6) inner += P(`M${n(pk.x - 9 * cf)},${n(pk.y - 11)} h${n(18 * cf)} v15 q0,8 ${n(-9 * cf)},8 q${n(-9 * cf)},0 ${n(-9 * cf)},-8z`, 'none', t.line, 2.4);
  }
  let s = `<clipPath id="${id}"><path d="${T.d}"/></clipPath>` + P(T.d, c.g('top'), 'none', 0) + `<g clip-path="url(#${id})">${inner}</g>` + P(T.d, 'none');
  // neckline
  const nx = F(432).x, nw = 22 * Math.max(0.72, Math.abs(c.cosp)), ny = yy(c, 430), nxx = nx * 0.75;
  const scoop = (dep) => `M${n(nxx - nw)},${n(ny - 4)} Q${n(nxx - nw * 0.8)},${n(ny + dep)} ${n(nxx)},${n(ny + dep)} Q${n(nxx + nw * 0.8)},${n(ny + dep)} ${n(nxx + nw)},${n(ny - 4)}`;
  // skin patch joins the neck (no line across the throat)
  const throat = (dep) => P(`${scoop(dep)}L${n(nxx + 14)},${n(ny - 12)} L${n(nxx - 14)},${n(ny - 12)}Z`, av.skin.base, 'none', 0) + S(scoop(dep), INK, 4.2);
  if (av.cardigan) {
    const d = `M${n(nxx - nw - 3)},${n(ny - 2)} Q${n(nxx - nw * 0.8)},${n(ny + 25)} ${n(nxx)},${n(ny + 25)} Q${n(nxx + nw * 0.8)},${n(ny + 25)} ${n(nxx + nw + 3)},${n(ny - 2)}`;
    s += throat(20) + S(d, INK, 13) + S(d, '#3b3539', 6);
    (c.near ? [-c.near, c.near] : [-1, 1]).forEach((sd) => { s += cardigan(c, sd); });
  } else if (t.kind === 'dress') {
    const d = `M${n(nxx - nw)},${n(ny)} Q${n(nxx)},${n(ny + 32)} ${n(nxx + nw)},${n(ny)}`;
    s += throat(17) + S(d, INK, 10) + S(d, '#f7ead2', 4.6);
    s += P(`M${n(nxx)},${n(ny + 18)} l${n(-13 * cf)},-7 v14z M${n(nxx)},${n(ny + 18)} l${n(13 * cf)},-7 v14z`, '#8f1e2b', INK, 3) + S(`M${n(nxx - 1)},${n(ny + 20)} l${n(-7 * cf)},13 M${n(nxx + 1)},${n(ny + 20)} l${n(7 * cf)},13`, '#f08a8e', 3.4) + E(nxx, ny + 18, 4, 4, '#f08a8e', 0, INK, 2.4);
  } else if (t.kind === 'shirt') {
    const v = F(452), vx = v.x * 0.9;
    s += P(`M${n(nxx - nw)},${n(ny - 8)} L${n(vx)},${n(v.y + 2)} L${n(nxx + nw)},${n(ny - 8)}Z`, av.skin.base, 'none', 0) + S(`M${n(nxx - nw)},${n(ny - 8)} L${n(vx)},${n(v.y + 2)} L${n(nxx + nw)},${n(ny - 8)}`, INK, 4);
    [-1, 1].forEach((sd) => { s += P(`M${n(nxx + sd * (nw - 1))},${n(ny - 13)} L${n(nxx + sd * (nw + 9 * cf))},${n(ny - 4)} L${n(nxx + sd * (nw * 0.75 + 5))},${n(ny + 20)} L${n(vx + sd * 6)},${n(ny + 6)}Z`, mix(t.color, '#ffffff', 0.25), INK, 4.4); });
  } else if (av.dupatta) {
    s += throat(18);
  } else if (t.bare) { // bare shoulders: hide the line between neck and chest
    s += `<rect x="${n(mid(c, 428) - 15)}" y="${n(yy(c, 418))}" width="30" height="${n(yy(c, 440) - yy(c, 418))}" fill="${av.skin.base}"/>`;
  }
  if (av.necklace) {
    const lo = surf(c, 484, 0, 1.04), a = [nxx - nw * 0.95, ny + 4], b = [nxx + nw * 0.95, ny + 4];
    const d = `M${n(a[0])},${n(a[1])} Q${n(lerp(a[0], lo.x, 0.45))},${n(lo.y - 18)} ${n(lo.x)},${n(lo.y - 6)} Q${n(lerp(b[0], lo.x, 0.45))},${n(lo.y - 18)} ${n(b[0])},${n(b[1])}`;
    const hx = lo.x, hy = lo.y;
    s += S(d, '#8d8f99', 3.4) + S(d, '#e6e7ee', 1.2);
    s += P(`M${n(hx)},${n(hy + 10)} C${n(hx - 15 * cf)},${n(hy + 1)} ${n(hx - 9 * cf)},${n(hy - 11)} ${n(hx)},${n(hy - 4)} C${n(hx + 9 * cf)},${n(hy - 11)} ${n(hx + 15 * cf)},${n(hy + 1)} ${n(hx)},${n(hy + 10)}Z`, '#ffffff', INK, 3.6);
  }
  if (av.scarf) s += scarf(c);
  if (av.dupatta) s += dupatta(c, nxx, nw, ny);
  return s;
}

function cardigan(c, sd) {
  const rows = [432, 450, 480, 530, 580, 615, 640], inA = [60, 34, 31, 29, 25, 21, 19];
  const A = rows.map((ry, i) => surf(c, ry, sd * inA[i], 1.02));
  // outer edge: the silhouette on this side (kept inside the kurta near the hem)
  const rim = sd * (c.cosp >= 0 ? 1 : -1);
  const B = rows.map((ry) => ({ x: mid(c, ry) + rim * halfW(c, ry) * (ry > 560 ? lerp(1.02, 0.9, (ry - 560) / 80) : 1.02), y: yy(c, ry) }));
  if (A.every((q) => q.vis < 1)) return '';
  const a = A.map((q, i) => [q.vis < 0 ? B[i].x : q.x, q.y]), b = B.map((q) => [q.x, q.y]);
  const e = a[a.length - 1], f = b[b.length - 1];
  const d = `${smoothPath(a, false)}Q${n((e[0] + f[0]) / 2)},${n(e[1] + 9)} ${n(f[0])},${n(f[1])}${smoothPath([...b].reverse(), false).replace('M', 'L')}Z`;
  const id = c.clip();
  let inner = '';
  [[578, 46, 0], [614, 34, 2], [612, 62, 1], [541, 70, 1], [560, 110, 2], [600, 100, 0], [520, 120, 0], [630, 130, 1], [580, 150, 2]].forEach(([ry, ang, k]) => { const p = surf(c, ry, sd * ang); if (p.vis > 2) inner += flower(p.x, p.y, 0.9, FC[k]); });
  return `<clipPath id="${id}"><path d="${d}"/></clipPath>` + P(d, mix(c.av.top.color, c.av.top.light, 0.25), 'none', 0) + `<g clip-path="url(#${id})">${inner}</g>` + P(d, 'none');
}
function scarf(c) {
  if (c.sinp < -0.5) return ''; // turned away from the scarf side
  const sway = (c.pose.hairSway || 0) * 0.5;
  const row = (ry, a, w, sw = 0) => { const q = surf(c, ry, a, 1.05); return [q.x + sw, q.y, w * Math.max(0.6, c.cf)]; };
  const r = [row(428, 50, 15), row(445, 40, 16), row(490, 34, 16), row(540, 30, 18, sway * 0.5), row(573, 28, 20, sway)];
  const L = r.map(([x, y, w]) => [x - w, y]), R = r.map(([x, y, w], i) => [x + w, y + (i === 4 ? 5 : 0)]).reverse();
  return P(`${smoothPath(L, false)}${smoothPath(R, false).replace('M', 'L')}Z`, c.av.scarf) +
    S(pts(r.slice(1).map(([x, y, w]) => [x - w * 0.3, y - 2])), '#564b51', 3) + S(pts(r.slice(1).map(([x, y, w]) => [x + w * 0.4, y - 2])), '#564b51', 2.4);
}
function dupatta(c, nxx, nw, ny) {
  const av = c.av;
  let s = '';
  const v = surf(c, 506, 0, 1.05);
  s += P(`M${n(nxx - nw)},${n(ny)} Q${n(nxx)},${n(ny + 26)} ${n(nxx + nw)},${n(ny)} L${n(v.x)},${n(v.y - 10)}Z`, av.top.color, INK, 3.4) + S(`M${n(lerp(nxx, v.x, 0.35))},${n(ny + 18)} L${n(lerp(nxx, v.x, 0.75))},${n(ny + 44)}`, av.top.line, 2.6);
  (c.near ? [-c.near, c.near] : [-1, 1]).forEach((sd) => {
    const rows = [432, 452, 478];
    const p = [surf(c, 432, sd * 80, 1.04), surf(c, 452, sd * 66, 1.05), surf(c, 478, sd * 52, 1.05)].map((q, i) => (q.vis < 0 ? [mid(c, rows[i]) + sd * halfW(c, rows[i]) * 1.02, q.y] : [q.x, q.y]));
    const top = [nxx + sd * nw, ny - 4];
    const at = (q) => q.map(n).join(',');
    s += P(`M${at(top)} L${at(p[0])} Q${at(p[1])} ${at(p[2])} Q${n(lerp(p[2][0], v.x, 0.5))},${n(v.y - 2)} ${n(v.x)},${n(v.y)} Q${n(lerp(top[0], v.x, 0.5) + sd * 4 * c.cosp)},${n(lerp(top[1], v.y, 0.5))} ${at(top)}Z`, av.dupatta, INK, 4.6);
    s += S(`M${at(along(top, p[0], 0.6))} Q${at(along(top, p[1], 0.8))} ${n(lerp(p[2][0], v.x, 0.55))},${n(v.y - 18)}`, '#5a4f55', 2.6);
  });
  const f0 = surf(c, 506, -50, 1.02), f1 = surf(c, 524, -8, 1.02);
  if (f0.vis > 0 && f1.vis > 0) s += S(`M${n(f0.x)},${n(f0.y)} Q${n(lerp(f0.x, f1.x, 0.4))},${n(f1.y - 2)} ${n(f1.x)},${n(f1.y)}`, INK, 4);
  // lanyard + card
  const k = surf(c, 500, 0, 1.1), kx = k.x + (c.pose.hairSway || 0) * 0.2, ky = k.y;
  [-1, 1].forEach((sd) => {
    const a = [nxx + sd * nw * 0.95, ny - 4], b = [kx, ky];
    s += S(pts([a, b]), INK, 15) + S(pts([a, b]), av.lanyard, 9);
    [0.35, 0.6, 0.85].forEach((t) => { const q = along(a, b, t); s += `<rect x="${n(q[0] - 2.6)}" y="${n(q[1] - 3)}" width="5.2" height="6" rx="1" fill="#e9f3ff" transform="rotate(${sd * 22} ${n(q[0])} ${n(q[1])})"/>`; });
  });
  const cw = 15 * Math.max(0.5, c.cf);
  return s + `<rect x="${n(kx - 4)}" y="${n(ky - 4)}" width="8" height="11" rx="2" fill="#e8ebf0" stroke="${INK}" stroke-width="3"/>` +
    `<rect x="${n(kx - cw)}" y="${n(ky + 6)}" width="${n(cw * 2)}" height="33" rx="4" fill="#ffffff" stroke="${INK}" stroke-width="4.6"/>` +
    `<rect x="${n(kx - cw * 0.55)}" y="${n(ky + 14)}" width="${n(cw * 1.1)}" height="9" fill="#b9d3f5"/><rect x="${n(kx - cw * 0.55)}" y="${n(ky + 27)}" width="${n(cw * 1.1)}" height="3" fill="#8fb4ea"/>`;
}

module.exports = { X, Y, mid, yy, surf, neck, torso, rose };
