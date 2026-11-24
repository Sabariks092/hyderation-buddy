// Jointed body drawn to match the reference artwork (same proportions, inks and outfits), plus
// the real reference head on top. Units: reference pixels; x = 0 body centre, y = 0 ground, up < 0.
// Yaw `phi`: 0 = facing the viewer, + = turned towards screen-left.
const { DEG, clamp, lerp, n, rot, smoothPath, polyPath } = require('../lib/util');
const { warpFront, project, Y0 } = require('./head');
const { LEG1, LEG2, ANKLE, ARM1, ARM2, HIP, GROUND_REF } = require('./dims');
const { INK, SW, P, S, E, pts, mix, along } = require('./ink');
const outfit = require('./outfit');

function defs(av) {
  const id = av.id;
  const lin = (k, st, x2 = 1, y2 = 0) => `<linearGradient id="${id}_${k}" x1="0" y1="0" x2="${x2}" y2="${y2}">${st.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;
  const g3 = (k, o) => lin(k, [[0, mix(o.color, o.light, 0.55)], [0.2, o.color], [0.62, o.color], [1, o.shade]]);
  return `<defs>${g3('top', av.top)}${g3('leg', av.legs)}${lin('legF', [[0, mix(av.legs.color, av.legs.shade, 0.5)], [1, av.legs.shade]])}${lin('topF', [[0, mix(av.top.color, av.top.shade, 0.5)], [1, av.top.shade]])}` +
    `${g3('skin', { color: av.skin.base, light: av.skin.light, shade: mix(av.skin.base, av.skin.shade, 0.7) })}` +
    `${lin('shoe', [[0, av.shoes.color], [0.55, av.shoes.color], [1, av.shoes.shade]], 0, 1)}` +
    `${lin('bot', [[0, '#5fd0ff'], [0.4, '#41b4fb'], [1, '#2f8fe6']])}${lin('cap', [[0, '#5ecbff'], [0.6, '#36aaf6'], [1, '#2b86d8']])}${lin('hair', [[0, '#4d4248'], [0.5, '#2f272b'], [1, '#231b1f']], 0.6, 1)}</defs>`;
}

function ctx(pose, av, uid) {
  const phi = pose.phi * DEG;
  const c = { pose, av, uid, clipN: 0, sinp: Math.sin(phi), cosp: Math.cos(phi), hipY: pose.hipY, tanL: Math.tan((pose.lean || 0) * DEG), g: (k) => `url(#${av.id}_${k})` };
  c.clip = () => `${uid}k${c.clipN++}`;
  c.near = c.sinp > 0.1 ? 1 : c.sinp < -0.1 ? -1 : 0;   // +1: her left side is nearest
  c.cf = Math.max(0.3, Math.abs(c.cosp));
  return c;
}
const { X, Y, mid, yy, surf } = outfit;

// ---------------------------------------------------------------- limbs
function limbOutline(joints, ws, flatEnd) {
  const Q = [], W = [];
  for (let i = 0; i < joints.length - 1; i++) for (let k = 0; k < 6; k++) { const t = k / 6; Q.push(along(joints[i], joints[i + 1], t)); W.push(lerp(ws[i], ws[i + 1], t)); }
  Q.push(joints[joints.length - 1]); W.push(ws[ws.length - 1]);
  const m = Q.length, L = [], R = [];
  for (let i = 0; i < m; i++) {
    const a = Q[Math.max(0, i - 3)], b = Q[Math.min(m - 1, i + 3)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, tx = (b[0] - a[0]) / l, ty = (b[1] - a[1]) / l;
    L.push([Q[i][0] - ty * W[i] / 2, Q[i][1] + tx * W[i] / 2]); R.push([Q[i][0] + ty * W[i] / 2, Q[i][1] - tx * W[i] / 2]);
  }
  const dirAt = (i, j) => { const dx = Q[j][0] - Q[i][0], dy = Q[j][1] - Q[i][1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };
  // half circle from the L side to the R side, bulging along `d`
  const cap = (p, r, d, sgn, flat) => {
    const o = [], nx = -d[1] * sgn, ny = d[0] * sgn, k = flat ? 0.16 : 1;
    for (let i = 1; i < 8; i++) { const th = i / 8 * Math.PI, ca = Math.cos(th) * r, sa = Math.sin(th) * r * k; o.push([p[0] + nx * ca + d[0] * sa, p[1] + ny * ca + d[1] * sa]); }
    return o;
  };
  const d1 = dirAt(m - 2, m - 1), d0 = dirAt(1, 0);
  return { d: polyPath([...L, ...cap(Q[m - 1], W[m - 1] / 2, d1, 1, flatEnd), ...R.reverse(), ...cap(Q[0], W[0] / 2, d0, 1, false)], true), Q, W };
}
function limb(c, joints, ws, fill, o = {}) {
  const L = limbOutline(joints, ws, o.flat);
  const id = c.clip();
  let inner = '';
  const off = (k, t0, t1) => L.Q.map((q, i) => [q[0] + L.W[i] * k, q[1]]).slice(Math.floor(t0 * L.Q.length), Math.ceil(t1 * L.Q.length));
  if (o.light) inner += S(pts(off(-0.36, 0.12, 0.96)), o.light, 4, 'opacity="0.6"');
  if (o.shade) inner += S(pts(off(0.36, 0.05, 0.98)), o.shade, 7, 'opacity="0.45"');
  inner += o.inner || '';
  return `<clipPath id="${id}"><path d="${L.d}"/></clipPath>` + P(L.d, fill, 'none', 0) + `<g clip-path="url(#${id})">${inner}</g>` + P(L.d, 'none', INK, SW);
}

// bent limb: both bones share one outline, so a folded elbow stays clean
function bentLimb(c, a, b, e, ws, fill, flat, shade) {
  const A = limbOutline([a, b], [ws[0], ws[1]], false).d, B = limbOutline([b, e], [ws[1], ws[2]], flat).d;
  const fold = along(a, b, 0.96);
  return P(A, INK, INK, SW * 2 - 1.5) + P(B, INK, INK, SW * 2 - 1.5) + P(A, fill, 'none', 0) + P(B, fill, 'none', 0) + S(`M${n(fold[0] - 5)},${n(fold[1] - 11)} q7,3 12,1`, shade, 3, 'opacity="0.8"');
}
// ---------------------------------------------------------------- legs
function legGeom(c, side, f) {
  // feet are set closer together when turned so both strides read equally long
  const z = side * 27 * Math.pow(Math.abs(c.cosp), 1.2), hip = { u: 0, y: c.hipY }, ank = { u: f.u, y: -f.yUp };
  const dx = ank.u - hip.u, dy = ank.y - hip.y, d = Math.min(Math.hypot(dx, dy), LEG1 + LEG2 - 0.05);
  const base = Math.atan2(dy, dx), a = Math.acos(clamp((LEG1 ** 2 + d * d - LEG2 ** 2) / (2 * LEG1 * d), -1, 1));
  const k = [base - a, base + a].map((t) => ({ u: hip.u + LEG1 * Math.cos(t), y: hip.y + LEG1 * Math.sin(t) })).sort((p, q) => q.u - p.u)[0];
  const pr = (q) => [X(c, q.u, z, 0), q.y];
  return { side, f, H: pr(hip), K: pr(k), A: pr(ank) };
}
function drawShoe(c, g) {
  const sh = c.av.shoes, s = Math.abs(c.sinp), dir = c.sinp >= 0 ? -1 : 1;
  // profile in foot space: x forward, y up from the ankle (sole at -ANKLE)
  const heel = -25 + 3 * s, toe = 25 + 23 * s;
  const prof = [[heel + 3, 4 * s + 2], [0, 13], [12 + 4 * s, 12 - 3 * s], [toe - 9, 2 - 3 * s], [toe, -10], [toe - 3, -ANKLE + 5], [toe - 13, -ANKLE], [heel + 11, -ANKLE], [heel + 1, -ANKLE + 6], [heel - 1, -8]];
  const w = (x, y) => { const r = rot(x, y, g.f.th * s); return [g.A[0] + dir * r.x, g.A[1] - r.y]; };
  const d = smoothPath(prof.map(([x, y]) => w(x, y)), true, 0.95);
  const id = c.clip();
  let inner = S(pts([w(heel - 4, -ANKLE + 5), w(0, -ANKLE + 5), w(toe + 4, -ANKLE + 5)]), sh.sole, 8, 'opacity="0.85"');
  const hl = w(lerp(heel, toe, 0.62), 1);
  inner += E(hl[0], hl[1], 9 + 3 * s, 3, '#ffffff', 0, 'none', 0, `opacity="${sh.kind === 'sneaker' ? 0.9 : 0.35}"`);
  if (sh.kind === 'sneaker') {
    if (s > 0.35) inner += S(pts([w(2 + 8 * s, 10), w(14 + 12 * s, 4)]), '#bfaea3', 3) + S(pts([w(-6 + 8 * s, 6), w(10 + 10 * s, -1)]), '#bfaea3', 2.4);
    else inner += S(`M${n(g.A[0] - 14)},${n(g.A[1] + 1)} q14,-5 28,0`, '#bfaea3', 3);
  }
  return `<clipPath id="${id}"><path d="${d}"/></clipPath>` + P(d, c.g('shoe'), 'none', 0) + `<g clip-path="url(#${id})">${inner}</g>` + P(d, 'none');
}
function drawLeg(c, g, far) {
  const l = c.av.legs, [w0, w1, w2] = l.w, pants = l.kind !== 'bare';
  const sc = lerp(1, 0.9, Math.abs(c.sinp));
  const end = along(g.K, g.A, pants ? 0.9 : 0.94);
  let inner = '';
  if (pants) {
    inner += S(`M${n(g.K[0] - 16)},${n(g.K[1] - 4)} q14,9 26,0 M${n(g.K[0] - 4)},${n(g.K[1] + 12)} q12,-2 18,-12`, l.shade, 3, 'opacity="0.8"');
    const h0 = along(g.K, g.A, 0.86), dx = g.A[0] - g.K[0], dy = g.A[1] - g.K[1], ln = Math.hypot(dx, dy) || 1;
    if (l.kind === 'flare') inner += S(pts([[h0[0] - dy / ln * 34, h0[1] + dx / ln * 34], [h0[0] + dy / ln * 34, h0[1] - dx / ln * 34]]), l.light, 3, 'opacity="0.8"');
  } else {
    inner += S(`M${n(g.K[0] - 14)},${n(g.K[1] + 4)} q14,8 24,0`, l.shade, 3, 'opacity="0.55"');
  }
  return drawShoe(c, g) + limb(c, [g.H, g.K, end], [w0 * sc, w1 * sc, w2 * sc], far ? c.g('legF') : c.g('leg'), { flat: true, light: far ? null : l.light, shade: l.shade, inner });
}

// ---------------------------------------------------------------- arms
const dir3 = (f, a, side) => ({ u: Math.sin(f * DEG) * Math.cos(a * DEG), y: Math.cos(f * DEG) * Math.cos(a * DEG), z: side * Math.sin(a * DEG) });
function armGeom(c, side, arm) {
  const yo = Y(453), z = side * 47;
  const A = { u: -yo * c.tanL, y: yy(c, 453), z };
  const d1 = dir3(arm.f1, arm.a1, side), d2 = dir3(arm.f2, arm.a2, side);
  const add = (p, d, l) => ({ u: p.u + d.u * l, y: p.y + d.y * l, z: p.z + d.z * l });
  const B = add(A, d1, ARM1), W = add(B, d2, ARM2), H = add(W, d2, 11);
  const pr = (q) => [-q.u * c.sinp + q.z * c.cosp, q.y];
  return { side, arm, S: pr(A), E: pr(B), W: pr(W), H: pr(H) };
}
function drawArm(c, g, far) {
  const av = c.av, t = av.top, sk = av.skin, top = far ? c.g('topF') : c.g('top');
  const bent = g.side === -1;
  let s = '';
  const join = (w0, col) => (far ? '' : E(g.S[0] + Math.sign(X(c, 0, 0, Y(453)) - g.S[0]) * (c.near ? 1 : 6), g.S[1], w0 / 2 - 1.6, w0 / 2 - 1.6, col, 0, 'none', 0));
  const skinArm = () => (bent ? bentLimb(c, g.S, g.E, g.W, [27, 27, 24], c.g('skin'), false, sk.shade) : limb(c, [g.S, g.E, g.W], [30, 30, 25], c.g('skin'), { shade: sk.shade, light: far ? null : '#fff1e4' }));
  if (t.sleeve === 'long') {
    s += limb(c, [along(g.E, g.W, 0.4), g.W], [26, 25], c.g('skin'), { shade: sk.shade });
    const end = along(g.E, g.W, bent ? 0.45 : 0.82), c0 = along(g.E, end, 0.75);
    s += bent ? bentLimb(c, g.S, g.E, end, [34, 38, 38], top, true, t.shade) : limb(c, [g.S, g.E, end], [34, 40, 46], top, { flat: true, light: far ? null : t.light, shade: t.shade, inner: E(c0[0] + 3, c0[1] - 3, 4, 10, 'none', -8, t.line, 2, 'opacity="0.7"') });
    if (!bent || !c.near) s += join(34, av.cardigan ? mix(t.color, t.light, 0.25) : t.color);
  } else if (t.sleeve === 'elbow') {
    s += skinArm();
    const c0 = along(g.S, g.E, 0.8), an = Math.atan2(g.E[1] - g.S[1], g.E[0] - g.S[0]) / DEG;
    s += limb(c, [g.S, along(g.S, g.E, 1.04)], [38, 46], top, { flat: true, light: far ? null : t.light, shade: t.shade, inner: E(c0[0], c0[1], 11, 5, 'none', an, t.line, 2, 'opacity="0.8"') + E(c0[0] + 5, c0[1] + 2, 26, 4, 'none', an + 90, t.line, 2, 'opacity="0.5"') });
    if (!bent || !c.near) s += join(38, t.color);
  } else {
    s += skinArm();
    const m = along(g.S, g.E, 0.36), an = Math.atan2(g.E[1] - g.S[1], g.E[0] - g.S[0]) - 90 * DEG;
    const loc = (x, y) => [m[0] + x * Math.cos(an) - y * Math.sin(an), m[1] + x * Math.sin(an) + y * Math.cos(an)];
    const at = (x, y) => loc(x, y).map(n).join(',');
    const sd = c.near ? 0 : g.side * 3;
    const puff = [[-16 + sd, -27], [14 + sd, -27], [27 + sd, -8], [25, 14], [17, 25], [-17, 25], [-25, 14], [-27 + sd, -8]].map((q) => loc(...q));
    s += P(smoothPath(puff, true), top);
    s += S(`M${at(-9, -16)} Q${at(-13, 2)} ${at(-8, 20)} M${at(1, -18)} Q${at(1, 2)} ${at(0, 20)} M${at(11, -16)} Q${at(14, 2)} ${at(8, 20)}`, t.line, 2.4, 'opacity="0.55"');
    s += S(`M${at(-20, -8)} Q${at(-22, 4)} ${at(-17, 14)}`, t.light, 3.4, 'opacity="0.8"');
    if (av.print === 'roses') s += outfit.rose(...loc(2, -2), 1);
    s += P(`M${at(-19, 22)}L${at(19, 22)}L${at(18, 32)}L${at(-18, 32)}Z`, t.shade, INK, 4.4);
  }
  if (bent) s += bottle(c, g);
  else if (g.arm.wave) s += openHand(c, g);
  else s += fist(c, g);
  return s;
}
function fist(c, g) {
  const an = Math.atan2(g.H[1] - g.W[1], g.H[0] - g.W[0]) / DEG - 90, o = c.near ? -Math.sign(c.sinp) : -1;
  const [x, y] = along(g.W, g.H, 0.75);
  const wr = along(g.W, g.H, c.av.top.sleeve === 'long' ? 0.15 : -0.15);
  return `<g transform="rotate(${n(an)} ${n(x)} ${n(y)})">` + E(x, y, 20, 19.5, c.g('skin')) + '</g>' + E(wr[0], wr[1], 9.8, 9.8, c.av.skin.base, 0, 'none', 0) + `<g transform="rotate(${n(an)} ${n(x)} ${n(y)})">` +
    P(`M${n(x + o * 12)},${n(y - 8)} q${n(o * 9)},8 ${n(o * 2)},19 q${n(o * -8)},2 ${n(o * -6)},-9`, c.av.skin.base, INK, 4.4) + '</g>';
}
function openHand(c, g) {
  const r = g.arm.handRot || 0, x = g.H[0], y = g.H[1];
  const f = (dx, dy, a, l, w) => `<g transform="rotate(${a} ${n(x + dx)} ${n(y + dy)})"><rect x="${n(x + dx - w / 2)}" y="${n(y + dy - l)}" width="${w}" height="${l + 8}" rx="${w / 2}" fill="${c.av.skin.base}" stroke="${INK}" stroke-width="4.6"/></g>`;
  return `<g transform="rotate(${n(r)} ${n(x)} ${n(y + 14)})">` + f(-13, 4, -50, 18, 13) + f(-9, -8, -16, 20, 12.5) + f(1, -11, 0, 23, 12.5) + f(11, -8, 15, 20, 12.5) +
    E(x, y, 18, 18, c.g('skin')) + `<circle cx="${n(x)}" cy="${n(y + 13)}" r="9.5" fill="${c.av.skin.base}"/><ellipse cx="${n(x)}" cy="${n(y - 6)}" rx="13" ry="10" fill="${c.av.skin.base}"/>` + S(`M${n(x - 6)},${n(y + 5)} q7,5 13,-1`, c.av.skin.deep, 2.6, 'opacity="0.7"') + '</g>';
}
// water bottle with the gripping hand, as in the reference
function bottle(c, g) {
  const [x, y] = g.H, t = c.pose.bottleTilt || 0, bx = x + 13, by = y - 3, sk = c.av.skin;
  const body = `M${n(bx - 10)},${n(by - 40)} C${n(bx - 24)},${n(by - 32)} ${n(bx - 23)},${n(by - 22)} ${n(bx - 22)},${n(by - 10)} L${n(bx - 20)},${n(by + 32)} Q${n(bx - 19)},${n(by + 41)} ${n(bx - 9)},${n(by + 41)} L${n(bx + 10)},${n(by + 41)} Q${n(bx + 20)},${n(by + 41)} ${n(bx + 20)},${n(by + 32)} L${n(bx + 21)},${n(by - 10)} C${n(bx + 22)},${n(by - 24)} ${n(bx + 20)},${n(by - 33)} ${n(bx + 9)},${n(by - 40)}Z`;
  const id = c.clip();
  let s = `<g transform="rotate(${n(t)} ${n(bx)} ${n(by)})">`;
  s += E(bx + 22, by - 6, 8, 17, sk.base, -4, INK, 4.6); // fingers peeking round the far side
  s += `<clipPath id="${id}"><path d="${body}"/></clipPath>` + P(body, c.g('bot'), 'none', 0) +
    `<g clip-path="url(#${id})"><path d="M${n(bx - 30)},${n(by - 44)} h60 v22 q-30,12 -60,0z" fill="#8fe0ff" opacity="0.9"/><path d="M${n(bx - 24)},${n(by + 14)} h50 v34 h-50z" fill="#5cc6ff" opacity="0.9"/><path d="M${n(bx + 15)},${n(by - 30)} v64" stroke="#2a7fd6" stroke-width="6" opacity="0.55"/><path d="M${n(bx - 13)},${n(by - 30)} q-4,6 -3,16" stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none" opacity="0.95"/><path d="M${n(bx + 10)},${n(by - 4)} v14" stroke="#fff" stroke-width="3.4" stroke-linecap="round" opacity="0.75"/></g>` + P(body, 'none');
  s += `<rect x="${n(bx - 9)}" y="${n(by - 48)}" width="18" height="9" fill="#2f8fe6" stroke="${INK}" stroke-width="4.4"/>`;
  s += `<rect x="${n(bx - 10.5)}" y="${n(by - 60)}" width="21" height="14" rx="3.5" fill="${c.g('cap')}" stroke="${INK}" stroke-width="4.6"/>`;
  s += `<path d="M${n(bx - 6)},${n(by - 57)} v7" stroke="#b9ecff" stroke-width="3" stroke-linecap="round"/></g>`;
  const hx = x - 3, hy = y + 1; // palm + fingers
  s += P(`M${n(hx - 20)},${n(hy + 14)} C${n(hx - 26)},${n(hy - 8)} ${n(hx - 16)},${n(hy - 24)} ${n(hx + 2)},${n(hy - 23)} C${n(hx + 14)},${n(hy - 24)} ${n(hx + 17)},${n(hy - 18)} ${n(hx + 16)},${n(hy - 13)} C${n(hx + 21)},${n(hy - 9)} ${n(hx + 21)},${n(hy - 4)} ${n(hx + 17)},${n(hy - 1)} C${n(hx + 20)},${n(hy + 4)} ${n(hx + 18)},${n(hy + 9)} ${n(hx + 13)},${n(hy + 10)} C${n(hx + 13)},${n(hy + 17)} ${n(hx + 6)},${n(hy + 20)} ${n(hx - 4)},${n(hy + 21)} C${n(hx - 12)},${n(hy + 22)} ${n(hx - 18)},${n(hy + 20)} ${n(hx - 20)},${n(hy + 14)}Z`, c.g('skin'));
  s += S(`M${n(hx + 16)},${n(hy - 13)} q-10,-3 -18,0 M${n(hx + 17)},${n(hy - 1)} q-10,-2 -18,0 M${n(hx + 13)},${n(hy + 10)} q-8,-1 -14,0`, INK, 3.6);
  return s;
}

// ---------------------------------------------------------------- braids
function braid(c, p0, ctrl, p1, n0, w0, w1, tie) {
  const at = (t) => { const u = 1 - t; return [u * u * p0[0] + 2 * u * t * ctrl[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * ctrl[1] + t * t * p1[1]]; };
  let s = '';
  const e = at(1), pe = at(0.93), an = Math.atan2(e[1] - pe[1], e[0] - pe[0]);
  const q = (x, y) => [e[0] + x * Math.sin(an) + y * Math.cos(an), e[1] - x * Math.cos(an) + y * Math.sin(an)].map(n).join(',');
  s += P(`M${q(-7, -2)} C${q(-22, 12)} ${q(-18, 36)} ${q(-2, 36)} C${q(18, 36)} ${q(20, 12)} ${q(7, -2)}Z`, '#2b2327') + S(`M${q(-2, 8)} Q${q(-6, 18)} ${q(-2, 28)}`, '#7d6f76', 4);
  for (let i = n0 - 1; i >= 0; i--) {
    const t = (i + 0.5) / n0, a = at(t), b = at(Math.min(1, t + 0.04)), z = at(Math.max(0, t - 0.04));
    const ang = Math.atan2(b[1] - z[1], b[0] - z[0]) / DEG, w = lerp(w0, w1, t), ln = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / n0;
    [-1, 1].forEach((sd) => {
      const ox = Math.cos((ang + 90) * DEG) * w * 0.42 * sd, oy = Math.sin((ang + 90) * DEG) * w * 0.42 * sd;
      const shift = sd > 0 ? ln * 0.22 : -ln * 0.1, x = a[0] + ox + Math.cos(ang * DEG) * shift, y = a[1] + oy + Math.sin(ang * DEG) * shift;
      s += E(x, y, ln * 0.82, w * 0.62, c.g('hair'), ang - sd * 30, INK, 4.4);
      s += E(x - 3, y - 3, ln * 0.2, w * 0.14, '#8a7b82', ang - sd * 30, 'none', 0, 'opacity="0.85"');
    });
  }
  s += E(e[0], e[1], 12, 5.5, tie, an / DEG + 90, INK, 4);
  return s;
}

// ---------------------------------------------------------------- assembly
const cache = new Map();
function headImage(hd, key, yaw) {
  const k = `${hd.av.id}|${key}|${yaw.toFixed(1)}`;
  if (!cache.has(k)) cache.set(k, warpFront(hd, key, yaw).toB64());
  return cache.get(k);
}
const img = (b64, x, y, w, h, extra = '') => `<image href="data:image/png;base64,${b64}" x="${n(x)}" y="${n(y)}" width="${w}" height="${h}" ${extra}/>`;

function drawCharacter(pose, av, hd, uid) {
  const c = ctx(pose, av, uid);
  const legsG = { L: legGeom(c, 1, pose.feet.L), R: legGeom(c, -1, pose.feet.R) };
  const arms = { L: armGeom(c, 1, pose.arms.L), R: armGeom(c, -1, pose.arms.R) };
  const K = (z) => (z > 0 ? 'L' : 'R');
  const far = -c.near;
  const yaw = Math.round(pose.headPhi * 2) / 2, t = yaw * DEG;
  // head transform: bitmap coords -> scene
  const hx = X(c, 0, 0, Y(420)) - c.sinp * 4 + (pose.headDx || 0), dy = pose.hipY - HIP + (pose.headDy || 0) - (pose.breath || 0) * 1.6;
  const ox = hx - hd.cx, oy = Y0 - GROUND_REF + dy;
  const tilt = `rotate(${n(pose.headTilt || 0)} ${n(hx)} ${n(400 - GROUND_REF + dy)})`;
  const trail = (pose.hairTrail || 0) * c.sinp, sway = pose.hairSway || 0;
  let s = '';
  // hair behind the body
  const long = hd.av.head.longHair, topY = 330 - GROUND_REF + dy;
  const skew = long ? Math.atan((sway + trail) / 200) / DEG : 0;
  const bx = long ? -Math.sin(t) * 14 : Math.sin(t) * 34;
  s += `<g transform="${tilt}"><g transform="translate(${n(bx)},${n(topY)}) skewX(${n(skew)}) translate(0,${n(-topY)})">${img(hd.backB64, ox, oy, hd.w, hd.h)}</g>` +
    `${Math.abs(yaw) < 10 ? img(hd.wispsB64, ox, oy, hd.w, hd.h, `opacity="${n(1 - Math.abs(yaw) / 10)}"`) : ''}</g>`;
  const earX = ox + project(hd, hd.cx - 92, 378 - Y0, yaw).x, earY = 388 - GROUND_REF + dy;
  if (av.braid === 'back') s += braid(c, [lerp(earX + 4, hx, c.near > 0 ? 0.3 : 0), earY - 4], [X(c, -4, -84, 0), yy(c, 440)], [X(c, -6, -104, 0) + sway * 1.2 + trail * 0.6, yy(c, 516)], 6, 27, 19, '#5b3a86');
  if (far) s += drawArm(c, arms[K(far)], true);
  (far ? [far, -far] : [1, -1]).forEach((z) => { s += drawLeg(c, legsG[K(z)], far && z === far); });
  s += outfit.neck(c);
  s += outfit.torso(c, [legsG.L, legsG.R]);
  if (av.braid === 'front') {
    const p = surf(c, 560, -30, 1.1), q = surf(c, 450, -50, 1.1);
    s += braid(c, [lerp(earX + 14, hx, c.near ? 0.35 : 0.05), earY + 2], [q.x - 6 * c.cosp, q.y + 10], [p.x + sway * 0.8, yy(c, 548)], 6, 28, 21, '#8e6b62');
  }
  if (far === -1) { // the raised bottle hand is in front of the body
    s += bottle(c, arms.R);
  }
  const front = far ? [arms[K(-far)]] : [arms.L, arms.R];
  front.filter((g) => !g.arm.wave).forEach((g) => { s += drawArm(c, g, false); });
  let dB = '', dF = '';
  hd.drops.forEach((d) => {
    const q = project(hd, d.ax, d.ay, yaw);
    const im = img(d.b64, ox + d.x + q.x - d.ax, oy + d.y, d.w, d.h, `transform="rotate(${n(-sway * 1.2)} ${n(ox + q.x)} ${n(oy + d.ay)})"`);
    if (q.front) dF += im; else dB += im;
  });
  s += `<g transform="${tilt}">${dB}${img(headImage(hd, `${pose.eyes || 'open'}_${pose.mouth || 'smile'}`, yaw), ox, oy, hd.w, hd.h)}${dF}</g>`;
  front.filter((g) => g.arm.wave).forEach((g) => { s += drawArm(c, g, false); });
  return s;
}

module.exports = { drawCharacter, defs };
