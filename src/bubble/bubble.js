// The speech bubble. It lives in its own small, always-clickable window that is created fresh for
// every reminder (see main.js), so no click-through switching is ever needed.
(() => {
  const $ = (id) => document.getElementById(id);
  const bubble = $('bubble');
  const THEME = {
    lavender: ['#8657bd', '#f2e9fc'], mint: ['#2c8a62', '#e3f6ea'], pearl: ['#a8701a', '#fdf2dc'],
    ruby: ['#c2334b', '#fde8ea'], scarlet: ['#cf403a', '#fdeae6'],
  };
  const DROP = '<svg viewBox="0 0 16 20"><path d="M8 1.6 C8 1.6 1.8 9.2 1.8 13 A6.2 6.2 0 0 0 14.2 13 C14.2 9.2 8 1.6 8 1.6Z"/></svg>';
  let today = 0, answered = false;

  function showCount(n, pop) {
    const shown = Math.min(8, n);
    $('drops').innerHTML = Array.from({ length: 8 }, (_, i) => DROP.replace('<svg', `<svg class="${i < shown ? 'on' : ''}${pop && i === shown - 1 ? ' pop' : ''}"`)).join('');
    $('count').textContent = n > 0 ? `${n} glass${n === 1 ? '' : 'es'} today` : 'First glass of the day!';
  }
  function answer(action) {
    if (answered) return;
    answered = true;
    if (action === 'drank') {
      bubble.classList.add('done');
      $('drank').querySelector('span').textContent = 'Yay, well done!';
      showCount(today + 1, true);
    }
    window.hydra.respond(action);
  }
  $('drank').addEventListener('click', () => answer('drank'));
  $('snooze').addEventListener('click', () => answer('snooze'));
  $('close').addEventListener('click', () => answer('dismiss'));
  bubble.addEventListener('mouseenter', () => window.hydra.bubbleHover(true));
  bubble.addEventListener('mouseleave', () => window.hydra.bubbleHover(false));

  window.hydra.onBubbleJob(async (job) => {
    const [accent, tint] = THEME[job.avatar] || ['#1f8ee0', '#e4f3ff'];
    document.documentElement.style.setProperty('--accent', accent);
    document.documentElement.style.setProperty('--tint', tint);
    $('face').src = `../assets/generated/${job.avatar}/portrait.png`;
    $('hiName').textContent = job.name ? `Hi ${job.name}!` : 'Hi there!';
    $('msg').textContent = job.message;
    $('snoozeText').textContent = `Snooze ${job.snoozeMinutes || 10}m`;
    today = job.today;
    showCount(today, false);
    await Promise.all([document.fonts.load('600 20px Fredoka'), document.fonts.load('700 16px Nunito')]).catch(() => {});
    // room for the shadow (left/top/bottom) and the tail (right)
    window.hydra.bubbleReady({ w: 22 + bubble.offsetWidth + 34, h: 18 + bubble.offsetHeight + 28, tipX: 22 + bubble.offsetWidth + 22, tipY: 18 + bubble.offsetHeight - 54 });
  });
  window.hydra.onBubbleShow(() => requestAnimationFrame(() => bubble.classList.remove('hidden')));
  window.hydra.onBubbleHide(() => bubble.classList.add('hidden'));
})();
