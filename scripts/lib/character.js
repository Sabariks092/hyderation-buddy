// Procedural chibi character renderer.
// The body is treated as simple 3D parts (elliptical torso sections, limb bones, a spherical head)
// that are projected to 2D for a given body yaw `phi` (0 = facing viewer, +90 = facing screen-left).
// Coordinates: logical canvas 220 x 300, ground at y = 290, y grows downward.
const { DEG, clamp, lerp, n, rot, smoothPath, polyPath, qbez } = require('./util');

const OUT = '#2b1b20';
const SW = 2.2;
const GROUND = 290;
const LEG1 = 44, LEG2 = 42;
const ARM1 = 25, ARM2 = 23;
const HEAD = { rx: 50, ry: 46 };

// ---------------------------------------------------------------- context / projection
function makeCtx(pose, av, uid) {
  const phi = pose.phi * DEG, hphi = pose.headPhi * DEG;
  const sinp = Math.sin(phi), cosp = Math.cos(phi);
  return {
    pose, av, uid, phi, sinp, cosp, hphi,
    sinh: Math.sin(hphi), cosh: Math.cos(hphi),
    cx: 110 + (pose.hipX || 0),
    hipY: pose.hipY,
    tanLean: Math.tan((pose.lean || 0) * DEG),
    nearSign: sinp > 0.1 ? 1 : (sinp < -0.1 ? -1 : 0),
  };
}
// body-space (u forward, z character-left) at screen height y -> screen x (lean applied above the hip)
function px(c, u, z, y) {
  const leanU = y !== undefined ? Math.max(0, c.hipY - y) * c.tanLean : 0;
  return c.cx + (-(u + leanU) * c.sinp + z * c.cosp);
}
const hwOf = (c, W, D) => Math.sqrt((W * c.cosp) ** 2 + (D * c.sinp) ** 2);
// a point on the torso surface at cross-section (W,D), angle a (0 = front centre, + = character-left)
function surf(c, y, W, D, a) {
  const r = a * DEG;
  const u = D * Math.cos(r), z = W * Math.sin(r);
  return { x: px(c, u, z, y), y, vis: u * c.cosp + z * c.sinp };
}

// ---------------------------------------------------------------- primitives
const pathEl = (d, fill, stroke = OUT, sw = SW, extra = '') =>
  `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round" ${extra}/>`;
const line = (pts, color, w, extra = '') =>
  `<path d="${polyPath(pts)}" fill="none" stroke="${color}" stroke-width="${n(w)}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
const circle = (x, y, r, fill, stroke = OUT, sw = SW, extra = '') =>
  `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${extra}/>`;
const ellipse = (x, y, rx, ry, fill, rotDeg = 0, stroke = OUT, sw = SW, extra = '') =>
  `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(Math.max(0.1, rx))}" ry="${n(Math.max(0.1, ry))}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" transform="rotate(${n(rotDeg)} ${n(x)} ${n(y)})" ${extra}/>`;

// ---------------------------------------------------------------- limbs
function dir3(f, a, side) {
  const fr = f * DEG, ar = a * DEG;
  return { u: Math.sin(fr) * Math.cos(ar), y: Math.cos(fr) * Math.cos(ar), z: side * Math.sin(ar) };
}
function armGeom(c, side, arm) {
  const yS = c.hipY - 44 - (c.pose.breath || 0) * 0.8;
  const S = { u: (c.hipY - yS) * c.tanLean, y: yS, z: side * 22 };
  const d1 = dir3(arm.f1, arm.a1, side), d2 = dir3(arm.f2, arm.a2, side);
  const E = { u: S.u + ARM1 * d1.u, y: S.y + ARM1 * d1.y, z: S.z + ARM1 * d1.z };
  const W = { u: E.u + ARM2 * d2.u, y: E.y + ARM2 * d2.y, z: E.z + ARM2 * d2.z };
  const Hd = { u: W.u + 3.5 * d2.u, y: W.y + 3.5 * d2.y, z: W.z + 3.5 * d2.z };
  const P = (q) => [c.cx + (-q.u * c.sinp + q.z * c.cosp), q.y];
  return { side, arm, S: P(S), E: P(E), W: P(W), H: P(Hd) };
}
const along = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];

function drawArm(c, g) {
  const av = c.av, top = av.top, skin = av.skin.base;
  let s = '';
  // skin arm
  s += line([g.S, g.E, g.W], OUT, 11.6) + line([g.S, g.E, g.W], skin, 8.8);
  // sleeve
  const sl = top.sleeve;
  const sleeveLine = (pts) => line(pts, OUT, 15) + line(pts, top.color, 12.4);
  if (sl === 'long') s += sleeveLine([g.S, g.E, along(g.E, g.W, 0.9)]);
  else if (sl === 'threeQuarter') s += sleeveLine([g.S, g.E, along(g.E, g.W, 0.55)]);
  else if (sl === 'elbow') s += sleeveLine([g.S, along(g.S, g.E, 0.92)]);
  else if (sl === 'shortPuff') {
    const m = along(g.S, g.E, 0.32), ang = Math.atan2(g.E[1] - g.S[1], g.E[0] - g.S[0]) / DEG;
    s += ellipse(m[0], m[1], 11.5, 9, top.color, ang);
    if (top.print) s += flower(m[0] + 2, m[1] + 1, 0.8, top.printColors);
  } else if (sl === 'puff') {
    const m = along(g.S, g.E, 0.42), ang = Math.atan2(g.E[1] - g.S[1], g.E[0] - g.S[0]) / DEG;
    s += ellipse(m[0], m[1], 10.5, 8.6, top.color, ang);
    // smocked band at the bottom of the puff
    const b1 = along(g.S, g.E, 0.62);
    s += ellipse(b1[0], b1[1], 2.6, 6.4, top.shade, ang, OUT, 1.6);
  }
  // cuff line
  if (sl === 'long' || sl === 'threeQuarter') {
    const t = sl === 'long' ? 0.9 : 0.55;
    const p = along(g.E, g.W, t), q = along(g.E, g.W, t - 0.12);
    s += line([q, p], top.line, 2.2, 'opacity="0.6"');
  }
  // bottle in the right hand
  if (g.side === -1 && c.pose.bottle !== false) s += bottle(g.H[0], g.H[1] + 3, c.pose.bottleTilt || 0);
  // hand
  if (g.arm.wave) {
    s += ellipse(g.H[0], g.H[1] - 1, 6, 7, skin, g.arm.handRot || 0);
    // thumb
    s += ellipse(g.H[0] - 5, g.H[1] + 2, 2.4, 3.4, skin, -30 + (g.arm.handRot || 0), OUT, 1.6);
  } else {
    s += circle(g.H[0], g.H[1], 5.1, skin);
  }
  return s;
}

