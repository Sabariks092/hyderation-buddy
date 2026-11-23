(async () => {
  const $ = (id) => document.getElementById(id);
  const BASE = '../assets/generated/';
  const init = await window.hydra.getSettings();
  let S = init.settings;
  const avatars = init.manifest.avatars;
  const defaults = init.defaultMessages;
  const manifest = await (await fetch(BASE + 'manifest.json')).json();

  let toastT;
  async function save(patch) {
    S = await window.hydra.saveSettings(patch);
    const t = $('toast'); t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1100);
    render();
  }

  // ---------------- status
  function showStatus(st) {
    $('today').textContent = st.today;
    const fmt = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    $('status').textContent = !st.enabled ? 'Reminders are turned off'
      : st.pausedUntil && st.pausedUntil > Date.now() ? `Paused until ${fmt(st.pausedUntil)}`
        : st.nextAt ? `Next reminder at ${fmt(st.nextAt)} · every ${S.intervalMinutes} min` : 'Ready';
    $('devHint').hidden = st.isPackaged;
  }
  showStatus(init.status);
  window.hydra.onStatus(showStatus);

  // ---------------- general
  $('enabled').onchange = (e) => save({ enabled: e.target.checked });
  $('interval').onchange = (e) => { const v = Math.max(1, Math.min(480, Math.round(+e.target.value || 30))); save({ intervalMinutes: v }); };
  $('intervalChips').onclick = (e) => { const v = e.target.dataset.v; if (v) save({ intervalMinutes: +v }); };
  $('quiet').onchange = (e) => save({ quietHours: { ...S.quietHours, enabled: e.target.checked } });
  $('quietStart').onchange = (e) => save({ quietHours: { ...S.quietHours, start: e.target.value } });
  $('quietEnd').onchange = (e) => save({ quietHours: { ...S.quietHours, end: e.target.value } });
  $('autoStart').onchange = (e) => save({ autoStart: e.target.checked });
  $('preview').onclick = () => window.hydra.previewNow();

  // ---------------- avatars (animated idle previews)
  const cards = avatars.map((a) => {
    const el = document.createElement('div');
    el.className = 'av';
    el.innerHTML = `<span class="tick">✓</span><span class="badge">Chosen</span><canvas width="264" height="360"></canvas><b>${a.name}</b><small>${a.tagline}</small>`;
    const img = new Image(); img.src = `${BASE}${a.id}/idle.png`;
    const still = new Image(); still.src = `${BASE}${a.id}/preview.png`;
    el.onclick = () => {
      if (S.avatarMode === 'fixed') return save({ fixedAvatar: a.id });
      const set = new Set(S.enabledAvatars);
      if (set.has(a.id)) { if (set.size > 1) set.delete(a.id); } else set.add(a.id);
      save({ enabledAvatars: avatars.map((x) => x.id).filter((id) => set.has(id)) });
    };
    $('avatars').appendChild(el);
    return { a, el, ctx: el.querySelector('canvas').getContext('2d'), img, still };
  });
  let f = 0;
  setInterval(() => {
    const sq = manifest.sequences.idle;
    f = (f + 1) % sq.frames;
    cards.forEach((c) => {
      c.ctx.clearRect(0, 0, 264, 360);
      if (c.img.complete && c.img.naturalWidth) {
        c.ctx.drawImage(c.img, (f % manifest.cols) * manifest.frameW, Math.floor(f / manifest.cols) * manifest.frameH, manifest.frameW, manifest.frameH, 0, 0, 264, 360);
      } else if (c.still.complete) c.ctx.drawImage(c.still, 0, 0);
    });
  }, 1000 / manifest.fps);

  $('avatarMode').onchange = (e) => save({ avatarMode: e.target.value });
  $('size').onclick = (e) => { const v = e.target.dataset.v; if (v) save({ size: v }); };
  $('steps').oninput = (e) => { $('stepsVal').textContent = e.target.value; };
  $('steps').onchange = (e) => save({ steps: +e.target.value });

  // ---------------- messages
  $('messageMode').onchange = (e) => save({ messageMode: e.target.value });
  $('fixedMessage').onchange = (e) => save({ fixedMessage: +e.target.value });
  $('useDefaults').onchange = (e) => save({ useDefaultMessages: e.target.checked });
  function addMsg() {
    const v = $('newMsg').value.trim();
    if (!v) return;
    $('newMsg').value = '';
    save({ customMessages: [...S.customMessages, v] });
  }
  $('addMsg').onclick = addMsg;
  $('newMsg').onkeydown = (e) => { if (e.key === 'Enter') addMsg(); };
  $('defCount').textContent = defaults.length;
  $('defaultList').innerHTML = defaults.map((m) => `<li><span></span></li>`).join('');
  [...$('defaultList').children].forEach((li, i) => { li.firstChild.textContent = defaults[i]; });

  // ---------------- behaviour
  $('autoDismiss').onchange = (e) => save({ autoDismissSeconds: +e.target.value });
  $('snooze').onchange = (e) => save({ snoozeMinutes: +e.target.value });
  $('sound').onchange = (e) => save({ sound: e.target.checked });

  function pool() {
    const custom = S.customMessages.filter(Boolean);
    return [...(S.useDefaultMessages || !custom.length ? defaults : []), ...custom];
  }

  function render() {
    $('enabled').checked = S.enabled;
    $('interval').value = S.intervalMinutes;
    [...$('intervalChips').children].forEach((b) => b.classList.toggle('on', +b.dataset.v === +S.intervalMinutes));
    $('quiet').checked = S.quietHours.enabled;
    $('quietStart').value = S.quietHours.start; $('quietEnd').value = S.quietHours.end;
    $('quietRow').style.display = S.quietHours.enabled ? '' : 'none';
    $('autoStart').checked = S.autoStart;
    $('avatarMode').value = S.avatarMode;
    $('avatarHint').textContent = S.avatarMode === 'fixed' ? 'Click an avatar to choose who always visits.'
      : 'Click avatars to include or exclude them. ' + (S.avatarMode === 'random' ? 'A different one will pop in each time.' : 'They will take turns.');
    cards.forEach(({ a, el }) => {
      const fixed = S.avatarMode === 'fixed';
      el.classList.toggle('off', !fixed && !S.enabledAvatars.includes(a.id));
      el.classList.toggle('chosen', fixed && S.fixedAvatar === a.id);
      el.querySelector('.tick').style.display = fixed ? 'none' : '';
    });
    [...$('size').children].forEach((b) => b.classList.toggle('on', b.dataset.v === S.size));
    $('steps').value = S.steps; $('stepsVal').textContent = S.steps;
    $('messageMode').value = S.messageMode;
    $('useDefaults').checked = S.useDefaultMessages;
    const p = pool();
    $('fixedMsgRow').style.display = S.messageMode === 'fixed' ? '' : 'none';
    $('fixedMessage').innerHTML = '';
    p.forEach((m, i) => { const o = document.createElement('option'); o.value = i; o.textContent = m; $('fixedMessage').appendChild(o); });
    $('fixedMessage').value = Math.min(S.fixedMessage, p.length - 1);
    const ul = $('customList'); ul.innerHTML = '';
    if (!S.customMessages.length) ul.innerHTML = '<li class="empty">No custom messages yet — add your own above.</li>';
    S.customMessages.forEach((m, i) => {
      const li = document.createElement('li');
      const sp = document.createElement('span'); sp.textContent = m;
      const del = document.createElement('button'); del.textContent = '✕'; del.title = 'Remove';
      del.onclick = () => save({ customMessages: S.customMessages.filter((_, j) => j !== i) });
      li.append(sp, del); ul.appendChild(li);
    });
    $('autoDismiss').value = String(S.autoDismissSeconds);
    $('snooze').value = String(S.snoozeMinutes);
    $('sound').checked = S.sound;
  }
  render();
})();
