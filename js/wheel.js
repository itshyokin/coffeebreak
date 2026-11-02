/* Coffee Break — Wheel of Fortune (1–4 local players, turn order) */
(function () {
  'use strict';
  const { el, $ } = CB;
  const view = $('#view');
  const VOWELS = 'AEIOU';
  const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

  const SCHEMA = [
    { key: 'puzzles', label: 'Puzzles per game', type: 'seg', default: 3, choices: [3, 5, 7].map((v) => ({ value: v, label: String(v) })) },
    { key: 'source', label: 'Puzzles from', type: 'seg', default: 'mix', choices: [{ value: 'mix', label: 'Mix' }, { value: 'classic', label: 'Classic phrases' }, { value: 'wiki', label: 'Wikipedia' }] },
    { key: 'timer', label: 'Turn timer', hint: 'Running out loses your turn', type: 'seg', default: 0, choices: CB.TIMER_CHOICES },
    { key: 'vowel', label: 'Vowel cost', type: 'seg', default: 250, choices: [{ value: 250, label: '$250' }, { value: 500, label: '$500' }] },
    { key: 'hazards', label: 'Bankrupt & Lose a Turn', hint: 'Wedges that can wipe out your round', type: 'switch', default: true },
  ];
  const WEDGES_BASE = [2500, 600, 700, 600, 650, 500, 700, 'BANKRUPT', 600, 550, 500, 600, 'LOSE A TURN', 800, 500, 650, 500, 900, 'BANKRUPT', 600, 750, 800, 500, 650];
  const COLORS = ['#e04a3a', '#3a7be0', '#e0a51f', '#35a35a', '#8f55d6', '#ef7d22', '#1fa6a0', '#e0569b'];

  let G = null, keyHandler = null;
  document.addEventListener('keydown', (e) => { if (keyHandler && !e.target.matches('input') && !document.querySelector('.sheet-back, .pass-screen')) keyHandler(e); });
  $('#backBtn').innerHTML = CB.icons.back;
  $('#settingsBtn').innerHTML = CB.icons.gear;
  CB.mountSoundToggle($('#soundBtn'));
  $('#backBtn').addEventListener('click', (e) => { if (G) { e.preventDefault(); confirmQuit(); } });
  $('#settingsBtn').addEventListener('click', () => {
    const box = el('div', null,
      el('ul', { class: 'small', style: { margin: '0 0 14px', paddingLeft: '22px', lineHeight: 1.6 } },
        el('li', null, 'On your turn: spin, buy a vowel, or solve.'),
        el('li', null, 'Spin, then pick a consonant. Each time it appears you earn the wedge\'s value, and you keep going.'),
        el('li', null, 'A missing letter, Bankrupt, Lose a Turn, a wrong solve or the timer running out passes the turn.'),
        el('li', null, 'Bankrupt wipes out your money for this puzzle.'),
        el('li', null, 'Solve the puzzle to bank your round money (at least $1,000). Highest bank after the last puzzle wins.'),
        el('li', null, 'Keyboard: Space to spin, letters to guess, Enter to solve.')));
    if (G) box.append(el('button', { class: 'btn block', onclick: () => { s.close(); confirmQuit(); } }, 'Leave game'));
    const s = CB.sheet('How to play', box);
  });
  function confirmQuit() {
    const s = CB.sheet('Leave this game?', el('div', null, el('p', { class: 'muted', style: { margin: '0 4px 16px' } }, 'Scores for this game will be lost.'),
      el('div', { class: 'row' }, el('button', { class: 'btn', onclick: () => s.close() }, 'Keep playing'),
        el('button', { class: 'btn primary', onclick: () => { s.close(); stopTimer(); G = null; setup(); } }, 'Leave game'))));
  }

  /* ================= SETUP ================= */
  function setup() {
    keyHandler = null;
    $('#title').textContent = 'Wheel of Fortune';
    view.innerHTML = '';
    const box = el('div', { style: { maxWidth: '720px', margin: '0 auto' } });
    view.append(box);
    CB.setupScreen(box, { gameId: 'wheel', schema: SCHEMA, intro: 'Spin the wheel, call letters and solve the puzzle. Players take turns in order.', onStart: start });
  }

  /* ================= PUZZLES ================= */
  function normalize(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim(); }
  function usable(answer) {
    const a = normalize(answer);
    if (!/^[A-Z0-9 &'\-.,!?:]+$/.test(a)) return null;
    const letters = a.replace(/[^A-Z]/g, '');
    if (letters.length < 4 || a.length > 44 || /\d/.test(a)) return null;
    if (a.split(' ').some((w) => w.length > 12)) return null;
    return a;
  }
  function classic(n, avoid) {
    const all = [];
    Object.entries(window.WHEEL_PHRASES).forEach(([cat, list]) => list.forEach((a) => all.push({ category: cat, answer: a })));
    const recent = CB.store.get('wheel.recent', []);
    let pool = all.filter((p) => !recent.includes(p.answer) && !avoid.has(p.answer));
    if (pool.length < n) pool = all;
    return CB.shuffle(pool).slice(0, n);
  }
  async function loadPuzzles(opts) {
    const n = opts.puzzles;
    let wiki = [];
    if (opts.source !== 'classic') {
      try { wiki = (await CB.wiki.puzzleNames(n)).filter((p) => usable(p.answer)); }
      catch (e) { wiki = []; }
      if (!wiki.length) CB.toast('Couldn\'t reach Wikipedia — using classic puzzles');
    }
    const want = opts.source === 'wiki' ? n : opts.source === 'mix' ? Math.ceil(n / 2) : 0;
    const fromWiki = wiki.slice(0, want);
    const list = fromWiki.concat(classic(n - fromWiki.length, new Set(fromWiki.map((p) => p.answer))));
    const out = CB.shuffle(list).map((p) => ({ category: p.category, text: usable(p.answer) || normalize(p.answer) }));
    const recent = CB.store.get('wheel.recent', []).concat(list.map((p) => p.answer)).slice(-80);
    CB.store.set('wheel.recent', recent);
    return out;
  }

  /* ================= GAME ================= */
  async function start(players, opts) {
    view.innerHTML = '';
    view.append(el('div', { class: 'loading' }, el('div', { class: 'spinner' }), el('p', { class: 'muted' }, 'Setting up the puzzle board…')));
    const puzzles = await loadPuzzles(opts);
    const wedges = WEDGES_BASE.map((w) => (opts.hazards ? w : w === 'BANKRUPT' ? 1000 : w === 'LOSE A TURN' ? 500 : w));
    G = { players, opts, puzzles, wedges, bank: players.map(() => 0), round: players.map(() => 0), turn: 0, pi: 0, angle: 0, spinning: false };
    newPuzzle();
  }
  const cur = () => G.players[G.turn];
  const P = () => G.puzzles[G.pi];
  const solo = () => G.players.length === 1;
  function newPuzzle() {
    G.round = G.players.map(() => 0);
    G.guessed = new Set();
    G.phase = 'turn';
    G.wedgeValue = 0;
    G.turn = G.pi % G.players.length; // rotate who starts each puzzle
    render();
    CB.sound.play('whoosh');
    startTurn('Puzzle ' + (G.pi + 1) + ' of ' + G.puzzles.length + ' — ' + cur().name + ' starts');
  }
  const letters = () => P().text.replace(/[^A-Z]/g, '');
  const remaining = (set) => [...new Set(letters())].filter((c) => set.includes(c) && !G.guessed.has(c));
  const consonantsLeft = () => remaining('BCDFGHJKLMNPQRSTVWXYZ').length;
  const vowelsLeft = () => remaining(VOWELS).length;
  const solved = () => [...letters()].every((c) => G.guessed.has(c));

  /* ---------- layout ---------- */
  let els = {};
  function render() {
    $('#title').textContent = 'Wheel of Fortune';
    view.innerHTML = '';
    els.score = el('div');
    els.banner = el('div', { class: 'turn-banner' });
    els.puzzle = el('div', { class: 'puzzle', 'aria-label': 'Puzzle board' });
    els.cat = el('div', { class: 'puzzle-cat' });
    els.result = el('div', { class: 'wheel-result', 'aria-live': 'polite' });
    els.timer = el('div', { style: { margin: '6px 0' } });
    els.actions = el('div', { class: 'row', style: { marginTop: '8px' } });
    els.keyboard = el('div', { class: 'keyboard' });
    els.canvas = el('canvas', { width: '640', height: '640', 'aria-label': 'Prize wheel' });
    const wheel = el('div', { class: 'wheel-wrap' }, el('div', { class: 'wheel-pointer' }), els.canvas);
    els.canvas.addEventListener('click', () => { if (G.phase === 'turn' && canSpin()) spin(); });
    view.append(els.score, els.banner,
      el('div', { class: 'wheel-layout' },
        el('div', null, wheel, els.result),
        el('div', null, els.cat, els.puzzle, els.timer, els.actions, els.keyboard)));
    ROWS.forEach((row) => {
      const r = el('div', { class: 'krow' });
      [...row].forEach((ch) => { const b = el('button', { class: VOWELS.includes(ch) ? 'vowel' : '', 'aria-label': ch, onclick: () => pickLetter(ch) }, ch); b._ch = ch; r.append(b); });
      els.keyboard.append(r);
    });
    drawWheel();
    drawPuzzle();
    drawScore();
  }
  function drawScore() {
    CB.renderScoreboard(els.score, G.players, G.round, G.turn, CB.money, G.bank.map((b) => 'Bank ' + CB.money(b)));
  }
  function setBanner(text) {
    const p = cur();
    els.banner.style.setProperty('--pc', p.color);
    els.banner.innerHTML = '';
    els.banner.append(el('span', { class: 'player-dot', style: { background: p.color } }), text);
  }
  function drawPuzzle(flashLetter) {
    const words = P().text.split(' ');
    const rows = []; let line = '';
    words.forEach((w) => { if (line && (line + ' ' + w).length > 12) { rows.push(line); line = w; } else line = line ? line + ' ' + w : w; });
    if (line) rows.push(line);
    els.puzzle.innerHTML = '';
    rows.forEach((r) => {
      const row = el('div', { class: 'prow' });
      [...r].forEach((ch) => {
        const isLetter = /[A-Z]/.test(ch);
        const show = !isLetter || G.guessed.has(ch) || G.revealAll;
        row.append(el('div', { class: 'pc' + (ch === ' ' ? ' space' : '') + (!isLetter && ch !== ' ' ? ' punct' : '') + (show ? '' : ' hide') + (flashLetter && ch === flashLetter ? ' flash' : '') }, ch === ' ' ? '' : ch));
      });
      els.puzzle.append(row);
    });
    els.cat.textContent = P().category;
  }

  /* ---------- wheel drawing & spinning ---------- */
  function drawWheel() {
    const c = els.canvas, ctx = c.getContext('2d'), n = G.wedges.length, R = 310, cx = 320, cy = 320, a = (2 * Math.PI) / n;
    ctx.clearRect(0, 0, 640, 640);
    for (let i = 0; i < n; i++) {
      const w = G.wedges[i];
      const s = -Math.PI / 2 + i * a + G.angle - a / 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, s, s + a); ctx.closePath();
      ctx.fillStyle = w === 'BANKRUPT' ? '#111' : w === 'LOSE A TURN' ? '#f4f1e6' : w === 2500 ? '#c0c0c0' : COLORS[i % COLORS.length];
      ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(s + a / 2);
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillStyle = w === 'LOSE A TURN' ? '#111' : '#fff';
      const label = typeof w === 'number' ? '$' + w : w;
      ctx.font = (typeof w === 'number' ? '800 30px ' : '800 17px ') + 'system-ui, sans-serif';
      ctx.fillText(label, R - 14, 0);
      ctx.restore();
    }
    ctx.beginPath(); ctx.arc(cx, cy, 44, 0, 2 * Math.PI); ctx.fillStyle = '#4a2c1d'; ctx.fill();
    ctx.font = '40px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('☕', cx, cy + 2);
  }
  function wedgeAt(angle) {
    const n = G.wedges.length, a = (2 * Math.PI) / n;
    const rel = ((-angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    return Math.round(rel / a) % n;
  }
  const canSpin = () => consonantsLeft() > 0 && !G.spinning;
  function spin() {
    if (!canSpin() || G.phase !== 'turn') return;
    stopTimer();
    G.spinning = true; G.phase = 'spinning';
    updateControls();
    els.result.textContent = '';
    const from = G.angle, dist = 2 * Math.PI * (3 + Math.random() * 2) + Math.random() * 2 * Math.PI;
    const dur = 3600 + Math.random() * 900, t0 = performance.now();
    let lastW = wedgeAt(from);
    function frame(now) {
      const t = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - t, 3.2);
      G.angle = from + dist * e;
      drawWheel();
      const w = wedgeAt(G.angle);
      if (w !== lastW) { lastW = w; CB.sound.play('tick'); }
      if (t < 1) requestAnimationFrame(frame); else landed(G.wedges[w]);
    }
    requestAnimationFrame(frame);
  }
  function landed(w) {
    G.spinning = false;
    if (w === 'BANKRUPT') {
      CB.sound.play('thud');
      els.result.textContent = '💥 BANKRUPT';
      G.round[G.turn] = 0;
      return passTurn(cur().name + ' went bankrupt');
    }
    if (w === 'LOSE A TURN') {
      CB.sound.play('buzzer');
      els.result.textContent = 'Lose a Turn';
      return passTurn(cur().name + ' loses a turn');
    }
    G.wedgeValue = w;
    els.result.textContent = '$' + w.toLocaleString();
    CB.sound.play('ding');
    G.phase = 'consonant';
    setBanner(cur().name + ': pick a consonant for $' + w.toLocaleString());
    updateControls();
    startTimer();
  }

  /* ---------- turns ---------- */
  function startTurn(msg) {
    G.phase = 'turn';
    if (solved()) return autoSolve();
    let hint = 'Spin, buy a vowel, or solve';
    if (!consonantsLeft()) hint = 'No consonants left — buy a vowel or solve';
    setBanner(msg || (solo() ? hint : cur().name + ': ' + hint.charAt(0).toLowerCase() + hint.slice(1)));
    drawScore();
    updateControls();
    startTimer();
  }
  function passTurn(why) {
    stopTimer();
    G.phase = 'wait';
    updateControls();
    drawScore();
    if (solo()) { setBanner(why); setTimeout(() => G && startTurn(), 1400); return; }
    const next = (G.turn + 1) % G.players.length;
    setBanner(why + ' — ' + G.players[next].name + '\'s turn');
    setTimeout(() => { if (!G) return; G.turn = next; startTurn(); }, 1600);
  }
  function updateControls() {
    if (!G) return;
    const p = G.phase;
    els.actions.innerHTML = '';
    if (p === 'turn') {
      const spinB = el('button', { class: 'btn primary', disabled: !canSpin(), onclick: spin }, '🎡 Spin');
      const canBuy = vowelsLeft() > 0 && G.round[G.turn] >= G.opts.vowel;
      const buyB = el('button', { class: 'btn', disabled: !canBuy, onclick: () => { G.phase = 'vowel'; setBanner(cur().name + ': pick a vowel (' + CB.money(G.opts.vowel) + ')'); updateControls(); } }, 'Buy vowel ' + CB.money(G.opts.vowel));
      const solveB = el('button', { class: 'btn', onclick: solvePrompt }, 'Solve');
      els.actions.append(spinB, buyB, solveB);
    } else if (p === 'vowel') {
      els.actions.append(el('button', { class: 'btn ghost', onclick: () => startTurn() }, 'Cancel'));
    }
    els.keyboard.querySelectorAll('button').forEach((b) => {
      const ch = b._ch, v = VOWELS.includes(ch), used = G.guessed.has(ch);
      b.disabled = used || !((p === 'consonant' && !v) || (p === 'vowel' && v));
      b.classList.toggle('hit', used && letters().includes(ch));
      b.classList.toggle('miss', used && !letters().includes(ch));
    });
    keyHandler = (e) => {
      if (!G) return;
      const k = e.key.toUpperCase();
      if (e.key === ' ' && G.phase === 'turn') { e.preventDefault(); spin(); }
      else if (e.key === 'Enter' && G.phase === 'turn') { e.preventDefault(); solvePrompt(); }
      else if (/^[A-Z]$/.test(k)) pickLetter(k);
    };
  }
  function pickLetter(ch) {
    if (!G || G.guessed.has(ch)) return;
    const v = VOWELS.includes(ch);
    if (!((G.phase === 'consonant' && !v) || (G.phase === 'vowel' && v))) return;
    stopTimer();
    if (v) G.round[G.turn] -= G.opts.vowel;
    G.guessed.add(ch);
    const count = [...letters()].filter((c) => c === ch).length;
    G.phase = 'wait';
    updateControls();
    if (!count) {
      CB.sound.play('buzzer');
      els.result.textContent = 'No ' + ch + '\'s';
      return passTurn('No ' + ch);
    }
    // reveal letters one by one
    let k = 0;
    const step = () => {
      CB.sound.play('ding');
      drawPuzzle(ch);
      if (++k < count) setTimeout(step, 320);
      else {
        setTimeout(() => drawPuzzle(), 500);
        if (!v) G.round[G.turn] += G.wedgeValue * count;
        els.result.textContent = count + ' ' + ch + (count > 1 ? '\'s' : '') + (v ? '' : ' · +' + CB.money(G.wedgeValue * count));
        drawScore();
        setTimeout(() => G && startTurn(), 650);
      }
    };
    step();
  }
  function solvePrompt() {
    if (G.phase !== 'turn') return;
    stopTimer();
    const input = el('input', { class: 'solve-input', type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', 'aria-label': 'Your solution', placeholder: 'Type the whole puzzle' });
    const submit = () => {
      const guess = normalize(input.value).replace(/[^A-Z]/g, '');
      if (!guess) return input.focus();
      s.close(true);
      if (guess === letters()) winPuzzle();
      else { CB.sound.play('wrong'); els.result.textContent = '“' + input.value.trim().toUpperCase() + '” isn\'t it'; passTurn('Wrong solve'); }
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    const s = CB.sheet(cur().name + ', solve the puzzle', el('div', null,
      el('p', { class: 'muted', style: { margin: '0 4px 10px' } }, 'Category: ' + P().category + '. Spaces and punctuation don\'t matter.'),
      input,
      el('div', { class: 'row', style: { marginTop: '12px' } }, el('button', { class: 'btn', onclick: () => s.close() }, 'Cancel'), el('button', { class: 'btn primary', onclick: submit }, 'Solve'))),
      () => { if (G && G.phase === 'turn') startTimer(); });
    setTimeout(() => input.focus(), 50);
  }
  function autoSolve() { winPuzzle(); }
  function winPuzzle() {
    stopTimer();
    G.phase = 'done';
    G.revealAll = true;
    drawPuzzle();
    G.revealAll = false;
    const won = Math.max(1000, G.round[G.turn]);
    G.bank[G.turn] += won;
    G.round = G.players.map((_, i) => (i === G.turn ? won : 0));
    drawScore();
    updateControls();
    CB.sound.play('win');
    els.result.textContent = '🎉 Solved!';
    setBanner(cur().name + ' solved it and banks ' + CB.money(won) + '!');
    const last = G.pi >= G.puzzles.length - 1;
    els.actions.innerHTML = '';
    els.actions.append(el('button', { class: 'btn primary', onclick: () => { if (last) gameOver(); else { G.pi++; newPuzzle(); } } }, last ? 'See final scores' : 'Next puzzle'));
    keyHandler = (e) => { if (e.key === 'Enter') els.actions.firstChild.click(); };
  }

  /* ---------- timer ---------- */
  function startTimer() {
    stopTimer();
    els.timer.innerHTML = '';
    if (!G.opts.timer) return;
    G.timer = CB.Timer(G.opts.timer, { onExpire: () => { if (!G) return; G.guessed && passTurn('Time\'s up'); } });
    els.timer.append(G.timer.el);
    G.timer.start();
  }
  function stopTimer() { if (G && G.timer) { G.timer.stop(); G.timer = null; } if (els.timer) els.timer.innerHTML = ''; }

  function gameOver() {
    keyHandler = null;
    $('#title').textContent = 'Game over';
    const order = G.players.map((p, i) => ({ p, s: G.bank[i] })).sort((a, b) => b.s - a.s);
    const top = order[0], tie = order.length > 1 && order[1].s === top.s;
    const pod = el('div', { class: 'podium' });
    order.forEach((o, k) => pod.append(el('div', { class: 'place' + (o.s === top.s ? ' first' : ''), style: { '--pc': o.p.color } },
      el('span', { class: 'rank' }, o.s === top.s ? '🏆' : k + 1), el('span', { class: 'player-dot', style: { background: o.p.color } }), el('span', { class: 'who' }, o.p.name), el('span', { class: 'amt' }, CB.money(o.s)))));
    const players = G.players, opts = G.opts;
    CB.sound.play('win');
    view.innerHTML = '';
    view.append(el('div', { style: { maxWidth: '620px', margin: '0 auto' } }, el('div', { class: 'card done-card', style: { padding: '26px 18px' } },
      el('div', { style: { fontSize: '3rem' } }, '🎡'),
      el('h2', null, players.length === 1 ? 'You banked ' + CB.money(top.s) : tie ? 'It\'s a tie!' : top.p.name + ' wins!'), pod,
      el('div', { class: 'row' }, el('button', { class: 'btn', onclick: () => { G = null; setup(); } }, 'Change setup'), el('button', { class: 'btn primary', onclick: () => start(players, opts) }, 'Play again')))));
    G = null;
  }

  window.__wheel = { start, get G() { return G; }, landed: (w) => landed(w), pickLetter, normalize, usable };
  setup();
})();