function bottle(x, y, tilt) {
  const g = [];
  g.push(`<g transform="rotate(${n(tilt)} ${n(x)} ${n(y)})">`);
  g.push(`<rect x="${n(x - 6)}" y="${n(y - 12)}" width="12" height="27" rx="4.5" fill="#d9f1fd" stroke="${OUT}" stroke-width="${SW}"/>`);
  g.push(`<path d="M${n(x - 4.6)},${n(y - 2)} h9.2 v13.5 a3.4,3.4 0 0 1 -3.4,3.4 h-2.4 a3.4,3.4 0 0 1 -3.4,-3.4z" fill="#5db6ec"/>`);
  g.push(`<path d="M${n(x - 4.6)},${n(y - 2)} q2.3,-1.4 4.6,0 t4.6,0" fill="none" stroke="#8fd0f5" stroke-width="1.2"/>`);
  g.push(`<rect x="${n(x - 3.6)}" y="${n(y - 9)}" width="2" height="20" rx="1" fill="#ffffff" opacity="0.7"/>`);
  g.push(`<rect x="${n(x - 4)}" y="${n(y - 17.5)}" width="8" height="6.5" rx="1.6" fill="#2f7fc4" stroke="${OUT}" stroke-width="${SW}"/>`);
  g.push(`</g>`);
  return g.join('');
}

function legIK(hip, ank) {
  const dx = ank.u - hip.u, dy = ank.y - hip.y;
  const d = Math.min(Math.hypot(dx, dy), LEG1 + LEG2 - 0.05);
  const base = Math.atan2(dy, dx);
  const a = Math.acos(clamp((LEG1 * LEG1 + d * d - LEG2 * LEG2) / (2 * LEG1 * d), -1, 1));
  const k1 = { u: hip.u + LEG1 * Math.cos(base - a), y: hip.y + LEG1 * Math.sin(base - a) };
  const k2 = { u: hip.u + LEG1 * Math.cos(base + a), y: hip.y + LEG1 * Math.sin(base + a) };
  return k1.u > k2.u ? k1 : k2;
}
function legGeom(c, side, foot) {
  const z = side * 9;
  const hip = { u: 0, y: c.hipY };
  const ank = { u: foot.u, y: GROUND - foot.yUp };
  const knee = legIK(hip, ank);
  const P = (q, zz = z) => [c.cx + (-q.u * c.sinp + zz * c.cosp), q.y];
  // shoe points (foot-local, y up) -> screen
  const fp = (lx, ly, dz = 0) => {
    const r = rot(lx, ly, foot.th);
    return P({ u: foot.u + r.x, y: GROUND - (foot.yUp + r.y) }, z + dz);
  };
  return { side, z, foot, H: P(hip), K: P(knee), A: P(ank), fp };
}
function drawLeg(c, g) {
  const av = c.av, b = av.bottom;
  let color = b.color, w1 = 14.6, w2 = 12;
  if (b.kind === 'skirt' || b.kind === 'kurtaHem') {
    color = b.legs === 'skin' ? av.skin.base : b.legColor;
    w1 = 11.6; w2 = 10;
  }
  let s = '';
  s += line([g.H, g.K], OUT, w1 + 2.8) + line([g.K, g.A], OUT, w2 + 2.8);
  s += line([g.H, g.K], color, w1) + line([g.K, g.A], color, w2);
  if (b.kind === 'pants') {
    // subtle inseam / crease
    s += line([along(g.H, g.K, 0.35), g.K, along(g.K, g.A, 0.8)], b.shade, 1.3, 'opacity="0.55"');
    s += line([along(g.K, g.A, 0.86), along(g.K, g.A, 0.98)], b.cuff, w2 - 1);
  }
  // shoe: two offset capsules give the foot some width in 3/4 view
  const sh = av.shoes;
  const caps = [-2.6, 2.6].map((dz) => [g.fp(-5, -3, dz), g.fp(12.5, -3.6, dz)]);
  s += caps.map((p) => line(p, OUT, 12.4)).join('');
  s += caps.map((p) => line(p, sh.color, 9.8)).join('');
  const sole = [-2.6, 2.6].map((dz) => [g.fp(-5.5, -6.3, dz), g.fp(13, -6.3, dz)]);
  s += sole.map((p) => line(p, sh.sole, 2.2)).join('');
  s += line([g.fp(1, -1.5, 0), g.fp(7, -2.2, 0)], sh.accent, 1.8);
  return s;
}

// ---------------------------------------------------------------- torso & clothes
function torsoGeom(c) {
  const br = c.pose.breath || 0;
  const y = { N: c.hipY - 56, S: c.hipY - 47 - br * 0.8, C: c.hipY - 36, W: c.hipY - 16, H: c.hipY + 6 };
  const sec = { sh: [27, 13], ch: [25 + br * 0.6, 15 + br * 0.5], wa: [21, 12.5], hip: [23, 13.5] };
  const tx = (yy) => px(c, 0, 0, yy);
  const hw = (k) => hwOf(c, sec[k][0], sec[k][1]);
  const L = [
    [tx(y.S - 4) - hwOf(c, 9.5, 7), y.S - 4],
    [tx(y.S) - hw('sh') * 0.8, y.S - 1.5],
    [tx(y.S + 6) - hw('sh'), y.S + 7],
    [tx(y.C + 6) - hw('ch'), y.C + 6],
    [tx(y.W) - hw('wa'), y.W],
    [tx(y.H) - hw('hip'), y.H],
  ];
  const R = L.map(([xx, yy]) => [2 * tx(yy) - xx, yy]).reverse();
  const pts = [...L, [tx(y.H + 2), y.H + 3], ...R, [tx(y.S - 5), y.S - 5.5]];
  return { y, sec, tx, hw, d: smoothPath(pts, true, 0.9) };
}

function flower(x, y, s, cols) {
  let o = '';
  for (let i = 0; i < 5; i++) {
    const a = i * 72 * DEG;
    o += `<circle cx="${n(x + Math.cos(a) * 2.1 * s)}" cy="${n(y + Math.sin(a) * 2.1 * s)}" r="${n(1.6 * s)}" fill="${cols[0]}"/>`;
  }
  o += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(1.1 * s)}" fill="${cols[1]}"/>`;
  return o;
}
// deterministic print positions on the body surface (angle, height-offset-from-hip)
const PRINT = [[-60, -40], [-20, -44], [25, -38], [65, -42], [-45, -28], [5, -30], [45, -24], [-75, -18], [-25, -16], [20, -12], [70, -10],
  [-55, -4], [-5, -2], [40, 2], [-35, 10], [15, 14], [60, 16], [-70, 22], [-15, 24], [30, 28], [-45, 34], [5, 38], [55, 36]];
function printOnTorso(c, T, top, maxOff) {
  if (!top.print) return '';
  let o = '';
  const bright = top.print === 'floralBright';
  PRINT.forEach(([a, off], i) => {
    if (off > maxOff) return;
    const yy = c.hipY + off;
    const sp = surf(c, yy, 21, 13.5, a);
    if (sp.vis < 1) return;
    const cols = bright ? [top.printColors[i % 3], '#f6e7b0'] : [top.printColors[i % 2], top.printColors[2] || '#fff'];
    o += flower(sp.x, sp.y, bright ? 1.05 : 1, cols);
    if (bright && i % 2 === 0) o += ellipse(sp.x + 4, sp.y + 3, 2.2, 1.1, top.printColors[3], 30, 'none', 0);
  });
  return o;
}

