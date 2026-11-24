// SVG drawing primitives in the line style of the reference.
const { lerp, n, polyPath } = require('../lib/util');

const INK = '#1e1011', SW = 5.4;
const along = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
const P = (d, fill, stroke = INK, sw = SW, extra = '') => `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round" ${extra}/>`;
const S = (d, color, w, extra = '') => P(d, 'none', color, w, extra);
const pts = (a) => polyPath(a);
const E = (x, y, rx, ry, fill, r = 0, stroke = INK, sw = SW, extra = '') => `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(Math.max(0.1, rx))}" ry="${n(Math.max(0.1, ry))}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" transform="rotate(${n(r)} ${n(x)} ${n(y)})" ${extra}/>`;
function mix(a, b, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const A = p(a), B = p(b);
  return '#' + A.map((v, i) => Math.round(lerp(v, B[i], t)).toString(16).padStart(2, '0')).join('');
}

module.exports = { INK, SW, P, S, E, pts, mix, along };
