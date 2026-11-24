// Motion generator (units: reference-image pixels, ground at y = 0, up is negative). Produces per-frame poses for every animation sequence.
//
// Walking is built from planted footsteps (the stance foot never slides) with heel-strike ->
// flat -> heel-off -> toe-off roll, a swing arc, 2-bone IK for knees, hip bob that is lowest
// in double support and highest at mid-stance, and counter-phase arm swing.
// Each frame also records `x`: the hip's screen displacement (logical px) since the sequence
// started, so the player can move the sprite exactly in sync with the planted feet.
const { clamp, lerp, smooth, smoothstep, easeIn, easeOut, easeSine, rot, keys } = require('../lib/util');
const { LEG1, LEG2, ANKLE, HIP } = require('./dims');

const FPS = 30;
const T = 28 / 30;        // seconds per gait cycle (2 steps)
const STEP = 120;         // step length (logical units)
const V = (2 * STEP) / T; // forward speed
const WALK_PHI = 56;      // body yaw while walking (3/4 view)
const WALK_HEAD = 25;     // head turns a bit more towards the viewer
const STAND_Y = HIP;
const STANCE = 0.6;       // stance fraction of the cycle
const THETA_STRIKE = 18, THETA_TOEOFF = -42;
const LMAX = LEG1 + LEG2 - 1;

const walkHipY = (p) => STAND_Y + 9 - 7 * Math.cos(4 * Math.PI * (p - 0.3));

function stanceAngle(q) {
  if (q < 0.1) return THETA_STRIKE * (1 - easeOut(q / 0.1));
  if (q < 0.38) return 0;
  return THETA_TOEOFF * easeIn((q - 0.38) / (STANCE - 0.38));
}
// ankle position for a foot planted at c (flat ankle position), rotated by th (deg, + = toes up)
function ankleFromPlant(c, th) {
  if (th >= 0) { const r = rot(-16, -ANKLE, th); return { u: c - 16 - r.x, yUp: -r.y, th }; }
  const r = rot(26, -ANKLE, th); return { u: c + 26 - r.x, yUp: -r.y, th };
}
function swingFoot(s, from, to, lift = 20) {
  const e = easeSine(s);
  const u = lerp(from.u, to.u, e);
  const yUp = lerp(from.yUp, to.yUp, s) + lift * Math.pow(Math.sin(Math.PI * Math.pow(s, 0.85)), 1.1);
  const th = keys([[0, from.th], [0.3, -14], [0.65, 2], [1, to.th]], s);
  return { u, yUp, th };
}
// steady-state foot (world coordinates) at time t for a foot with phase offset o
function steadyFoot(t, o) {
  const ph = t / T + o;
  const k = Math.floor(ph), q = ph - k;
  const tc = (k - o) * T;
  const c = V * tc + 0.6 * STEP;
  if (q < STANCE) return ankleFromPlant(c, stanceAngle(q));
  const from = ankleFromPlant(c, THETA_TOEOFF);
  const to = ankleFromPlant(c + 2 * STEP, THETA_STRIKE);
  return swingFoot((q - STANCE) / (1 - STANCE), from, to);
}
const rel = (f, hipU) => ({ u: f.u - hipU, yUp: f.yUp, th: f.th });

// lower the hip if needed so both legs can reach their ankles
function reachHipY(y, feet) {
  let out = y;
  for (const f of feet) {
    const ay = -f.yUp;
    const need = ay - Math.sqrt(Math.max(0, LMAX * LMAX - f.u * f.u));
    out = Math.max(out, need);
  }
  return out;
}

const REST = {
  L: { f1: -2, a1: 16, f2: 6, a2: 14 },
  R: { f1: 16, a1: 27, f2: 132, a2: 2 }, // holding the water bottle up, as in the reference
};
function walkArms(p, amp) {
  const sL = -Math.cos(2 * Math.PI * p), sR = -sL, k = amp / 22;
  return {
    L: { f1: REST.L.f1 + amp * 1.15 * sL, a1: REST.L.a1 - 5 * k, f2: REST.L.f1 + amp * 1.15 * sL + 8 * (1 - k) + (12 + 14 * Math.max(0, sL)) * k, a2: REST.L.a2 - 6 * k },
    R: { f1: REST.R.f1 - 8 * k + 8 * k * sR, a1: REST.R.a1 - 4 * k, f2: REST.R.f2 - 14 * k + 7 * k * sR, a2: REST.R.a2 },
  };
}
const lerpArm = (a, b, t) => {
  const o = {};
  for (const k of Object.keys(a)) o[k] = typeof a[k] === 'number' ? lerp(a[k], b[k] ?? a[k], t) : a[k];
  return o;
};