function drawNeck(c, head) {
  const skin = c.av.skin;
  const x = head.neckX, top = head.y + 30, bot = c.hipY - 46;
  return `<path d="M${n(x - 6)},${n(top)} L${n(x - 6.5)},${n(bot)} L${n(x + 6.5)},${n(bot)} L${n(x + 6)},${n(top)} Z" fill="${skin.base}" stroke="${OUT}" stroke-width="${SW}"/>` +
    `<path d="M${n(x - 6)},${n(top + 2)} Q${n(x)},${n(top + 8)} ${n(x + 6)},${n(top + 2)} L${n(x + 6)},${n(top)} L${n(x - 6)},${n(top)}Z" fill="${skin.shade}"/>`;
}

function drawTorso(c, head) {
  const av = c.av, top = av.top, T = torsoGeom(c);
  const id = `${c.uid}_t`;
  const cf = Math.max(0.35, Math.abs(c.cosp));
  const fx = (yy, D = 13) => surf(c, yy, 20, D, 0).x;
  let s = `<defs><clipPath id="${id}"><path d="${T.d}"/></clipPath></defs>`;
  const baseFill = top.kind === 'offShoulder' ? av.skin.base : top.color;
  s += pathEl(T.d, baseFill);
  let inner = '';
  const X0 = c.cx - 70, X1 = c.cx + 70;
  if (top.kind === 'offShoulder') {
    // lilac smocked bodice starting below the shoulders, scalloped frill neckline
    const yN = T.y.S + 6;
    let edge = `M${n(X0)},${n(yN)}`;
    for (let x = X0; x <= X1; x += 4) edge += ` Q${n(x + 2)},${n(yN + 2.6)} ${n(x + 4)},${n(yN)}`;
    inner += `<path d="${edge} L${n(X1)},${n(c.hipY + 20)} L${n(X0)},${n(c.hipY + 20)}Z" fill="${top.color}"/>`;
    inner += `<path d="${edge}" fill="none" stroke="${OUT}" stroke-width="1.6"/>`;
    for (let yy = yN + 6; yy < c.hipY + 6; yy += 3.6) {
      let d = `M${n(X0)},${n(yy)}`;
      for (let x = X0; x <= X1; x += 3) d += ` L${n(x + 1.5)},${n(yy + 0.9)} L${n(x + 3)},${n(yy)}`;
      inner += `<path d="${d}" fill="none" stroke="${top.line}" stroke-width="0.9" opacity="0.55"/>`;
    }
    // collarbone hint
    inner += line([[fx(T.y.S + 1) - 9 * cf, T.y.S + 1], [fx(T.y.S + 2) - 3 * cf, T.y.S + 3]], av.skin.shade, 1.2);
  } else {
    inner += printOnTorso(c, T, top, 8);
  }
  // shading on the far side of the torso
  const shadeX = c.nearSign >= 0 ? T.tx(T.y.C) - T.hw('ch') : T.tx(T.y.C) + T.hw('ch');
  if (top.kind !== 'offShoulder') inner += ellipse(shadeX + (c.nearSign >= 0 ? -2 : 2), T.y.C + 10, 9, 40, top.shade, 0, 'none', 0, 'opacity="0.55"');
  else inner += ellipse(shadeX + (c.nearSign >= 0 ? -2 : 2), T.y.C + 14, 8, 32, top.shade, 0, 'none', 0, 'opacity="0.5"');

  if (top.kind === 'dress' || top.kind === 'kurta') {
    // round neckline showing skin
    const nx = fx(T.y.S - 3);
    inner += ellipse(nx, T.y.S - 4, 9 * cf + 2.5, 7.5, av.skin.base, 0, OUT, 1.8);
    if (top.kind === 'kurta') inner += line([[nx, T.y.S + 3], [fx(T.y.S + 12), T.y.S + 12]], top.line, 1.5);
    if (top.kind === 'dress') inner += line([[T.tx(T.y.W) - 40, T.y.W + 1], [T.tx(T.y.W) + 40, T.y.W + 1]], top.line, 1.8, 'opacity="0.7"');
  }
  if (top.kind === 'shirt') {
    const nx = fx(T.y.S - 3);
    inner += `<path d="M${n(nx - 8 * cf - 2)},${n(T.y.S - 6)} L${n(nx)},${n(T.y.S + 4)} L${n(nx + 8 * cf + 2)},${n(T.y.S - 6)}Z" fill="${av.skin.base}" stroke="${OUT}" stroke-width="1.6"/>`;
    // mandarin collar
    inner += `<path d="M${n(nx - 9 * cf - 3)},${n(T.y.S - 8)} Q${n(nx - 5 * cf)},${n(T.y.S - 2)} ${n(nx - 1)},${n(T.y.S + 3)} L${n(nx - 1)},${n(T.y.S)} Q${n(nx - 5 * cf)},${n(T.y.S - 5)} ${n(nx - 9 * cf - 2)},${n(T.y.S - 10)}Z" fill="${top.color}" stroke="${OUT}" stroke-width="1.5"/>`;
    inner += `<path d="M${n(nx + 9 * cf + 3)},${n(T.y.S - 8)} Q${n(nx + 5 * cf)},${n(T.y.S - 2)} ${n(nx + 1)},${n(T.y.S + 3)} L${n(nx + 1)},${n(T.y.S)} Q${n(nx + 5 * cf)},${n(T.y.S - 5)} ${n(nx + 9 * cf + 2)},${n(T.y.S - 10)}Z" fill="${top.color}" stroke="${OUT}" stroke-width="1.5"/>`;
    const p0 = [nx, T.y.S + 4], p1 = [fx(c.hipY + 6), c.hipY + 8];
    inner += line([p0, p1], top.line, 1.4);
    [0.25, 0.55, 0.85].forEach((t) => {
      const p = along(p0, p1, t);
      inner += circle(p[0] + 2 * cf, p[1], 1.5, '#ffffff', top.line, 0.9);
    });
  }
  s += `<g clip-path="url(#${id})">${inner}</g>`;
  s += pathEl(T.d, 'none');

  // ---- accessories on the chest
  const neckL = surf(c, T.y.S - 4, 9, 7, 70), neckR = surf(c, T.y.S - 4, 9, 7, -70);
  if (av.necklace) {
    const nk = av.necklace;
    const low = [fx(T.y.S + (nk.kind === 'heart' ? 13 : 7)), T.y.S + (nk.kind === 'heart' ? 13 : 7)];
    s += `<path d="M${n(neckL.x)},${n(neckL.y)} Q${n(lerp(neckL.x, low[0], 0.5) + 3 * c.sinp)},${n(low[1] + 2)} ${n(low[0])},${n(low[1])} Q${n(lerp(neckR.x, low[0], 0.5) + 3 * c.sinp)},${n(low[1] + 2)} ${n(neckR.x)},${n(neckR.y)}" fill="none" stroke="#8d929b" stroke-width="1.2"/>`;
    if (nk.kind === 'heart') {
      const hx = low[0], hy = low[1] + 1.5;
      s += `<path d="M${n(hx)},${n(hy + 4.6)} C${n(hx - 5.5 * cf)},${n(hy + 0.5)} ${n(hx - 3 * cf)},${n(hy - 3.5)} ${n(hx)},${n(hy - 0.8)} C${n(hx + 3 * cf)},${n(hy - 3.5)} ${n(hx + 5.5 * cf)},${n(hy + 0.5)} ${n(hx)},${n(hy + 4.6)}Z" fill="${nk.color}" stroke="${OUT}" stroke-width="1.2"/>`;
    }
  }
  if (av.scarf) {
    const sc = av.scarf;
    // wrap around the neck + two hanging tails
    const cx0 = T.tx(T.y.S - 6);
    s += `<path d="M${n(cx0 - hwOf(c, 13, 10))},${n(T.y.S - 8)} Q${n(fx(T.y.S + 4))},${n(T.y.S + 8)} ${n(cx0 + hwOf(c, 13, 10))},${n(T.y.S - 8)} L${n(cx0 + hwOf(c, 11, 8))},${n(T.y.S - 13)} Q${n(fx(T.y.S - 2))},${n(T.y.S - 1)} ${n(cx0 - hwOf(c, 11, 8))},${n(T.y.S - 13)}Z" fill="${sc.color}" stroke="${OUT}" stroke-width="${SW}"/>`;
    [-30, 30].forEach((a) => {
      const t0 = surf(c, T.y.S, 20, 14, a), t1 = surf(c, c.hipY - 6, 20, 14, a * 0.7);
      if (t0.vis < -2) return;
      const w = 3.6 * Math.max(0.6, cf);
      const sway = (c.pose.hairSway || 0) * 0.5;
      s += `<path d="M${n(t0.x - w)},${n(t0.y)} Q${n(t0.x - w - 1)},${n(lerp(t0.y, t1.y, 0.5))} ${n(t1.x - w + sway)},${n(t1.y)} L${n(t1.x + w + sway)},${n(t1.y + 2)} Q${n(t0.x + w + 1)},${n(lerp(t0.y, t1.y, 0.5))} ${n(t0.x + w)},${n(t0.y)}Z" fill="${sc.color}" stroke="${OUT}" stroke-width="${SW}"/>`;
      s += line([[t0.x, t0.y + 4], [t1.x + sway, t1.y - 3]], sc.shade, 1.3);
    });
  }
  if (av.dupatta) {
    const dp = av.dupatta;
    if (dp.style === 'drape') {
      // dupatta draped over both shoulders, sagging into a V on the chest
      const lo = [fx(T.y.C + 14), T.y.C + 14];
      [-1, 1].forEach((sd) => {
        const sh = surf(c, T.y.S, 22, 12, sd * 62);
        const mid = surf(c, T.y.C + 4, 21, 14, sd * 40);
        const w = 9;
        s += `<path d="M${n(sh.x - w)},${n(sh.y - 3)} Q${n(mid.x - w)},${n(mid.y)} ${n(lo[0] - 3)},${n(lo[1] + 4)} L${n(lo[0] + 3)},${n(lo[1] - 4)} Q${n(mid.x + w)},${n(mid.y - 6)} ${n(sh.x + w)},${n(sh.y - 5)}Z" fill="${dp.color}" stroke="${OUT}" stroke-width="${SW}"/>`;
        s += line([[sh.x, sh.y], [mid.x, mid.y - 2], [lo[0], lo[1]]], dp.shade, 1.4);
      });
    } else {
      [-1, 1].forEach((sd) => {
        const t0 = surf(c, T.y.S - 1, 22, 13, sd * 52), t1 = surf(c, c.hipY + 28, 22, 14, sd * 45);
        if (t0.vis < -3) return;
        const w = 6.5 * Math.max(0.55, cf);
        const sway = (c.pose.hairSway || 0) * 0.6;
        s += `<path d="M${n(t0.x - w)},${n(t0.y - 2)} L${n(t1.x - w + sway)},${n(t1.y)} Q${n(t1.x + sway)},${n(t1.y + 3)} ${n(t1.x + w + sway)},${n(t1.y)} L${n(t0.x + w)},${n(t0.y - 2)}Z" fill="${dp.color}" stroke="${OUT}" stroke-width="${SW}"/>`;
        s += line([[t0.x - w * 0.3, t0.y + 2], [t1.x - w * 0.3 + sway, t1.y - 2]], dp.shade, 1.4);
        s += line([[t0.x + w * 0.45, t0.y + 2], [t1.x + w * 0.45 + sway, t1.y - 2]], dp.shade, 1);
      });
    }
  }
  if (av.neckband) {
    const a = surf(c, T.y.S - 3, 11, 9, 75), b = surf(c, T.y.S - 3, 11, 9, -75);
    const lo = [fx(T.y.S + 3), T.y.S + 3];
    s += `<path d="M${n(a.x)},${n(a.y)} Q${n(lo[0] + 6 * cf)},${n(lo[1] + 4)} ${n(lo[0])},${n(lo[1] + 2)} Q${n(lo[0] - 6 * cf)},${n(lo[1] + 4)} ${n(b.x)},${n(b.y)}" fill="none" stroke="${av.neckband.color}" stroke-width="2.6"/>`;
  }
  if (av.lanyard) {
    const ly = av.lanyard;
    const card = [fx(T.y.W + 2), T.y.W + 2];
    [neckL, neckR].forEach((p) => {
      s += line([[p.x, p.y], [card[0], card[1] - 7]], OUT, 4.4) + line([[p.x, p.y], [card[0], card[1] - 7]], ly.color, 2.8);
      s += line([[p.x, p.y], [card[0], card[1] - 7]], ly.stripe, 0.8, 'opacity="0.9"');
    });
    s += `<rect x="${n(card[0] - 5.5 * cf - 1)}" y="${n(card[1] - 7)}" width="${n(11 * cf + 2)}" height="13" rx="1.5" fill="${ly.card}" stroke="${OUT}" stroke-width="1.6"/>`;
    s += `<rect x="${n(card[0] - 3 * cf)}" y="${n(card[1] - 4)}" width="${n(6 * cf)}" height="2.4" fill="#d64b4f"/>`;
  }
  return s;
}

