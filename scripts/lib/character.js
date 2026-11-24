// Procedural character renderer (sticker-illustration style, modelled on the /assets references).
// The body is treated as simple 3D parts (elliptical torso sections, tapered limb bones, a spherical
// head) projected to 2D for a body yaw `phi` (0 = facing viewer, +90 = facing screen-left).
// Logical canvas 220 x 300, ground at y = 290, y grows downward.
const { DEG, clamp, lerp, n, rot, smoothPath, polyPath, qbez } = require('./util');

const OUT = '#2a171c';
const SW = 2.2;
const GROUND = 290;
const LEG1 = 44, LEG2 = 42;
const ARM1 = 25, ARM2 = 23;
const HEAD = { rx: 50, ry: 46 };

// ---------------------------------------------------------------- colour helpers
function mix(hex, to, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = p(hex), b = p(to);
  return '#' + a.map((v, i) => Math.round(lerp(v, b[i], t)).toString(16).padStart(2, '0')).join('');
}
const lighten = (c, t = 0.15) => mix(c, '#ffffff', t);

// ---------------------------------------------------------------- shared <defs> (one set per avatar)
function defs(av) {
  const p = av.id;
  const lin = (id, stops, x2 = 0, y2 = 1) =>
    `<linearGradient id="${p}_${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops.map(([o, c, op = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${op}"/>`).join('')}</linearGradient>`;
  const top = av.top, b = av.bottom;
  const legColor = b.kind === 'pants' ? b.color : (b.legs === 'skin' ? av.skin.base : b.legColor);
  const legShade = b.kind === 'pants' ? b.shade : (b.legs === 'skin' ? av.skin.shade : b.legShade);
  return `<defs>
${lin('skin', [[0, av.skin.light], [0.45, av.skin.base], [1, av.skin.shade]], 1, 0)}
${lin('face', [[0, av.skin.light], [0.55, av.skin.base], [1, mix(av.skin.base, av.skin.shade, 0.6)]], 0.25, 1)}
${lin('hair', [[0, av.hair.top], [0.45, av.hair.base], [1, av.hair.dark]], 0, 1)}
${lin('hairS', [[0, av.hair.top], [1, av.hair.base]], 1, 0)}
${lin('top', [[0, lighten(top.color, 0.14)], [0.5, top.color], [1, top.shade]], 1, 0)}
${lin('leg', [[0, lighten(legColor, 0.12)], [0.5, legColor], [1, legShade]], 1, 0)}
${lin('iris', [[0, '#0e0a0c'], [0.55, av.eyeColor], [1, mix(av.eyeColor, '#d9c2b8', 0.32)]], 0, 1)}
${lin('shoe', [[0, av.shoes.color], [1, av.shoes.shade]], 0, 1)}
${lin('bottle', [[0, '#e9f8ff'], [0.5, '#c7ebfd'], [1, '#9fd6f5']], 1, 0)}
${lin('water', [[0, '#7fcaf2'], [1, '#2f97dc']], 0, 1)}
${lin('gold', [[0, '#f2d27a'], [0.5, '#c99a3e'], [1, '#9b7022']], 1, 1)}
${av.dupatta ? lin('dup', [[0, lighten(av.dupatta.color, 0.1)], [1, av.dupatta.shade]], 1, 0) : ''}
<radialGradient id="${p}_blush"><stop offset="0" stop-color="${av.skin.blush}" stop-opacity="0.7"/><stop offset="0.6" stop-color="${av.skin.blush}" stop-opacity="0.3"/><stop offset="1" stop-color="${av.skin.blush}" stop-opacity="0"/></radialGradient>
<filter id="${p}_stk" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB">
  <feMorphology in="SourceAlpha" operator="dilate" radius="3.2" result="d"/>
  <feGaussianBlur in="d" stdDeviation="2.2" result="b"/><feOffset in="b" dy="1.6" result="bo"/>
  <feFlood flood-color="#10283c" flood-opacity="0.28"/><feComposite in2="bo" operator="in" result="sh"/>
  <feFlood flood-color="#ffffff"/><feComposite in2="d" operator="in" result="w"/>
  <feMerge><feMergeNode in="sh"/><feMergeNode in="w"/><feMergeNode in="SourceGraphic"/></feMerge>
</filter>
</defs>`;
}

// ---------------------------------------------------------------- context / projection
function makeCtx(pose, av, uid) {
  const phi = pose.phi * DEG, hphi = pose.headPhi * DEG;
  const sinp = Math.sin(phi), cosp = Math.cos(phi);
  return {
    pose, av, uid, phi, sinp, cosp, hphi,
    g: (id) => `url(#${av.id}_${id})`,
    sinh: Math.sin(hphi), cosh: Math.cos(hphi),
    cx: 110 + (pose.hipX || 0),
    hipY: pose.hipY,
    tanLean: Math.tan((pose.lean || 0) * DEG),
    nearSign: sinp > 0.1 ? 1 : (sinp < -0.1 ? -1 : 0),
  };
}
function px(c, u, z, y) {
  const leanU = y !== undefined ? Math.max(0, c.hipY - y) * c.tanLean : 0;
  return c.cx + (-(u + leanU) * c.sinp + z * c.cosp);
}
const hwOf = (c, W, D) => Math.sqrt((W * c.cosp) ** 2 + (D * c.sinp) ** 2);
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
const along = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];

