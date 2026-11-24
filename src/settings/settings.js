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
    $('dashStatus').textContent = $('status').textContent;
    showDashboard(st);
  }

  // ---------------- dashboard: today's total + one bar per day for the last week
  function showDashboard(st) {
    const days = st.history || [];
    $('dashToday').textContent = st.today;
    $('dashTodayLabel').textContent = st.today === 1 ? 'glass today' : 'glasses today';
    $('resetToday').disabled = !st.today;
    const total = days.reduce((n, d) => n + d.count, 0);
    $('dashSummary').textContent = `${total} this week · ${(total / (days.length || 1)).toFixed(1)} a day`;
    const top = Math.max(4, ...days.map((d) => d.count)); // short bars for a slow week instead of full-height ones
    const bars = $('bars');
    bars.innerHTML = '';
    days.forEach((d, i) => {
      const [y, mo, da] = d.date.split('-').map(Number), date = new Date(y, mo - 1, da);
      const isToday = i === days.length - 1;
      const col = document.createElement('div');
      col.className = 'bar' + (isToday ? ' now' : '') + (d.count ? '' : ' zero');
      col.title = `${date.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' })}: ${d.count} glass${d.count === 1 ? '' : 'es'}`;
      const val = document.createElement('span'); val.className = 'val'; val.textContent = d.count;
      const track = document.createElement('div'); track.className = 'track';
      const fill = document.createElement('i'); fill.style.height = `${d.count ? Math.max(6, (d.count / top) * 100) : 0}%`;
      track.appendChild(fill);
      const day = document.createElement('span'); day.className = 'day';
      day.textContent = isToday ? 'Today' : date.toLocaleDateString([], { weekday: 'short' });
      col.append(val, track, day);
      bars.appendChild(col);
    });
  }
  $('resetToday').onclick = async () => {
    if (!confirm("Reset today's glass count to 0?")) return;
    showStatus(await window.hydra.resetToday());
  };
  $('enabledTop').onchange = (e) => save({ enabled: e.target.checked });
  showStatus(init.status);
  window.hydra.onStatus(showStatus);
  // keep the chart right when the day changes while the window stays open
  setInterval(async () => showStatus(await window.hydra.getStatus()), 60 * 1000);

  // ---------------- general
  $('enabled').onchange = (e) => save({ enabled: e.target.checked });
  $('interval').onchange = (e) => { const v = Math.max(1, Math.min(480, Math.round(+e.target.value || 30))); save({ intervalMinutes: v }); };
  $('intervalChips').onclick = (e) => { const v = e.target.dataset.v; if (v) save({ intervalMinutes: +v }); };
  $('quiet').onchange = (e) => save({ quietHours: { ...S.quietHours, enabled: e.target.checked } });
  $('quietStart').onchange = (e) => save({ quietHours: { ...S.quietHours, start: e.target.value } });
  $('quietEnd').onchange = (e) => save({ quietHours: { ...S.quietHours, end: e.target.value } });
  $('autoStart').onchange = (e) => save({ autoStart: e.target.checked });
  $('autoLaunch').onchange = (e) => save({ autoLaunch: e.target.checked });
  const saveName = () => save({ userName: $('userName').value.trim().slice(0, 40) });
  $('saveName').onclick = saveName;
  $('userName').onkeydown = (e) => { if (e.key === 'Enter') saveName(); };
  $('userName').onblur = () => { if ($('userName').value.trim() !== (S.userName || '')) saveName(); };
  $('userName').oninput = () => { $('namePreview').textContent = $('userName').value.trim() || 'there'; };
  $('preview').onclick = () => window.hydra.previewNow();

  // ---------------- avatars (animated idle previews)
  const cards = avatars.map((a) => {
    const el = document.createElement('div');
    el.className = 'av';
    el.innerHTML = `<span class="tick">✓</span><span class="badge">Chosen</span><canvas width="264" height="360"></canvas><b>${a.name}</b><small>${a.tagline}</small>`;
    const still = new Image(); still.src = `${BASE}${a.id}/preview.png`;
    el.onclick = () => {
      if (S.avatarMode === 'fixed') return save({ fixedAvatar: a.id });
      const set = new Set(S.enabledAvatars);
      if (set.has(a.id)) { if (set.size > 1) set.delete(a.id); } else set.add(a.id);
      save({ enabledAvatars: avatars.map((x) => x.id).filter((id) => set.has(id)) });
    };
    $('avatars').appendChild(el);
    const card = { a, el, ctx: el.querySelector('canvas').getContext('2d'), img: null, still };
    const idle = manifest.sequences.idle;
    window.loadSpriteSheet(`${BASE}${a.id}/${idle.file}`, idle.frames, manifest).then((sheet) => { card.img = sheet; }).catch(() => {});
    return card;
  });
  let f = 0;
  setInterval(() => {
    const sq = manifest.sequences.idle;
    f = (f + 1) % sq.frames;
    cards.forEach((c) => {
      c.ctx.clearRect(0, 0, 264, 360);
      if (c.img) {
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
    $('enabledTop').checked = S.enabled;
    $('interval').value = S.intervalMinutes;
    [...$('intervalChips').children].forEach((b) => b.classList.toggle('on', +b.dataset.v === +S.intervalMinutes));
    $('quiet').checked = S.quietHours.enabled;
    $('quietStart').value = S.quietHours.start; $('quietEnd').value = S.quietHours.end;
    $('quietRow').style.display = S.quietHours.enabled ? '' : 'none';
    $('autoStart').checked = S.autoStart;
    $('autoLaunch').checked = S.autoLaunch !== false;
    if (document.activeElement !== $('userName')) $('userName').value = S.userName || '';
    $('namePreview').textContent = (S.userName || '').trim() || 'there';
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