function basePose(extra) {
  return Object.assign({
    phi: 0, headPhi: 0, hipX: 0, hipY: STAND_Y, lean: 0,
    feet: { L: { u: 0, yUp: ANKLE, th: 0 }, R: { u: 0, yUp: ANKLE, th: 0 } },
    arms: { L: { ...REST.L }, R: { ...REST.R } },
    eyes: 'open', mouth: 'smile', headTilt: 0, bottleTilt: -6, hairSway: 0, hairTrail: 0, breath: 0,
  }, extra);
}
const screenDx = (u, phi) => -u * Math.sin(phi * Math.PI / 180);

// ------------------------------------------------------------------ sequences
function walkLoop(dirSign) {
  const phi = WALK_PHI * dirSign, head = WALK_HEAD * dirSign;
  const N = Math.round(T * FPS);
  const frames = [];
  for (let i = 0; i < N; i++) {
    const t = i / FPS, p = t / T;
    const hipU = V * t;
    const L = rel(steadyFoot(t, 0), hipU), R = rel(steadyFoot(t, 0.5), hipU);
    const hipY = reachHipY(walkHipY(p), [L, R]);
    frames.push({
      pose: basePose({
        phi, headPhi: head, hipY, lean: 4, feet: { L, R },
        arms: walkArms(p, 22),
        headTilt: 1.4 * Math.sin(2 * Math.PI * p) * dirSign,
        headDy: 2 * Math.cos(4 * Math.PI * (p - 0.38)),
        hairSway: 5 * Math.sin(4 * Math.PI * p - 1.3) + 3 * dirSign,
        hairTrail: 9,
      }),
      x: screenDx(hipU, phi),
    });
  }
  return { frames, loop: true, cycleDx: screenDx(V * T, phi), stepFrames: N / 2 };
}

// stop from steady walking. lead = which foot just struck the ground ('L' at p=0, 'R' at p=0.5)
function stopSeq(dirSign, lead) {
  const phi = WALK_PHI * dirSign, head = WALK_HEAD * dirSign;
  const D = 0.6 * STEP, Ts = 0.6 * T;
  const N = Math.round(0.85 * T * FPS);
  const frames = [];
  const back = lead === 'L' ? 'R' : 'L';
  const pOff = lead === 'L' ? 0 : 0.5;
  for (let i = 0; i < N; i++) {
    const t = i / FPS;
    const s = clamp(t / Ts, 0, 1);
    const hipU = D * (1 - (1 - s) * (1 - s));
    // leading foot: finishes heel-strike roll then stays flat
    const lf = ankleFromPlant(0.6 * STEP, t < 0.1 * T ? stanceAngle(t / T) : 0);
    // trailing foot: pushes off then takes a short closing step beside the lead foot
    let bf;
    if (t < 0.1 * T) bf = ankleFromPlant(-0.4 * STEP, stanceAngle(0.5 + t / T));
    else {
      const ss = clamp((t - 0.1 * T) / (0.42 * T), 0, 1);
      const from = ankleFromPlant(-0.4 * STEP, THETA_TOEOFF);
      const to = ankleFromPlant(0.6 * STEP, 0);
      const sw = swingFoot(ss, from, { ...to, th: 0 }, 15);
      sw.th = keys([[0, THETA_TOEOFF], [0.3, -12], [0.75, 6], [1, 0]], ss);
      bf = ss >= 1 ? to : sw;
    }
    const feet = {};
    feet[lead] = rel(lf, hipU);
    feet[back] = rel(bf, hipU);
    const w = smoothstep(0, 0.7 * T, t);
    const p = t / T + pOff;
    let hipY = lerp(walkHipY(p), STAND_Y, w);
    // small settle after the feet come together
    hipY += 3 * Math.sin(clamp((t - 0.5 * T) / (0.35 * T), 0, 1) * Math.PI);
    hipY = reachHipY(hipY, [feet.L, feet.R]);
    const amp = 22 * (1 - smoothstep(0, 0.6 * T, t));
    const arms = walkArms(p, amp);
    const settle = smoothstep(0.35 * T, 0.75 * T, t);
    frames.push({
      pose: basePose({
        phi, headPhi: head, hipY, lean: 4 * (1 - w), feet,
        arms: { L: lerpArm(arms.L, REST.L, settle), R: lerpArm(arms.R, REST.R, settle) },
        hairSway: (5 * Math.sin(4 * Math.PI * p - 1.3) + 3 * dirSign) * (1 - w) - 3 * dirSign * Math.sin(w * Math.PI) ,
        hairTrail: 9 * (1 - w),
        headTilt: 1.4 * Math.sin(2 * Math.PI * p) * dirSign * (1 - w),
      }),
      x: screenDx(hipU, phi),
    });
  }
  return { frames, loop: false };
}

