/* Coffee Break — fresh questions from Wikidata + Wikipedia.
   Wikidata gives a list of things in a category (with "sitelinks" = how many Wikipedias cover it,
   a good fame/difficulty signal). Wikipedia gives the intro text we turn into a clue. */
(function () {
  'use strict';
  const CB = window.CB;
  const SPARQL = 'https://query.wikidata.org/sparql?format=json&query=';
  const WIKI = 'https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&origin=*';
  const DAY = 86400000;

  // name: board title · q: query pattern binding ?item · cls: class item checked by label · expect: word the class label must contain
  // kind: used by Wheel of Fortune for puzzle categories · person: mask name parts
  const P31 = (q) => '?item wdt:P31 wd:' + q + ' .';
  const JOB = (q) => '?item wdt:P106 wd:' + q + ' ; wdt:P31 wd:Q5 .';
  CB.WIKI_CATEGORIES = [
    { id: 'countries', name: 'Countries', cls: 'Q3624078', expect: 'sovereign', pat: P31('Q3624078'), min: 40, kind: 'Place' },
    { id: 'capitals', name: 'Capital Cities', cls: 'Q3624078', expect: 'sovereign', pat: '?c wdt:P31 wd:Q3624078 ; wdt:P36 ?item .', min: 40, kind: 'Place' },
    { id: 'states', name: 'U.S. States', cls: 'Q35657', expect: 'state', pat: P31('Q35657'), min: 10, kind: 'Place' },
    { id: 'cities', name: 'Big Cities', cls: 'Q1637706', expect: 'million', pat: P31('Q1637706'), min: 60, kind: 'Place' },
    { id: 'rivers', name: 'Rivers', cls: 'Q4022', expect: 'river', pat: P31('Q4022'), min: 60, kind: 'Place' },
    { id: 'mountains', name: 'Mountains', cls: 'Q8502', expect: 'mountain', pat: P31('Q8502'), min: 50, kind: 'Place' },
    { id: 'islands', name: 'Islands', cls: 'Q23442', expect: 'island', pat: P31('Q23442'), min: 70, kind: 'Place' },
    { id: 'elements', name: 'Chemical Elements', cls: 'Q11344', expect: 'element', pat: P31('Q11344'), min: 30, kind: 'Thing' },
    { id: 'constellations', name: 'Constellations', cls: 'Q8928', expect: 'constellation', pat: P31('Q8928'), min: 30, kind: 'Thing' },
    { id: 'moons', name: 'Moons', cls: 'Q2537', expect: 'satellite', pat: P31('Q2537'), min: 20, kind: 'Thing' },
    { id: 'dogs', name: 'Dog Breeds', cls: 'Q39367', expect: 'dog', pat: P31('Q39367'), min: 25, kind: 'Living Thing' },
    { id: 'languages', name: 'Languages', cls: 'Q34770', expect: 'language', pat: P31('Q34770'), min: 90, kind: 'Thing' },
    { id: 'dishes', name: 'Food & Dishes', cls: 'Q746549', expect: 'dish', pat: P31('Q746549'), min: 35, kind: 'Food & Drink' },
    { id: 'sports', name: 'Sports', cls: 'Q31629', expect: 'sport', pat: P31('Q31629'), min: 50, kind: 'Fun & Games' },
    { id: 'boardgames', name: 'Board Games', cls: 'Q131436', expect: 'board game', pat: P31('Q131436'), min: 25, kind: 'Fun & Games' },
    { id: 'videogames', name: 'Video Games', cls: 'Q7889', expect: 'video game', pat: P31('Q7889'), min: 50, kind: 'Title' },
    { id: 'films', name: 'Movies', cls: 'Q11424', expect: 'film', pat: P31('Q11424'), min: 75, kind: 'Title' },
    { id: 'novels', name: 'Novels', cls: 'Q8261', expect: 'novel', pat: P31('Q8261'), min: 50, kind: 'Title' },
    { id: 'bands', name: 'Bands', cls: 'Q215380', expect: 'group', pat: P31('Q215380'), min: 60, kind: 'Proper Name' },
    { id: 'currencies', name: 'Currencies', cls: 'Q8142', expect: 'currency', pat: P31('Q8142'), min: 40, kind: 'Thing' },
    { id: 'empires', name: 'Empires', cls: 'Q48349', expect: 'empire', pat: P31('Q48349'), min: 45, kind: 'Proper Name' },
    { id: 'wars', name: 'Wars', cls: 'Q198', expect: 'war', pat: P31('Q198'), min: 55, kind: 'Event' },
    { id: 'gods', name: 'Greek Mythology', cls: 'Q22989102', expect: 'greek', pat: P31('Q22989102'), min: 30, kind: 'Proper Name' },
    { id: 'presidents', name: 'U.S. Presidents', cls: 'Q11696', expect: 'president', pat: '?item wdt:P39 wd:Q11696 .', min: 30, kind: 'Person', person: true },
    { id: 'painters', name: 'Painters', cls: 'Q1028181', expect: 'painter', pat: JOB('Q1028181'), min: 80, kind: 'Person', person: true },
    { id: 'composers', name: 'Composers', cls: 'Q36834', expect: 'composer', pat: JOB('Q36834'), min: 80, kind: 'Person', person: true },
    { id: 'novelists', name: 'Novelists', cls: 'Q6625963', expect: 'novelist', pat: JOB('Q6625963'), min: 90, kind: 'Person', person: true },
    { id: 'physicists', name: 'Physicists', cls: 'Q169470', expect: 'physicist', pat: JOB('Q169470'), min: 80, kind: 'Person', person: true },
    { id: 'philosophers', name: 'Philosophers', cls: 'Q4964182', expect: 'philosopher', pat: JOB('Q4964182'), min: 100, kind: 'Person', person: true },
    { id: 'inventors', name: 'Inventors', cls: 'Q205375', expect: 'inventor', pat: JOB('Q205375'), min: 60, kind: 'Person', person: true },
  ];

  async function getJSON(url, ms) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms || 15000);
    try {
      const r = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/sparql-results+json, application/json' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  }
  const cleanTitle = (t) => t.replace(/\s*\([^)]*\)\s*$/, '').trim();

  /** List of {title, name, links} for a category, cached in the browser for a week. */
  async function members(cat) {
    const cacheKey = 'wiki.m.' + cat.id;
    const cached = CB.store.get(cacheKey, null);
    if (cached && Date.now() - cached.t < 7 * DAY && cached.list.length >= 12) return cached.list;
    const q = 'SELECT DISTINCT ?title ?links ?cl WHERE { wd:' + cat.cls + ' rdfs:label ?cl . FILTER(LANG(?cl) = "en") ' +
      cat.pat + ' ?item wikibase:sitelinks ?links . FILTER(?links >= ' + cat.min + ') ' +
      '?art schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?title . } LIMIT 500';
    const data = await getJSON(SPARQL + encodeURIComponent(q), 25000);
    const rows = data.results.bindings;
    if (rows.length && !rows[0].cl.value.toLowerCase().includes(cat.expect)) throw new Error('category check failed: ' + rows[0].cl.value);
    const seen = new Set(); const list = [];
    rows.forEach((r) => {
      const title = r.title.value, name = cleanTitle(title);
      if (/^(list|history|outline|index) of/i.test(title) || seen.has(name.toLowerCase())) return;
      seen.add(name.toLowerCase());
      list.push({ title, name, links: +r.links.value });
    });
    list.sort((a, b) => b.links - a.links);
    if (list.length >= 12) CB.store.set(cacheKey, { t: Date.now(), list });
    return list;
  }

  /** Intro text for up to 20 titles: { title: extract } */
  async function extracts(titles) {
    const url = WIKI + '&prop=extracts&exintro=1&explaintext=1&exsentences=3&exlimit=20&redirects=1&titles=' + encodeURIComponent(titles.join('|'));
    const data = await getJSON(url, 15000);
    const q = data.query || {};
    const back = {};
    (q.normalized || []).forEach((n) => { back[n.to] = n.from; });
    (q.redirects || []).forEach((n) => { back[n.to] = back[n.from] || n.from; });
    const out = {};
    (q.pages || []).forEach((p) => { if (p.extract) out[back[p.title] || p.title] = p.extract; });
    return out;
  }

  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  /** Turn a Wikipedia intro into a clue that doesn't give the answer away. Returns null if unusable. */
  function makeClue(text, item, cat, others) {
    if (!text || /may refer to|disambiguation/i.test(text)) return null;
    let t = text.replace(/\s+/g, ' ').trim();
    // drop parentheticals (pronunciations, translations) but keep short ones with years, e.g. (1452–1519)
    for (let k = 0; k < 3; k++) t = t.replace(/\s*\(([^()]*)\)/g, (m, inner) => (/\d{3,4}/.test(inner) && inner.length < 50 && !/[:;]/.test(inner) ? ' (' + inner + ')' : ''));
    t = t.replace(/\s+([,.;])/g, '$1');
    // keep to roughly two sentences
    const sentences = t.match(/[^.!?]+[.!?]+(\s|$)/g) || [t];
    let clue = '';
    for (const s of sentences) { if ((clue + s).length > 280 && clue) break; clue += s; }
    clue = clue.trim();
    // mask the answer: full name, each name word (3+ letters), and close word forms (German for Germany)
    const name = item.name;
    const words = name.split(/[\s\-–,]+/).filter((w) => w.replace(/[^A-Za-zÀ-ÿ]/g, '').length >= 3 && !/^(the|and|of|von|van|der|de|la|le|du)$/i.test(w));
    const pats = [esc(name)].concat(words.map((w) => {
      const base = w.replace(/[^A-Za-zÀ-ÿ0-9']/g, '');
      const stem = base.length >= 6 ? base.slice(0, base.length - 2) : base;
      return esc(stem) + "[A-Za-zÀ-ÿ']*";
    }));
    let masked = clue;
    pats.forEach((p) => { masked = masked.replace(new RegExp('(^|[^A-Za-zÀ-ÿ])(' + p + ')(?=$|[^A-Za-zÀ-ÿ])', 'gi'), '$1▁'); });
    masked = masked.replace(/▁(\s*▁)+/g, '▁');
    const blanks = (masked.match(/▁/g) || []).length;
    const plain = masked.replace(/▁/g, '').trim();
    if (plain.length < 50) return null;
    if (blanks > 6) return null;
    // other answer choices shouldn't appear in the clue
    const lower = masked.toLowerCase();
    const okOthers = others.filter((o) => !lower.includes(o.name.toLowerCase()));
    void cat;
    return { text: masked, okOthers };
  }

  /** Build a trivia category: 5 clues ordered easiest → hardest, each with 4 choices. */
  CB.wiki = {
    async category(cat, count) {
      count = count || 5;
      const list = await members(cat);
      if (list.length < 12) throw new Error('not enough items');
      const top = list.slice(0, Math.min(list.length, 200));
      // split by fame into `count` buckets; pick 2 candidates per bucket (backup in case a clue is unusable)
      const per = Math.max(2, Math.floor(top.length / count));
      const picks = [];
      for (let b = 0; b < count; b++) {
        const bucket = CB.shuffle(top.slice(b * per, b === count - 1 ? top.length : (b + 1) * per));
        picks.push(bucket.slice(0, 3));
      }
      const ex = await extracts(picks.flat().map((x) => x.title));
      const clues = [];
      const usedNames = new Set();
      for (let b = 0; b < count; b++) {
        let made = null;
        for (const item of picks[b]) {
          if (usedNames.has(item.name)) continue;
          const pool = CB.shuffle(list.filter((x) => x.name !== item.name && !usedNames.has(x.name)));
          const c = makeClue(ex[item.title], item, cat, pool.slice(0, 12));
          if (!c || c.okOthers.length < 3) continue;
          made = { answer: item.name, title: item.title, clue: c.text, choices: CB.shuffle([item.name].concat(c.okOthers.slice(0, 3).map((o) => o.name))),
            url: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(item.title.replace(/ /g, '_')) };
          usedNames.add(item.name);
          break;
        }
        if (!made) throw new Error('could not build clue ' + b);
        clues.push(made);
      }
      return { id: cat.id, name: cat.name, clues };
    },
    /** Several categories, skipping any that fail. onProgress(done, total). */
    async board(n, exclude, onProgress) {
      const order = CB.shuffle(CB.WIKI_CATEGORIES.filter((c) => !(exclude || []).includes(c.id)));
      const out = []; let i = 0, done = 0;
      async function worker() {
        while (out.length < n && i < order.length) {
          const cat = order[i++];
          try { const c = await CB.wiki.category(cat); if (out.length < n) { out.push(c); onProgress && onProgress(++done, n); } }
          catch (e) { console.warn('Skipping category', cat.id, e.message); }
        }
      }
      await Promise.all([worker(), worker(), worker()]);
      if (out.length < n) throw new Error('Only found ' + out.length + ' of ' + n + ' categories');
      return out;
    },
    /** Short names for Wheel of Fortune puzzles: [{answer, category}] */
    async puzzleNames(howMany) {
      const cats = CB.shuffle(CB.WIKI_CATEGORIES).slice(0, Math.min(8, howMany + 3));
      const out = [];
      await Promise.all(cats.map(async (cat) => {
        try {
          const list = await members(cat);
          CB.shuffle(list.slice(0, 120)).slice(0, 4).forEach((x) => out.push({ answer: x.name, category: cat.kind }));
        } catch (e) { console.warn('Skipping', cat.id, e.message); }
      }));
      return CB.shuffle(out);
    },
    _makeClue: makeClue,
    _members: members,
  };
})();