// Tapered limb outline through joint points with per-joint widths, rounded caps.
function limbShape(pts, ws) {
  const P = [], Wd = [];
  for (let i = 0; i < pts.length - 1; i++) {
    for (let k = 0; k < 5; k++) { const t = k / 5; P.push(along(pts[i], pts[i + 1], t)); Wd.push(lerp(ws[i], ws[i + 1], t)); }
  }
  P.push(pts[pts.length - 1]); Wd.push(ws[ws.length - 1]);
  const m = P.length, L = [], R = [], T = [];
  for (let i = 0; i < m; i++) {
    const a = P[Math.max(0, i - 2)], b = P[Math.min(m - 1, i + 2)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const l = Math.hypot(tx, ty);
    if (l < 1e-6) { tx = 0; ty = 1; } else { tx /= l; ty /= l; }
    T.push([tx, ty]);
    L.push([P[i][0] - ty * Wd[i] / 2, P[i][1] + tx * Wd[i] / 2]);
    R.push([P[i][0] + ty * Wd[i] / 2, P[i][1] - tx * Wd[i] / 2]);
  }
  const cap = (i, dir) => {
    const out = [], [tx, ty] = T[i], nx = -ty, ny = tx, r = Wd[i] / 2;
    for (let k = 1; k < 8; k++) {
      const th = (k / 8) * Math.PI, c = Math.cos(th), s = Math.sin(th);
      out.push(dir > 0 ? [P[i][0] + (nx * c + tx * s) * r, P[i][1] + (ny * c + ty * s) * r]
        : [P[i][0] + (-nx * c - tx * s) * r, P[i][1] + (-ny * c - ty * s) * r]);
    }
    return out;
  };
  return polyPath([...L, ...cap(m - 1, 1), ...R.reverse(), ...cap(0, -1)], true);
}
const limb = (pts, ws, fill, sw = SW) => pathEl(limbShape(pts, ws), fill, OUT, sw);

// ---------------------------------------------------------------- arms
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

function drawArm(c, g) {
  const av = c.av, top = av.top;
  let s = '';
  s += limb([g.S, g.E, g.W], [10.4, 8.6, 7], c.g('skin'));
  const sl = top.sleeve;
  const ang = Math.atan2(g.E[1] - g.S[1], g.E[0] - g.S[0]) / DEG;
  const fang = Math.atan2(g.W[1] - g.E[1], g.W[0] - g.E[0]) / DEG;
  if (sl === 'long') s += limb([g.S, g.E, along(g.E, g.W, 0.88)], [15, 12.6, 11.4], c.g('top'));
  else if (sl === 'threeQuarter') s += limb([g.S, g.E, along(g.E, g.W, 0.55)], [15, 13, 12.4], c.g('top'));
  else if (sl === 'elbow') {
    s += limb([g.S, along(g.S, g.E, 0.95)], [15.4, 13.4], c.g('top'));
    const e = along(g.S, g.E, 0.84);
    s += ellipse(e[0], e[1], 1.2, 6.2, 'none', ang + 90, top.line, 1.1, 'opacity="0.6"');
  } else if (sl === 'shortPuff') {
    const m = along(g.S, g.E, 0.34);
    s += ellipse(m[0], m[1], 12, 9.6, c.g('top'), ang);
    if (top.print) s += rose(m[0] + 1, m[1] + 1, 0.75, top.printColors);
  } else if (sl === 'puff') {
    const m = along(g.S, g.E, 0.42);
    s += ellipse(m[0], m[1], 11, 9.2, c.g('top'), ang);
    s += `<path d="M${n(m[0] - 3)},${n(m[1] - 6)} q2,6 0,12 M${n(m[0] + 2)},${n(m[1] - 7)} q2,7 0,14" fill="none" stroke="${top.line}" stroke-width="0.9" opacity="0.5" transform="rotate(${n(ang - 90)} ${n(m[0])} ${n(m[1])})"/>`;
    const b1 = along(g.S, g.E, 0.66);
    s += ellipse(b1[0], b1[1], 2.8, 6.6, top.shade, ang, OUT, 1.5);
  }
  if (sl === 'long' || sl === 'threeQuarter') {
    const p0 = along(g.E, g.W, (sl === 'long' ? 0.88 : 0.55) - 0.1);
    s += ellipse(p0[0], p0[1], 1.2, 5.6, 'none', fang + 90, top.line, 1.1, 'opacity="0.55"');
  }
  if (g.side === -1 && c.pose.bottle !== false) s += bottle(c, g.H[0], g.H[1] + 3, c.pose.bottleTilt || 0);
  s += hand(c, g, fang);
  return s;
}
function hand(c, g, fang) {
  if (g.arm.wave) {
    const r = g.arm.handRot || 0;
    const x = g.H[0], y = g.H[1] - 2;
    let s = `<g transform="rotate(${n(r)} ${n(x)} ${n(y + 5)})">`;
    s += `<path d="M${n(x - 6)},${n(y + 6)} C${n(x - 7.5)},${n(y - 1)} ${n(x - 6.5)},${n(y - 9)} ${n(x - 4.4)},${n(y - 9)} C${n(x - 3)},${n(y - 9)} ${n(x - 3)},${n(y - 6)} ${n(x - 2.6)},${n(y - 5)} C${n(x - 2.4)},${n(y - 11)} ${n(x + 1.2)},${n(y - 11)} ${n(x + 1.2)},${n(y - 5.5)} C${n(x + 1.6)},${n(y - 10.4)} ${n(x + 5)},${n(y - 10)} ${n(x + 4.6)},${n(y - 4.6)} C${n(x + 6.4)},${n(y - 8)} ${n(x + 8.6)},${n(y - 5.4)} ${n(x + 7.2)},${n(y - 1.4)} C${n(x + 9.4)},${n(y - 2)} ${n(x + 9.8)},${n(y + 1)} ${n(x + 7)},${n(y + 4)} C${n(x + 5)},${n(y + 8)} ${n(x - 4)},${n(y + 9)} ${n(x - 6)},${n(y + 6)}Z" fill="${c.g('skin')}" stroke="${OUT}" stroke-width="1.8" stroke-linejoin="round"/>`;
    s += `<path d="M${n(x - 2.6)},${n(y - 5)} l0.2,3 M${n(x + 1.2)},${n(y - 5.5)} l0,3 M${n(x + 4.6)},${n(y - 4.6)} l-0.4,3" stroke="${c.av.skin.deep}" stroke-width="1" fill="none" opacity="0.7"/>`;
    return s + '</g>';
  }
  return ellipse(g.H[0], g.H[1], 5.8, 5.1, c.g('skin'), fang, OUT, 2) +
    ellipse(g.H[0] - 2.4, g.H[1] - 1.4, 2.2, 3, c.av.skin.base, fang + 40, OUT, 1.3);
}

function bottle(c, x, y, tilt) {
  return `<g transform="rotate(${n(tilt)} ${n(x)} ${n(y)})">` +
    `<path d="M${n(x - 6.2)},${n(y - 8)} q0,-4.5 3,-5 h6.4 q3,0.5 3,5 v19.5 q0,4.5 -4.5,4.5 h-3.4 q-4.5,0 -4.5,-4.5z" fill="${c.g('bottle')}" stroke="${OUT}" stroke-width="${SW}"/>` +
    `<path d="M${n(x - 4.6)},${n(y - 2)} h9.2 v13.6 q0,3.2 -3.2,3.2 h-2.8 q-3.2,0 -3.2,-3.2z" fill="${c.g('water')}"/>` +
    `<path d="M${n(x - 4.6)},${n(y - 2)} q2.3,-1.6 4.6,0 t4.6,0" fill="none" stroke="#bfe6fb" stroke-width="1.1"/>` +
    `<rect x="${n(x - 4)}" y="${n(y + 2)}" width="8" height="5" rx="1" fill="#ffffff" opacity="0.85"/>` +
    `<path d="M${n(x)},${n(y + 2.8)} q-1.6,2 0,3.3 q1.6,-1.3 0,-3.3z" fill="#2f97dc"/>` +
    `<rect x="${n(x - 3.6)}" y="${n(y - 9)}" width="1.8" height="19" rx="0.9" fill="#ffffff" opacity="0.75"/>` +
    `<rect x="${n(x - 3.8)}" y="${n(y - 18)}" width="7.6" height="5.6" rx="1.6" fill="#2f7fc4" stroke="${OUT}" stroke-width="${SW}"/>` +
    `<rect x="${n(x - 2.6)}" y="${n(y - 17)}" width="2" height="3.6" rx="0.8" fill="#7cc0f0"/></g>`;
}

// ---------------------------------------------------------------- legs
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
  const fp = (lx, ly, dz = 0) => {
    const r = rot(lx, ly, foot.th);
    return P({ u: foot.u + r.x, y: GROUND - (foot.yUp + r.y) }, z + dz);
  };
  return { side, z, foot, H: P(hip), K: P(knee), A: P(ank), fp };
}
const SHOE = {
  sneaker: [[-7.5, -7.2], [4, -7.4], [15, -7.2], [18, -5.4], [17.8, -2], [13.5, 0.6], [6, 2.4], [1, 4.6], [-5.5, 4.6], [-8.4, 1]],
  flat: [[-7, -7.2], [4, -7.4], [15, -7.2], [17.6, -5.4], [16.8, -2.8], [11, -1.4], [3, -0.4], [-3.5, 0.6], [-7.8, -2]],
  sandal: [[-7, -7.2], [4, -7.4], [15, -7.2], [17.4, -5.6], [16.6, -3.4], [11, -2.6], [3, -1.8], [-3.5, -1], [-7.8, -3]],
};
function drawLeg(c, g) {
  const av = c.av, b = av.bottom;
  const bare = b.kind !== 'pants';
  let s = limb([g.H, g.K, g.A], bare ? [13, 10.6, 8.4] : [18, 14, 12], c.g('leg'));
  if (!bare) {
    const k0 = along(g.K, g.H, 0.12), k1 = along(g.K, g.A, 0.14);
    s += `<path d="M${n(k0[0] - 3)},${n(k0[1])} q3,2 6,0 M${n(k1[0] - 3)},${n(k1[1])} q3,-2 6,0" fill="none" stroke="${b.line}" stroke-width="1.1" opacity="0.55"/>`;
    s += line([along(g.H, g.K, 0.25), along(g.H, g.K, 0.85)], lighten(b.color, 0.25), 1.4, 'opacity="0.45"');
  }
  const sh = av.shoes, prof = SHOE[sh.kind] || SHOE.flat;
  const offs = [-4.6, 0, 4.6].sort((a, b2) => a * c.sinp - b2 * c.sinp);
  const paths = offs.map((dz) => smoothPath(prof.map(([x, y]) => g.fp(x, y, dz)), true, 0.6));
  s += paths.map((d) => pathEl(d, 'none', OUT, SW * 2.2)).join('');
  s += paths.map((d) => pathEl(d, c.g('shoe'), 'none', 0)).join('');
  const near = offs[offs.length - 1];
  const fc = Math.abs(c.cosp);
  if (fc > 0.25) {
    // seen from the front the foot points at the viewer: draw a rounded toe cap
    const t = g.fp(9, -3.4, 0), rx = 2.5 + 5.2 * fc, ry = 4.6;
    s += ellipse(t[0], t[1], rx, ry, c.g('shoe'), 0, OUT, SW);
    s += `<path d="M${n(t[0] - rx + 0.5)},${n(t[1] + 2.4)} Q${n(t[0])},${n(t[1] + 5.2)} ${n(t[0] + rx - 0.5)},${n(t[1] + 2.4)}" fill="none" stroke="${sh.sole}" stroke-width="2"/>`;
    if (sh.kind === 'sandal') s += line([[t[0] - rx + 1, t[1] - 1], [t[0] + rx - 1, t[1] - 1]], sh.accent, 2);
    return s;
  }
  s += line([g.fp(-7.4, -5.8, near), g.fp(4, -6.1, near), g.fp(16.4, -5.8, near)], sh.sole, 2.4);
  if (sh.kind === 'sneaker') {
    s += line([g.fp(3, 1.4, near), g.fp(9.5, -0.6, near)], sh.accent, 1.8);
  } else if (sh.kind === 'sandal') {
    s += line([g.fp(7, -2.4, -4), g.fp(7, -2.4, 4)], sh.accent, 2.2);
    s += line([g.fp(-2, 2, -4), g.fp(-2, 2, 4)], sh.accent, 2);
  } else {
    s += line([g.fp(9, -1.8, near), g.fp(12.5, -1.8, near)], sh.accent, 1.6);
  }
  return s;
}

