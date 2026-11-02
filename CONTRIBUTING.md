# Contributing

Thanks for helping. The project is small on purpose, so a change is easy to review.

## Setup

```bash
git clone https://github.com/itzjk/explainkit && cd explainkit
npm install && npx playwright install chromium
npm run doctor
npm test        # unit tests + renders every example (about 1-2 minutes)
```

## Ground rules

1. **Everything runs locally.** No feature may upload a user's script, voice or video, or require an account.
2. **No audio, fonts or images we cannot redistribute.** Fonts must be OFL or similar; sounds must be generated or CC0. Say where anything you add comes from.
3. **The same time gives the same frame.** Scenes are pure functions of `(p, P, T)`: no `Math.random()` (use `rng(seed)`), no `Date.now()`.
4. **A default that works beats an option.** If every user has to change a setting, the default is wrong: fix the default.
5. **Tests with teeth.** Add a test that fails without your change. Break your fix once on purpose and watch the test go red.

## Where things live

| Path | What |
|---|---|
| `src/runtime/` | what runs in the browser: `draw.js` helpers, `character.js`, `scenes.js`, `overlay.js` (reframes, label, captions, pulse) |
| `src/project.mjs` | script + timings + plan -> shots and captions |
| `src/guides.mjs` | the platform UI zones that `frames --guides` tints on stills: one constant, with where each number comes from |
| `src/output.mjs` | video sizes (9:16, 4:5, 1:1): the crop of the stage and where the label, captions and pulse go |
| `src/align.mjs` | word timings (estimate, whisper.cpp, files) |
| `src/mix.mjs`, `src/synth.mjs` | soundtrack |
| `src/render.mjs` | Chromium + ffmpeg |
| `src/tts.mjs` | optional narration adapters |
| `src/subtitles.mjs` | the caption list as `.srt` and `.vtt` files |
| `examples/` | one complete project per format |

## Adding a scene to the built-in library

Put it in `src/runtime/scenes.js` as `ESC.name = (p, P, T) => ...`, document the params in a comment above it, and add a still of it to the PR description (`explainkit frames`). Keep text out of scenes unless it comes from `P`, so it works in any language. Scenes draw the 1080x1920 stage, but 4:5 and 1:1 videos keep only the middle of it (README, Output sizes): keep what matters in rows 420 to 1499 so it survives every size.

## Adding an example

Copy an existing folder in `examples/`, write your own script (original, or public domain), and make sure `npm test` still passes: it renders every shot of every example.

## Commit style

Short imperative subject, one change per commit.