function drawLowerGarment(c, legs) {
  const av = c.av, b = av.bottom, top = av.top;
  if (b.kind !== 'skirt' && b.kind !== 'kurtaHem') return '';
  const T = torsoGeom(c);
  const hemY = c.hipY + (b.kind === 'skirt' ? 47 : 36);
  // leg x positions at hem height
  const xs = [];
  [legs.L, legs.R].forEach((g) => {
    const seg = hemY <= g.K[1] ? [g.H, g.K] : [g.K, g.A];
    const t = clamp((hemY - seg[0][1]) / Math.max(1, seg[1][1] - seg[0][1]), 0, 1);
    xs.push(lerp(seg[0][0], seg[1][0], t));
  });
  const cxh = T.tx(hemY);
  const flare = b.kind === 'skirt' ? 10 : 6;
  const left = Math.min(cxh - T.hw('hip') - flare, Math.min(...xs) - 9);
  const right = Math.max(cxh + T.hw('hip') + flare, Math.max(...xs) + 9);
  const tl = [T.tx(T.y.W) - T.hw('wa'), T.y.W], tr = [T.tx(T.y.W) + T.hw('wa'), T.y.W];
  const sway = (c.pose.hairSway || 0) * 0.4;
  const d = `M${n(tl[0])},${n(tl[1])} Q${n(tl[0] - 5)},${n(lerp(tl[1], hemY, 0.55))} ${n(left + sway)},${n(hemY)} Q${n((left + right) / 2 + sway)},${n(hemY + 5)} ${n(right + sway)},${n(hemY)} Q${n(tr[0] + 5)},${n(lerp(tr[1], hemY, 0.55))} ${n(tr[0])},${n(tr[1])}Z`;
  const id = `${c.uid}_h`;
  let s = `<defs><clipPath id="${id}"><path d="${d}"/></clipPath></defs>`;
  s += pathEl(d, top.color);
  let inner = '';
  if (top.print) {
    const bright = top.print === 'floralBright';
    for (let i = 0; i < 14; i++) {
      const fxp = left + ((i * 37) % 100) / 100 * (right - left);
      const fyp = T.y.W + 6 + ((i * 53) % 100) / 100 * (hemY - T.y.W - 4);
      const cols = bright ? [top.printColors[i % 3], '#f6e7b0'] : [top.printColors[i % 2], top.printColors[2]];
      inner += flower(fxp, fyp, 1, cols);
    }
  }
  // folds between the legs
  inner += line([[cxh + sway * 0.5, T.y.W + 10], [(xs[0] + xs[1]) / 2 + sway, hemY]], top.line, 1.3, 'opacity="0.5"');
  inner += line([[left + sway + 1, hemY - 3], [right + sway - 1, hemY - 3]], top.line, 1.2, 'opacity="0.5"');
  s += `<g clip-path="url(#${id})">${inner}</g>` + pathEl(d, 'none');
  return s;
}