// ---------------------------------------------------------------- torso & clothes
function torsoGeom(c) {
  const br = c.pose.breath || 0;
  const y = { N: c.hipY - 56, S: c.hipY - 47 - br * 0.8, C: c.hipY - 36, W: c.hipY - 16, H: c.hipY + 6 };
  const sec = { sh: [27, 13], ch: [25 + br * 0.6, 15.5 + br * 0.5], wa: [20.5, 12.5], hip: [23.5, 13.5] };
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
    o += `<circle cx="${n(x + Math.cos(a) * 2.2 * s)}" cy="${n(y + Math.sin(a) * 2.2 * s)}" r="${n(1.7 * s)}" fill="${cols[0]}"/>`;
  }
  return o + `<circle cx="${n(x)}" cy="${n(y)}" r="${n(1.1 * s)}" fill="${cols[1]}"/>`;
}
function rose(x, y, s, cols) {
  return `<circle cx="${n(x)}" cy="${n(y)}" r="${n(3.4 * s)}" fill="${cols[0]}"/>` +
    `<path d="M${n(x - 1.6 * s)},${n(y)} a${n(1.6 * s)},${n(1.6 * s)} 0 1 1 ${n(1.6 * s)},${n(1.6 * s)} a${n(2.4 * s)},${n(2.4 * s)} 0 0 1 ${n(-2.6 * s)},${n(-2.8 * s)}" fill="none" stroke="${cols[1]}" stroke-width="${n(0.9 * s)}"/>` +
    `<ellipse cx="${n(x + 3.8 * s)}" cy="${n(y + 2.4 * s)}" rx="${n(2 * s)}" ry="${n(1 * s)}" fill="${cols[2]}" transform="rotate(30 ${n(x + 3.8 * s)} ${n(y + 2.4 * s)})"/>`;
}
function printMotif(top, i, x, y, scale = 1) {
  if (top.print === 'roses') return rose(x, y, scale, top.printColors);
  let o = flower(x, y, 1.05 * scale, [top.printColors[i % 3], '#f6e7b0']);
  if (i % 2 === 0) o += ellipse(x + 4, y + 3, 2.4, 1.1, top.printColors[3], 30, 'none', 0);
  return o;
}
const PRINT = [[-60, -40], [-20, -44], [25, -38], [65, -42], [-45, -28], [5, -30], [45, -24], [-75, -18], [-25, -16], [20, -12], [70, -10],
  [-55, -4], [-5, -2], [40, 2], [-35, 10], [15, 14], [60, 16]];
function printOnTorso(c, top) {
  if (!top.print) return '';
  let o = '';
  PRINT.forEach(([a, off], i) => {
    const sp = surf(c, c.hipY + off, 24, 14.5, a);
    if (sp.vis < 1) return;
    o += printMotif(top, i, sp.x, sp.y, 0.95);
  });
  return o;
}

function drawNeck(c, head) {
  const skin = c.av.skin;
  const x = head.neckX, top = head.y + 30, bot = c.hipY - 46;
  return `<path d="M${n(x - 6.5)},${n(top)} L${n(x - 7)},${n(bot)} L${n(x + 7)},${n(bot)} L${n(x + 6.5)},${n(top)} Z" fill="${c.g('skin')}" stroke="${OUT}" stroke-width="${SW}"/>` +
    `<path d="M${n(x - 6.5)},${n(top + 2)} Q${n(x)},${n(top + 10)} ${n(x + 6.5)},${n(top + 2)} L${n(x + 6.5)},${n(top)} L${n(x - 6.5)},${n(top)}Z" fill="${skin.shade}"/>`;
}

