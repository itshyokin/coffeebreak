/* Coffee Break — Mandarin Practice */
(function () {
  'use strict';
  const { el, $ } = CB;
  const DAY = 86400000;

  const WORDS = window.HSK.map((r) => ({ h: r[0], p: r[1], n: r[2], m: r[3], lv: r[4], pos: r[5], f: r[6] }));
  const BY_H = Object.create(null);
  WORDS.forEach((w) => { BY_H[w.h] = w; });

  /* ---------- settings ---------- */
  const SCHEMA = [
    { key: 'direction', label: 'Card front', hint: 'What you see before flipping', type: 'seg', default: 'h2e',
      choices: [{ value: 'h2e', label: '汉字' }, { value: 'e2h', label: 'English' }, { value: 'mix', label: 'Mix' }] },
    { key: 'showPinyin', label: 'Pinyin on card front', hint: 'Turn off to test yourself on characters alone', type: 'switch', default: true },
    { key: 'toneColors', label: 'Tone colors', hint: '1st red · 2nd orange · 3rd green · 4th blue', type: 'switch', default: true },
    { key: 'newPerDay', label: 'New words per day', type: 'seg', default: 10,
      choices: [{ value: 5, label: '5' }, { value: 10, label: '10' }, { value: 20, label: '20' }, { value: 30, label: '30' }] },
    { key: 'goal', label: 'Daily goal', hint: 'Cards, questions and matches all count', type: 'seg', default: 30,
      choices: [{ value: 15, label: '15' }, { value: 30, label: '30' }, { value: 50, label: '50' }, { value: 100, label: '100' }] },
    { key: 'autoSpeak', label: 'Auto-play pronunciation', hint: 'Speak each word when a card flips', type: 'switch', default: false },
    { key: 'rate', label: 'Speech speed', type: 'seg', default: 0.8, choices: [{ value: 0.55, label: 'Slow' }, { value: 0.8, label: 'Normal' }, { value: 1, label: 'Fast' }] },
    { key: 'quizType', label: 'Quiz asks', type: 'select', default: 'mix',
      choices: [{ value: 'h2m', label: 'Character → meaning' }, { value: 'm2h', label: 'Meaning → character' }, { value: 'listen', label: 'Listen → character' }, { value: 'mix', label: 'Mixed' }] },
    { key: 'quizFrom', label: 'Practice words from', hint: 'Quiz, tones, typing and memory', type: 'seg', default: 'learned',
      choices: [{ value: 'learned', label: 'Learned' }, { value: 'deck', label: 'Whole deck' }] },
    { key: 'quizLen', label: 'Round length', type: 'seg', default: 10, choices: [{ value: 10, label: '10' }, { value: 20, label: '20' }, { value: 30, label: '30' }] },
    { key: 'timer', label: 'Answer timer', hint: 'For quiz, tones and typing', type: 'seg', default: 0, choices: CB.TIMER_CHOICES },
    { key: 'memPairs', label: 'Memory pairs', type: 'seg', default: 6, choices: [{ value: 6, label: '6' }, { value: 8, label: '8' }, { value: 10, label: '10' }] },
    { key: 'memType', label: 'Memory matches', type: 'seg', default: 'hm', choices: [{ value: 'hm', label: '汉字 ↔ meaning' }, { value: 'hp', label: '汉字 ↔ pinyin' }] },
  ];
  let opts = CB.options.load('mandarin', SCHEMA);

  /* ---------- saved progress ---------- */
  const STORE_KEY = 'mandarin';
  function blank() { return { v: 1, cards: {}, decks: [1], daily: { date: CB.today(), newDone: 0, done: 0 }, streak: { last: '', count: 0 }, best: {} }; }
  let S = Object.assign(blank(), CB.store.get(STORE_KEY, {}));
  function save() { if (!CB.store.set(STORE_KEY, S)) CB.toast('Couldn\'t save progress (storage full or blocked)'); }
  function rollover() {
    const t = CB.today();
    if (S.daily.date !== t) S.daily = { date: t, newDone: 0, done: 0 };
  }
  rollover();
  function streakAlive() { return S.streak.last && CB.daysBetween(S.streak.last, CB.today()) <= 1 ? S.streak.count : 0; }
  function activity(n) {
    rollover();
    S.daily.done += n || 1;
    const t = CB.today();
    if (S.streak.last !== t) {
      S.streak.count = S.streak.last && CB.daysBetween(S.streak.last, t) === 1 ? S.streak.count + 1 : 1;
      S.streak.last = t;
    }
    if (S.daily.done === opts.goal) setTimeout(() => { CB.sound.play('win'); CB.toast('☕ Daily goal reached!'); }, 400);
    save();
  }
  const cardOf = (h) => S.cards[h];
  const isLearned = (h) => { const c = S.cards[h]; return !!c && (c.r > 0 || c.k); };
  const isKnown = (h) => !!(S.cards[h] && S.cards[h].k);

  function pool() { return WORDS.filter((w) => S.decks.includes(w.lv)); }
  function practicePool(min) {
    const p = pool();
    if (opts.quizFrom === 'learned') {
      const learned = p.filter((w) => isLearned(w.h));
      if (learned.length >= (min || 8)) return learned;
    }
    return p;
  }
  function dueList() {
    const now = Date.now();
    return pool().filter((w) => { const c = S.cards[w.h]; return c && !c.k && c.d <= now && (c.r > 0 || c.d > 0); })
      .sort((a, b) => S.cards[a.h].d - S.cards[b.h].d);
  }
  function newList(limit) {
    return pool().filter((w) => !S.cards[w.h]).sort((a, b) => a.lv - b.lv || a.f - b.f).slice(0, Math.max(0, limit));
  }
  const newLeft = () => Math.max(0, opts.newPerDay - S.daily.newDone);

  /* ---------- spaced repetition ---------- */
  function nextState(c, grade) {
    c = Object.assign({ e: 2.5, i: 0, d: 0, r: 0, l: 0, k: false }, c);
    if (grade === 0) { c.l += c.r > 0 ? 1 : 0; c.i = 0; c.e = Math.max(1.3, c.e - 0.2); c.d = Date.now() + 60000; return c; }
    if (grade === 1) { c.i = c.i ? Math.max(c.i + 1, Math.round(c.i * 1.2)) : 1; c.e = Math.max(1.3, c.e - 0.15); }
    if (grade === 2) { c.i = c.i ? Math.max(c.i + 1, Math.round(c.i * c.e)) : 1; }
    if (grade === 3) { c.i = c.i ? Math.max(c.i + 2, Math.round(c.i * c.e * 1.3)) : 4; c.e += 0.15; }
    c.r += 1;
    c.d = Date.now() + c.i * DAY - 2 * 3600000;
    return c;
  }
  function ivlLabel(c, grade) {
    if (grade === 0) return '<1m';
    const d = nextState(c, grade).i;
    if (d >= 365) return (d / 365).toFixed(1).replace('.0', '') + 'y';
    if (d >= 30) return Math.round(d / 30) + 'mo';
    return d + 'd';
  }

  /* ---------- text helpers ---------- */
  function pinyinEl(w) {
    const wrap = el('div', { class: 'pinyin' });
    const syl = w.p.split(' '), num = w.n.split(' ');
    syl.forEach((s, i) => { wrap.append(el('span', { class: 't' + (num[i] || '5').slice(-1) }, s)); if (i < syl.length - 1) wrap.append(' '); });
    return wrap;
  }
  function hanziEl(w) { return el('div', { class: 'hanzi' + (w.h.length > 2 ? ' long' : ''), lang: 'zh-CN' }, w.h); }
  function stripTones(s) { return s.normalize('NFD').replace(/[\u0304\u0301\u030C\u0300]/g, '').normalize('NFC'); }
  function speak(w) { CB.speech.speak(w.h, opts.rate); }
  function speakBtn(w, extraClass) {
    const b = el('button', { class: 'icon-btn ' + (extraClass || ''), 'aria-label': 'Play pronunciation', html: CB.icons.speaker });
    b.addEventListener('click', (e) => { e.stopPropagation(); speak(w); });
    return b;
  }
  function applyToneClass() { document.body.classList.toggle('notone', !opts.toneColors); }
  applyToneClass();

  /* ---------- view router (phone back button friendly) ---------- */
  const view = $('#view');
  const titleEl = $('#title');
  let current = 'home', keyHandler = null, cleanup = null;
  function show(name, push) {
    if (cleanup) { cleanup(); cleanup = null; }
    keyHandler = null;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    current = name;
    view.innerHTML = '';
    window.scrollTo(0, 0);
    if (name !== 'home' && push !== false) history.pushState({ v: name }, '');
    VIEWS[name]();
  }
  window.addEventListener('popstate', () => { if (current !== 'home') show('home', false); });
  $('#backBtn').innerHTML = CB.icons.back;
  $('#backBtn').addEventListener('click', (e) => { if (current !== 'home') { e.preventDefault(); history.back(); } });
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea') && e.key !== 'Enter') return;
    if (keyHandler && !document.querySelector('.sheet-back')) keyHandler(e);
  });
  $('#settingsBtn').innerHTML = CB.icons.gear;
  $('#settingsBtn').addEventListener('click', openSettings);
  CB.mountSoundToggle($('#soundBtn'));

  /* ================= HOME ================= */
  function ring(done, goal) {
    const r = 42, c = 2 * Math.PI * r, pct = Math.min(1, done / goal);
    const w = el('div', { class: 'ring', role: 'img', 'aria-label': done + ' of ' + goal + ' daily goal' });
    w.innerHTML = '<svg viewBox="0 0 100 100"><circle class="track" cx="50" cy="50" r="' + r + '" fill="none" stroke-width="9"/>' +
      '<circle class="fill" cx="50" cy="50" r="' + r + '" fill="none" stroke-width="9" stroke-linecap="round" stroke-dasharray="' + c + '" stroke-dashoffset="' + c * (1 - pct) + '"/></svg>';
    w.append(el('div', { class: 'lbl' }, el('div', null, el('b', null, Math.min(done, 999)), el('small', null, 'of ' + goal + ' today'))));
    return w;
  }

  const VIEWS = {};
  VIEWS.home = function () {
    titleEl.textContent = 'Mandarin';
    rollover();
    const due = dueList().length, nl = Math.min(newLeft(), newList(newLeft()).length);
    const learned = WORDS.filter((w) => isLearned(w.h)).length;

    // decks
    view.append(el('div', { class: 'section-title' }, 'Decks'));
    const chips = el('div', { class: 'deck-chips' });
    [1, 2, 3].forEach((lv) => {
      const total = WORDS.filter((w) => w.lv === lv).length;
      const have = WORDS.filter((w) => w.lv === lv && isLearned(w.h)).length;
      chips.append(el('button', {
        class: 'chip' + (S.decks.includes(lv) ? ' on' : ''), 'aria-pressed': S.decks.includes(lv) ? 'true' : 'false',
        onclick: () => {
          if (S.decks.includes(lv)) { if (S.decks.length === 1) return CB.toast('Keep at least one deck on'); S.decks = S.decks.filter((x) => x !== lv); }
          else S.decks = S.decks.concat(lv).sort();
          save(); CB.sound.play('tap'); show('home', false);
        },
      }, 'HSK ' + lv, el('span', { class: 'n' }, have + '/' + total)));
    });
    view.append(chips);

    // stats
    view.append(el('div', { class: 'card stats', style: { marginTop: '14px' } }, ring(S.daily.done, opts.goal),
      el('div', { class: 'stat-nums' },
        el('div', null, el('b', null, due), el('span', null, 'due for review')),
        el('div', null, el('b', null, nl), el('span', null, 'new words left today')),
        el('div', null, el('b', null, learned), el('span', null, 'words learned')),
        el('div', null, el('b', null, streakAlive() + (streakAlive() ? ' 🔥' : '')), el('span', null, 'day streak')))));

    const start = el('button', { class: 'btn primary block', style: { marginTop: '14px', minHeight: '56px', fontSize: '1.05rem' }, onclick: () => show('review') },
      due + nl ? 'Study now · ' + (due ? due + ' review' + (due > 1 ? 's' : '') : '') + (due && nl ? ' + ' : '') + (nl ? nl + ' new' : '') : 'All caught up — learn extra words');
    view.append(start);

    // modes
    view.append(el('div', { class: 'section-title' }, 'Practice'));
    const modes = el('div', { class: 'modes' });
    const mode = (ic, name, desc, go) => modes.append(el('button', { class: 'mode', onclick: () => { CB.sound.play('tap'); show(go); } },
      el('span', { class: 'ic', 'aria-hidden': 'true' }, ic), el('b', null, name), el('span', null, desc)));
    mode('卡', 'Flip cards', 'Browse cards freely, no grading', 'cards');
    mode('✓', 'Quiz', '4-choice questions', 'quiz');
    mode('配', 'Memory match', 'Pair characters with meanings', 'memory');
    mode('声', 'Tones', 'Pick the tone for each syllable', 'tones');
    mode('⌨', 'Type pinyin', 'Spell it out (tones optional)', 'type');
    mode('词', 'Word list', 'Search, mark words you know', 'list');
    view.append(modes);

    if (CB.speech.supported() && CB.speech.voicesLoaded() && !CB.speech.hasChinese()) {
      view.append(el('div', { class: 'notice', style: { marginTop: '18px' } },
        'No Chinese voice was found on this device, so pronunciation may not play. ', el('a', { href: '#', onclick: (e) => { e.preventDefault(); openSettings(); } }, 'How to add one')));
    }
    keyHandler = (e) => { if (e.key === 'Enter') show('review'); };
  };

  /* ================= REVIEW (spaced repetition) ================= */
  VIEWS.review = function () {
    titleEl.textContent = 'Study';
    rollover();
    let reviews = dueList();
    let fresh = newList(newLeft());
    if (!reviews.length && !fresh.length) fresh = newList(10); // extra session when caught up
    // interleave: one new word after every 3 reviews
    const queue = [];
    while (reviews.length || fresh.length) {
      for (let k = 0; k < 3 && reviews.length; k++) queue.push(reviews.shift());
      if (fresh.length) queue.push(fresh.shift());
    }
    if (!queue.length) return finished(true);
    const total = queue.length;
    let doneCount = 0, w = null, flipped = false, front = 'h';

    const counts = el('div', { class: 'counts' });
    const prog = el('div', { class: 'progress' }, el('i'));
    const flash = el('div', { class: 'flash', tabindex: '0', role: 'button', 'aria-label': 'Flashcard, tap to flip' });
    const grades = el('div', { class: 'grades hidden' });
    const actions = el('div', { class: 'row', style: { marginTop: '14px' } });
    view.append(counts, prog, el('div', { class: 'flash-wrap' }, flash), grades, actions,
      el('div', { class: 'kbd-hint' }, 'Space to flip · 1 Again · 2 Hard · 3 Good · 4 Easy · K I know this'));

    function drawCounts() {
      const now = Date.now();
      const n = queue.filter((x) => !S.cards[x.h]).length;
      const lrn = queue.filter((x) => S.cards[x.h] && S.cards[x.h].i === 0).length;
      counts.innerHTML = '';
      counts.append(el('span', { class: 'new' }, n + ' new'), el('span', { class: 'lrn' }, lrn + ' learning'), el('span', { class: 'rev' }, (queue.length - n - lrn) + ' review'));
      prog.firstChild.style.width = Math.round((doneCount / (doneCount + queue.length)) * 100) + '%';
      void now;
    }
    function next() {
      if (!queue.length) return finished(false);
      w = queue[0]; flipped = false;
      front = opts.direction === 'mix' ? (Math.random() < 0.5 ? 'h' : 'e') : opts.direction === 'e2h' ? 'e' : 'h';
      const isNew = !S.cards[w.h];
      const f = el('div', { class: 'face front' }, el('span', { class: 'tag' }, isNew ? 'New · HSK ' + w.lv : 'HSK ' + w.lv));
      if (front === 'h') { f.append(hanziEl(w)); if (opts.showPinyin) f.append(pinyinEl(w)); f.append(speakBtn(w, 'spk')); }
      else f.append(el('div', { class: 'meaning big' }, w.m));
      f.append(el('div', { class: 'hint' }, 'Tap to flip'));
      const b = el('div', { class: 'face back' }, el('span', { class: 'tag' }, 'HSK ' + w.lv), hanziEl(w), pinyinEl(w), el('div', { class: 'meaning' }, w.m), speakBtn(w, 'spk'));
      flash.className = 'flash'; flash.innerHTML = ''; flash.append(f, b);
      grades.classList.add('hidden');
      actions.innerHTML = '';
      actions.append(el('button', { class: 'btn primary', onclick: flip }, 'Show answer'));
      drawCounts();
    }
    function flip() {
      if (flipped) return;
      flipped = true; flash.classList.add('flipped'); CB.sound.play('flip');
      if (opts.autoSpeak) speak(w);
      const c = S.cards[w.h] || {};
      grades.innerHTML = '';
      [['again', 'Again'], ['hard', 'Hard'], ['good', 'Good'], ['easy', 'Easy']].forEach(([cls, label], g) =>
        grades.append(el('button', { class: cls, onclick: () => grade(g) }, label, el('small', null, ivlLabel(c, g)))));
      grades.classList.remove('hidden');
      actions.innerHTML = '';
      actions.append(el('button', { class: 'btn ghost', onclick: markKnown }, 'I already know this'));
    }
    function grade(g) {
      const wasNew = !S.cards[w.h];
      S.cards[w.h] = nextState(S.cards[w.h], g);
      if (wasNew) S.daily.newDone++;
      queue.shift();
      if (g === 0) { queue.splice(Math.min(3, queue.length), 0, w); CB.sound.play('wrong'); }
      else { doneCount++; CB.sound.play(g >= 2 ? 'correct' : 'tap'); }
      activity(1);
      next();
    }
    function markKnown() {
      S.cards[w.h] = Object.assign(S.cards[w.h] || { e: 2.5, i: 0, d: 0, r: 0, l: 0 }, { k: true });
      save(); queue.shift(); doneCount++;
      CB.toast('Marked “' + w.h + '” as known — it won\'t be shown again');
      next();
    }
    flash.addEventListener('click', flip);
    keyHandler = (e) => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); }
      else if (flipped && '1234'.includes(e.key)) grade(+e.key - 1);
      else if (e.key.toLowerCase() === 'k') { if (!flipped) flip(); markKnown(); }
      else if (e.key.toLowerCase() === 'p' && w) speak(w);
    };
    next();
    void total;
  };

  function finished(empty) {
    titleEl.textContent = 'Study';
    view.innerHTML = '';
    if (!empty) CB.sound.play('win');
    view.append(el('div', { class: 'card done-card' },
      el('div', { class: 'big' }, '☕'),
      el('h2', null, empty ? 'Nothing left in these decks' : 'Session complete'),
      el('p', { class: 'muted' }, empty ? 'You\'ve started every word in your selected decks. Turn on another HSK deck, or practice below.' :
        'Nice work. ' + S.daily.done + ' of ' + opts.goal + ' toward today\'s goal.'),
      el('div', { class: 'row', style: { marginTop: '18px' } },
        el('button', { class: 'btn', onclick: () => show('quiz', false) }, 'Quiz'),
        el('button', { class: 'btn', onclick: () => show('memory', false) }, 'Memory'),
        el('button', { class: 'btn primary', onclick: () => history.back() }, 'Done'))));
    keyHandler = (e) => { if (e.key === 'Enter') history.back(); };
  }

  /* ================= FLIP CARDS (free practice) ================= */
  VIEWS.cards = function () {
    titleEl.textContent = 'Flip cards';
    const list = CB.shuffle(practicePool(10));
    let i = 0, flipped = false;
    const counter = el('div', { class: 'q-head' });
    const flash = el('div', { class: 'flash', tabindex: '0', role: 'button', 'aria-label': 'Flashcard, tap to flip' });
    const prev = el('button', { class: 'btn', onclick: () => go(-1) }, '‹ Prev');
    const nxt = el('button', { class: 'btn primary', onclick: () => go(1) }, 'Next ›');
    view.append(counter, el('div', { class: 'flash-wrap' }, flash), el('div', { class: 'row', style: { marginTop: '14px' } }, prev, nxt),
      el('div', { class: 'kbd-hint' }, 'Space to flip · ← → to move · P to play sound'));
    function draw() {
      const w = list[i]; flipped = false;
      const front = opts.direction === 'mix' ? (Math.random() < 0.5 ? 'h' : 'e') : opts.direction === 'e2h' ? 'e' : 'h';
      const f = el('div', { class: 'face front' }, el('span', { class: 'tag' }, 'HSK ' + w.lv + (isKnown(w.h) ? ' · known' : isLearned(w.h) ? ' · learned' : '')));
      if (front === 'h') { f.append(hanziEl(w)); if (opts.showPinyin) f.append(pinyinEl(w)); f.append(speakBtn(w, 'spk')); }
      else f.append(el('div', { class: 'meaning big' }, w.m));
      f.append(el('div', { class: 'hint' }, 'Tap to flip'));
      const b = el('div', { class: 'face back' }, hanziEl(w), pinyinEl(w), el('div', { class: 'meaning' }, w.m), speakBtn(w, 'spk'));
      flash.className = 'flash'; flash.innerHTML = ''; flash.append(f, b);
      counter.innerHTML = ''; counter.append(el('span', null, (i + 1) + ' / ' + list.length), el('span', { class: 'muted' }, opts.quizFrom === 'learned' && isLearned(w.h) ? 'Learned words' : 'Deck words'));
      prev.disabled = i === 0;
    }
    function flip() { flipped = !flipped; flash.classList.toggle('flipped', flipped); CB.sound.play('flip'); if (flipped && opts.autoSpeak) speak(list[i]); }
    function go(d) { const n = i + d; if (n < 0) return; if (n >= list.length) { i = 0; CB.toast('Back to the start (reshuffled)'); list.splice(0, list.length, ...CB.shuffle(list)); } else i = n; draw(); }
    flash.addEventListener('click', flip);
    keyHandler = (e) => {
      if (e.key === ' ') { e.preventDefault(); flip(); }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key.toLowerCase() === 'p') speak(list[i]);
    };
    if (opts.quizFrom === 'learned' && pool().filter((w) => isLearned(w.h)).length < 10) CB.toast('Showing the whole deck until you\'ve learned 10 words');
    draw();
  };

  /* ================= QUIZ ================= */
  function distractors(w, field, n, from) {
    const src = (from && from.length > 30 ? from : WORDS);
    const used = new Set([w[field], w.h]);
    const same = CB.shuffle(src.filter((x) => x.h !== w.h && x.lv === w.lv && x.pos === w.pos));
    const any = CB.shuffle(src.filter((x) => x.h !== w.h));
    const out = [];
    for (const x of same.concat(any)) {
      if (out.length >= n) break;
      if (used.has(x[field]) || used.has(x.h)) continue;
      if (field === 'h' && Math.abs(x.h.length - w.h.length) > 1) continue;
      used.add(x[field]); used.add(x.h); out.push(x);
    }
    return out;
  }
  VIEWS.quiz = function () {
    titleEl.textContent = 'Quiz';
    const src = practicePool(8);
    const words = CB.shuffle(src).slice(0, opts.quizLen);
    const canListen = CB.speech.supported() && (CB.speech.hasChinese() || !CB.speech.voicesLoaded());
    if (opts.quizType === 'listen' && !canListen) CB.toast('No Chinese voice found — using character questions');
    let qi = 0, score = 0, streak = 0, bestStreak = 0, answered = false, timer = null;
    const missed = [];
    const head = el('div', { class: 'q-head' });
    const timerSlot = el('div');
    const prompt = el('div', { class: 'card q-prompt' });
    const choices = el('div', { class: 'choices' });
    const fb = el('div', { class: 'feedback', 'aria-live': 'polite' });
    const nextBtn = el('button', { class: 'btn primary block hidden', onclick: () => advance() }, 'Next');
    view.append(head, timerSlot, prompt, choices, fb, nextBtn);
    cleanup = () => timer && timer.stop();

    function ask() {
      if (qi >= words.length) return results();
      answered = false; fb.textContent = ''; fb.className = 'feedback'; nextBtn.classList.add('hidden');
      const w = words[qi];
      let type = opts.quizType === 'mix' ? CB.pick(canListen ? ['h2m', 'h2m', 'm2h', 'listen'] : ['h2m', 'm2h']) : opts.quizType;
      if (type === 'listen' && !canListen) type = 'h2m';
      head.innerHTML = '';
      head.append(el('span', null, 'Question ' + (qi + 1) + ' / ' + words.length), el('span', null, score + ' correct' + (streak > 1 ? ' · ' + streak + ' in a row 🔥' : '')));
      prompt.innerHTML = '';
      const field = type === 'h2m' ? 'm' : 'h';
      if (type === 'h2m') { prompt.append(hanziEl(w)); if (opts.showPinyin) prompt.append(pinyinEl(w)); prompt.append(el('div', { class: 'muted small', style: { marginTop: '10px' } }, 'What does this mean?')); }
      else if (type === 'm2h') prompt.append(el('div', { class: 'meaning big' }, w.m), el('div', { class: 'muted small', style: { marginTop: '10px' } }, 'Which word means this?'));
      else { prompt.append(el('button', { class: 'btn primary', style: { minHeight: '64px', fontSize: '1.1rem' }, onclick: () => speak(w), html: CB.icons.speaker + '&nbsp; Play again' }), el('div', { class: 'muted small', style: { marginTop: '10px' } }, 'Which word did you hear?')); setTimeout(() => speak(w), 250); }
      const opts4 = CB.shuffle([w].concat(distractors(w, field, 3, pool())));
      choices.innerHTML = '';
      opts4.forEach((o, k) => {
        const b = el('button', { class: 'choice' + (field === 'h' ? ' han' : ''), lang: field === 'h' ? 'zh-CN' : null, onclick: () => answer(o, b) },
          el('span', { class: 'k' }, k + 1), field === 'h' ? o.h : o.m);
        b._w = o; choices.append(b);
      });
      timerSlot.innerHTML = '';
      if (timer) timer.stop();
      if (opts.timer) { timer = CB.Timer(opts.timer, { onExpire: () => answer(null, null) }); timerSlot.append(timer.el); timerSlot.style.marginBottom = '6px'; timer.start(); }
    }
    function answer(o, btn) {
      if (answered) return; answered = true;
      if (timer) timer.stop();
      const w = words[qi];
      [...choices.children].forEach((b) => { b.disabled = true; if (b._w === w) b.classList.add('right'); });
      if (o === w) {
        score++; streak++; bestStreak = Math.max(bestStreak, streak);
        fb.textContent = CB.pick(['Correct!', 'Nice!', '对！', '很好！', 'Yes!']); fb.classList.add('ok'); CB.sound.play('correct');
        setTimeout(() => { if (answered && words[qi] === w) advance(); }, 1100);
      } else {
        streak = 0; missed.push(w);
        if (btn) btn.classList.add('wrong');
        fb.innerHTML = ''; fb.classList.add('no');
        fb.append(o ? 'Not quite — ' : 'Time\'s up — ', el('span', { class: 'han', lang: 'zh-CN' }, w.h), ' ' + w.p + ' = ' + w.m);
        CB.sound.play(o ? 'wrong' : 'buzzer');
        nextBtn.classList.remove('hidden');
        const c = S.cards[w.h]; if (c && !c.k && c.r > 0) { c.d = Date.now(); c.i = 0; } // bring missed learned words back for review
        if (!o || opts.autoSpeak) speak(w);
      }
      activity(1);
    }
    function advance() { qi++; ask(); }
    function results() {
      if (timer) timer.stop();
      const key = 'quiz' + opts.quizLen;
      const prevBest = S.best[key] || 0;
      if (score > prevBest) { S.best[key] = score; save(); }
      view.innerHTML = '';
      CB.sound.play(score / words.length >= 0.7 ? 'win' : 'ding');
      const box = el('div', { class: 'card done-card' }, el('div', { class: 'big' }, score === words.length ? '🏆' : '☕'),
        el('h2', null, score + ' / ' + words.length + ' correct'),
        el('p', { class: 'muted' }, 'Best streak ' + bestStreak + (score > prevBest && prevBest ? ' · New personal best!' : prevBest ? ' · Best ' + prevBest : '')));
      if (missed.length) {
        const list = el('div', { class: 'card list', style: { marginTop: '14px', textAlign: 'left', boxShadow: 'none' } });
        missed.forEach((w) => list.append(el('div', { class: 'word-row' }, el('span', { class: 'h' }, w.h), el('span', null, pinyinEl(w), el('div', { class: 'm' }, w.m)), speakBtn(w))));
        box.append(el('div', { class: 'section-title', style: { textAlign: 'left' } }, 'To review'), list);
      }
      box.append(el('div', { class: 'row', style: { marginTop: '18px' } }, el('button', { class: 'btn', onclick: () => history.back() }, 'Done'), el('button', { class: 'btn primary', onclick: () => show('quiz', false) }, 'Play again')));
      view.append(box);
      keyHandler = (e) => { if (e.key === 'Enter') show('quiz', false); };
    }
    keyHandler = (e) => {
      if (!answered && '1234'.includes(e.key)) { const b = choices.children[+e.key - 1]; if (b) b.click(); }
      else if (answered && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); advance(); }
      else if (e.key.toLowerCase() === 'p') speak(words[qi]);
    };
    if (!words.length) { view.innerHTML = ''; view.append(el('p', null, 'No words available.')); return; }
    ask();
  };

  /* ================= MEMORY MATCH ================= */
  VIEWS.memory = function () {
    titleEl.textContent = 'Memory match';
    const n = opts.memPairs;
    const words = CB.shuffle(practicePool(n)).slice(0, n);
    // avoid duplicate meanings/pinyin on the board
    const seen = new Set(); const pairs = [];
    for (const w of CB.shuffle(practicePool(n))) { const k = opts.memType === 'hp' ? stripTones(w.p) : w.m; if (seen.has(k)) continue; seen.add(k); pairs.push(w); if (pairs.length === n) break; }
    void words;
    const tiles = CB.shuffle(pairs.flatMap((w) => [{ w, side: 'h' }, { w, side: opts.memType }]));
    let first = null, lock = false, moves = 0, matched = 0, t0 = 0, tick = 0;
    const head = el('div', { class: 'q-head' });
    const grid = el('div', { class: 'mem-grid' + (tiles.length >= 16 ? ' c4' : '') });
    view.append(head, grid, el('p', { class: 'muted small', style: { textAlign: 'center', marginTop: '14px' } }, 'Flip two cards to find a character and its ' + (opts.memType === 'hp' ? 'pinyin.' : 'meaning.')));
    function drawHead() {
      const s = t0 ? Math.floor((Date.now() - t0) / 1000) : 0;
      head.innerHTML = ''; head.append(el('span', null, matched + ' / ' + pairs.length + ' pairs'), el('span', null, moves + ' moves · ' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')));
    }
    tiles.forEach((t) => {
      const face = t.side === 'h' ? el('div', { class: 'b han', lang: 'zh-CN' }, t.w.h) : t.side === 'p' || t.side === 'hp' ? el('div', { class: 'b' }, el('div', { class: 'pinyin', style: { fontSize: '1.05rem', margin: 0 } }, t.w.p)) : el('div', { class: 'b' }, t.w.m);
      const b = el('button', { class: 'tile', 'aria-label': 'Hidden card' }, el('div', { class: 'in' }, el('div', { class: 'f', 'aria-hidden': 'true' }, '☕'), face));
      b.addEventListener('click', () => flip(b, t));
      t.el = b; grid.append(b);
    });
    function flip(b, t) {
      if (lock || b.classList.contains('up') || b.classList.contains('done')) return;
      if (!t0) { t0 = Date.now(); tick = setInterval(drawHead, 1000); }
      b.classList.add('up'); b.setAttribute('aria-label', t.side === 'h' ? t.w.h : t.side === 'hp' ? t.w.p : t.w.m);
      CB.sound.play('flip');
      if (t.side === 'h' && opts.autoSpeak) speak(t.w);
      if (!first) { first = t; return; }
      moves++;
      const a = first; first = null;
      if (a.w === t.w && a.side !== t.side) {
        matched++;
        setTimeout(() => { a.el.classList.add('done'); t.el.classList.add('done'); CB.sound.play('match'); drawHead(); activity(1); if (matched === pairs.length) win(); }, 300);
      } else {
        lock = true;
        setTimeout(() => { a.el.classList.add('miss'); t.el.classList.add('miss'); }, 350);
        setTimeout(() => { [a.el, t.el].forEach((x) => { x.classList.remove('up', 'miss'); x.setAttribute('aria-label', 'Hidden card'); }); lock = false; }, 1050);
      }
      drawHead();
    }
    function win() {
      clearInterval(tick);
      const secs = Math.round((Date.now() - t0) / 1000);
      const key = 'mem' + n + opts.memType; const best = S.best[key];
      const isBest = !best || moves < best.moves || (moves === best.moves && secs < best.secs);
      if (isBest) { S.best[key] = { moves, secs }; save(); }
      CB.sound.play('win');
      setTimeout(() => {
        const list = el('div', { class: 'card list', style: { boxShadow: 'none' } });
        pairs.forEach((w) => list.append(el('div', { class: 'word-row' }, el('span', { class: 'h' }, w.h), el('span', null, pinyinEl(w), el('div', { class: 'm' }, w.m)), speakBtn(w))));
        const s = CB.sheet(isBest ? 'New best! 🏆' : 'All matched! ☕', el('div', null,
          el('p', { class: 'muted', style: { margin: '0 4px 14px' } }, moves + ' moves in ' + Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0') + (best && !isBest ? ' · Best ' + best.moves + ' moves' : '')),
          list,
          el('div', { class: 'row', style: { marginTop: '16px' } }, el('button', { class: 'btn', onclick: () => { s.close(); history.back(); } }, 'Done'), el('button', { class: 'btn primary', onclick: () => { s.close(); show('memory', false); } }, 'Play again'))));
      }, 500);
    }
    cleanup = () => clearInterval(tick);
    drawHead();
  };

  /* ================= TONES ================= */
  const TONE_PATHS = ['M4 6 H36', 'M4 18 L36 4', 'M4 8 L16 18 L36 4', 'M4 4 L36 18', ''];
  VIEWS.tones = function () {
    titleEl.textContent = 'Tones';
    const words = CB.shuffle(practicePool(8)).slice(0, opts.quizLen);
    let qi = 0, si = 0, score = 0, results = [], timer = null, done = false;
    const head = el('div', { class: 'q-head' });
    const timerSlot = el('div');
    const prompt = el('div', { class: 'card q-prompt' });
    const btns = el('div', { class: 'tone-btns' });
    const fb = el('div', { class: 'feedback', 'aria-live': 'polite' });
    const nextBtn = el('button', { class: 'btn primary block hidden', onclick: () => { qi++; ask(); } }, 'Next');
    view.append(head, timerSlot, prompt, btns, fb, nextBtn,
      el('p', { class: 'muted small', style: { textAlign: 'center' } }, 'Tones shown are dictionary tones (before tone changes like 不 → bú).'),
      el('div', { class: 'kbd-hint' }, 'Keys 1–4 for tones, 5 for neutral · P to play'));
    cleanup = () => timer && timer.stop();
    ['1st', '2nd', '3rd', '4th', 'neutral'].forEach((lbl, k) => {
      const b = el('button', { 'aria-label': lbl + ' tone', onclick: () => pick(k + 1) });
      b.innerHTML = k < 4 ? '<svg viewBox="0 0 40 22" fill="none" stroke="var(--tone' + (k + 1) + ')" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="' + TONE_PATHS[k] + '"/></svg>' : '<svg viewBox="0 0 40 22"><circle cx="20" cy="11" r="4" fill="var(--tone5)"/></svg>';
      b.append(el('small', null, lbl));
      btns.append(b);
    });
    let syls = [];
    function ask() {
      if (qi >= words.length) return finish();
      done = false; si = 0; results = []; fb.textContent = ''; fb.className = 'feedback'; nextBtn.classList.add('hidden');
      const w = words[qi];
      const p = w.p.split(' '), n = w.n.split(' ');
      syls = p.map((s, i) => ({ text: stripTones(s), tone: +(n[i] || '5').slice(-1), skip: /^r$/i.test(stripTones(s)) }));
      while (syls[si] && syls[si].skip) si++;
      head.innerHTML = ''; head.append(el('span', null, 'Word ' + (qi + 1) + ' / ' + words.length), el('span', null, score + ' perfect'));
      draw();
      [...btns.children].forEach((b) => (b.disabled = false));
      if (timer) timer.stop();
      timerSlot.innerHTML = '';
      if (opts.timer) { timer = CB.Timer(opts.timer, { onExpire: () => { while (si < syls.length) { if (!syls[si].skip) results[si] = 0; si++; } reveal(); } }); timerSlot.append(timer.el); timer.start(); }
    }
    function draw() {
      const w = words[qi];
      prompt.innerHTML = '';
      const row = el('div', { class: 'syllables' });
      syls.forEach((s, i) => row.append(el('span', { class: 'syl' + (i === si && !done ? ' cur' : '') + (results[i] === 1 ? ' ok' : results[i] === 0 ? ' no' : '') }, s.text)));
      prompt.append(hanziEl(w), row, el('div', { class: 'meaning small muted' }, w.m), speakBtn(w, 'spk'));
      prompt.lastChild.style.position = 'absolute'; prompt.lastChild.style.top = '10px'; prompt.lastChild.style.right = '10px';
    }
    function pick(t) {
      if (done) return;
      results[si] = syls[si].tone === t ? 1 : 0;
      CB.sound.play(results[si] ? 'tap' : 'wrong');
      si++; while (syls[si] && syls[si].skip) si++;
      if (si >= syls.length) reveal(); else draw();
    }
    function reveal() {
      done = true; if (timer) timer.stop();
      const w = words[qi];
      draw();
      [...btns.children].forEach((b) => (b.disabled = true));
      const perfect = syls.every((s, i) => s.skip || results[i] === 1);
      fb.innerHTML = '';
      if (perfect) { score++; fb.className = 'feedback ok'; fb.append('Perfect! ', pinyinEl(w)); CB.sound.play('correct'); }
      else { fb.className = 'feedback no'; fb.append('Correct tones: ', pinyinEl(w)); CB.sound.play('wrong'); }
      fb.querySelector('.pinyin').style.display = 'inline'; fb.querySelector('.pinyin').style.fontSize = '1.2rem';
      if (opts.autoSpeak || !perfect) speak(w);
      nextBtn.classList.remove('hidden');
      activity(1);
    }
    function finish() {
      if (timer) timer.stop();
      view.innerHTML = '';
      CB.sound.play(score / words.length >= 0.7 ? 'win' : 'ding');
      view.append(el('div', { class: 'card done-card' }, el('div', { class: 'big' }, '🎵'), el('h2', null, score + ' / ' + words.length + ' perfect'),
        el('p', { class: 'muted' }, 'Tip: the 3rd tone dips then rises; the 4th falls sharply, like a command.'),
        el('div', { class: 'row', style: { marginTop: '18px' } }, el('button', { class: 'btn', onclick: () => history.back() }, 'Done'), el('button', { class: 'btn primary', onclick: () => show('tones', false) }, 'Play again'))));
      keyHandler = (e) => { if (e.key === 'Enter') show('tones', false); };
    }
    keyHandler = (e) => {
      if (!done && '12345'.includes(e.key)) pick(+e.key);
      else if (done && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); qi++; ask(); }
      else if (e.key.toLowerCase() === 'p') speak(words[qi]);
    };
    ask();
  };

  /* ================= TYPE PINYIN ================= */
  function normPinyin(s) { return s.toLowerCase().replace(/u:/g, 'ü').replace(/[\s'’·-]/g, ''); }
  function checkPinyin(input, w) {
    const u = normPinyin(input);
    if (!u) return 'empty';
    const marked = normPinyin(w.p);
    const nums = w.n.toLowerCase().replace(/\s/g, '');
    const uNum = u.replace(/ü/g, 'v').replace(/0/g, '5');
    if (u === marked || uNum === nums || uNum === nums.replace(/5/g, '')) return 'right';
    const bare = stripTones(marked).replace(/ü/g, 'v');
    if (uNum.replace(/[0-9]/g, '') === bare || stripTones(u).replace(/ü/g, 'v') === bare) return 'tones';
    return 'wrong';
  }
  VIEWS.type = function () {
    titleEl.textContent = 'Type pinyin';
    const words = CB.shuffle(practicePool(8)).slice(0, opts.quizLen);
    let qi = 0, score = 0, answered = false, timer = null;
    const head = el('div', { class: 'q-head' });
    const timerSlot = el('div');
    const prompt = el('div', { class: 'card q-prompt' });
    const input = el('input', { class: 'type-input', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'e.g. ni3 hao3 or nǐ hǎo', 'aria-label': 'Type the pinyin' });
    const fb = el('div', { class: 'feedback', 'aria-live': 'polite' });
    const checkBtn = el('button', { class: 'btn primary', onclick: () => check() }, 'Check');
    const skipBtn = el('button', { class: 'btn', onclick: () => check(true) }, 'Show me');
    view.append(head, timerSlot, prompt, input, el('div', { class: 'row', style: { marginTop: '12px' } }, skipBtn, checkBtn), fb,
      el('p', { class: 'muted small', style: { textAlign: 'center' } }, 'Type tone numbers (ni3 hao3) or tone marks. Leaving tones off counts as close.'));
    cleanup = () => timer && timer.stop();
    function ask() {
      if (qi >= words.length) return finish();
      answered = false; fb.textContent = ''; fb.className = 'feedback'; input.value = ''; input.disabled = false;
      checkBtn.textContent = 'Check'; skipBtn.classList.remove('hidden');
      const w = words[qi];
      head.innerHTML = ''; head.append(el('span', null, 'Word ' + (qi + 1) + ' / ' + words.length), el('span', null, score + ' correct'));
      prompt.innerHTML = ''; prompt.append(hanziEl(w), el('div', { class: 'meaning small muted' }, w.m), speakBtn(w, 'spk'));
      prompt.lastChild.style.position = 'absolute'; prompt.lastChild.style.top = '10px'; prompt.lastChild.style.right = '10px';
      input.focus();
      if (timer) timer.stop();
      timerSlot.innerHTML = '';
      if (opts.timer) { timer = CB.Timer(opts.timer, { onExpire: () => check(true) }); timerSlot.append(timer.el); timer.start(); }
    }
    function check(giveUp) {
      if (answered) { qi++; return ask(); }
      const w = words[qi];
      const r = giveUp ? 'wrong' : checkPinyin(input.value, w);
      if (r === 'empty') return input.focus();
      answered = true; if (timer) timer.stop(); input.disabled = true;
      fb.innerHTML = '';
      const py = pinyinEl(w); py.style.display = 'inline'; py.style.fontSize = '1.2rem';
      if (r === 'right') { score++; fb.className = 'feedback ok'; fb.append('Correct! ', py); CB.sound.play('correct'); }
      else if (r === 'tones') { fb.className = 'feedback'; fb.style.color = 'var(--warn)'; fb.append('Close — check the tones: ', py); CB.sound.play('tap'); }
      else { fb.className = 'feedback no'; fb.append(giveUp ? 'It\'s ' : 'Not quite — it\'s ', py); CB.sound.play('wrong'); }
      if (opts.autoSpeak || r !== 'right') speak(w);
      checkBtn.textContent = 'Next'; skipBtn.classList.add('hidden');
      activity(1);
    }
    function finish() {
      if (timer) timer.stop();
      view.innerHTML = '';
      CB.sound.play(score / words.length >= 0.7 ? 'win' : 'ding');
      view.append(el('div', { class: 'card done-card' }, el('div', { class: 'big' }, '⌨️'), el('h2', null, score + ' / ' + words.length + ' correct'),
        el('div', { class: 'row', style: { marginTop: '18px' } }, el('button', { class: 'btn', onclick: () => history.back() }, 'Done'), el('button', { class: 'btn primary', onclick: () => show('type', false) }, 'Play again'))));
      keyHandler = (e) => { if (e.key === 'Enter') show('type', false); };
    }
    keyHandler = (e) => { if (e.key === 'Enter') { e.preventDefault(); check(); } };
    ask();
  };

  /* ================= WORD LIST ================= */
  VIEWS.list = function () {
    titleEl.textContent = 'Word list';
    let level = 0, filter = 'all', shown = 150;
    const search = el('input', { class: 'search', type: 'search', placeholder: 'Search 汉字, pinyin or English', 'aria-label': 'Search words' });
    const lvChips = el('div', { class: 'deck-chips', style: { marginTop: '10px' } });
    const stChips = el('div', { class: 'deck-chips', style: { marginTop: '8px' } });
    const count = el('div', { class: 'muted small', style: { margin: '12px 4px 6px' } });
    const list = el('div', { class: 'card list' });
    const more = el('button', { class: 'btn block hidden', style: { marginTop: '12px' }, onclick: () => { shown += 300; draw(); } }, 'Show more');
    view.append(search, lvChips, stChips, count, list, more);
    function chipsDraw() {
      lvChips.innerHTML = ''; stChips.innerHTML = '';
      [[0, 'All levels'], [1, 'HSK 1'], [2, 'HSK 2'], [3, 'HSK 3']].forEach(([v, l]) => lvChips.append(el('button', { class: 'chip' + (level === v ? ' on' : ''), onclick: () => { level = v; shown = 150; chipsDraw(); draw(); } }, l)));
      [['all', 'All'], ['new', 'Not started'], ['learn', 'Learning'], ['known', 'Known']].forEach(([v, l]) => stChips.append(el('button', { class: 'chip' + (filter === v ? ' on' : ''), onclick: () => { filter = v; shown = 150; chipsDraw(); draw(); } }, l)));
    }
    function status(w) { const c = S.cards[w.h]; return !c ? 'new' : c.k ? 'known' : 'learn'; }
    function draw() {
      const q = search.value.trim().toLowerCase();
      const qb = stripTones(q).replace(/\s/g, '');
      const res = WORDS.filter((w) => (!level || w.lv === level) && (filter === 'all' || status(w) === filter) &&
        (!q || w.h.includes(q) || w.m.toLowerCase().includes(q) || stripTones(w.p).replace(/\s/g, '').includes(qb)));
      count.textContent = res.length + (res.length === 1 ? ' word' : ' words');
      list.innerHTML = '';
      res.slice(0, shown).forEach((w) => {
        const st = status(w);
        list.append(el('button', { class: 'word-row', onclick: () => detail(w) }, el('span', { class: 'h', lang: 'zh-CN' }, w.h),
          el('span', { style: { minWidth: 0 } }, pinyinEl(w), el('div', { class: 'm' }, w.m)),
          el('span', { class: 'st ' + st }, st === 'new' ? 'HSK ' + w.lv : st === 'known' ? 'Known' : 'Learning')));
      });
      more.classList.toggle('hidden', res.length <= shown);
    }
    function detail(w) {
      const c = S.cards[w.h];
      const info = c && !c.k && c.r > 0 ? 'Next review in ' + Math.max(0, Math.round((c.d - Date.now()) / DAY)) + ' day(s) · reviewed ' + c.r + ' time(s)' : c && c.k ? 'Marked as known' : 'Not started yet';
      const body = el('div', { style: { textAlign: 'center' } }, hanziEl(w), pinyinEl(w), el('div', { class: 'meaning', style: { margin: '10px auto' } }, w.m),
        el('p', { class: 'muted small' }, 'HSK ' + w.lv + ' · ' + info),
        el('div', { class: 'row', style: { marginTop: '14px' } },
          el('button', { class: 'btn', onclick: () => speak(w), html: CB.icons.speaker + ' Listen' }),
          c && c.k ? el('button', { class: 'btn', onclick: () => { delete S.cards[w.h]; save(); s.close(); draw(); CB.toast('Unmarked'); } }, 'Not known')
            : el('button', { class: 'btn', onclick: () => { S.cards[w.h] = Object.assign(S.cards[w.h] || { e: 2.5, i: 0, d: 0, r: 0, l: 0 }, { k: true }); save(); s.close(); draw(); CB.toast('Marked as known'); } }, 'I know this')),
        el('div', { class: 'row', style: { marginTop: '10px' } },
          el('button', { class: 'btn primary', onclick: () => { S.cards[w.h] = Object.assign({ e: 2.5, i: 0, r: 0, l: 0 }, S.cards[w.h] || {}, { k: false, d: Date.now() - 1 }); if (!S.cards[w.h].r) S.cards[w.h].r = 0; save(); s.close(); draw(); CB.toast('Added to your next study session'); } }, 'Study this now')));
      const s = CB.sheet('Word', body);
    }
    let deb; search.addEventListener('input', () => { clearTimeout(deb); deb = setTimeout(() => { shown = 150; draw(); }, 150); });
    chipsDraw(); draw();
  };

  /* ================= SETTINGS ================= */
  function openSettings() {
    const body = el('div');
    const optsBox = el('div');
    CB.options.render(optsBox, 'mandarin', SCHEMA, (o) => { opts = o; applyToneClass(); });
    body.append(optsBox);

    // voice
    body.append(el('div', { class: 'section-title' }, 'Pronunciation voice'));
    const voiceCard = el('div', { class: 'card', style: { padding: '14px 16px' } });
    const has = CB.speech.hasChinese();
    voiceCard.append(el('p', { style: { margin: '0 0 10px' } }, !CB.speech.supported() ? 'This browser doesn\'t support speech.' : has ? 'Using voice: ' + CB.speech.voiceName() : 'No Chinese voice found on this device yet.'));
    if (!has) voiceCard.append(el('p', { class: 'muted small', style: { margin: '0 0 10px' } },
      'Android: Settings → System → Languages → Text-to-speech → install Chinese (Mandarin) voice data. Windows: Settings → Time & language → Language → Add a language → Chinese (Simplified, China) with Speech. Then restart the browser.'));
    voiceCard.append(el('button', { class: 'btn', onclick: () => CB.speech.speak('你好，欢迎来到咖啡时间。', opts.rate), html: CB.icons.speaker + ' Test voice' }));
    body.append(voiceCard);

    // data
    body.append(el('div', { class: 'section-title' }, 'Your progress'));
    const file = el('input', { type: 'file', accept: 'application/json,.json', class: 'hidden' });
    file.addEventListener('change', async () => {
      try {
        const data = JSON.parse(await file.files[0].text());
        if (!data || typeof data.cards !== 'object') throw new Error('bad');
        if (!confirm('Replace your current Mandarin progress with this backup?')) return;
        S = Object.assign(blank(), data); rollover(); save(); sheet.close(); show('home', false); CB.toast('Backup restored');
      } catch (e) { CB.toast('That file isn\'t a Coffee Break backup'); }
    });
    body.append(el('p', { class: 'muted small', style: { margin: '0 4px 10px' } }, 'Progress is saved in this browser only. Back it up to move it to another device or keep it safe if you clear browser data.'),
      el('div', { class: 'row' },
        el('button', { class: 'btn', onclick: exportData }, 'Save backup'),
        el('button', { class: 'btn', onclick: () => file.click() }, 'Restore backup')),
      file,
      el('button', { class: 'btn ghost block', style: { marginTop: '10px', color: 'var(--bad)' }, onclick: () => {
        if (!confirm('Erase all Mandarin progress? This can\'t be undone (unless you saved a backup).')) return;
        S = blank(); save(); sheet.close(); show('home', false); CB.toast('Progress reset');
      } }, 'Reset all progress'),
      el('p', { class: 'muted small', style: { margin: '18px 4px 0' } }, 'Word list: HSK 3.0 levels 1–3 from the open-source complete-hsk-vocabulary project (MIT), based on CC-CEDICT.'));
    const sheet = CB.sheet('Mandarin settings', body, () => { if (current === 'home') show('home', false); });
  }
  function exportData() {
    const blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: 'coffee-break-mandarin-' + CB.today() + '.json' });
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  // Test hook for automated checks
  window.__mandarin = { checkPinyin, nextState, WORDS, show };
  show('home', false);
})();