// ---------------------------------------------------------------- head
function headGeom(c) {
  const p = c.pose;
  const neckY = c.hipY - 56;
  const neckX = px(c, 0, 0, neckY);
  return {
    x: neckX + (p.headDx || 0), y: c.hipY - 101 + (p.headDy || 0),
    rx: HEAD.rx, ry: HEAD.ry, tilt: p.headTilt || 0, neckX,
  };
}
// a point on the head sphere: a = degrees around (0 = face centre, + = character-left), yOff from centre
function hp(c, h, a, yOff, rs = 1) {
  const cl = Math.sqrt(Math.max(0, 1 - (yOff / h.ry) ** 2));
  const t = a * DEG - c.hphi;
  return { x: h.x + h.rx * rs * cl * Math.sin(t), y: h.y + yOff, vis: Math.cos(t), cl, sin: Math.sin(t) };
}

const PROFILES = {
  longWavy: { prof: (a) => { const k = Math.abs(a); return k <= 90 ? -24 + 26 * Math.pow(k / 90, 1.8) : 2 + (k - 90) * 1.3; }, side: 28, puff: 5, range: 110 },
  longWavySide: { prof: (a) => { const k = Math.abs(a - 18); const v = -26 + 26 * Math.pow(Math.min(k, 100) / 100, 1.6); return Math.abs(a) > 90 ? Math.max(v, 2 + (Math.abs(a) - 90) * 1.3) : v; }, side: 28, puff: 5, range: 110, sidePart: 18 },
  crownBraid: { prof: (a) => -23 + 30 * Math.pow(Math.min(Math.abs(a), 100) / 100, 1.7), side: 7, puff: 3, range: 102 },
  messyBun: { prof: (a) => -21 + 25 * Math.pow(Math.min(Math.abs(a), 100) / 100, 1.5), side: 4, puff: 3, range: 100 },
  slickBraid: { prof: (a) => -25 + 29 * Math.pow(Math.min(Math.abs(a), 100) / 100, 1.6), side: 4, puff: 2.5, range: 100 },
};

function hairCapPath(c, h, P) {
  const R = h.rx + P.puff, Ry = h.ry + P.puff;
  const pts = [];
  const sideY = P.side;
  const sideX = (yo) => R * Math.sqrt(Math.max(0, 1 - (yo / Ry) ** 2));
  pts.push([h.x - sideX(sideY), h.y + sideY]);
  for (let th = 190; th <= 350; th += 8) {
    pts.push([h.x + R * Math.cos(th * DEG), h.y + Ry * Math.sin(th * DEG)]);
  }
  pts.push([h.x + sideX(sideY), h.y + sideY]);
  // hairline from screen-right to screen-left
  const hl = [];
  for (let a = P.range; a >= -P.range; a -= 6) {
    const yo = P.prof(a);
    const q = hp(c, h, a, yo);
    let x = q.x;
    if (q.vis < 0) x = h.x + h.rx * q.cl * Math.sign(q.sin);
    hl.push([x, q.y]);
  }
  // keep the hairline monotonic in x (avoid folding at the silhouette)
  for (let i = 1; i < hl.length; i++) if (hl[i][0] > hl[i - 1][0]) hl[i][0] = hl[i - 1][0];
  return { outer: pts, hairline: hl, d: smoothPath([...pts, ...hl], true, 0.8) };
}

function drawBackHair(c, h) {
  const av = c.av, st = av.hairStyle, H = av.hair;
  if (st !== 'longWavy' && st !== 'longWavySide') return '';
  const p = c.pose;
  const bs = 9 * c.sinh + (p.hairTrail || 0) * c.sinp;
  const sway = p.hairSway || 0;
  const bottom = c.hipY - 34;
  const R = h.rx + 4;
  const pts = [];
  const cx = h.x + bs;
  pts.push([cx - R - 4 + sway * 0.4, h.y + 30]);
  for (let th = 200; th <= 340; th += 20) pts.push([h.x + R * Math.cos(th * DEG), h.y + (h.ry + 7) * Math.sin(th * DEG)]);
  pts.push([cx + R + 4 + sway * 0.4, h.y + 30]);
  pts.push([cx + R + 6 + sway * 0.7, h.y + 58]);
  // wavy bottom edge (right -> left)
  const bl = cx - R - 2 + sway, br = cx + R + 2 + sway;
  const waves = 5;
  for (let i = 0; i <= waves * 2; i++) {
    const t = i / (waves * 2);
    const x = lerp(br, bl, t);
    const y = bottom + (i % 2 === 0 ? 4 : -5) + Math.sin(t * Math.PI) * 6;
    pts.push([x, y]);
  }
  pts.push([cx - R - 6 + sway * 0.7, h.y + 58]);
  let s = pathEl(smoothPath(pts, true, 0.9), H.base);
  // strands
  for (let i = -2; i <= 2; i++) {
    const x0 = cx + i * 17;
    s += `<path d="M${n(x0)},${n(h.y + 40)} Q${n(x0 + 5 + sway * 0.3)},${n(h.y + 70)} ${n(x0 + sway * 0.8)},${n(bottom - 6)}" fill="none" stroke="${H.mid}" stroke-width="1.5"/>`;
  }
  return s;
}