function drawTorso(c) {
  const av = c.av, top = av.top, T = torsoGeom(c);
  const id = `${c.uid}_t`;
  const cf = Math.max(0.35, Math.abs(c.cosp));
  const fx = (yy, D = 13) => surf(c, yy, 20, D, 0).x;
  let s = `<defs><clipPath id="${id}"><path d="${T.d}"/></clipPath></defs>`;
  s += pathEl(T.d, top.kind === 'offShoulder' ? c.g('skin') : c.g('top'));
  let inner = '';
  const X0 = c.cx - 70, X1 = c.cx + 70;
  if (top.kind === 'offShoulder') {
    const yN = T.y.S + 6;
    let edge = `M${n(X0)},${n(yN)}`;
    for (let x = X0; x <= X1; x += 4) edge += ` Q${n(x + 2)},${n(yN + 2.8)} ${n(x + 4)},${n(yN)}`;
    inner += `<path d="${edge} L${n(X1)},${n(c.hipY + 20)} L${n(X0)},${n(c.hipY + 20)}Z" fill="${c.g('top')}"/>`;
    inner += `<path d="${edge}" fill="none" stroke="${OUT}" stroke-width="1.6"/>`;
    for (let yy = yN + 6, r = 0; yy < c.hipY + 6; yy += 3.4, r++) {
      let d = '';
      for (let x = X0 + (r % 2) * 2; x <= X1; x += 4) d += `M${n(x)},${n(yy)} l2,0.9 `;
      inner += `<path d="${d}" fill="none" stroke="${top.line}" stroke-width="1" opacity="0.6"/>`;
    }
    inner += line([[fx(T.y.S + 1) - 10 * cf, T.y.S + 1], [fx(T.y.S + 2) - 3 * cf, T.y.S + 3]], av.skin.shade, 1.2);
    inner += line([[fx(T.y.S + 1) + 10 * cf, T.y.S + 1], [fx(T.y.S + 2) + 3 * cf, T.y.S + 3]], av.skin.shade, 1.2);
  } else {
    inner += printOnTorso(c, top);
  }
  const bx = T.tx(T.y.C + 9), bw = T.hw('ch') * 0.75;
  inner += `<path d="M${n(bx - bw)},${n(T.y.C + 8)} Q${n(bx)},${n(T.y.C + 13)} ${n(bx + bw)},${n(T.y.C + 8)}" fill="none" stroke="${top.shade}" stroke-width="1.6" opacity="0.5"/>`;
  inner += ellipse(T.tx(T.y.H), T.y.H + 4, T.hw('hip') + 4, 6, top.shade, 0, 'none', 0, 'opacity="0.35"');
  inner += ellipse(T.tx(T.y.S - 6), T.y.S - 6, 15, 7, '#000', 0, 'none', 0, 'opacity="0.08"');

  if (top.kind === 'dress' || top.kind === 'kurta') {
    const nx = fx(T.y.S - 3);
    inner += ellipse(nx, T.y.S - 4, 9 * cf + 3, 8, c.g('skin'), 0, OUT, 1.8);
    if (top.kind === 'kurta') {
      inner += line([[nx, T.y.S + 4], [fx(T.y.S + 13), T.y.S + 13]], top.line, 1.4);
      inner += `<path d="M${n(nx - 9 * cf - 3)},${n(T.y.S - 4)} A${n(9 * cf + 3)},8 0 0 0 ${n(nx + 9 * cf + 3)},${n(T.y.S - 4)}" fill="none" stroke="${top.line}" stroke-width="2.2" opacity="0.7"/>`;
    }
    if (top.kind === 'dress') {
      inner += line([[T.tx(T.y.W) - 40, T.y.W + 1], [T.tx(T.y.W) + 40, T.y.W + 1]], top.line, 1.8, 'opacity="0.7"');
      const by = T.y.S + 3;
      inner += `<path d="M${n(nx)},${n(by)} l-4,-2.5 l0,5z M${n(nx)},${n(by)} l4,-2.5 l0,5z" fill="${top.line}" stroke="${OUT}" stroke-width="0.9"/><path d="M${n(nx - 0.6)},${n(by)} l-1.6,6 M${n(nx + 0.6)},${n(by)} l1.6,6" stroke="${top.line}" stroke-width="1"/>`;
    }
  }
  if (top.kind === 'shirt') {
    const nx = fx(T.y.S - 3);
    inner += `<path d="M${n(nx - 8 * cf - 2)},${n(T.y.S - 6)} L${n(nx)},${n(T.y.S + 4)} L${n(nx + 8 * cf + 2)},${n(T.y.S - 6)}Z" fill="${c.g('skin')}" stroke="${OUT}" stroke-width="1.6"/>`;
    [-1, 1].forEach((sd) => {
      inner += `<path d="M${n(nx + sd * (9 * cf + 3))},${n(T.y.S - 8)} Q${n(nx + sd * 5 * cf)},${n(T.y.S - 2)} ${n(nx + sd)},${n(T.y.S + 3)} L${n(nx + sd)},${n(T.y.S - 0.5)} Q${n(nx + sd * 5 * cf)},${n(T.y.S - 5.5)} ${n(nx + sd * (9 * cf + 2))},${n(T.y.S - 10.5)}Z" fill="${lighten(top.color, 0.2)}" stroke="${OUT}" stroke-width="1.5"/>`;
    });
    const p0 = [nx, T.y.S + 4], p1 = [fx(c.hipY + 6), c.hipY + 8];
    inner += line([[p0[0] + 2.4 * cf, p0[1]], [p1[0] + 2.4 * cf, p1[1]]], top.line, 1.2, 'opacity="0.8"');
    [0.2, 0.48, 0.76].forEach((t) => { const p = along(p0, p1, t); inner += circle(p[0], p[1], 1.6, '#ffffff', top.line, 1); });
    const pk = surf(c, T.y.C + 2, 24, 15, 40);
    if (pk.vis > 2) inner += `<path d="M${n(pk.x - 4.5 * cf)},${n(pk.y - 4)} h${n(9 * cf)} v7 q${n(-4.5 * cf)},2.4 ${n(-9 * cf)},0z" fill="none" stroke="${top.line}" stroke-width="1.1"/>`;
  }
  s += `<g clip-path="url(#${id})">${inner}</g>`;
  s += pathEl(T.d, 'none');

  const neckL = surf(c, T.y.S - 4, 9, 7, 70), neckR = surf(c, T.y.S - 4, 9, 7, -70);
  if (av.necklace) {
    const nk = av.necklace;
    const dy = nk.kind === 'heart' ? 14 : 8;
    const low = [fx(T.y.S + dy), T.y.S + dy];
    s += `<path d="M${n(neckL.x)},${n(neckL.y)} Q${n(lerp(neckL.x, low[0], 0.5) + 3 * c.sinp)},${n(low[1] + 2)} ${n(low[0])},${n(low[1])} Q${n(lerp(neckR.x, low[0], 0.5) + 3 * c.sinp)},${n(low[1] + 2)} ${n(neckR.x)},${n(neckR.y)}" fill="none" stroke="#9aa0aa" stroke-width="1.1"/>`;
    if (nk.kind === 'heart') {
      const hx = low[0], hy = low[1] + 1.5;
      s += `<path d="M${n(hx)},${n(hy + 5)} C${n(hx - 6 * cf)},${n(hy + 0.5)} ${n(hx - 3.2 * cf)},${n(hy - 3.8)} ${n(hx)},${n(hy - 0.8)} C${n(hx + 3.2 * cf)},${n(hy - 3.8)} ${n(hx + 6 * cf)},${n(hy + 0.5)} ${n(hx)},${n(hy + 5)}Z" fill="${nk.color}" stroke="${OUT}" stroke-width="1.2"/>`;
      s += ellipse(hx - 1.4 * cf, hy + 0.4, 0.9, 0.6, '#fff', 0, 'none', 0);
    }
  }
  if (av.scarf) {
    const sc = av.scarf;
    const cx0 = T.tx(T.y.S - 6);
    s += `<path d="M${n(cx0 - hwOf(c, 14, 10))},${n(T.y.S - 8)} Q${n(fx(T.y.S + 4))},${n(T.y.S + 9)} ${n(cx0 + hwOf(c, 14, 10))},${n(T.y.S - 8)} L${n(cx0 + hwOf(c, 11, 8))},${n(T.y.S - 14)} Q${n(fx(T.y.S - 2))},${n(T.y.S - 1)} ${n(cx0 - hwOf(c, 11, 8))},${n(T.y.S - 14)}Z" fill="${sc.color}" stroke="${OUT}" stroke-width="${SW}"/>`;
    const t0 = surf(c, T.y.S, 24, 15, 34), t1 = surf(c, c.hipY - 2, 24, 15, 30);
    if (t0.vis > -3) {
      const w = 5.5 * Math.max(0.6, cf), sway = (c.pose.hairSway || 0) * 0.5;
      s += `<path d="M${n(t0.x - w)},${n(t0.y - 2)} C${n(t0.x - w - 2)},${n(lerp(t0.y, t1.y, 0.4))} ${n(t1.x - w - 1 + sway)},${n(lerp(t0.y, t1.y, 0.7))} ${n(t1.x - w + sway)},${n(t1.y)} L${n(t1.x + w + sway)},${n(t1.y + 2)} C${n(t1.x + w + sway)},${n(lerp(t0.y, t1.y, 0.6))} ${n(t0.x + w + 2)},${n(lerp(t0.y, t1.y, 0.3))} ${n(t0.x + w)},${n(t0.y - 2)}Z" fill="${sc.color}" stroke="${OUT}" stroke-width="${SW}"/>`;
      s += line([[t0.x - w * 0.2, t0.y + 4], [t1.x - w * 0.2 + sway, t1.y - 3]], sc.shade, 1.3);
      s += line([[t0.x + w * 0.5, t0.y + 6], [t1.x + w * 0.5 + sway, t1.y - 5]], sc.shade, 1);
    }
  }
  if (av.dupatta) {
    const dp = av.dupatta;
    if (dp.style === 'drape') {
      const lo = [fx(T.y.C + 14), T.y.C + 14];
      [-1, 1].forEach((sd) => {
        const sh = surf(c, T.y.S, 27, 13, sd * 62);
        const mid = surf(c, T.y.C + 4, 25, 15, sd * 40);
        const w = 9.5;
        s += `<path d="M${n(sh.x - w)},${n(sh.y - 3)} Q${n(mid.x - w)},${n(mid.y)} ${n(lo[0] - 3)},${n(lo[1] + 4)} L${n(lo[0] + 3)},${n(lo[1] - 4)} Q${n(mid.x + w)},${n(mid.y - 6)} ${n(sh.x + w)},${n(sh.y - 5)}Z" fill="${c.g('dup')}" stroke="${OUT}" stroke-width="${SW}"/>`;
        s += line([[sh.x, sh.y], [mid.x, mid.y - 2], [lo[0], lo[1]]], dp.shade, 1.4);
        s += line([[sh.x + 4, sh.y - 2], [mid.x + 3, mid.y - 4]], dp.shade, 1);
      });
    } else {
      [-1, 1].forEach((sd) => {
        const t0 = surf(c, T.y.S - 1, 27, 13, sd * 52), t1 = surf(c, c.hipY + 28, 25, 15, sd * 45);
        if (t0.vis < -3) return;
        const w = 7.5 * Math.max(0.55, cf);
        const sway = (c.pose.hairSway || 0) * 0.6;
        s += pathEl(`M${n(t0.x - w)},${n(t0.y - 2)} L${n(t1.x - w + sway)},${n(t1.y)} Q${n(t1.x + sway)},${n(t1.y + 3)} ${n(t1.x + w + sway)},${n(t1.y)} L${n(t0.x + w)},${n(t0.y - 2)}Z`, c.g('dup'));
        if (dp.print) {
          for (let k = 0; k < 4; k++) {
            const p = along([t0.x, t0.y + 6], [t1.x + sway, t1.y - 4], 0.15 + k * 0.24);
            s += flower(p[0] + (k % 2 ? 2 : -2) * cf, p[1], 0.7, [['#cf474d', '#e7b947', '#4f7cc4'][k % 3], '#f6e7b0']);
          }
        }
        s += line([[t0.x - w * 0.3, t0.y + 2], [t1.x - w * 0.3 + sway, t1.y - 2]], dp.shade, 1.3);
        s += line([[t0.x + w * 0.45, t0.y + 2], [t1.x + w * 0.45 + sway, t1.y - 2]], dp.shade, 1);
      });
    }
  }
  if (av.neckband) {
    const a = surf(c, T.y.S - 3, 11, 9, 75), b = surf(c, T.y.S - 3, 11, 9, -75);
    const lo = [fx(T.y.S + 3), T.y.S + 3];
    s += `<path d="M${n(a.x)},${n(a.y)} Q${n(lo[0] + 6 * cf)},${n(lo[1] + 5)} ${n(lo[0])},${n(lo[1] + 3)} Q${n(lo[0] - 6 * cf)},${n(lo[1] + 5)} ${n(b.x)},${n(b.y)}" fill="none" stroke="${av.neckband.color}" stroke-width="2.8"/>`;
    [a, b].forEach((p) => { if (p.vis > -2) s += ellipse(p.x, p.y + 9, 2.2, 4.4, av.neckband.color, 0, OUT, 1); });
  }
  if (av.lanyard) {
    const ly = av.lanyard;
    const card = [fx(T.y.W + 4), T.y.W + 4];
    [neckL, neckR].forEach((p) => {
      const a = [p.x, p.y], b = [card[0], card[1] - 8];
      s += line([a, b], OUT, 4.6) + line([a, b], ly.color, 3);
      for (let k = 1; k < 4; k++) { const q = along(a, b, k / 4); s += `<rect x="${n(q[0] - 0.9)}" y="${n(q[1] - 1.1)}" width="1.8" height="2.2" fill="${k % 2 ? '#ffffff' : '#e04848'}"/>`; }
    });
    s += `<rect x="${n(card[0] - 1.6)}" y="${n(card[1] - 9.5)}" width="3.2" height="3.4" rx="0.6" fill="#c5cbd3" stroke="${OUT}" stroke-width="0.9"/>`;
    s += `<rect x="${n(card[0] - 5.8 * cf - 1)}" y="${n(card[1] - 6.5)}" width="${n(11.6 * cf + 2)}" height="14" rx="1.8" fill="${ly.card}" stroke="${OUT}" stroke-width="1.6"/>`;
    s += `<rect x="${n(card[0] - 3.4 * cf)}" y="${n(card[1] - 3.6)}" width="${n(6.8 * cf)}" height="4.6" rx="0.6" fill="#dfe7f0"/>`;
    s += `<rect x="${n(card[0] - 3.4 * cf)}" y="${n(card[1] + 2.6)}" width="${n(6.8 * cf)}" height="1" fill="#9aa6b4"/>`;
  }
  return s;
}

