/* Coffee Break — Trivia Board (Jeopardy-style, multiple choice, 1–4 local players) */
(function () {
  'use strict';
  const { el, $ } = CB;
  const view = $('#view');

  const SCHEMA = [
    { key: 'cats', label: 'Categories', hint: '5 clues each', type: 'seg', default: 5, choices: [3, 4, 5, 6].map((v) => ({ value: v, label: String(v) })) },
    { key: 'wrong', label: 'Wrong answer', hint: 'With 2+ players', type: 'seg', default: 'steal',
      choices: [{ value: 'steal', label: 'Next steals' }, { value: 'new', label: 'New clue' }] },
    { key: 'timer', label: 'Answer timer', hint: 'Running out counts as wrong', type: 'seg', default: 30, choices: CB.TIMER_CHOICES },
    { key: 'penalty', label: 'Lose points when wrong', type: 'switch', default: true },
    { key: 'stealPenalty', label: 'Missed steals lose points', type: 'switch', default: false, showIf: (o) => o.wrong === 'steal' && o.penalty },
    { key: 'dd', label: 'Daily Doubles', hint: 'Hidden clues where you bet your own points', type: 'switch', default: true },
    { key: 'rounds', label: 'Rounds', type: 'seg', default: 1, choices: [{ value: 1, label: 'Single' }, { value: 2, label: '+ Double round' }] },
    { key: 'final', label: 'Final round', hint: 'Everyone wagers on one last clue', type: 'switch', default: true },
  ];
  const BASE = [200, 400, 600, 800, 1000];

  let G = null; // current game
  let keyHandler = null;
  document.addEventListener('keydown', (e) => { if (keyHandler && !e.target.matches('input') && !document.querySelector('.sheet-back, .pass-screen')) keyHandler(e); });

  $('#backBtn').innerHTML = CB.icons.back;
  $('#settingsBtn').innerHTML = CB.icons.gear;
  CB.mountSoundToggle($('#soundBtn'));
  $('#backBtn').addEventListener('click', (e) => { if (G) { e.preventDefault(); confirmQuit(); } });
  $('#settingsBtn').addEventListener('click', menu);

  function confirmQuit() {
    const s = CB.sheet('Leave this game?', el('div', null,
      el('p', { class: 'muted', style: { margin: '0 4px 16px' } }, 'Scores for this game will be lost.'),
      el('div', { class: 'row' }, el('button', { class: 'btn', onclick: () => s.close() }, 'Keep playing'),
        el('button', { class: 'btn primary', onclick: () => { s.close(); endTimers(); G = null; closeClue(); setup(); } }, 'Leave game'))));
  }
  function menu() {
    const rules = el('div', null,
      el('p', { style: { margin: '0 4px 10px' } }, 'Players take turns picking a clue from the board. Each clue has 4 choices.'),
      el('ul', { class: 'small', style: { margin: '0 0 14px', paddingLeft: '22px', lineHeight: 1.6 } },
        el('li', null, 'Right answer: earn the clue\'s value.'),
        el('li', null, 'Wrong answer (with "Next player steals"): only the next player gets one try at the remaining choices.'),
        el('li', null, 'Wrong answer (with "New question"): the answer is shown and play moves on.'),
        el('li', null, 'Daily Double: only you answer, and you choose how much to bet.'),
        el('li', null, 'Final round: everyone with points bets secretly, then answers secretly.')),
      el('p', { class: 'muted small', style: { margin: '0 4px 14px' } }, 'Clues are written automatically from Wikipedia, so once in a while one may be odd — skip it from this menu.'));
    const box = el('div', null, rules);
    if (G && G.clue && !G.clue.revealed) box.append(el('button', { class: 'btn block', style: { marginBottom: '10px' }, onclick: () => { s.close(); skipClue(); } }, 'Skip this clue (no points)'));
    if (G) box.append(el('button', { class: 'btn block', onclick: () => { s.close(); confirmQuit(); } }, 'Leave game'));
    const s = CB.sheet('How to play', box);
  }

  /* ================= SETUP ================= */
  function setup() {
    keyHandler = null;
    $('#title').textContent = 'Trivia Board';
    view.innerHTML = '';
    const box = el('div', { style: { maxWidth: '720px', margin: '0 auto' } });
    view.append(box);
    CB.setupScreen(box, {
      gameId: 'trivia', schema: SCHEMA,
      intro: 'Jeopardy-style trivia with brand-new clues from Wikipedia every game. Take turns picking from the board — no buzzing in.',
      onStart: (players, opts) => start(players, opts),
    });
  }

  /* ================= LOADING ================= */
  function loadingView(msg) {
    view.innerHTML = '';
    const p = el('p', { class: 'muted' }, msg);
    view.append(el('div', { class: 'loading' }, el('div', { class: 'spinner' }), el('h2', { style: { fontFamily: 'var(--font-display)', margin: '0 0 6px' } }, 'Brewing fresh clues…'), p));
    return p;
  }
  function errorView(err, retry) {
    view.innerHTML = '';
    view.append(el('div', { class: 'card error-box' }, el('div', { style: { fontSize: '2.4rem' } }, '📡'),
      el('h2', { style: { fontFamily: 'var(--font-display)' } }, 'Couldn\'t reach Wikipedia'),
      el('p', { class: 'muted' }, 'Trivia needs an internet connection to fetch new clues. Check your connection and try again.'),
      el('p', { class: 'muted small' }, String(err && err.message || err)),
      el('div', { class: 'row', style: { marginTop: '14px' } }, el('button', { class: 'btn', onclick: () => { G = null; setup(); } }, 'Back'), el('button', { class: 'btn primary', onclick: retry }, 'Try again'))));
  }

  /* ================= GAME ================= */
  async function start(players, opts) {
    G = { players, opts, scores: players.map(() => 0), turn: 0, round: 1, usedIds: [], clue: null, timers: [] };
    const msg = loadingView('Picking ' + opts.cats + ' categories…');
    try {
      G.board = await CB.wiki.board(opts.cats, [], (d, n) => { msg.textContent = d + ' of ' + n + ' categories ready'; });
    } catch (e) { return errorView(e, () => start(players, opts)); }
    if (!G) return;
    prepRound();
    prefetch();
    CB.sound.play('win');
    showBoard();
  }
  function prepRound() {
    const n = G.board.length;
    G.board.forEach((c) => G.usedIds.push(c.id));
    G.used = G.board.map(() => [false, false, false, false, false]);
    G.left = n * 5;
    G.dd = new Set();
    if (G.opts.dd) {
      const count = G.round === 2 ? 2 : 1;
      while (G.dd.size < count) G.dd.add(Math.floor(Math.random() * n) + ':' + (1 + Math.floor(Math.random() * 4)));
    }
  }
  function prefetch() {
    if (G.opts.rounds === 2 && G.round === 1 && !G.next) G.next = CB.wiki.board(G.opts.cats, G.usedIds.slice()).catch(() => null);
    if (G.opts.final && !G.finalCat) G.finalCat = CB.wiki.board(1, G.usedIds.slice()).catch(() => null);
  }
  const value = (row) => BASE[row] * G.round;
  const cur = () => G.players[G.turn];
  const nextIdx = (i) => (i + 1) % G.players.length;
  function endTimers() { if (G && G.timer) G.timer.stop(); }

  function header() {
    const sb = el('div');
    CB.renderScoreboard(sb, G.players, G.scores, G.turn, CB.money);
    return sb;
  }
  function banner(player, text) {
    return el('div', { class: 'turn-banner', style: { '--pc': player.color } }, el('span', { class: 'player-dot', style: { background: player.color } }), text);
  }

  function showBoard() {
    $('#title').textContent = G.round === 2 ? 'Double Round' : 'Trivia Board';
    view.innerHTML = '';
    view.append(header(), banner(cur(), G.players.length > 1 ? cur().name + ', pick a clue' : 'Pick a clue'));
    const n = G.board.length;
    const grid = el('div', { class: 'board', style: { gridTemplateColumns: 'repeat(' + n + ', 1fr)' } });
    G.board.forEach((c) => grid.append(el('div', { class: 'cat', style: c.name.split(' ').some((w) => w.length > 9) ? { fontSize: 'clamp(.5rem, 1.9vw, .8rem)' } : null }, c.name)));
    for (let r = 0; r < 5; r++) {
      G.board.forEach((c, ci) => {
        const used = G.used[ci][r];
        grid.append(el('button', { class: 'cell' + (used ? ' used' : ''), disabled: used, 'aria-label': c.name + ' for ' + value(r),
          onclick: () => openClue(ci, r) }, used ? '' : '$' + value(r)));
      });
    }
    view.append(grid);
    view.append(el('p', { class: 'muted small', style: { textAlign: 'center', marginTop: '12px' } }, G.left + ' clues left' + (G.opts.dd ? ' · Daily Doubles hidden: ' + [...G.dd].filter((k) => { const [a, b] = k.split(':'); return !G.used[a][b]; }).length : '')));
    keyHandler = null;
  }

  /* ---------- clue overlay ---------- */
  let overlay = null;
  function closeClue() { if (overlay) { overlay.remove(); overlay = null; } }
  function openClue(ci, row) {
    CB.sound.play('tap');
    const cat = G.board[ci], data = cat.clues[row];
    const isDD = G.dd.has(ci + ':' + row);
    G.clue = { ci, row, cat, data, isDD, value: value(row), answerer: G.turn, phase: 'main', revealed: false, eliminated: [] };
    overlay = el('div', { class: 'clue-view', role: 'dialog', 'aria-label': 'Clue' });
    overlay.append(el('div', { class: 'clue-inner' }));
    document.body.append(overlay);
    if (isDD) ddWager(); else renderClue();
  }
  function ddWager() {
    const c = G.clue, p = G.players[c.answerer], score = G.scores[c.answerer];
    const max = Math.max(score, 1000 * G.round);
    const inner = overlay.firstChild; inner.innerHTML = '';
    CB.sound.play('ding'); setTimeout(() => CB.sound.play('ding'), 180);
    const input = el('input', { type: 'number', inputmode: 'numeric', min: '5', max: String(max), step: '100', value: String(Math.min(max, Math.max(5, Math.round(max / 2 / 100) * 100))), 'aria-label': 'Wager' });
    const go = () => {
      let w = Math.round(+input.value || 0);
      if (w < 5 || w > max) return CB.toast('Wager between $5 and ' + CB.money(max));
      c.value = w; renderClue();
    };
    inner.append(el('div', { class: 'dd-banner' }, 'Daily Double!'), banner(p, p.name + ' — only you answer this one'),
      el('p', { style: { textAlign: 'center' } }, 'Category: ', el('b', null, c.cat.name), el('br'), el('span', { class: 'muted small' }, 'Bet up to ' + CB.money(max) + ' (your score, or ' + CB.money(1000 * G.round) + ' if that\'s higher)')),
      el('div', { class: 'wager-row' }, input,
        el('button', { class: 'btn', onclick: () => { input.value = String(max); } }, 'All in'),
        el('button', { class: 'btn primary', onclick: go }, 'Lock bet')));
    input.focus();
    keyHandler = (e) => { if (e.key === 'Enter') go(); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  }
  function clueTextEl(text) {
    const box = el('div', { class: 'clue-text' });
    text.split('▁').forEach((part, i) => { if (i) box.append(el('span', { class: 'blank', 'aria-label': 'blank' })); box.append(part); });
    return box;
  }
  function renderClue() {
    const c = G.clue, p = G.players[c.answerer];
    const inner = overlay.firstChild; inner.innerHTML = '';
    const steal = c.phase === 'steal';
    inner.append(el('div', { class: 'clue-meta' }, el('span', null, c.cat.name), el('span', { class: 'right-bits' }, el('span', { class: 'val' }, CB.money(c.value)),
      el('button', { class: 'icon-btn', 'aria-label': 'Menu', html: CB.icons.gear, onclick: menu }))));
    inner.append(clueTextEl(c.data.clue));
    const status = el('div');
    if (G.players.length > 1 || c.isDD) status.append(banner(p, steal ? 'Steal chance: ' + p.name : p.name + (c.isDD ? ' — Daily Double' : ', your answer')));
    inner.append(status);
    const timerSlot = el('div', { style: { margin: '6px 0 10px' } });
    inner.append(timerSlot);
    const list = el('div', { class: 'choices', style: { display: 'grid', gap: '10px' } });
    c.data.choices.forEach((ch, k) => {
      const out = c.eliminated.includes(ch);
      const b = el('button', { class: 'choice', disabled: out, style: out ? { opacity: '.4', textDecoration: 'line-through' } : null, onclick: () => answer(ch, b) },
        el('span', { class: 'k' }, k + 1), ch);
      b._ch = ch; list.append(b);
    });
    inner.append(list);
    c.list = list;
    inner.append(el('div', { class: 'feedback', 'aria-live': 'polite' }));
    inner.append(el('div', { class: 'reveal-slot' }));
    endTimers();
    if (G.opts.timer) { G.timer = CB.Timer(G.opts.timer, { onExpire: () => answer(null, null) }); timerSlot.append(G.timer.el); G.timer.start(); }
    keyHandler = (e) => { if ('1234'.includes(e.key)) { const b = list.children[+e.key - 1]; if (b && !b.disabled) b.click(); } };
  }
  function answer(choice, btn) {
    const c = G.clue;
    if (c.revealed || c.locked) return;
    endTimers();
    const right = choice === c.data.answer;
    const steal = c.phase === 'steal';
    const fb = overlay.querySelector('.feedback');
    const who = c.answerer;
    if (right) {
      G.scores[who] += c.value;
      CB.sound.play('correct');
      fb.className = 'feedback ok';
      fb.textContent = (G.players.length > 1 ? G.players[who].name + ' ' : '') + '+' + CB.money(c.value) + (steal ? ' — stolen!' : '!');
      return reveal(true);
    }
    // wrong (or time out)
    if (btn) btn.classList.add('wrong');
    if (choice) c.eliminated.push(choice);
    const lose = steal ? G.opts.penalty && G.opts.stealPenalty : G.opts.penalty || c.isDD;
    if (lose) G.scores[who] -= c.value;
    CB.sound.play(choice ? 'wrong' : 'buzzer');
    const canSteal = !steal && !c.isDD && G.players.length > 1 && G.opts.wrong === 'steal';
    if (canSteal) {
      c.locked = true;
      fb.className = 'feedback no';
      fb.textContent = (choice ? 'Wrong' : 'Time\'s up') + (lose ? ' (−' + CB.money(c.value) + ')' : '') + ' — ' + G.players[nextIdx(who)].name + ' can steal!';
      setTimeout(() => { if (!G || G.clue !== c) return; c.locked = false; c.phase = 'steal'; c.answerer = nextIdx(who); renderClue(); }, 1400);
      return;
    }
    fb.className = 'feedback no';
    fb.textContent = (choice ? 'Wrong' : 'Time\'s up') + (lose ? ' (−' + CB.money(c.value) + ')' : '');
    reveal(false);
  }
  function reveal(right) {
    const c = G.clue;
    c.revealed = true;
    [...c.list.children].forEach((b) => { b.disabled = true; if (b._ch === c.data.answer) b.classList.add('right'); });
    const slot = overlay.querySelector('.reveal-slot');
    slot.append(el('p', { style: { textAlign: 'center', margin: '4px 0 14px' } }, 'Answer: ', el('b', null, c.data.answer), el('br'),
      el('a', { class: 'answer-link', href: c.data.url, target: '_blank', rel: 'noopener' }, 'Read about it on Wikipedia ↗')));
    const cont = el('button', { class: 'btn primary block', onclick: finishClue }, 'Back to the board');
    slot.append(cont);
    if (!right && G.players.length === 1) CB.toast('The answer was ' + c.data.answer);
    keyHandler = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); finishClue(); } };
  }
  function skipClue() { endTimers(); G.clue.revealed = true; finishClue(); }
  function finishClue() {
    const c = G.clue;
    G.used[c.ci][c.row] = true;
    G.left--;
    G.clue = null;
    closeClue();
    G.turn = nextIdx(G.turn); // turn order always moves on
    if (G.left <= 0) return roundOver();
    showBoard();
  }

  /* ---------- rounds ---------- */
  async function roundOver() {
    if (G.round === 1 && G.opts.rounds === 2) {
      const msg = loadingView('Setting up the Double round…');
      let b = G.next ? await G.next : null;
      if (!b) { try { b = await CB.wiki.board(G.opts.cats, G.usedIds); } catch (e) { return errorView(e, roundOver); } }
      if (!G) return;
      void msg;
      G.round = 2; G.board = b; G.next = null; prepRound();
      // the player in last place picks first in the Double round
      let low = 0; G.scores.forEach((s, i) => { if (s < G.scores[low]) low = i; }); G.turn = low;
      CB.sound.play('win');
      CB.toast('Double round — all values doubled!', 2600);
      return showBoard();
    }
    if (G.opts.final && G.scores.some((s) => s > 0)) return finalRound();
    gameOver();
  }

  async function finalRound() {
    $('#title').textContent = 'Final Round';
    loadingView('Choosing the final category…');
    let b = G.finalCat ? await G.finalCat : null;
    if (!b) { try { b = await CB.wiki.board(1, G.usedIds); } catch (e) { return errorView(e, finalRound); } }
    if (!G) return;
    const cat = b[0], data = cat.clues[4];
    const eligible = G.players.map((p, i) => i).filter((i) => G.scores[i] > 0);
    const wagers = {}, picks = {};
    view.innerHTML = '';
    view.append(header(), el('div', { class: 'card', style: { padding: '24px 18px', textAlign: 'center', marginTop: '12px' } },
      el('div', { class: 'muted small', style: { fontWeight: 800, letterSpacing: '.08em' } }, 'FINAL CATEGORY'),
      el('h2', { style: { fontFamily: 'var(--font-display)', fontSize: '2rem', margin: '8px 0' } }, cat.name),
      el('p', { class: 'muted' }, eligible.length === G.players.length ? 'Everyone' : eligible.map((i) => G.players[i].name).join(', ') + (eligible.length === 1 ? ' is' : ' are'),
        eligible.length === G.players.length ? ' is in. ' : ' in (you need more than $0). ', 'Each player bets secretly, then answers secretly.'),
      el('button', { class: 'btn primary', style: { marginTop: '10px' }, onclick: () => nextWager(0) }, 'Start betting')));
    CB.sound.play('ding');

    function nextWager(k) {
      if (k >= eligible.length) return nextAnswer(0);
      const i = eligible[k], p = G.players[i];
      CB.passScreen(p, G.players.length > 1 ? 'Place your bet — others look away!' : 'Place your bet', () => {
        const input = el('input', { type: 'number', inputmode: 'numeric', min: '0', max: String(G.scores[i]), value: '0', 'aria-label': 'Final wager' });
        const s = CB.sheet(p.name + '\'s bet', el('div', null,
          el('p', { class: 'muted', style: { margin: '0 4px' } }, 'Category: ' + cat.name + ' · You have ' + CB.money(G.scores[i])),
          el('div', { class: 'wager-row' }, input, el('button', { class: 'btn', onclick: () => { input.value = String(G.scores[i]); } }, 'All in')),
          el('button', { class: 'btn primary block', onclick: () => {
            const w = Math.round(+input.value || 0);
            if (w < 0 || w > G.scores[i]) return CB.toast('Bet between $0 and ' + CB.money(G.scores[i]));
            wagers[i] = w; s.close(); nextWager(k + 1);
          } }, 'Lock bet')));
        input.type = 'password'; input.inputMode = 'numeric'; // keep it hidden from onlookers
        input.focus();
      });
    }
    function nextAnswer(k) {
      if (k >= eligible.length) return finalReveal();
      const i = eligible[k], p = G.players[i];
      CB.passScreen(p, G.players.length > 1 ? 'Answer the final clue — others look away!' : 'Here comes the final clue', () => {
        closeClue();
        overlay = el('div', { class: 'clue-view' }); const inner = el('div', { class: 'clue-inner' }); overlay.append(inner); document.body.append(overlay);
        inner.append(el('div', { class: 'clue-meta' }, el('span', null, cat.name), el('span', { class: 'val' }, 'Final')), clueTextEl(data.clue), banner(p, p.name + ', choose your answer'));
        const timerSlot = el('div', { style: { margin: '6px 0 10px' } }); inner.append(timerSlot);
        let t = null;
        const done = (ch) => { if (t) t.stop(); picks[i] = ch; closeClue(); nextAnswer(k + 1); };
        const list = el('div', { style: { display: 'grid', gap: '10px' } });
        data.choices.forEach((ch, n) => list.append(el('button', { class: 'choice', onclick: () => done(ch) }, el('span', { class: 'k' }, n + 1), ch)));
        inner.append(list);
        const secs = G.opts.timer || 0;
        if (secs) { t = CB.Timer(Math.max(30, secs), { onExpire: () => done(null) }); timerSlot.append(t.el); t.start(); }
        keyHandler = (e) => { if ('1234'.includes(e.key)) list.children[+e.key - 1].click(); };
      });
    }
    function finalReveal() {
      keyHandler = null;
      view.innerHTML = '';
      view.append(el('div', { class: 'clue-meta', style: { marginTop: '10px' } }, el('span', null, cat.name), el('span', { class: 'val' }, 'Final')), clueTextEl(data.clue),
        el('p', { style: { textAlign: 'center' } }, 'Answer: ', el('b', null, data.answer), ' · ', el('a', { href: data.url, target: '_blank', rel: 'noopener' }, 'Wikipedia ↗')));
      const list = el('div', { class: 'card list' });
      view.append(list);
      eligible.forEach((i, k) => {
        setTimeout(() => {
          const ok = picks[i] === data.answer;
          G.scores[i] += ok ? wagers[i] : -wagers[i];
          CB.sound.play(ok ? 'correct' : 'wrong');
          list.append(el('div', { class: 'setting' }, el('span', { class: 'player-dot', style: { background: G.players[i].color } }),
            el('div', { class: 'label' }, el('b', null, G.players[i].name), el('small', null, 'Picked: ' + (picks[i] || 'no answer') + ' · bet ' + CB.money(wagers[i]))),
            el('b', { style: { color: ok ? 'var(--good)' : 'var(--bad)' } }, (ok ? '+' : '−') + CB.money(wagers[i]))));
          if (k === eligible.length - 1) setTimeout(() => view.append(el('button', { class: 'btn primary block', style: { marginTop: '16px' }, onclick: gameOver }, 'See final scores')), 600);
        }, 700 * (k + 1));
      });
    }
  }

  function gameOver() {
    endTimers(); closeClue(); keyHandler = null;
    $('#title').textContent = 'Game over';
    const order = G.players.map((p, i) => ({ p, s: G.scores[i] })).sort((a, b) => b.s - a.s);
    const top = order[0];
    const tie = order.length > 1 && order[1].s === top.s;
    CB.sound.play('win');
    view.innerHTML = '';
    const pod = el('div', { class: 'podium' });
    order.forEach((o, k) => pod.append(el('div', { class: 'place' + (o.s === top.s ? ' first' : ''), style: { '--pc': o.p.color } },
      el('span', { class: 'rank' }, o.s === top.s ? '🏆' : k + 1), el('span', { class: 'player-dot', style: { background: o.p.color } }), el('span', { class: 'who' }, o.p.name), el('span', { class: 'amt' }, CB.money(o.s)))));
    const players = G.players, opts = G.opts;
    view.append(el('div', { style: { maxWidth: '620px', margin: '0 auto' } },
      el('div', { class: 'card done-card', style: { textAlign: 'center', padding: '26px 18px' } },
        el('div', { style: { fontSize: '3rem' } }, '☕'),
        el('h2', { style: { fontFamily: 'var(--font-display)', margin: '6px 0' } }, players.length === 1 ? 'You finished with ' + CB.money(top.s) : tie ? 'It\'s a tie!' : top.p.name + ' wins!'),
        pod,
        el('div', { class: 'row' }, el('button', { class: 'btn', onclick: () => { G = null; setup(); } }, 'Change setup'), el('button', { class: 'btn primary', onclick: () => start(players, opts) }, 'Play again')))));
    G = null;
  }

  window.__trivia = { start, get G() { return G; } };
  setup();
})();
