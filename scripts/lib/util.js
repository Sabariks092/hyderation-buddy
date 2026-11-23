// Small math / SVG helpers shared by the asset generator.
const DEG = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const smoothstep = (a, b, x) => smooth((x - a) / (b - a));
const easeIn = (t) => { t = clamp(t, 0, 1); return t * t; };
const easeOut = (t) => { t = clamp(t, 0, 1); return 1 - (1 - t) * (1 - t); };
const easeSine = (t) => { t = clamp(t, 0, 1); return 0.5 - 0.5 * Math.cos(Math.PI * t); };
const n = (v) => (Math.round(v * 100) / 100).toString();

// rotate (x,y) by deg in a y-up frame (positive = counter-clockwise)
function rot(x, y, deg) {
  const c = Math.cos(deg * DEG), s = Math.sin(deg * DEG);
  return { x: x * c - y * s, y: x * s + y * c };
}

// piecewise-linear keyframe sampler: keys = [[t, v], ...] sorted by t; eased between keys
function keys(k, t, ease = smooth) {
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) {
    if (t <= k[i][0]) {
      const a = k[i - 1], b = k[i];
      return lerp(a[1], b[1], ease((t - a[0]) / (b[0] - a[0])));
    }
  }
  return k[k.length - 1][1];
}

// Catmull-Rom spline through points -> SVG cubic path
function smoothPath(pts, closed = true, tension = 1) {
  const P = pts;
  const m = P.length;
  if (m < 2) return '';
  const get = (i) => closed ? P[(i + m) % m] : P[clamp(i, 0, m - 1)];
  let d = `M${n(P[0][0])},${n(P[0][1])}`;
  const segs = closed ? m : m - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    const c1x = p1[0] + (p2[0] - p0[0]) / 6 * tension;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6 * tension;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6 * tension;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6 * tension;
    d += `C${n(c1x)},${n(c1y)} ${n(c2x)},${n(c2y)} ${n(p2[0])},${n(p2[1])}`;
  }
  return d + (closed ? 'Z' : '');
}

function polyPath(pts, closed = false) {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${n(p[0])},${n(p[1])}`).join('') + (closed ? 'Z' : '');
}

// quadratic bezier point
function qbez(a, c, b, t) {
  const u = 1 - t;
  return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]];
}

module.exports = { DEG, clamp, lerp, smooth, smoothstep, easeIn, easeOut, easeSine, n, rot, keys, smoothPath, polyPath, qbez };