function drawEye(x, y, sx, state, outer, lashColor) {
  const k = clamp(sx, 0, 1);
  if (k < 0.18) return '';
  let s = '';
  if (state === 'open') {
    s += ellipse(x, y, 8.4 * k, 10.4, '#2d2229', 0, OUT, 0.8);
    s += ellipse(x, y + 2.4, 6.8 * k, 7.4, '#57454f', 0, 'none', 0);
    s += ellipse(x, y + 4, 4.8 * k, 4.6, '#82707b', 0, 'none', 0);
    s += circle(x + 2.4 * k * outer * -1 + 2.4 * k, y - 3.6, 3.6 * Math.max(0.55, k), '#ffffff', 'none', 0);
    s += circle(x - 2.6 * k, y + 4.2, 1.6 * Math.max(0.55, k), '#ffffff', 'none', 0);
    // upper lid + lashes
    s += `<path d="M${n(x - 9.6 * k)},${n(y - 4.5)} Q${n(x)},${n(y - 13.5)} ${n(x + 9.6 * k)},${n(y - 4.5)}" fill="none" stroke="${lashColor}" stroke-width="2.8" stroke-linecap="round"/>`;
    const ox = x + outer * 9.6 * k;
    s += `<path d="M${n(ox)},${n(y - 4.5)} l${n(outer * 3.4 * k)},-2.6 M${n(ox - outer * 1.6 * k)},${n(y - 7)} l${n(outer * 3 * k)},-3" fill="none" stroke="${lashColor}" stroke-width="1.7" stroke-linecap="round"/>`;
  } else if (state === 'closed') {
    s += `<path d="M${n(x - 8.5 * k)},${n(y + 1)} Q${n(x)},${n(y + 6.5)} ${n(x + 8.5 * k)},${n(y + 1)}" fill="none" stroke="${lashColor}" stroke-width="2.8" stroke-linecap="round"/>`;
    s += `<path d="M${n(x + outer * 8.5 * k)},${n(y + 1)} l${n(outer * 3 * k)},-1.6" fill="none" stroke="${lashColor}" stroke-width="1.7" stroke-linecap="round"/>`;
  } else { // happy ^ ^
    s += `<path d="M${n(x - 8 * k)},${n(y + 3.5)} Q${n(x)},${n(y - 8)} ${n(x + 8 * k)},${n(y + 3.5)}" fill="none" stroke="${lashColor}" stroke-width="3" stroke-linecap="round"/>`;
  }
  return s;
}

function drawBraidChain(pts, H, tieColor) {
  // pts: array of [x,y] along the braid, draws overlapping lobes
  let s = '';
  const m = pts.length;
  for (let i = 0; i < m - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) / DEG;
    const w = lerp(7.6, 5, i / (m - 1));
    s += ellipse(mx, my, Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.62 + 2, w, H.base, ang + (i % 2 ? 22 : -22), OUT, 1.8);
    s += ellipse(mx - 1, my - 1, 3, 1.3, H.shine, ang + (i % 2 ? 22 : -22), 'none', 0, 'opacity="0.5"');
  }
  const e = pts[m - 1], pe = pts[m - 2];
  const ang = Math.atan2(e[1] - pe[1], e[0] - pe[0]);
  const tx = e[0] + Math.cos(ang) * 2, ty = e[1] + Math.sin(ang) * 2;
  // tuft
  s += `<path d="M${n(tx - 4)},${n(ty)} Q${n(tx - 6)},${n(ty + 9)} ${n(tx + Math.cos(ang) * 10)},${n(ty + Math.sin(ang) * 11)} Q${n(tx + 6)},${n(ty + 9)} ${n(tx + 4)},${n(ty)}Z" fill="${H.base}" stroke="${OUT}" stroke-width="1.8"/>`;
  s += ellipse(tx, ty, 4.6, 2.2, tieColor, ang / DEG, OUT, 1.4);
  return s;
}

function sideBraid(c, h, endOffY, tie) {
  // braid hanging from behind the character's right ear over the right shoulder to the chest
  const startQ = hp(c, h, -96, 26);
  let sx = startQ.x;
  if (startQ.vis < 0) sx = h.x + h.rx * startQ.cl * Math.sign(startQ.sin) * 0.92;
  const start = [sx, startQ.y];
  const sh = surf(c, c.hipY - 49, 19, 14, -55);
  const end = surf(c, c.hipY + endOffY, 18, 15, -38);
  const sway = (c.pose.hairSway || 0) * 0.7;
  const ctrl = [sh.x, sh.y - 6];
  const pts = [];
  for (let i = 0; i <= 7; i++) {
    const t = i / 7;
    const p = qbez(start, ctrl, [end.x + sway, end.y], t);
    pts.push(p);
  }
  return drawBraidChain(pts, c.av.hair, tie);
}

