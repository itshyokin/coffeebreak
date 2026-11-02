# ☕ Coffee Break

Little games for little breaks. Play in any browser, on your phone or a big screen.

**Play:** https://itshyokin.github.io/coffeebreak/

## Games

| Game | Players | Status |
|---|---|---|
| **Mandarin Practice**: spaced-repetition flashcards, flip cards, 4-choice quiz, memory match, tone drill, pinyin typing, searchable HSK 1–3 word list | Solo | ✅ Ready |
| **Trivia Board**: Jeopardy-style, multiple choice, fresh clues from Wikipedia | 1–4 local | 🚧 Next |
| **Wheel of Fortune** | 1–4 local | 🚧 Planned |
| **Blackjack** | 1–4 local | 🚧 Planned |

Multiplayer is local "hot seat": players take turns on the same device (or one person drives while streaming).

## Running it

- **Online:** enable GitHub Pages (Settings → Pages → Deploy from branch → `main` / root). The site updates a minute or two after each push.
- **Offline / locally:** download the repo and open `index.html`. After the first online visit, the installed app also works offline.
- **Install like an app:** in your browser menu choose *Add to Home screen* / *Install*.

## How it's built

Plain HTML, CSS and JavaScript. No build step, no server, no dependencies.

```
index.html        home menu
mandarin.html     Mandarin Practice
css/app.css       shared styles (light/dark themes)
js/core.js        shared: storage, synthesized sound effects, Chinese text-to-speech,
                  1–4 player setup (names + colors), game options, timers, turn order
js/mandarin.js    Mandarin game logic
data/hsk.js       ~2,200 HSK 1–3 words
sw.js             offline cache (bump VERSION after big updates)
```

Progress and settings are stored in the browser (localStorage). Mandarin progress can be backed up and restored from its settings screen.

## Credits

- Vocabulary: [complete-hsk-vocabulary](https://github.com/drkameleon/complete-hsk-vocabulary) by Yanis Zafirópulos (MIT), built on [CC-CEDICT](https://cc-cedict.org/) (CC BY-SA 4.0). Some definitions were shortened or adjusted for flashcards.
- Pronunciation uses your device's built-in text-to-speech voices.