// standing -> steady walk (ends exactly at walkLoop frame 0 state)
function startSeq(dirSign) {
  const phi = WALK_PHI * dirSign, head = WALK_HEAD * dirSign;
  const D = 0.4 * STEP, Ts = 0.4 * T;
  const N = Math.round(Ts * FPS);
  const frames = [];
  for (let i = 0; i < N; i++) {
    const t = i / FPS;
    const s = t / Ts;
    const hipU = D * s * s;
    const bAng = stanceAngle(0.5) * smoothstep(0.1, 1, s);
    const R = ankleFromPlant(0, bAng);
    const t0 = 0.05 * T;
    const ss = clamp((t - t0) / (Ts - t0), 0, 1);
    const from = ankleFromPlant(0, 0);
    const to = ankleFromPlant(STEP, THETA_STRIKE);
    const sw = swingFoot(ss, from, to, 20);
    sw.th = keys([[0, 0], [0.3, -16], [0.65, 2], [1, THETA_STRIKE]], ss);
    const L = t < t0 ? from : sw;
    const p = t / T - 0.4;
    const w = smoothstep(0, Ts, t);
    const feet = { L: rel(L, hipU), R: rel(R, hipU) };
    const hipY = reachHipY(lerp(STAND_Y, walkHipY(p), w), [feet.L, feet.R]);
    const arms = walkArms(p, 22 * w);
    frames.push({
      pose: basePose({
        phi, headPhi: head, hipY, lean: 4 * w, feet,
        arms: { L: lerpArm(REST.L, arms.L, smooth(w * 1.4)), R: lerpArm(REST.R, arms.R, smooth(w * 1.4)) },
        hairSway: (5 * Math.sin(4 * Math.PI * p - 1.3) + 3 * dirSign) * w,
        hairTrail: 9 * w,
      }),
      x: screenDx(hipU, phi),
    });
  }
  return { frames, loop: false };
}

// turn while standing. from/to yaw in degrees. extra(t) can override pose fields.
function turnSeq(fromPhi, toPhi, fromHead, toHead, N, extra) {
  const frames = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const e = smooth(t);
    const lift = Math.sin(t * Math.PI);
    // shift weight and give a tiny step with the leading foot to sell the turn
    const feet = {
      L: { u: 0, yUp: ANKLE + 9 * Math.max(0, Math.sin(clamp(t * 2, 0, 1) * Math.PI)), th: 0 },
      R: { u: 0, yUp: ANKLE + 9 * Math.max(0, Math.sin(clamp(t * 2 - 1, 0, 1) * Math.PI)), th: 0 },
    };
    const base = basePose({
      phi: lerp(fromPhi, toPhi, e),
      headPhi: lerp(fromHead, toHead, smooth(clamp(t * 1.25, 0, 1))),
      hipY: STAND_Y + 4 * lift,
      feet,
      hairSway: -6 * Math.sign(toPhi - fromPhi) * lift,
    });
    frames.push({ pose: Object.assign(base, extra ? extra(t) : {}), x: 0 });
  }
  return { frames, loop: false };
}