function drawHead(c, h) {
  const av = c.av, st = av.hairStyle, H = av.hair, skin = av.skin, P = PROFILES[st];
  const p = c.pose;
  let s = `<g transform="rotate(${n(h.tilt)} ${n(h.x)} ${n(h.y + 40)})">`;
  // bun sits behind the cap
  if (st === 'messyBun') {
    const bx = h.x + 7 * c.sinh, by = h.y - h.ry - 6;
    s += circle(bx, by, 22, H.base);
    s += `<path d="M${n(bx - 13)},${n(by + 4)} Q${n(bx - 10)},${n(by - 14)} ${n(bx + 4)},${n(by - 12)} Q${n(bx + 15)},${n(by - 6)} ${n(bx + 9)},${n(by + 8)}" fill="none" stroke="${H.mid}" stroke-width="1.8"/>`;
    s += `<path d="M${n(bx - 6)},${n(by + 6)} Q${n(bx - 4)},${n(by - 6)} ${n(bx + 5)},${n(by - 3)}" fill="none" stroke="${H.mid}" stroke-width="1.6"/>`;
    s += `<path d="M${n(bx + 14)},${n(by - 14)} q8,-6 6,4 M${n(bx - 16)},${n(by - 10)} q-8,-4 -5,6 M${n(bx + 2)},${n(by - 22)} q2,-8 8,-5" fill="none" stroke="${OUT}" stroke-width="1.4"/>`;
    s += ellipse(bx - 7, by - 8, 5, 2.4, H.shine, -30, 'none', 0, 'opacity="0.45"');
  }
  // ears
  const earsOnTop = st === 'crownBraid' || st === 'messyBun' || st === 'slickBraid';
  const ear = (a) => {
    const q = hp(c, h, a, 12);
    if (q.vis < -0.45) return '';
    const x = h.x + h.rx * q.cl * q.sin * 1.0 + Math.sign(q.sin) * 1.5;
    const w = 4 + 3 * Math.abs(q.sin);
    return ellipse(x, q.y, w, 8.5, skin.base) + ellipse(x - Math.sign(q.sin) * 0.5, q.y + 0.5, w * 0.45, 4.5, skin.shade, 0, 'none', 0);
  };
  const ears = ear(95) + ear(-95);
  if (!earsOnTop) s += ears;
  // face
  s += ellipse(h.x, h.y, h.rx, h.ry, skin.base);
  // face features
  const eyeState = p.eyes || 'open';
  const lash = '#24181c';
  const fe = (a, yo) => hp(c, h, a, yo, 0.93);
  [27, -27].forEach((a) => {
    const q = fe(a, 10);
    const k = Math.pow(clamp(q.vis, 0, 1), 0.8);
    s += drawEye(q.x, q.y, k, eyeState, Math.sign(a), lash);
    // brow
    const b0 = fe(a - 11, -8), b1 = fe(a + 11, -8), bm = fe(a, -11.5);
    if (q.vis > 0.2) s += `<path d="M${n(b0.x)},${n(b0.y)} Q${n(bm.x)},${n(bm.y - 1.5)} ${n(b1.x)},${n(b1.y)}" fill="none" stroke="#3a2826" stroke-width="2.8" stroke-linecap="round"/>`;
    // blush
    const bl = fe(a * 1.4, 22);
    if (bl.vis > 0.15) s += ellipse(bl.x, bl.y, 6.8 * Math.pow(bl.vis, 0.8), 3.8, skin.blush, 0, 'none', 0, 'opacity="0.5"');
  });
  const nose = fe(0, 21);
  s += ellipse(nose.x, nose.y, 1.4, 1.1, '#d0927f', 0, 'none', 0);
  const m = fe(0, 31);
  const mk = Math.max(0.5, m.vis);
  if (p.mouth === 'open') {
    s += `<path d="M${n(m.x - 6.5 * mk)},${n(m.y - 1.5)} Q${n(m.x)},${n(m.y + 10)} ${n(m.x + 6.5 * mk)},${n(m.y - 1.5)}Z" fill="#9b3a45" stroke="${OUT}" stroke-width="1.6" stroke-linejoin="round"/>`;
    s += ellipse(m.x, m.y + 4.2, 3.4 * mk, 1.8, '#ea7f88', 0, 'none', 0);
  } else if (p.mouth === 'o') {
    s += ellipse(m.x, m.y + 1, 2.6 * mk, 3, '#9b3a45', 0, OUT, 1.4);
  } else {
    s += `<path d="M${n(m.x - 5.2 * mk)},${n(m.y - 0.5)} Q${n(m.x)},${n(m.y + 4.5)} ${n(m.x + 5.2 * mk)},${n(m.y - 0.5)}" fill="none" stroke="#9a3c44" stroke-width="1.9" stroke-linecap="round"/>`;
  }
  // hair cap
  const cap = hairCapPath(c, h, P);
  s += pathEl(cap.d, H.base);
  if (earsOnTop) s += ears;
  // parting / texture
  if (st === 'longWavy' || st === 'crownBraid') {
    const top = hp(c, h, 0, -h.ry + 2), part = hp(c, h, 0, P.prof(0) + 1);
    if (part.vis > 0) s += `<path d="M${n(top.x)},${n(top.y - 2)} Q${n(lerp(top.x, part.x, 0.5) + 2)},${n(lerp(top.y, part.y, 0.5))} ${n(part.x)},${n(part.y)}" fill="none" stroke="${OUT}" stroke-width="1.5"/>`;
    [-50, -25, 25, 50].forEach((a) => {
      const q0 = hp(c, h, a * 0.3, -h.ry + 6), q1 = hp(c, h, a, P.prof(a) - 2);
      if (q1.vis > 0.1) s += `<path d="M${n(q0.x)},${n(q0.y)} Q${n(lerp(q0.x, q1.x, 0.6) + Math.sign(a) * 4)},${n(lerp(q0.y, q1.y, 0.4))} ${n(q1.x)},${n(q1.y)}" fill="none" stroke="${H.mid}" stroke-width="1.5"/>`;
    });
  }
  if (st === 'longWavySide') {
    // side-swept volume with a swoop over the forehead
    const a0 = hp(c, h, 18, -h.ry + 4), a1 = hp(c, h, -40, -12), a2 = hp(c, h, -70, 4);
    s += `<path d="M${n(a0.x)},${n(a0.y)} Q${n(a1.x + 4)},${n(a1.y - 14)} ${n(Math.max(a2.x, h.x - h.rx + 2))},${n(a2.y)}" fill="none" stroke="${H.mid}" stroke-width="1.8"/>`;
    [-10, 40, 70].forEach((a) => {
      const q0 = hp(c, h, 18, -h.ry + 6), q1 = hp(c, h, a, P.prof(a) - 2);
      if (q1.vis > 0.1) s += `<path d="M${n(q0.x)},${n(q0.y)} Q${n(lerp(q0.x, q1.x, 0.5) + 4)},${n(lerp(q0.y, q1.y, 0.4))} ${n(q1.x)},${n(q1.y)}" fill="none" stroke="${H.mid}" stroke-width="1.5"/>`;
    });
  }
  if (st === 'slickBraid') {
    [-60, -30, 0, 30, 60].forEach((a) => {
      const q0 = hp(c, h, a, P.prof(a) - 1), q1 = hp(c, h, a * 0.55 + 0, -h.ry + 3);
      if (q0.vis > 0.05) s += `<path d="M${n(q0.x)},${n(q0.y)} Q${n(lerp(q0.x, q1.x, 0.5))},${n(lerp(q0.y, q1.y, 0.6) - 4)} ${n(q1.x)},${n(q1.y)}" fill="none" stroke="${H.mid}" stroke-width="1.8"/>`;
    });
  }
  if (st === 'messyBun') {
    [-45, -15, 20, 50].forEach((a) => {
      const q0 = hp(c, h, a, P.prof(a) - 1), q1 = hp(c, h, a * 0.4, -h.ry + 2);
      if (q0.vis > 0.05) s += `<path d="M${n(q0.x)},${n(q0.y)} Q${n(lerp(q0.x, q1.x, 0.5) + 3)},${n(lerp(q0.y, q1.y, 0.5) - 3)} ${n(q1.x)},${n(q1.y)}" fill="none" stroke="${H.mid}" stroke-width="1.6"/>`;
    });
    // loose strands near the temples
    [88, -88].forEach((a) => {
      const q = hp(c, h, a, -2);
      if (q.vis > -0.2) {
        const x = q.vis < 0 ? h.x + h.rx * q.cl * Math.sign(q.sin) : q.x;
        s += `<path d="M${n(x)},${n(q.y)} q${n(Math.sign(q.sin) * 3)},10 ${n(Math.sign(q.sin) * -1)},20 q${n(Math.sign(q.sin) * -2)},5 ${n(Math.sign(q.sin) * 2)},9" fill="none" stroke="${OUT}" stroke-width="1.4"/>`;
      }
    });
  }
  if (st === 'crownBraid') {
    // braided band over the crown, from ear to ear
    const lobes = [];
    for (let a = -96; a <= 96; a += 12) {
      const yo = -33 + 25 * Math.pow(Math.abs(a) / 96, 2);
      const q = hp(c, h, a, yo, 1.02);
      if (q.vis > -0.1) lobes.push({ q, a });
    }
    lobes.sort((A, B) => A.q.vis - B.q.vis);
    lobes.forEach(({ q, a }) => {
      const q2 = hp(c, h, a + 6, -33 + 25 * Math.pow(Math.abs(a + 6) / 96, 2), 1.02);
      const ang = Math.atan2(q2.y - q.y, q2.x - q.x) / DEG;
      const k = 0.55 + 0.45 * clamp(q.vis, 0, 1);
      s += ellipse(q.x, q.y, 7.8 * k + 1, 5.4, H.base, ang + 25, OUT, 1.7);
      s += ellipse(q.x - 1, q.y - 1.2, 3 * k, 1.2, H.shine, ang + 25, 'none', 0, 'opacity="0.45"');
    });
  }
  // shine
  const sh1 = hp(c, h, -30, -30), sh2 = hp(c, h, 30, -32);
  [sh1, sh2].forEach((q, i) => { if (q.vis > 0.1 && st !== 'crownBraid') s += ellipse(q.x, q.y, 6, 2.6, H.shine, i ? 25 : -25, 'none', 0, 'opacity="0.42"'); });
  // front locks for long hair
  if (st === 'longWavy' || st === 'longWavySide') {
    const sway = p.hairSway || 0;
    [1, -1].forEach((sd) => {
      const a = sd * 84;
      const q = hp(c, h, a, 4);
      if (q.vis < -0.05) return;
      const x0 = q.vis < 0.2 ? h.x + h.rx * q.cl * Math.sign(q.sin) * 0.98 : q.x;
      const o = Math.sign(q.sin) || sd;
      const w = 9 + 4 * clamp(q.vis, 0, 1);
      const tipY = c.hipY - 34 + (st === 'longWavySide' && sd < 0 ? 6 : 0);
      const pts = [
        [x0 - o * w * 0.9, q.y - 22],
        [x0 - o * w * 0.6, q.y + 20],
        [x0 - o * w * 0.1 + sway * 0.4, q.y + 42],
        [x0 + o * 2 + sway, tipY],
        [x0 + o * w * 1.0 + sway * 0.6, q.y + 44],
        [x0 + o * w * 1.1 + sway * 0.2, q.y + 18],
        [x0 + o * w * 0.6, q.y - 22],
      ];
      s += pathEl(smoothPath(pts, true, 0.9), H.base);
      s += `<path d="M${n(x0)},${n(q.y - 6)} Q${n(x0 + o * 4)},${n(q.y + 22)} ${n(x0 + o * 1 + sway * 0.8)},${n(tipY - 10)}" fill="none" stroke="${H.mid}" stroke-width="1.5"/>`;
    });
  }
  // glasses
  if (av.glasses) {
    const g = av.glasses;
    const lens = [27, -27].map((a) => { const q = fe(a, 10); return { q, k: Math.pow(clamp(q.vis, 0, 1), 0.8), a }; });
    lens.forEach(({ q, k }) => {
      if (k < 0.12) return;
      s += ellipse(q.x, q.y, 13.2 * k + 0.6, 12.8, '#ffffff', 0, g.color, g.width, 'fill-opacity="0.14"');
    });
    const iL = fe(12, 8), iR = fe(-12, 8), br = fe(0, 6);
    if (lens[0].k > 0.12 && lens[1].k > 0.12) s += `<path d="M${n(iL.x)},${n(iL.y)} Q${n(br.x)},${n(br.y - 3)} ${n(iR.x)},${n(iR.y)}" fill="none" stroke="${g.color}" stroke-width="${g.width}"/>`;
    // temple arm on the visible side
    lens.forEach(({ q, k, a }) => {
      const e = hp(c, h, Math.sign(a) * 92, 6);
      const o = fe(a + Math.sign(a) * 15, 8);
      if (e.vis > 0 && k > 0.12) s += `<path d="M${n(o.x)},${n(o.y)} L${n(e.x)},${n(e.y)}" fill="none" stroke="${g.color}" stroke-width="${g.width}"/>`;
    });
  }
  // earrings
  if (av.earring) {
    [95, -95].forEach((a) => {
      const q = hp(c, h, a, 21);
      if (q.vis < -0.3) return;
      const x = h.x + h.rx * q.cl * q.sin + Math.sign(q.sin) * 1.5;
      if (av.earring.kind === 'pearl') s += circle(x, q.y + 2, 2.8, '#ffffff', OUT, 1.3);
      else s += `<circle cx="${n(x)}" cy="${n(q.y + 4)}" r="4.6" fill="none" stroke="#c8ccd3" stroke-width="1.8"/><circle cx="${n(x)}" cy="${n(q.y + 4)}" r="5.7" fill="none" stroke="${OUT}" stroke-width="0.6" opacity="0.6"/>`;
    });
  }
  s += '</g>';
  return s;
}