function drawLowerGarment(c, legs) {
  const av = c.av, b = av.bottom, top = av.top;
  if (b.kind !== 'skirt' && b.kind !== 'kurtaHem') return '';
  const T = torsoGeom(c);
  const hemY = c.hipY + (b.kind === 'skirt' ? 47 : 36);
  const xs = [];
  [legs.L, legs.R].forEach((g) => {
    const seg = hemY <= g.K[1] ? [g.H, g.K] : [g.K, g.A];
    const t = clamp((hemY - seg[0][1]) / Math.max(1, seg[1][1] - seg[0][1]), 0, 1);
    xs.push(lerp(seg[0][0], seg[1][0], t));
  });
  const cxh = T.tx(hemY);
  const flare = b.kind === 'skirt' ? 11 : 6;
  const left = Math.min(cxh - T.hw('hip') - flare, Math.min(...xs) - 10);
  const right = Math.max(cxh + T.hw('hip') + flare, Math.max(...xs) + 10);
  const tl = [T.tx(T.y.W) - T.hw('wa'), T.y.W], tr = [T.tx(T.y.W) + T.hw('wa'), T.y.W];
  const sway = (c.pose.hairSway || 0) * 0.4;
  const d = `M${n(tl[0])},${n(tl[1])} Q${n(tl[0] - 5)},${n(lerp(tl[1], hemY, 0.55))} ${n(left + sway)},${n(hemY)} Q${n((left + right) / 2 + sway)},${n(hemY + 5)} ${n(right + sway)},${n(hemY)} Q${n(tr[0] + 5)},${n(lerp(tr[1], hemY, 0.55))} ${n(tr[0])},${n(tr[1])}Z`;
  const id = `${c.uid}_h`;
  let s = `<defs><clipPath id="${id}"><path d="${d}"/></clipPath></defs>`;
  s += pathEl(d, c.g('top'));
  let inner = '';
  if (top.print) {
    for (let i = 0; i < 14; i++) {
      const fxp = left + ((i * 37) % 100) / 100 * (right - left);
      const fyp = T.y.W + 6 + ((i * 53) % 100) / 100 * (hemY - T.y.W - 4);
      inner += printMotif(top, i, fxp, fyp, 0.95);
    }
  }
  const mid = (xs[0] + xs[1]) / 2 + sway;
  inner += `<path d="M${n(cxh + sway * 0.5)},${n(T.y.W + 10)} Q${n(mid - 2)},${n(lerp(T.y.W, hemY, 0.6))} ${n(mid)},${n(hemY + 2)}" fill="none" stroke="${top.shade}" stroke-width="2.4" opacity="0.55"/>`;
  xs.forEach((x) => { inner += `<path d="M${n(lerp(cxh, x, 0.5))},${n(T.y.W + 14)} L${n(x + sway)},${n(hemY - 2)}" fill="none" stroke="${top.shade}" stroke-width="1.4" opacity="0.4"/>`; });
  inner += line([[left + sway + 1, hemY - 3.5], [right + sway - 1, hemY - 3.5]], top.line, 1.2, 'opacity="0.5"');
  s += `<g clip-path="url(#${id})">${inner}</g>` + pathEl(d, 'none');
  return s;
}

// ---------------------------------------------------------------- head
function headGeom(c) {
  const p = c.pose;
  const neckY = c.hipY - 56;
  const neckX = px(c, 0, 0, neckY);
  return { x: neckX + (p.headDx || 0), y: c.hipY - 101 + (p.headDy || 0), rx: HEAD.rx, ry: HEAD.ry, tilt: p.headTilt || 0, neckX };
}
function hp(c, h, a, yOff, rs = 1) {
  const cl = Math.sqrt(Math.max(0, 1 - (yOff / h.ry) ** 2));
  const t = a * DEG - c.hphi;
  return { x: h.x + h.rx * rs * cl * Math.sin(t), y: h.y + yOff, vis: Math.cos(t), cl, sin: Math.sin(t) };
}
function facePath(h) {
  const pts = [];
  for (let i = 0; i < 40; i++) {
    const t = (i / 40) * 2 * Math.PI, x = Math.cos(t), y = Math.sin(t);
    let rx = h.rx, ry = h.ry;
    if (y > 0) { rx *= 1 - 0.06 * y * y; ry *= 0.98; }
    pts.push([h.x + rx * x, h.y + ry * y]);
  }
  return smoothPath(pts, true);
}

const arch = (top, k, span, e) => top + (4 - top) * Math.pow(Math.min(k, span) / span, e);
const PROFILES = {
  longWavy: { prof: (a) => { const k = Math.abs(a); return k <= 82 ? arch(-37, k, 82, 1.15) : 4 + (k - 82) * 1.1; }, side: 28, puff: 5, range: 110 },
  curlyLong: { prof: (a) => { const k = Math.abs(a - 22); const v = arch(-37, k, 92, 1.05); return Math.abs(a) > 88 ? Math.max(v, 4 + (Math.abs(a) - 88) * 1.1) : v; }, side: 30, puff: 7, range: 110, curly: 2.4 },
  braids: { prof: (a) => arch(-36, Math.abs(a), 96, 1.2) + 3, side: 7, puff: 4, range: 102 },
  curlyBun: { prof: (a) => arch(-34, Math.abs(a), 96, 1.15), side: 4, puff: 5, range: 100, curly: 2 },
  slickBraid: { prof: (a) => arch(-38, Math.abs(a), 96, 1.2), side: 4, puff: 3, range: 100 },
};

function hairCapPath(c, h, P) {
  const R = h.rx + P.puff, Ry = h.ry + P.puff;
  const pts = [];
  const sideX = (yo) => R * Math.sqrt(Math.max(0, 1 - (yo / Ry) ** 2));
  pts.push([h.x - sideX(P.side), h.y + P.side]);
  for (let th = 190; th <= 350; th += 5) {
    const bump = P.curly ? P.curly * Math.abs(Math.sin(th * DEG * 9)) : 0;
    pts.push([h.x + (R + bump) * Math.cos(th * DEG), h.y + (Ry + bump) * Math.sin(th * DEG)]);
  }
  pts.push([h.x + sideX(P.side), h.y + P.side]);
  const hl = [];
  for (let a = P.range; a >= -P.range; a -= 6) {
    const q = hp(c, h, a, P.prof(a));
    let x = q.x;
    if (q.vis < 0) x = h.x + h.rx * q.cl * Math.sign(q.sin);
    hl.push([x, q.y]);
  }
  for (let i = 1; i < hl.length; i++) if (hl[i][0] > hl[i - 1][0]) hl[i][0] = hl[i - 1][0];
  return smoothPath([...pts, ...hl], true, 0.8);
}

function gloss(c, h, spots) {
  let s = '';
  spots.forEach(([a, yo, rx, ry, rotD]) => {
    const q = hp(c, h, a, yo, 0.98);
    if (q.vis < 0.15) return;
    s += ellipse(q.x, q.y, rx * Math.max(0.5, q.vis), ry, c.av.hair.gloss, rotD, 'none', 0, 'opacity="0.8"');
  });
  return s;
}

function backHairShape(c, h, curly) {
  const p = c.pose;
  const bs = 9 * c.sinh + (p.hairTrail || 0) * c.sinp;
  const sway = p.hairSway || 0;
  const bottom = c.hipY - (curly ? 26 : 32);
  const R = h.rx + (curly ? 9 : 5);
  const cx = h.x + bs;
  const pts = [];
  pts.push([cx - R - 4 + sway * 0.3, h.y + 26]);
  for (let th = 200; th <= 340; th += 20) pts.push([h.x + R * Math.cos(th * DEG), h.y + (h.ry + 7) * Math.sin(th * DEG)]);
  pts.push([cx + R + 4 + sway * 0.3, h.y + 26]);
  if (curly) { for (let k = 1; k <= 3; k++) pts.push([cx + R + 8 + (k % 2 ? 6 : 0) + sway * 0.25 * k, h.y + 26 + k * 16]); }
  else pts.push([cx + R + 7 + sway * 0.7, h.y + 58]);
  const bl = cx - R - 3 + sway, br = cx + R + 3 + sway;
  const waves = curly ? 7 : 5;
  for (let i = 0; i <= waves * 2; i++) {
    const t = i / (waves * 2);
    pts.push([lerp(br, bl, t), bottom + (i % 2 === 0 ? 5 : -5) + Math.sin(t * Math.PI) * 6]);
  }
  if (curly) { for (let k = 3; k >= 1; k--) pts.push([cx - R - 8 - (k % 2 ? 6 : 0) + sway * 0.25 * k, h.y + 26 + k * 16]); }
  else pts.push([cx - R - 7 + sway * 0.7, h.y + 58]);
  return { d: smoothPath(pts, true, 0.9), cx, bottom, R, sway };
}
function drawBackHair(c, h) {
  const av = c.av, st = av.hairStyle, H = av.hair;
  if (st !== 'longWavy' && st !== 'curlyLong') return '';
  const curly = st === 'curlyLong';
  const B = backHairShape(c, h, curly);
  let s = pathEl(B.d, c.g('hair'));
  for (let i = -2; i <= 2; i++) {
    const x0 = B.cx + i * 18;
    if (curly) s += wave(x0, h.y + 34, B.bottom - h.y - 40, H.mid);
    else s += `<path d="M${n(x0)},${n(h.y + 40)} Q${n(x0 + 6 + B.sway * 0.3)},${n(h.y + 70)} ${n(x0 + B.sway * 0.8)},${n(B.bottom - 6)}" fill="none" stroke="${H.mid}" stroke-width="1.6"/>`;
  }
  return s;
}

