/* Coffee Break — Blackjack (1–4 local players vs. the dealer) */
(function () {
  'use strict';
  const { el, $ } = CB;
  const view = $('#view');

  const SCHEMA = [
    { key: 'chips', label: 'Starting chips', type: 'seg', default: 1000, choices: [{ value: 500, label: '$500' }, { value: 1000, label: '$1,000' }, { value: 5000, label: '$5,000' }] },
    { key: 'minBet', label: 'Minimum bet', type: 'seg', default: 10, choices: [{ value: 5, label: '$5' }, { value: 10, label: '$10' }, { value: 25, label: '$25' }] },
    { key: 'decks', label: 'Decks in the shoe', type: 'seg', default: 6, choices: [{ value: 1, label: '1' }, { value: 2, label: '2' }, { value: 6, label: '6' }] },
    { key: 'soft17', label: 'Dealer on soft 17', hint: 'A soft 17 is an Ace + 6', type: 'seg', default: 'stand', choices: [{ value: 'stand', label: 'Stands' }, { value: 'hit', label: 'Hits' }] },
    { key: 'double', label: 'Allow doubling down', type: 'switch', default: true },
    { key: 'split', label: 'Allow splitting pairs', type: 'switch', default: true },
    { key: 'timer', label: 'Decision timer', hint: 'Running out means you stand', type: 'seg', default: 0, choices: CB.TIMER_CHOICES },
  ];
  const SUITS = ['♠', '♥', '♦', '♣'];
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const CHIP_VALUES = [{ v: 5, c: '#c62828' }, { v: 25, c: '#2e7d32' }, { v: 100, c: '#222' }, { v: 500, c: '#6a1b9a' }];

  let G = null, keyHandler = null;
  document.addEventListener('keydown', (e) => { if (keyHandler && !e.target.matches('input') && !document.querySelector('.sheet-back')) keyHandler(e); });
  $('#backBtn').innerHTML = CB.icons.back;
  $('#settingsBtn').innerHTML = CB.icons.gear;
  CB.mountSoundToggle($('#soundBtn'));
  $('#backBtn').addEventListener('click', (e) => { if (G) { e.preventDefault(); confirmQuit(); } });
  $('#settingsBtn').addEventListener('click', () => {
    const box = el('div', null, el('ul', { class: 'small', style: { margin: '0 0 14px', paddingLeft: '22px', lineHeight: 1.6 } },
      el('li', null, 'Get closer to 21 than the dealer without going over. Face cards are 10, Aces are 1 or 11.'),
      el('li', null, 'Hit: take a card. Stand: keep your total. Double: double your bet, take exactly one card.'),
      el('li', null, 'Split: turn a pair into two hands (each with its own bet).'),
      el('li', null, 'Blackjack (Ace + 10-card) pays 3 to 2. Wins pay 1 to 1. Ties push (bet returned).'),
      el('li', null, 'Keyboard: H hit · S stand · D double · P split · Enter deal'))
    );
    if (G) box.append(el('button', { class: 'btn block', style: { marginBottom: '10px' }, onclick: () => { s.close(); cashOut(); } }, 'Cash out & see results'),
      el('button', { class: 'btn block', onclick: () => { s.close(); confirmQuit(); } }, 'Leave game'));
    const s = CB.sheet('How to play', box);
  });
  function confirmQuit() {
    const s = CB.sheet('Leave this game?', el('div', null, el('p', { class: 'muted', style: { margin: '0 4px 16px' } }, 'Chip counts for this game will be lost.'),
      el('div', { class: 'row' }, el('button', { class: 'btn', onclick: () => s.close() }, 'Keep playing'),
        el('button', { class: 'btn primary', onclick: () => { s.close(); stopTimer(); G = null; setup(); } }, 'Leave game'))));
  }

  function setup() {
    keyHandler = null;
    $('#title').textContent = 'Blackjack';
    view.innerHTML = '';
    const box = el('div', { style: { maxWidth: '720px', margin: '0 auto' } });
    view.append(box);
    CB.setupScreen(box, { gameId: 'blackjack', schema: SCHEMA, intro: 'Everyone plays their own hand against the dealer, one player at a time.', startLabel: 'Take a seat', onStart: start });
  }

  /* ---------- cards ---------- */
  function newShoe(decks) {
    const s = [];
    for (let d = 0; d < decks; d++) SUITS.forEach((su) => RANKS.forEach((r) => s.push({ r, s: su })));
    return CB.shuffle(s);
  }
  function draw() {
    if (G.shoe.length < 15) { G.shoe = newShoe(G.opts.decks); CB.toast('Shuffling a fresh shoe'); CB.sound.play('whoosh'); }
    return G.shoe.pop();
  }
  const cardVal = (c) => (c.r === 'A' ? 11 : ['J', 'Q', 'K'].includes(c.r) ? 10 : +c.r);
  function total(cards) {
    let t = 0, aces = 0;
    cards.forEach((c) => { t += cardVal(c); if (c.r === 'A') aces++; });
    while (t > 21 && aces) { t -= 10; aces--; }
    return { t, soft: aces > 0 };
  }
  const isBJ = (h) => h.cards.length === 2 && total(h.cards).t === 21 && !h.fromSplit;
  function cardEl(c, hidden) {
    if (hidden) return el('div', { class: 'card-face back', 'aria-label': 'Face-down card' });
    const red = c.s === '♥' || c.s === '♦';
    return el('div', { class: 'card-face' + (red ? ' red' : ''), 'aria-label': c.r + ' of ' + { '♠': 'spades', '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs' }[c.s] },
      el('div', { class: 'tl' }, c.r, el('small', null, c.s)), el('div', { class: 'mid' }, c.s));
  }

  /* ---------- game ---------- */
  function start(players, opts) {
    G = {
      opts, shoe: newShoe(opts.decks), dealer: [], hideHole: true,
      seats: players.map((p) => ({ p, chips: opts.chips, bet: 0, lastBet: opts.minBet, hands: [], hi: 0, rebuys: 0, result: '' })),
      phase: 'bet', turn: 0,
    };
    beginBetting();
  }
  const seat = () => G.seats[G.turn];
  const active = () => G.seats.filter((s) => !s.out);

  function beginBetting() {
    G.phase = 'bet'; G.dealer = []; G.hideHole = true;
    G.seats.forEach((s) => { s.hands = []; s.bet = 0; s.result = ''; s.out = s.chips < G.opts.minBet; });
    if (!active().length) return render(); // everyone broke: render shows rebuy / results
    G.turn = G.seats.findIndex((s) => !s.out);
    render();
  }
  function nextBettor() {
    let i = G.turn + 1;
    while (i < G.seats.length && G.seats[i].out) i++;
    if (i >= G.seats.length) return deal();
    G.turn = i; render();
  }
  function addChip(v) {
    const s = seat();
    if (s.chips < v) return;
    s.chips -= v; s.bet += v; CB.sound.play('tap'); render();
  }
  function clearBet() { const s = seat(); s.chips += s.bet; s.bet = 0; render(); }
  function sameBet() { const s = seat(); clearBet(); const v = Math.min(s.lastBet, s.chips); s.chips -= v; s.bet = v; render(); }
  function placeBet() {
    const s = seat();
    if (s.bet < G.opts.minBet) return CB.toast('Minimum bet is ' + CB.money(G.opts.minBet));
    s.lastBet = s.bet; CB.sound.play('flip');
    nextBettor();
  }

  async function deal() {
    G.phase = 'dealing';
    const players = active();
    players.forEach((s) => { s.hands = [{ cards: [], bet: s.bet, done: false }]; s.hi = 0; });
    render();
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let round = 0; round < 2; round++) {
      for (const s of players) { s.hands[0].cards.push(draw()); CB.sound.play('flip'); render(); await wait(220); }
      G.dealer.push(draw()); CB.sound.play('flip'); render(); await wait(220);
    }
    // dealer peeks for blackjack when showing an Ace or 10-card
    const up = G.dealer[0];
    if (cardVal(up) >= 10 && total(G.dealer).t === 21) {
      G.hideHole = false; CB.sound.play('thud'); CB.toast('Dealer has Blackjack');
      players.forEach((s) => (s.hands[0].done = true));
      return settle();
    }
    players.forEach((s) => { if (isBJ(s.hands[0])) { s.hands[0].done = true; } });
    G.phase = 'play';
    G.turn = -1;
    nextPlayer();
  }
  function nextPlayer() {
    stopTimer();
    let i = G.turn + 1;
    while (i < G.seats.length && (G.seats[i].out || G.seats[i].hands.every((h) => h.done))) i++;
    if (i >= G.seats.length) return dealerPlay();
    G.turn = i; G.seats[i].hi = G.seats[i].hands.findIndex((h) => !h.done);
    render(); startTimer();
  }
  const hand = () => seat().hands[seat().hi];
  function afterAction() {
    const h = hand();
    if (h.done || total(h.cards).t >= 21) {
      h.done = true;
      if (total(h.cards).t > 21) CB.sound.play('wrong');
      const s = seat();
      const n = s.hands.findIndex((x) => !x.done);
      if (n >= 0) { s.hi = n; render(); startTimer(); return; }
      setTimeout(nextPlayer, 450);
      render();
      return;
    }
    render(); startTimer();
  }
  function hit() { if (G.phase !== 'play') return; stopTimer(); hand().cards.push(draw()); CB.sound.play('flip'); afterAction(); }
  function stand() { if (G.phase !== 'play') return; stopTimer(); hand().done = true; CB.sound.play('tap'); afterAction(); }
  const canDouble = () => G.opts.double && hand().cards.length === 2 && seat().chips >= hand().bet && !hand().splitAces;
  const canSplit = () => { const h = hand(), s = seat(); return G.opts.split && s.hands.length === 1 && h.cards.length === 2 && cardVal(h.cards[0]) === cardVal(h.cards[1]) && s.chips >= h.bet; };
  function doubleDown() {
    if (G.phase !== 'play' || !canDouble()) return;
    stopTimer();
    const s = seat(), h = hand();
    s.chips -= h.bet; h.bet *= 2; h.doubled = true;
    h.cards.push(draw()); CB.sound.play('flip'); h.done = true; afterAction();
  }
  function split() {
    if (G.phase !== 'play' || !canSplit()) return;
    stopTimer();
    const s = seat(), h = hand();
    s.chips -= h.bet;
    const aces = h.cards[0].r === 'A';
    const a = { cards: [h.cards[0], draw()], bet: h.bet, done: false, fromSplit: true, splitAces: aces };
    const b = { cards: [h.cards[1], draw()], bet: h.bet, done: false, fromSplit: true, splitAces: aces };
    if (aces) { a.done = true; b.done = true; } // split aces get one card each
    s.hands = [a, b]; s.hi = 0;
    CB.sound.play('flip');
    if (aces) { render(); setTimeout(nextPlayer, 500); return; }
    afterAction();
  }

  async function dealerPlay() {
    G.phase = 'dealer'; G.turn = -1; G.hideHole = false;
    CB.sound.play('flip'); render();
    const live = active().some((s) => s.hands.some((h) => total(h.cards).t <= 21 && !isBJ(h)));
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    await wait(600);
    if (live) {
      for (;;) {
        const { t, soft } = total(G.dealer);
        if (t < 17 || (t === 17 && soft && G.opts.soft17 === 'hit')) { G.dealer.push(draw()); CB.sound.play('flip'); render(); await wait(650); }
        else break;
      }
    }
    settle();
  }
  function settle() {
    stopTimer();
    G.phase = 'settle'; G.hideHole = false;
    const d = total(G.dealer).t, dBJ = G.dealer.length === 2 && d === 21;
    active().forEach((s) => {
      let net = 0; const parts = [];
      s.hands.forEach((h) => {
        const t = total(h.cards).t;
        let win;
        if (isBJ(h) && !dBJ) { win = h.bet * 2.5; parts.push('Blackjack!'); }
        else if (t > 21) { win = 0; parts.push('Bust'); }
        else if (dBJ && !isBJ(h)) { win = 0; parts.push('Lose'); }
        else if (d > 21 || t > d) { win = h.bet * 2; parts.push('Win'); }
        else if (t === d) { win = h.bet; parts.push('Push'); }
        else { win = 0; parts.push('Lose'); }
        s.chips += win; net += win - h.bet;
      });
      s.chips = Math.round(s.chips);
      s.result = parts.join(' / ') + (net ? ' ' + (net > 0 ? '+' : '−') + CB.money(Math.abs(net)) : '');
      s.net = net;
    });
    const anyWin = active().some((s) => s.net > 0);
    CB.sound.play(anyWin ? 'correct' : 'wrong');
    render();
  }

  /* ---------- timer ---------- */
  let timerEl = null;
  function startTimer() {
    stopTimer();
    if (!G.opts.timer || G.phase !== 'play') return;
    G.timer = CB.Timer(G.opts.timer, { onExpire: () => { CB.sound.play('buzzer'); stand(); } });
    if (timerEl) { timerEl.innerHTML = ''; timerEl.append(G.timer.el); }
    G.timer.start();
  }
  function stopTimer() { if (G && G.timer) { G.timer.stop(); G.timer = null; } }

  /* ---------- rendering ---------- */
  function handEl(h, showTotal) {
    const box = el('div');
    const row = el('div', { class: 'hand' });
    h.cards.forEach((c) => row.append(cardEl(c)));
    box.append(row);
    if (showTotal && h.cards.length) {
      const { t, soft } = total(h.cards);
      box.append(el('div', { class: 'hand-total' }, isBJ(h) ? 'Blackjack!' : t > 21 ? 'Bust (' + t + ')' : (soft && t < 21 ? 'Soft ' : '') + t + (h.doubled ? ' · doubled' : '')));
    }
    return box;
  }
  function render() {
    if (!G) return;
    view.innerHTML = '';
    $('#title').textContent = 'Blackjack';
    const felt = el('div', { class: 'felt' });
    // dealer
    felt.append(el('h3', null, 'Dealer' + (G.dealer.length && !G.hideHole ? ' · ' + total(G.dealer).t : G.dealer.length ? ' · ' + cardVal(G.dealer[0]) + ' showing' : '')));
    const dRow = el('div', { class: 'hand' });
    G.dealer.forEach((c, i) => dRow.append(cardEl(c, i === 1 && G.hideHole)));
    if (!G.dealer.length) dRow.append(el('div', { style: { opacity: '.6', alignSelf: 'center', fontSize: '.9rem' } }, G.phase === 'bet' ? 'Place your bets' : ''));
    felt.append(dRow);
    // seats
    const seats = el('div', { class: 'seats' });
    G.seats.forEach((s, i) => {
      const isTurn = i === G.turn && (G.phase === 'bet' || G.phase === 'play');
      const box = el('div', { class: 'seat' + (isTurn ? ' active' : ''), style: { '--pc': s.p.color } },
        el('div', { class: 'who' }, el('span', { class: 'player-dot', style: { background: s.p.color } }), s.p.name),
        el('div', { class: 'chips' }, s.out && G.phase === 'bet' ? 'Out of chips' : 'Chips ' + CB.money(s.chips)));
      if (s.hands.length > 1) {
        const sh = el('div', { class: 'split-hands' });
        s.hands.forEach((h, k) => sh.append(el('div', { class: isTurn && k === s.hi ? 'cur' : '' }, handEl(h, true), el('div', { class: 'bet' }, CB.money(h.bet)))));
        box.append(sh);
      } else if (s.hands.length) {
        box.append(handEl(s.hands[0], true), el('div', { class: 'bet' }, 'Bet ' + CB.money(s.hands[0].bet)));
      } else {
        box.append(el('div', { class: 'bet', style: { minHeight: '30px', marginTop: '8px' } }, s.bet ? 'Bet ' + CB.money(s.bet) : ''));
      }
      if (s.result) box.append(el('div', { class: 'result', style: { color: s.net > 0 ? '#9effb6' : s.net < 0 ? '#ffb3a8' : '#fff' } }, s.result));
      seats.append(box);
    });
    felt.append(seats);
    view.append(felt);

    // controls
    const controls = el('div', { style: { maxWidth: '620px', margin: '0 auto' } });
    timerEl = el('div', { style: { marginTop: '12px' } });
    controls.append(timerEl);
    if (G.phase === 'bet') {
      if (!active().length) {
        controls.append(el('div', { class: 'card', style: { padding: '18px', textAlign: 'center', marginTop: '10px' } },
          el('p', { style: { marginTop: 0 } }, 'Everyone is out of chips!'),
          el('div', { class: 'row' }, el('button', { class: 'btn', onclick: rebuyAll }, 'Rebuy everyone'), el('button', { class: 'btn primary', onclick: cashOut }, 'See results'))));
      } else {
        const s = seat();
        const chipRow = el('div', { class: 'chip-row' });
        CHIP_VALUES.forEach((c) => chipRow.append(el('button', { class: 'chip-btn', style: { background: c.c }, disabled: s.chips < c.v, onclick: () => addChip(c.v), 'aria-label': 'Add ' + c.v }, c.v)));
        controls.append(el('div', { class: 'turn-banner', style: { '--pc': s.p.color } }, el('span', { class: 'player-dot', style: { background: s.p.color } }), s.p.name + ', place your bet: ' + CB.money(s.bet)),
          chipRow,
          el('div', { class: 'row', style: { marginTop: '12px' } },
            el('button', { class: 'btn', onclick: clearBet, disabled: !s.bet }, 'Clear'),
            el('button', { class: 'btn', onclick: sameBet }, 'Bet ' + CB.money(Math.min(s.lastBet, s.chips + s.bet))),
            el('button', { class: 'btn primary', onclick: placeBet, disabled: s.bet < G.opts.minBet }, active().indexOf(s) === active().length - 1 ? 'Deal' : 'Place bet')));
        const broke = G.seats.filter((x) => x.out);
        if (broke.length) controls.append(el('p', { class: 'muted small', style: { textAlign: 'center' } }, broke.map((x) => x.p.name).join(', ') + ' — out of chips. ', el('a', { href: '#', onclick: (e) => { e.preventDefault(); broke.forEach(rebuy); render(); } }, 'Rebuy')));
        keyHandler = (e) => { if (e.key === 'Enter') placeBet(); else if (e.key === '1') addChip(5); else if (e.key === '2') addChip(25); else if (e.key === '3') addChip(100); else if (e.key === '4') addChip(500); };
      }
    } else if (G.phase === 'play') {
      const s = seat();
      controls.append(el('div', { class: 'turn-banner', style: { '--pc': s.p.color } }, el('span', { class: 'player-dot', style: { background: s.p.color } }),
        s.p.name + (s.hands.length > 1 ? ' — hand ' + (s.hi + 1) + ' of 2' : '') + ': ' + total(hand().cards).t));
      controls.append(el('div', { class: 'actions' },
        el('button', { class: 'btn primary', onclick: hit }, 'Hit'),
        el('button', { class: 'btn primary', onclick: stand }, 'Stand'),
        el('button', { class: 'btn', onclick: doubleDown, disabled: !canDouble() }, 'Double'),
        el('button', { class: 'btn', onclick: split, disabled: !canSplit() }, 'Split')));
      keyHandler = (e) => { const k = e.key.toLowerCase(); if (k === 'h') hit(); else if (k === 's') stand(); else if (k === 'd') doubleDown(); else if (k === 'p') split(); };
    } else if (G.phase === 'settle') {
      controls.append(el('div', { class: 'row', style: { marginTop: '12px' } },
        el('button', { class: 'btn', onclick: cashOut }, 'Cash out'),
        el('button', { class: 'btn primary', onclick: beginBetting }, 'Next hand')));
      keyHandler = (e) => { if (e.key === 'Enter') beginBetting(); };
    } else {
      keyHandler = null;
    }
    view.append(controls);
    if (G.timer && timerEl) timerEl.append(G.timer.el);
  }
  function rebuy(s) { s.chips += G.opts.chips; s.rebuys++; s.out = false; }
  function rebuyAll() { G.seats.forEach(rebuy); beginBetting(); }

  function cashOut() {
    stopTimer(); keyHandler = null;
    $('#title').textContent = 'Results';
    const pending = (s) => (G.phase === 'bet' ? s.bet : 0); // a bet placed but not yet dealt goes back to the player
    const order = G.seats.map((s) => ({ p: s.p, s: s.chips + pending(s) - s.rebuys * G.opts.chips - G.opts.chips, chips: s.chips + pending(s), rebuys: s.rebuys })).sort((a, b) => b.s - a.s);
    const top = order[0];
    const pod = el('div', { class: 'podium' });
    order.forEach((o, k) => pod.append(el('div', { class: 'place' + (o.s === top.s ? ' first' : ''), style: { '--pc': o.p.color } },
      el('span', { class: 'rank' }, o.s === top.s ? '🏆' : k + 1), el('span', { class: 'player-dot', style: { background: o.p.color } }),
      el('span', { class: 'who' }, o.p.name, el('div', { class: 'muted small', style: { fontWeight: 500 } }, CB.money(o.chips) + ' in chips' + (o.rebuys ? ' · ' + o.rebuys + ' rebuy' + (o.rebuys > 1 ? 's' : '') : ''))),
      el('span', { class: 'amt', style: { color: o.s >= 0 ? 'var(--good)' : 'var(--bad)' } }, (o.s >= 0 ? '+' : '') + CB.money(o.s)))));
    const players = G.seats.map((s) => s.p), opts = G.opts;
    CB.sound.play('win');
    view.innerHTML = '';
    view.append(el('div', { style: { maxWidth: '620px', margin: '0 auto' } }, el('div', { class: 'card done-card', style: { padding: '26px 18px' } },
      el('div', { style: { fontSize: '3rem' } }, '🃏'),
      el('h2', null, players.length === 1 ? (top.s >= 0 ? 'You\'re up ' : 'You\'re down ') + CB.money(Math.abs(top.s)) : top.p.name + ' is the big winner!'),
      el('p', { class: 'muted small' }, 'Profit = chips now − starting chips − rebuys'), pod,
      el('div', { class: 'row' }, el('button', { class: 'btn', onclick: () => { G = null; setup(); } }, 'Change setup'), el('button', { class: 'btn primary', onclick: () => start(players, opts) }, 'New game')))));
    G = null;
  }

  window.__bj = { start, get G() { return G; }, total };
  setup();
})();
