// Plays the reminder animation: walk in N steps -> stop -> turn -> wave + bubble -> idle -> walk away.
(() => {
  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d');
  const bubble = document.getElementById('bubble');
  const msgEl = document.getElementById('msg');
  const countEl = document.getElementById('count');
  const BASE = '../assets/generated/';
  let manifest = null;
  const sheetCache = new Map();

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingQuality = 'high';
  }
  addEventListener('resize', resize);
  resize();

  const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  async function loadSheets(avatar) {
    if (sheetCache.has(avatar)) return sheetCache.get(avatar);
    const out = {};
    await Promise.all(Object.entries(manifest.sequences).map(async ([name, sq]) => {
      out[name] = await loadImg(`${BASE}${avatar}/${sq.file}`);
      if (out[name].decode) await out[name].decode().catch(() => {});
    }));
    sheetCache.clear(); // keep memory low: only one avatar cached
    sheetCache.set(avatar, out);
    return out;
  }

  // ---------------------------------------------------------------- sound: soft synthesized water "bloop"
  function bloop() {
    try {
      const ac = new AudioContext();
      const t = ac.currentTime;
      [0, 0.16].forEach((d, i) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(i ? 520 : 380, t + d);
        o.frequency.exponentialRampToValueAtTime(i ? 1100 : 900, t + d + 0.12);
        g.gain.setValueAtTime(0.0001, t + d);
        g.gain.exponentialRampToValueAtTime(0.18, t + d + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.22);
        o.connect(g).connect(ac.destination);
        o.start(t + d); o.stop(t + d + 0.25);
      });
      setTimeout(() => ac.close(), 800);
    } catch { /* audio unavailable */ }
  }

  // ---------------------------------------------------------------- player
  let job = null, sheets = null, phase = null, seqName = null, frame = 0, played = 0;
  let baseX = 0, hipX = 0, lastT = 0, acc = 0, raf = 0, dismissTimer = 0, leaving = false;

  function setSeq(name) {
    // carry over the hip position so the next sequence starts where the last one ended
    seqName = name; frame = 0; played = 0; baseX = hipX;
  }
  function seq() { return manifest.sequences[seqName]; }

  function step() {
    const sq = seq();
    frame++; played++;
    if (frame >= sq.frames) {
      if (sq.loop) { frame = 0; baseX += sq.cycleDx * job.scale; }
      else { frame = sq.frames - 1; return onSeqEnd(); }
    }
    hipX = baseX + sq.x[frame] * job.scale;
    afterStep();
  }
  function afterStep() {
    const sq = seq();
    if (phase === 'walkIn' && played >= job.steps * sq.stepFrames) {
      // after an even number of steps the left foot leads, after odd the right foot leads
      phase = 'stop';
      setSeq(job.steps % 2 === 0 ? 'stopLeftA' : 'stopLeftB');
    } else if (phase === 'wave' && frame === 8) {
      showBubble();
    } else if (phase === 'walkOut') {
      const left = hipX - manifest.anchorX * job.scale;
      if (left > innerWidth + 10) finish();
    }
  }
  function onSeqEnd() {
    if (phase === 'stop') { phase = 'turn'; setSeq('turnFront'); }
    else if (phase === 'turn') { phase = 'wave'; setSeq('wave'); if (job.sound) bloop(); }
    else if (phase === 'wave') { phase = 'idle'; setSeq('idle'); armDismiss(); }
    else if (phase === 'turnAway') { phase = 'start'; setSeq('startRight'); }
    else if (phase === 'start') { phase = 'walkOut'; setSeq('walkRight'); }
    hipX = baseX + seq().x[frame] * job.scale;
  }

  function draw() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    if (!sheets || !seqName) return;
    const sq = seq(), img = sheets[seqName];
    const m = manifest, s = job.scale;
    const sx = (frame % m.cols) * m.frameW, sy = Math.floor(frame / m.cols) * m.frameH;
    const dw = m.frameW * s, dh = m.frameH * s;
    const dx = hipX - m.anchorX * s;
    const dy = innerHeight - m.groundY * s - 4;
    // soft contact shadow
    ctx.save();
    ctx.fillStyle = 'rgba(20, 40, 60, 0.18)';
    ctx.beginPath();
    ctx.ellipse(hipX, innerHeight - 4 - 1, 34 * s, 6 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.drawImage(img, sx, sy, m.frameW, m.frameH, dx, dy, dw, dh);
    if (!bubble.classList.contains('hidden')) placeBubble();
  }
  function loop(t) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(100, t - lastT); lastT = t;
    acc += dt;
    const fd = 1000 / manifest.fps;
    let n = 0;
    while (acc >= fd && n < 4) { acc -= fd; step(); n++; if (!job) return; }
    draw();
  }

  function placeBubble() {
    const s = job.scale;
    const headTop = innerHeight - 4 - (290 - 45) * manifest.scale * s;
    const right = Math.max(bubble.offsetWidth + 8, hipX - 46 * s);
    bubble.style.left = `${right - bubble.offsetWidth}px`;
    bubble.style.top = `${Math.max(6, headTop - bubble.offsetHeight * 0.7)}px`;
  }
  function showBubble() {
    msgEl.textContent = job.message;
    countEl.textContent = job.today > 0 ? `You've had ${job.today} glass${job.today === 1 ? '' : 'es'} today — keep going!` : 'First glass of the day? Let\'s go!';
    document.getElementById('snooze').textContent = `Snooze ${job.snoozeMinutes || 10}m`;
    bubble.classList.remove('hidden');
    placeBubble();
  }
  function hideBubble() { bubble.classList.add('hidden'); window.hydra.setInteractive(false); }
  function armDismiss() {
    clearTimeout(dismissTimer);
    if (job.autoDismissSeconds > 0) dismissTimer = setTimeout(() => leave(null), job.autoDismissSeconds * 1000);
  }
  function leave(action) {
    if (leaving || !job) return;
    leaving = true;
    clearTimeout(dismissTimer);
    if (action) window.hydra.respond(action);
    if (action === 'drank') { countEl.textContent = 'Yay! Great job 🎉'; setTimeout(go, 700); } else go();
    function go() {
      hideBubble();
      // finish the current pose first, then turn and walk away to the right
      phase = 'turnAway'; setSeq('turnRight');
    }
  }
  function finish() {
    cancelAnimationFrame(raf);
    job = null; seqName = null; leaving = false;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    window.hydra.finished();
  }

  bubble.addEventListener('mouseenter', () => window.hydra.setInteractive(true));
  bubble.addEventListener('mouseleave', () => window.hydra.setInteractive(false));
  document.getElementById('drank').addEventListener('click', () => leave('drank'));
  document.getElementById('snooze').addEventListener('click', () => leave('snooze'));
  document.getElementById('close').addEventListener('click', () => leave('dismiss'));

  window.hydra.onPlay(async (j) => {
    if (!manifest) manifest = await (await fetch(BASE + 'manifest.json')).json();
    cancelAnimationFrame(raf);
    clearTimeout(dismissTimer);
    hideBubble();
    leaving = false;
    job = j;
    resize();
    sheets = await loadSheets(j.avatar);
    // start fully off-screen on the right edge
    hipX = innerWidth + manifest.anchorX * j.scale * 0.75;
    phase = 'walkIn';
    setSeq('walkLeft');
    hipX = baseX + seq().x[0] * j.scale;
    lastT = performance.now(); acc = 0;
    raf = requestAnimationFrame(loop);
  });
})();
