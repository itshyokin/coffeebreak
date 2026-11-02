/* Coffee Break — shared core: storage, sounds, speech, players, options, timer, UI helpers.
   Plain script (no build step) so the site works on GitHub Pages and when opened as a local file. */
(function () {
  'use strict';
  const CB = (window.CB = window.CB || {});

  /* ---------- storage ---------- */
  CB.store = {
    get(key, fallback) {
      try { const v = localStorage.getItem('cb.' + key); return v == null ? fallback : JSON.parse(v); }
      catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem('cb.' + key, JSON.stringify(value)); return true; } catch (e) { return false; }
    },
    remove(key) { try { localStorage.removeItem('cb.' + key); } catch (e) {} },
  };

  /* ---------- global settings ---------- */
  const SETTINGS_DEFAULT = { sound: true, volume: 0.6, theme: 'auto' };
  CB.settings = Object.assign({}, SETTINGS_DEFAULT, CB.store.get('settings', {}));
  CB.saveSettings = function () { CB.store.set('settings', CB.settings); CB.applyTheme(); };
  CB.applyTheme = function () {
    const t = CB.settings.theme;
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  };
  CB.applyTheme();

  /* ---------- helpers ---------- */
  CB.$ = (sel, root) => (root || document).querySelector(sel);
  CB.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  CB.el = function (tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') { for (const sk in v) { if (sk.startsWith('--')) n.style.setProperty(sk, v[sk]); else n.style[sk] = v[sk]; } }
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) n.append(kid.nodeType ? kid : String(kid));
    return n;
  };
  CB.shuffle = function (a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  CB.pick = (a) => a[Math.floor(Math.random() * a.length)];
  CB.today = function (d) { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  CB.daysBetween = (a, b) => Math.round((new Date(b + 'T12:00') - new Date(a + 'T12:00')) / 86400000);

  let toastTimer;
  CB.toast = function (msg, ms) {
    let t = CB.$('.toast');
    if (!t) { t = CB.el('div', { class: 'toast', role: 'status' }); document.body.append(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms || 2200);
  };

  CB.sheet = function (title, content, onClose) {
    const back = CB.el('div', { class: 'sheet-back' });
    const sheet = CB.el('div', { class: 'sheet', role: 'dialog', 'aria-label': title }, CB.el('h2', null, title), content);
    back.append(sheet);
    const close = () => { back.remove(); document.removeEventListener('keydown', esc); onClose && onClose(); };
    const esc = (e) => { if (e.key === 'Escape') close(); };
    back.addEventListener('click', (e) => { if (e.target === back) close(); });
    document.addEventListener('keydown', esc);
    document.body.append(back);
    return { close, el: sheet };
  };

  CB.icons = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    speaker: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg>',
    soundOn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>',
    soundOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M22 9l-6 6M16 9l6 6"/></svg>',
  };

  /* ---------- sound effects (synthesized, no audio files) ---------- */
  let ctx, master;
  function audio() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC(); master = ctx.createGain(); master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    master.gain.value = CB.settings.volume;
    return ctx;
  }
  function tone(freq, start, dur, type, gain, slideTo) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, start);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain || 0.3, start + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g); g.connect(master); o.start(start); o.stop(start + dur + 0.05);
  }
  function noise(start, dur, gain, filterFreq) {
    const len = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = buf; f.type = 'bandpass'; f.frequency.value = filterFreq || 2000; g.gain.value = gain || 0.3;
    s.connect(f); f.connect(g); g.connect(master); s.start(start);
  }
  const SOUNDS = {
    tap(t) { tone(660, t, 0.05, 'triangle', 0.15); },
    flip(t) { noise(t, 0.08, 0.25, 3000); tone(520, t, 0.06, 'sine', 0.08, 780); },
    correct(t) { tone(880, t, 0.12, 'triangle', 0.25); tone(1320, t + 0.09, 0.22, 'triangle', 0.25); },
    wrong(t) { tone(220, t, 0.18, 'square', 0.12, 180); tone(196, t + 0.15, 0.28, 'square', 0.12, 150); },
    buzzer(t) { tone(130, t, 0.6, 'sawtooth', 0.18); tone(138, t, 0.6, 'sawtooth', 0.12); },
    ding(t) { tone(1568, t, 0.6, 'sine', 0.25); tone(2093, t, 0.5, 'sine', 0.12); },
    tick(t) { tone(1800, t, 0.025, 'square', 0.08); },
    match(t) { tone(784, t, 0.1, 'sine', 0.2); tone(988, t + 0.07, 0.1, 'sine', 0.2); tone(1175, t + 0.14, 0.2, 'sine', 0.2); },
    win(t) { [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.11, 0.3, 'triangle', 0.22)); tone(1047, t + 0.44, 0.6, 'sine', 0.2); },
    whoosh(t) { noise(t, 0.3, 0.2, 900); },
    thud(t) { tone(90, t, 0.35, 'sine', 0.5, 40); noise(t, 0.12, 0.2, 400); },
  };
  CB.sound = {
    play(name) {
      if (!CB.settings.sound || !SOUNDS[name]) return;
      const c = audio(); if (!c) return;
      try { SOUNDS[name](c.currentTime + 0.01); } catch (e) {}
    },
    toggle() { CB.settings.sound = !CB.settings.sound; CB.saveSettings(); if (CB.settings.sound) CB.sound.play('tap'); return CB.settings.sound; },
  };
  // Unlock audio on first gesture (required by mobile browsers)
  window.addEventListener('pointerdown', function unlock() { if (CB.settings.sound) audio(); window.removeEventListener('pointerdown', unlock); }, { once: true });

  /* ---------- Mandarin text-to-speech ---------- */
  let zhVoice = null, voicesLoaded = false;
  function findVoice() {
    if (!('speechSynthesis' in window)) return null;
    const vs = speechSynthesis.getVoices();
    if (vs.length) voicesLoaded = true;
    const zh = vs.filter((v) => /^zh|cmn/i.test(v.lang));
    zhVoice = zh.find((v) => /zh[-_]CN/i.test(v.lang)) || zh.find((v) => !/HK|yue/i.test(v.lang)) || zh[0] || null;
    return zhVoice;
  }
  if ('speechSynthesis' in window) { findVoice(); speechSynthesis.addEventListener && speechSynthesis.addEventListener('voiceschanged', findVoice); }
  CB.speech = {
    supported: () => 'speechSynthesis' in window,
    hasChinese: () => !!(zhVoice || findVoice()),
    voicesLoaded: () => voicesLoaded,
    voiceName: () => (zhVoice ? zhVoice.name : ''),
    speak(text, rate) {
      if (!('speechSynthesis' in window)) { CB.toast('Speech isn\'t supported in this browser'); return false; }
      const v = zhVoice || findVoice();
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = v ? v.lang : 'zh-CN';
      if (v) u.voice = v;
      u.rate = rate || 0.85;
      speechSynthesis.speak(u);
      if (!v && voicesLoaded) CB.toast('No Chinese voice found — see Settings');
      return true;
    },
  };

  /* ---------- players (shared by multiplayer games) ---------- */
  CB.PLAYER_COLORS = [
    { id: 'red', hex: '#e04a3a' }, { id: 'blue', hex: '#3a7be0' }, { id: 'green', hex: '#35a35a' }, { id: 'gold', hex: '#e0a51f' },
    { id: 'purple', hex: '#8f55d6' }, { id: 'pink', hex: '#e0569b' }, { id: 'teal', hex: '#1fa6a0' }, { id: 'orange', hex: '#ef7d22' },
  ];
  CB.players = {
    load() {
      const saved = CB.store.get('players', null);
      const base = [0, 1, 2, 3].map((i) => ({ name: '', color: CB.PLAYER_COLORS[i].hex }));
      const s = saved && Array.isArray(saved.list) ? saved : { count: 1, list: base };
      s.list = base.map((b, i) => Object.assign(b, s.list[i] || {}));
      return s;
    },
    save(s) { CB.store.set('players', s); },
    /** Active players with defaults applied: [{name, color, index}] */
    active(s) {
      s = s || CB.players.load();
      return s.list.slice(0, s.count).map((p, i) => ({ name: (p.name || '').trim() || 'Player ' + (i + 1), color: p.color, index: i }));
    },
    /** Render the 1–4 player setup UI into a container. onChange(state) fires on every edit. */
    render(container, onChange) {
      const s = CB.players.load();
      function draw() {
        container.innerHTML = '';
        const count = CB.el('div', { class: 'player-count', role: 'group', 'aria-label': 'Number of players' });
        [1, 2, 3, 4].forEach((n) => count.append(CB.el('button', {
          class: s.count === n ? 'on' : '', 'aria-pressed': s.count === n ? 'true' : 'false',
          onclick: () => { s.count = n; commit(); draw(); CB.sound.play('tap'); },
        }, n === 1 ? '1 player' : n)));
        container.append(count);
        const list = CB.el('div', { class: 'card list', style: { marginTop: '12px' } });
        for (let i = 0; i < s.count; i++) {
          const p = s.list[i];
          const takenByOthers = s.list.slice(0, s.count).filter((_, j) => j !== i).map((q) => q.color);
          const sw = CB.el('div', { class: 'swatches' });
          CB.PLAYER_COLORS.forEach((c) => sw.append(CB.el('button', {
            class: 'swatch' + (p.color === c.hex ? ' on' : ''), style: { background: c.hex },
            disabled: takenByOthers.includes(c.hex), 'aria-label': c.id + ' color',
            onclick: () => { p.color = c.hex; commit(); draw(); },
          })));
          const input = CB.el('input', { type: 'text', maxlength: '16', placeholder: 'Player ' + (i + 1), value: p.name, 'aria-label': 'Player ' + (i + 1) + ' name' });
          input.addEventListener('input', () => { p.name = input.value; commit(); });
          list.append(CB.el('div', { class: 'player-row', style: { flexWrap: 'wrap' } },
            CB.el('span', { class: 'player-dot', style: { background: p.color } }), input,
            CB.el('div', { style: { width: '100%', paddingLeft: '24px' } }, sw)));
        }
        container.append(list);
      }
      function commit() { CB.players.save(s); onChange && onChange(s); }
      draw();
      return { state: s, active: () => CB.players.active(s) };
    },
  };

  /* ---------- options (game settings rendered from a schema) ----------
     schema: [{key, label, hint, type:'seg'|'switch'|'select', choices:[{value,label}], default}] */
  CB.options = {
    load(gameId, schema) {
      const saved = CB.store.get('opts.' + gameId, {});
      const o = {};
      schema.forEach((f) => { o[f.key] = f.key in saved ? saved[f.key] : f.default; });
      return o;
    },
    save(gameId, o) { CB.store.set('opts.' + gameId, o); },
    render(container, gameId, schema, onChange) {
      const o = CB.options.load(gameId, schema);
      container.innerHTML = '';
      const list = CB.el('div', { class: 'card list' });
      schema.forEach((f) => {
        if (f.showIf && !f.showIf(o)) return;
        let ctl;
        if (f.type === 'switch') {
          const inp = CB.el('input', { type: 'checkbox', role: 'switch', 'aria-label': f.label });
          inp.checked = !!o[f.key];
          inp.addEventListener('change', () => { o[f.key] = inp.checked; commit(f); });
          ctl = CB.el('label', { class: 'switch' }, inp, CB.el('span'));
        } else if (f.type === 'select') {
          ctl = CB.el('select', { class: 'select', 'aria-label': f.label });
          f.choices.forEach((c) => ctl.append(CB.el('option', { value: String(c.value), selected: String(o[f.key]) === String(c.value) }, c.label)));
          ctl.addEventListener('change', () => { const c = f.choices.find((x) => String(x.value) === ctl.value); o[f.key] = c.value; commit(f); });
        } else {
          ctl = CB.el('div', { class: 'seg', role: 'group', 'aria-label': f.label });
          f.choices.forEach((c) => ctl.append(CB.el('button', {
            class: o[f.key] === c.value ? 'on' : '', 'aria-pressed': o[f.key] === c.value ? 'true' : 'false',
            onclick: () => { o[f.key] = c.value; commit(f); },
          }, c.label)));
        }
        list.append(CB.el('div', { class: 'setting' },
          CB.el('div', { class: 'label' }, f.label, f.hint ? CB.el('small', null, f.hint) : null), ctl));
      });
      container.append(list);
      function commit(f) {
        CB.options.save(gameId, o);
        CB.sound.play('tap');
        onChange && onChange(o);
        CB.options.render(container, gameId, schema, onChange); // redraw (for showIf + seg state)
      }
      return o;
    },
  };
  CB.TIMER_CHOICES = [{ value: 15, label: '15s' }, { value: 30, label: '30s' }, { value: 60, label: '60s' }, { value: 0, label: 'Off' }];

  /* ---------- countdown timer ---------- */
  CB.Timer = function (seconds, opts) {
    opts = opts || {};
    const bar = CB.el('div', { class: 'timer', role: 'timer', 'aria-label': seconds + ' second timer' }, CB.el('i'));
    let start = 0, raf = 0, lastTick = -1, done = false, pausedAt = 0;
    function frame() {
      const left = Math.max(0, seconds - (performance.now() - start) / 1000);
      bar.firstChild.style.transform = 'scaleX(' + left / seconds + ')';
      bar.classList.toggle('low', left <= 5);
      const whole = Math.ceil(left);
      if (left <= 5 && whole !== lastTick && left > 0) { lastTick = whole; CB.sound.play('tick'); }
      if (left <= 0) { done = true; opts.onExpire && opts.onExpire(); return; }
      raf = requestAnimationFrame(frame);
    }
    return {
      el: bar,
      start() { if (!seconds) return this; done = false; start = performance.now(); lastTick = -1; cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); return this; },
      stop() { cancelAnimationFrame(raf); },
      pause() { cancelAnimationFrame(raf); pausedAt = performance.now(); },
      resume() { if (done || !pausedAt) return; start += performance.now() - pausedAt; pausedAt = 0; raf = requestAnimationFrame(frame); },
      get expired() { return done; },
    };
  };

  /* ---------- turn order helper for local multiplayer ---------- */
  CB.Turns = function (players) {
    let i = 0;
    return {
      players,
      get current() { return players[i]; },
      get index() { return i; },
      get next() { return players[(i + 1) % players.length]; },
      advance() { i = (i + 1) % players.length; return players[i]; },
      set(n) { i = ((n % players.length) + players.length) % players.length; },
    };
  };
  CB.money = (n) => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString();
  /** Scoreboard row. fmt: function to format a score (default plain number). sub: optional array of small second lines. */
  CB.renderScoreboard = function (container, players, scores, activeIndex, fmt, sub) {
    fmt = fmt || ((n) => (n || 0).toLocaleString());
    container.innerHTML = '';
    container.classList.add('scoreboard');
    players.forEach((p, i) => container.append(CB.el('div', {
      class: 'score' + (i === activeIndex ? ' active' : '') + (p.out ? ' out' : ''), style: { '--pc': p.color },
    }, CB.el('div', { class: 'name', style: { color: p.color } }, p.name), CB.el('div', { class: 'pts' }, fmt(scores[i] || 0)),
      sub && sub[i] != null ? CB.el('div', { class: 'sub' }, sub[i]) : null)));
  };

  /* ---------- shared game setup screen (players + options + start) ---------- */
  CB.setupScreen = function (container, cfg) {
    container.innerHTML = '';
    if (cfg.intro) container.append(CB.el('p', { class: 'muted', style: { margin: '4px 4px 0' } }, cfg.intro));
    container.append(CB.el('div', { class: 'section-title' }, 'Players'));
    const pBox = CB.el('div');
    container.append(pBox);
    const players = CB.players.render(pBox);
    container.append(CB.el('div', { class: 'section-title' }, 'Game options'));
    const oBox = CB.el('div');
    container.append(oBox);
    let opts = CB.options.render(oBox, cfg.gameId, cfg.schema, (o) => { opts = o; });
    const start = CB.el('button', { class: 'btn primary block', style: { marginTop: '20px', minHeight: '58px', fontSize: '1.1rem' } }, cfg.startLabel || 'Start game');
    start.addEventListener('click', () => { CB.sound.play('ding'); cfg.onStart(CB.players.active(players.state), CB.options.load(cfg.gameId, cfg.schema)); });
    container.append(start);
    return { start };
  };

  /* ---------- "pass the device" screen for hidden choices ---------- */
  CB.passScreen = function (player, message, onReady) {
    const back = CB.el('div', { class: 'pass-screen', style: { '--pc': player.color } },
      CB.el('div', { class: 'pass-inner' },
        CB.el('div', { class: 'pass-dot', style: { background: player.color } }),
        CB.el('h2', null, player.name),
        CB.el('p', null, message || 'Your turn — others look away!'),
        CB.el('button', { class: 'btn primary', onclick: () => { back.remove(); onReady(); } }, 'I\'m ready')));
    document.body.append(back);
  };

  /* ---------- shared top bar sound toggle ---------- */
  CB.mountSoundToggle = function (btn) {
    if (!btn) return;
    const draw = () => { btn.innerHTML = CB.settings.sound ? CB.icons.soundOn : CB.icons.soundOff; btn.setAttribute('aria-label', CB.settings.sound ? 'Mute sounds' : 'Unmute sounds'); btn.setAttribute('aria-pressed', CB.settings.sound ? 'false' : 'true'); };
    draw();
    btn.addEventListener('click', () => { CB.sound.toggle(); draw(); CB.toast(CB.settings.sound ? 'Sound on' : 'Sound off', 1200); });
  };

  /* ---------- offline support ---------- */
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