function drawEye(c, x, y, k, state, outer) {
  if (k < 0.18) return '';
  const lash = '#1d1216';
  const X = (dx) => x + dx * k * outer;
  let s = '';
  if (state === 'open') {
    s += ellipse(x, y + 0.6, 9.7 * k, 10.6, '#ffffff', 0, 'none', 0);
    s += `<path d="M${n(X(-9))},${n(y + 5)} Q${n(x)},${n(y + 12.6)} ${n(X(9.4))},${n(y + 4)}" fill="none" stroke="#c99a8a" stroke-width="0.9"/>`;
    s += ellipse(x + 0.3 * outer * k, y + 0.8, 8.9 * k, 10.3, c.g('iris'), 0, 'none', 0);
    s += ellipse(x + 0.4 * outer * k, y + 0.6, 4.4 * k, 5.4, '#0d090b', 0, 'none', 0);
    s += ellipse(x + 0.4 * outer * k, y + 5.6, 5.8 * k, 3, mix(c.av.eyeColor, '#e8cfc2', 0.5), 0, 'none', 0, 'opacity="0.6"');
    s += ellipse(x + 3 * k, y - 3.4, 4.3 * Math.max(0.6, k), 4.1, '#ffffff', 0, 'none', 0);
    s += circle(x - 3.4 * k, y + 4.4, 2 * Math.max(0.6, k), '#ffffff', 'none', 0);
    s += circle(x + 4.6 * k, y + 3.6, 1 * Math.max(0.6, k), '#ffffff', 'none', 0, 'opacity="0.9"');
    s += `<path d="M${n(X(-11))},${n(y - 1.6)} C${n(X(-8.6))},${n(y - 12.8)} ${n(X(6))},${n(y - 14)} ${n(X(11.6))},${n(y - 4.6)} C${n(X(6))},${n(y - 10.6)} ${n(X(-7))},${n(y - 10.4)} ${n(X(-11))},${n(y - 1.6)}Z" fill="${lash}" stroke="${lash}" stroke-width="1.2" stroke-linejoin="round"/>`;
    s += `<path d="M${n(X(11))},${n(y - 5)} l${n(outer * 3.8 * k)},-2.2 M${n(X(9.2))},${n(y - 8.2)} l${n(outer * 3.4 * k)},-3.2 M${n(X(6.6))},${n(y - 10.4)} l${n(outer * 2.2 * k)},-3.4" fill="none" stroke="${lash}" stroke-width="1.6" stroke-linecap="round"/>`;
    s += `<path d="M${n(X(-5))},${n(y - 15)} Q${n(X(3))},${n(y - 17.6)} ${n(X(9.6))},${n(y - 12)}" fill="none" stroke="#8d5d52" stroke-width="1.1" opacity="0.75"/>`;
    s += `<path d="M${n(X(4.6))},${n(y + 10.2)} l${n(outer * 1.4 * k)},1.6 M${n(X(7.4))},${n(y + 8.6)} l${n(outer * 1.6 * k)},1.4" fill="none" stroke="${lash}" stroke-width="1" stroke-linecap="round" opacity="0.8"/>`;
  } else if (state === 'closed') {
    s += `<path d="M${n(X(-9.5))},${n(y + 1)} Q${n(x)},${n(y + 7)} ${n(X(10))},${n(y + 0.5)}" fill="none" stroke="${lash}" stroke-width="3" stroke-linecap="round"/>`;
    s += `<path d="M${n(X(9.6))},${n(y + 1)} l${n(outer * 3.4 * k)},-1.4 M${n(X(7.6))},${n(y + 3)} l${n(outer * 2.4 * k)},2" fill="none" stroke="${lash}" stroke-width="1.6" stroke-linecap="round"/>`;
  } else {
    s += `<path d="M${n(X(-9))},${n(y + 3.5)} Q${n(x)},${n(y - 8.5)} ${n(X(9.5))},${n(y + 3.5)}" fill="none" stroke="${lash}" stroke-width="3.2" stroke-linecap="round"/>`;
    s += `<path d="M${n(X(9.5))},${n(y + 3.5)} l${n(outer * 3 * k)},-0.6" fill="none" stroke="${lash}" stroke-width="1.6" stroke-linecap="round"/>`;
  }
  return s;
}

function drawBraidChain(c, pts, tieColor, w0 = 7.8, w1 = 5) {
  const H = c.av.hair;
  let s = '';
  const m = pts.length;
  for (let i = 0; i < m - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) / DEG;
    const w = lerp(w0, w1, i / (m - 1));
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.64 + 2;
    s += ellipse(mx, my, len, w, c.g('hairS'), ang + (i % 2 ? 24 : -24), OUT, 1.8);
    s += ellipse(mx - 0.6, my - 1.4, len * 0.45, 1.4, H.gloss, ang + (i % 2 ? 24 : -24), 'none', 0, 'opacity="0.7"');
  }
  const e = pts[m - 1], pe = pts[m - 2];
  const ang = Math.atan2(e[1] - pe[1], e[0] - pe[0]);
  const tx = e[0] + Math.cos(ang) * 2, ty = e[1] + Math.sin(ang) * 2;
  s += `<path d="M${n(tx - 4.4)},${n(ty)} Q${n(tx - 7)},${n(ty + 10)} ${n(tx + Math.cos(ang) * 12)},${n(ty + Math.sin(ang) * 12)} Q${n(tx + 7)},${n(ty + 10)} ${n(tx + 4.4)},${n(ty)}Z" fill="${c.g('hair')}" stroke="${OUT}" stroke-width="1.8"/>`;
  s += `<path d="M${n(tx)},${n(ty + 2)} l0,7" stroke="${H.mid}" stroke-width="1.1"/>`;
  s += ellipse(tx, ty, 5, 2.4, tieColor, ang / DEG, OUT, 1.4);
  return s;
}
function sideBraid(c, h, endOffY, tie) {
  const startQ = hp(c, h, -96, 26);
  let sx = startQ.x;
  if (startQ.vis < 0) sx = h.x + h.rx * startQ.cl * Math.sign(startQ.sin) * 0.92;
  const start = [sx, startQ.y];
  const sh = surf(c, c.hipY - 49, 22, 14, -55);
  const end = surf(c, c.hipY + endOffY, 22, 16, -38);
  const sway = (c.pose.hairSway || 0) * 0.7;
  const ctrl = [sh.x, sh.y - 6];
  const pts = [];
  for (let i = 0; i <= 8; i++) pts.push(qbez(start, ctrl, [end.x + sway, end.y], i / 8));
  return drawBraidChain(c, pts, tie, 8.4, 5.4);
}

function wave(x, y, len, color) {
  const seg = 7, k = Math.max(1, Math.round(len / seg));
  let d = `M${n(x)},${n(y)}`;
  for (let i = 0; i < k; i++) d += ` q${i % 2 ? -4 : 4},${seg / 2} 0,${seg}`;
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/>`;
}
function clump(x, y, r, color) {
  return `<path d="M${n(x - r)},${n(y + r * 0.3)} a${n(r)},${n(r * 0.9)} 0 0 1 ${n(2 * r)},0" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/><path d="M${n(x - r * 0.4)},${n(y + r * 0.2)} a${n(r * 0.45)},${n(r * 0.45)} 0 0 1 ${n(r * 0.9)},0" fill="none" stroke="${color}" stroke-width="1.1" stroke-linecap="round"/>`;
}
function curl(x, y, r, color, w = 1.4) {
  return `<path d="M${n(x + r)},${n(y)} a${n(r)},${n(r)} 0 1 0 ${n(-r * 0.6)},${n(r * 0.8)}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`;
}