// front-facing greeting: wave "hi", then raise the water bottle
const WAVE_UP = { f1: 8, a1: 84, f2: 10, a2: 156, wave: true };
const BOTTLE_UP = { ...REST.R };
function waveSeq() {
  const N = 60;
  const frames = [];
  for (let i = 0; i < N; i++) {
    const t = i / FPS;
    let L;
    const raise = smoothstep(0.0, 0.3, t);
    const lower = smoothstep(1.45, 1.85, t);
    const wav = Math.sin((t - 0.3) * 2 * Math.PI * 2.6) * smoothstep(0.25, 0.4, t) * (1 - lower);
    const up = { ...WAVE_UP, a2: WAVE_UP.a2 + 17 * wav, handRot: 18 * wav };
    L = lerpArm(lerpArm(REST.L, up, raise), REST.L, lower);
    L.wave = raise > 0.5 && lower < 0.5;
    const bot = smoothstep(1.4, 1.95, t);
    // cheers: lift the bottle towards the viewer and back
    const cheer = Math.sin(Math.PI * bot);
    const R = { ...REST.R, f1: REST.R.f1 + 16 * cheer, a1: REST.R.a1 + 8 * cheer, f2: REST.R.f2 + 20 * cheer };
    const talking = t > 0.3 && t < 1.2;
    frames.push({
      pose: basePose({
        arms: { L, R },
        eyes: t > 0.35 && t < 1.25 ? 'happy' : 'open',
        mouth: talking ? (Math.floor(t * 7) % 3 === 2 ? 'o' : 'open') : 'smile',
        headTilt: 5 * smoothstep(0.1, 0.4, t) * (1 - smoothstep(1.3, 1.8, t)) + 2 * Math.sin(t * 6) * raise * (1 - lower),
        hipY: STAND_Y + 4 * Math.sin(Math.PI * smoothstep(0, 0.35, t)),
        bottleTilt: -6 - 8 * cheer,
        breath: 0.5,
      }),
      x: 0,
    });
  }
  return { frames, loop: false };
}

function idleSeq() {
  const N = 72;
  const frames = [];
  for (let i = 0; i < N; i++) {
    const t = i / N;
    const br = 0.5 + 0.5 * Math.sin(2 * Math.PI * t);
    const blink = i >= 50 && i <= 53;
    frames.push({
      pose: basePose({
        arms: { L: { ...REST.L, f1: REST.L.f1 + 1.5 * Math.sin(2 * Math.PI * t) }, R: { ...BOTTLE_UP, f2: BOTTLE_UP.f2 + 4 * Math.sin(2 * Math.PI * t) } },
        eyes: blink ? 'closed' : 'open',
        breath: br,
        hipY: STAND_Y + 1.2 * Math.sin(2 * Math.PI * t),
        headTilt: 2.4 * Math.sin(2 * Math.PI * t),
        headDy: 1.4 * Math.sin(2 * Math.PI * t),
        hairSway: 2.2 * Math.sin(2 * Math.PI * t),
        bottleTilt: -6 + 3 * Math.sin(2 * Math.PI * t),
      }),
      x: 0,
    });
  }
  return { frames, loop: true, cycleDx: 0 };
}

function buildSequences() {
  return {
    walkLeft: walkLoop(1),
    stopLeftA: stopSeq(1, 'L'),
    stopLeftB: stopSeq(1, 'R'),
    turnFront: turnSeq(WALK_PHI, 0, WALK_HEAD, 0, 12),
    wave: waveSeq(),
    idle: idleSeq(),
    turnRight: turnSeq(0, -WALK_PHI, 0, -WALK_HEAD, 14, (t) => ({
      arms: { L: { ...REST.L }, R: lerpArm(BOTTLE_UP, REST.R, smooth(clamp(t * 1.6, 0, 1))) },
      bottleTilt: -6,
    })),
    startRight: startSeq(-1),
    walkRight: walkLoop(-1),
  };
}

module.exports = { buildSequences, FPS, STEP, WALK_PHI };