// ---------------------------------------------------------------- full character
function drawCharacter(pose, av, uid) {
  const c = makeCtx(pose, av, uid);
  const head = headGeom(c);
  const legs = { L: legGeom(c, 1, pose.feet.L), R: legGeom(c, -1, pose.feet.R) };
  const arms = { L: armGeom(c, 1, pose.arms.L), R: armGeom(c, -1, pose.arms.R) };
  const key = (z) => (z > 0 ? 'L' : 'R');
  const far = c.nearSign === 0 ? 0 : -c.nearSign;
  let s = '';
  s += drawBackHair(c, head);
  if (far) s += drawArm(c, arms[key(far)]);
  const legOrder = far ? [far, -far] : [1, -1];
  legOrder.forEach((z) => { s += drawLeg(c, legs[key(z)]); });
  s += drawLowerGarment(c, legs);
  s += drawNeck(c, head);
  s += drawTorso(c, head);
  if (av.hairStyle === 'crownBraid') s += sideBraid(c, head, -24, '#e0565e');
  if (av.hairStyle === 'slickBraid') s += sideBraid(c, head, -20, '#c8ccd3');
  const front = far ? [arms[key(-far)]] : [arms.L, arms.R];
  front.filter((g) => !g.arm.wave).forEach((g) => { s += drawArm(c, g); });
  s += drawHead(c, head);
  front.filter((g) => g.arm.wave).forEach((g) => { s += drawArm(c, g); });
  return s;
}

module.exports = { drawCharacter, GROUND, LEG1, LEG2 };