function drawHead(c, h) {
  const av = c.av, st = av.hairStyle, H = av.hair, skin = av.skin, P = PROFILES[st];
  const p = c.pose;
  let s = `<g transform="rotate(${n(h.tilt)} ${n(h.x)} ${n(h.y + 40)})">`;
  if (st === 'curlyBun') {
    const bx = h.x + 7 * c.sinh, by = h.y - h.ry - 7;
    const bp = [];
    for (let i = 0; i < 30; i++) { const t = (i / 30) * 2 * Math.PI; const r = 22 + 2.2 * Math.abs(Math.sin(t * 5)); bp.push([bx + r * Math.cos(t), by + r * 0.9 * Math.sin(t)]); }
    s += pathEl(smoothPath(bp, true), c.g('hair'));
    [[-10, -6, 5], [3, -11, 5.5], [12, -2, 4.5], [-3, 3, 5], [-14, 6, 4], [8, 9, 4.5]].forEach(([dx, dy, r]) => { s += clump(bx + dx, by + dy, r, H.mid); });
    s += ellipse(bx - 6, by - 9, 6, 2.6, H.gloss, -25, 'none', 0, 'opacity="0.75"');
    s += curl(bx + 16, by - 18, 4, OUT, 1.3) + curl(bx - 19, by - 12, 3.6, OUT, 1.3);
  }
  const earsOnTop = st === 'braids' || st === 'curlyBun' || st === 'slickBraid' || st === 'curlyLong';
  const ear = (a) => {
    const q = hp(c, h, a, 12);
    if (q.vis < -0.45) return '';
    const x = h.x + h.rx * q.cl * q.sin + Math.sign(q.sin) * 1.5;
    const w = 3.4 + 2.6 * Math.abs(q.sin);
    return ellipse(x, q.y + 1, w, 7.6, av.skin.base) + `<path d="M${n(x - Math.sign(q.sin) * 0.5)},${n(q.y - 4)} q${n(Math.sign(q.sin) * w * 0.6)},3 0,8" fill="none" stroke="${skin.deep}" stroke-width="1.2" opacity="0.8"/>`;
  };
  const ears = ear(95) + ear(-95);
  if (!earsOnTop) s += ears;
  const fpath = facePath(h);
  const fid = `${c.uid}_f`;
  s += `<defs><clipPath id="${fid}"><path d="${fpath}"/></clipPath></defs>`;
  s += pathEl(fpath, c.g('face'));
  const cap = hairCapPath(c, h, P);
  s += `<g clip-path="url(#${fid})"><path d="${cap}" fill="${skin.shade}" opacity="0.85" transform="translate(${n(-2 * c.sinh)},4.5)"/>` +
    `<ellipse cx="${n(h.x)}" cy="${n(h.y + h.ry + 4)}" rx="${n(h.rx * 0.8)}" ry="12" fill="${skin.shade}" opacity="0.35"/></g>`;
  const eyeState = p.eyes || 'open';
  const fe = (a, yo) => hp(c, h, a, yo, 0.93);
  [28, -28].forEach((a) => {
    const q = fe(a, 10);
    const k = Math.pow(clamp(q.vis, 0, 1), 0.8);
    s += drawEye(c, q.x, q.y, k, eyeState, Math.sign(a));
    const b0 = fe(a - 12, -9.5), b1 = fe(a + 12, -9.5), bm = fe(a, -11.5);
    if (q.vis > 0.2) {
      const inner = Math.sign(a) > 0 ? b0 : b1, outerP = Math.sign(a) > 0 ? b1 : b0;
      const bd = `M${n(inner.x)},${n(inner.y + 0.6)} Q${n(bm.x)},${n(bm.y - 1)} ${n(outerP.x)},${n(outerP.y)}`;
      s += `<path d="${bd}" fill="none" stroke="#33201d" stroke-width="3.8" stroke-linecap="round"/><path d="${bd}" fill="none" stroke="#5a3a33" stroke-width="1" stroke-linecap="round" opacity="0.6"/>`;
    }
    const bl = fe(a * 1.45, 23);
    if (bl.vis > 0.15) {
      const bk = Math.pow(bl.vis, 0.8);
      s += ellipse(bl.x, bl.y, 9 * bk, 5.4, c.g('blush'), 0, 'none', 0);
      [-2.6, 0, 2.6].forEach((dx) => { s += circle(bl.x + dx * bk, bl.y + (dx === 0 ? -0.6 : 0.4), 0.55, '#e0767e', 'none', 0); });
    }
  });
  const nose = fe(0, 20.5);
  s += `<path d="M${n(nose.x + 0.6)},${n(nose.y - 2.4)} q1.8,2.4 -1.2,3.4" fill="none" stroke="#c27c66" stroke-width="1.4" stroke-linecap="round"/>`;
  if (av.noseStud) s += circle(nose.x + 3.4, nose.y + 0.6, 1.2, '#ffffff', '#8a8f98', 0.6);
  const m = fe(0, 31);
  const mk = Math.max(0.5, m.vis);
  if (p.mouth === 'open') {
    s += `<path d="M${n(m.x - 6.8 * mk)},${n(m.y - 1.5)} Q${n(m.x)},${n(m.y + 10.5)} ${n(m.x + 6.8 * mk)},${n(m.y - 1.5)}Z" fill="#8e3340" stroke="${OUT}" stroke-width="1.6" stroke-linejoin="round"/>`;
    s += `<path d="M${n(m.x - 5.6 * mk)},${n(m.y - 0.8)} Q${n(m.x)},${n(m.y + 1.4)} ${n(m.x + 5.6 * mk)},${n(m.y - 0.8)}Z" fill="#ffffff"/>`;
    s += ellipse(m.x, m.y + 5, 3.6 * mk, 2, '#ef8790', 0, 'none', 0);
  } else if (p.mouth === 'o') {
    s += ellipse(m.x, m.y + 1.4, 2.8 * mk, 3.3, '#8e3340', 0, OUT, 1.4);
  } else {
    s += `<path d="M${n(m.x - 5.8 * mk)},${n(m.y - 0.6)} Q${n(m.x)},${n(m.y + 5)} ${n(m.x + 5.8 * mk)},${n(m.y - 0.6)}" fill="none" stroke="#8c3540" stroke-width="2" stroke-linecap="round"/>`;
    s += `<path d="M${n(m.x - 2.4 * mk)},${n(m.y + 4)} Q${n(m.x)},${n(m.y + 5.4)} ${n(m.x + 2.4 * mk)},${n(m.y + 4)}" fill="none" stroke="#e48d93" stroke-width="1.3" opacity="0.8"/>`;
  }
  s += pathEl(cap, c.g('hair'), OUT, 2.4);
  if (earsOnTop) s += ears;
  if (st === 'longWavy') {
    const top = hp(c, h, 0, -h.ry + 2), part = hp(c, h, 0, P.prof(0) + 1);
    if (part.vis > 0) s += `<path d="M${n(top.x)},${n(top.y - 3)} Q${n(lerp(top.x, part.x, 0.5) + 1.5)},${n(lerp(top.y, part.y, 0.5))} ${n(part.x)},${n(part.y)}" fill="none" stroke="${OUT}" stroke-width="1.6"/>`;
    [-62, -38, -16, 16, 38, 62].forEach((a) => {
      const q0 = hp(c, h, a * 0.25, -h.ry + 6), q1 = hp(c, h, a, P.prof(a) - 2);
      if (q1.vis > 0.1) s += `<path d="M${n(q0.x)},${n(q0.y)} Q${n(lerp(q0.x, q1.x, 0.65) + Math.sign(a) * 5)},${n(lerp(q0.y, q1.y, 0.35))} ${n(q1.x)},${n(q1.y)}" fill="none" stroke="${H.mid}" stroke-width="1.6"/>`;
    });
    s += gloss(c, h, [[-40, -36, 9, 4, -25], [40, -36, 9, 4, 25], [-62, -22, 3, 2.6, 0], [62, -22, 3, 2.6, 0], [-20, -42, 2.4, 2, 0], [20, -42, 2.4, 2, 0]]);
  }
  if (st === 'curlyLong') {
    const a0 = hp(c, h, 24, -h.ry + 3), a1 = hp(c, h, -30, -24), a2 = hp(c, h, -78, 0);
    const x2 = a2.vis < 0 ? h.x - h.rx * a2.cl : a2.x;
    s += `<path d="M${n(a0.x)},${n(a0.y)} C${n(a1.x + 10)},${n(a1.y - 16)} ${n(a1.x - 8)},${n(a1.y - 2)} ${n(x2)},${n(a2.y)} C${n(a1.x - 4)},${n(a1.y - 8)} ${n(a1.x + 10)},${n(a1.y - 22)} ${n(a0.x + 3)},${n(a0.y + 1)}Z" fill="${c.g('hairS')}" stroke="${OUT}" stroke-width="1.8"/>`;
    [-40, -10, 30, 55, 75].forEach((a, i) => {
      const q = hp(c, h, a, -30 + (i % 2) * 8);
      if (q.vis > 0.15 && -30 + (i % 2) * 8 < P.prof(a) - 4) s += wave(q.x, q.y - 6, 14, H.mid);
    });
    s += gloss(c, h, [[-30, -38, 8, 3.6, -25], [45, -34, 8, 3.6, 25], [10, -43, 2.6, 2.2, 0], [-55, -24, 2.8, 2.2, 0]]);
  }
  if (st === 'slickBraid') {
    [-62, -36, -12, 12, 36, 62].forEach((a) => {
      const q0 = hp(c, h, a, P.prof(a) - 1), q1 = hp(c, h, a * 0.5, -h.ry + 2);
      if (q0.vis > 0.05) s += `<path d="M${n(q0.x)},${n(q0.y)} Q${n(lerp(q0.x, q1.x, 0.5))},${n(lerp(q0.y, q1.y, 0.6) - 4)} ${n(q1.x)},${n(q1.y)}" fill="none" stroke="${H.mid}" stroke-width="2"/>`;
    });
    s += gloss(c, h, [[-24, -36, 10, 4.2, -20], [24, -36, 10, 4.2, 20], [-48, -24, 4, 2.6, -30], [48, -24, 4, 2.6, 30], [0, -42, 3, 2.4, 0]]);
  }
  if (st === 'curlyBun') {
    [[-50, -30], [-25, -38], [0, -40], [25, -38], [50, -30], [-38, -20], [38, -20], [-12, -30], [14, -30]].forEach(([a, yo]) => {
      const q = hp(c, h, a, yo);
      if (q.vis > 0.15 && yo < P.prof(a) - 3) s += clump(q.x, q.y, 4.2, H.mid);
    });
    [86, -86].forEach((a) => {
      const q = hp(c, h, a, -4);
      if (q.vis > -0.2) {
        const x = q.vis < 0 ? h.x + h.rx * q.cl * Math.sign(q.sin) : q.x, o = Math.sign(q.sin) || 1;
        s += `<path d="M${n(x)},${n(q.y)} q${n(o * 4)},6 0,11 q${n(-o * 4)},5 ${n(o * 1)},10 q${n(o * 4)},4 ${n(o * -1)},8" fill="none" stroke="${OUT}" stroke-width="1.5" stroke-linecap="round"/>`;
      }
    });
    s += gloss(c, h, [[-30, -34, 7, 3.2, -25], [30, -34, 7, 3.2, 25], [0, -42, 2.6, 2.2, 0]]);
  }
  if (st === 'braids') {
    const lobes = [];
    [1, -1].forEach((sd) => {
      for (let i = 0; i <= 9; i++) {
        const t = i / 9;
        const a = sd * lerp(10, 100, t);
        const yo = lerp(-38, 4, Math.pow(t, 1.3));
        const q = hp(c, h, a, yo, 1.03);
        if (q.vis > -0.15) lobes.push({ q, a, sd, t });
      }
    });
    lobes.sort((A, B) => A.q.vis - B.q.vis);
    lobes.forEach(({ q, a, sd, t }) => {
      const q2 = hp(c, h, a + sd * 9, lerp(-38, 4, Math.pow(Math.min(1, t + 0.11), 1.3)), 1.03);
      const ang = Math.atan2(q2.y - q.y, q2.x - q.x) / DEG;
      const k = 0.55 + 0.45 * clamp(q.vis, 0, 1);
      s += ellipse(q.x, q.y, 7.6 * k + 1, 5.6, c.g('hairS'), ang + 28, OUT, 1.7);
      s += ellipse(q.x - 0.8, q.y - 1.4, 3 * k, 1.3, H.gloss, ang + 28, 'none', 0, 'opacity="0.75"');
    });
    const top = hp(c, h, 0, -h.ry + 6), part = hp(c, h, 0, P.prof(0) + 1);
    if (part.vis > 0) s += `<path d="M${n(top.x)},${n(top.y)} L${n(part.x)},${n(part.y)}" stroke="${OUT}" stroke-width="1.4"/>`;
  }
  if (st === 'longWavy' || st === 'curlyLong') {
    const sway = p.hairSway || 0;
    const curly = st === 'curlyLong';
    [1, -1].forEach((sd) => {
      const a = sd * 78;
      const q = hp(c, h, a, 4);
      if (q.vis < -0.05) return;
      const x0 = q.vis < 0.2 ? h.x + h.rx * q.cl * Math.sign(q.sin) * 0.98 : q.x;
      const o = Math.sign(q.sin) || sd;
      const w = (curly ? 11 : 9) + 4 * clamp(q.vis, 0, 1);
      const tipY = c.hipY - (curly ? 30 : 36);
      const pts = [
        [x0 - o * w * 0.9, q.y - 22],
        [x0 - o * w * 0.5, q.y + 14],
        [x0 - o * w * (curly ? 0.9 : 0.2) + sway * 0.3, q.y + 30],
        [x0 - o * w * 0.1 + sway * 0.5, q.y + 46],
        [x0 + o * 3 + sway, tipY],
        [x0 + o * w * 1.1 + sway * 0.6, q.y + 46],
        [x0 + o * w * (curly ? 1.5 : 1.1) + sway * 0.4, q.y + 28],
        [x0 + o * w * 1.0 + sway * 0.2, q.y + 12],
        [x0 + o * w * 0.6, q.y - 22],
      ];
      s += pathEl(smoothPath(pts, true, 0.9), c.g('hair'));
      if (curly) s += wave(x0 + o * 2 + sway * 0.3, q.y + 4, 40, H.mid);
      else s += `<path d="M${n(x0)},${n(q.y - 6)} Q${n(x0 + o * 5)},${n(q.y + 22)} ${n(x0 + o * 1 + sway * 0.8)},${n(tipY - 10)}" fill="none" stroke="${H.mid}" stroke-width="1.6"/>`;
      s += ellipse(x0 + o * w * 0.3, q.y + 6, 2, 5, H.gloss, o * 10, 'none', 0, 'opacity="0.7"');
    });
  }
  if (av.glasses) {
    const g = av.glasses;
    const stroke = g.gold ? c.g('gold') : g.color;
    const lens = [28, -28].map((a) => { const q = fe(a, 10); return { q, k: Math.pow(clamp(q.vis, 0, 1), 0.8), a }; });
    lens.forEach(({ q, k }) => {
      if (k < 0.12) return;
      s += ellipse(q.x, q.y, g.size * k + 0.6, g.size - 0.4, '#e8f4ff', 0, stroke, g.width, 'fill-opacity="0.16"');
      s += `<path d="M${n(q.x - g.size * 0.55 * k)},${n(q.y - g.size * 0.5)} l${n(3 * k)},-1.4" stroke="#ffffff" stroke-width="1.4" opacity="0.7" stroke-linecap="round"/>`;
    });
    const iL = fe(28 - g.size * 0.9, 8), iR = fe(-28 + g.size * 0.9, 8), br = fe(0, 6);
    if (lens[0].k > 0.12 && lens[1].k > 0.12) s += `<path d="M${n(iL.x)},${n(iL.y)} Q${n(br.x)},${n(br.y - 3)} ${n(iR.x)},${n(iR.y)}" fill="none" stroke="${stroke}" stroke-width="${g.width}"/>`;
    lens.forEach(({ k, a }) => {
      const e = hp(c, h, Math.sign(a) * 92, 6);
      const o = fe(a + Math.sign(a) * (g.size * 1.05), 8);
      if (e.vis > 0 && k > 0.12) s += `<path d="M${n(o.x)},${n(o.y)} L${n(e.x)},${n(e.y)}" fill="none" stroke="${stroke}" stroke-width="${g.width}"/>`;
    });
  }
  if (av.earring) {
    [95, -95].forEach((a) => {
      const q = hp(c, h, a, 21);
      if (q.vis < -0.3) return;
      const x = h.x + h.rx * q.cl * q.sin + Math.sign(q.sin) * 1.5;
      if (av.earring.kind === 'pearl') {
        s += line([[x, q.y - 1], [x, q.y + 2]], '#c8ccd3', 1);
        s += circle(x, q.y + 4.4, 3, '#ffffff', OUT, 1.3) + circle(x - 0.9, q.y + 3.4, 0.9, '#e9eef5', 'none', 0);
      } else {
        s += `<circle cx="${n(x)}" cy="${n(q.y + 4.6)}" r="5" fill="none" stroke="${OUT}" stroke-width="3.4"/><circle cx="${n(x)}" cy="${n(q.y + 4.6)}" r="5" fill="none" stroke="#d8dce2" stroke-width="1.8"/>`;
      }
    });
  }
  return s + '</g>';
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
  (far ? [far, -far] : [1, -1]).forEach((z) => { s += drawLeg(c, legs[key(z)]); });
  s += drawLowerGarment(c, legs);
  s += drawNeck(c, head);
  s += drawTorso(c);
  if (av.hairStyle === 'braids') s += sideBraid(c, head, -22, '#e0565e');
  if (av.hairStyle === 'slickBraid') s += sideBraid(c, head, -18, '#d5d9df');
  const front = far ? [arms[key(-far)]] : [arms.L, arms.R];
  front.filter((g) => !g.arm.wave).forEach((g) => { s += drawArm(c, g); });
  s += drawHead(c, head);
  front.filter((g) => g.arm.wave).forEach((g) => { s += drawArm(c, g); });
  return `<g filter="url(#${av.id}_stk)">${s}</g>`;
}

module.exports = { drawCharacter, defs, GROUND, LEG1, LEG2 };
