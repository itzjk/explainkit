# explainkit

**Turn a script and a narration into a vertical 2D explainer video (1080x1920, 30 fps) with shots, word-by-word captions and a mixed soundtrack. Everything runs on your machine. MIT licensed.**

![A steel boat flips over, then a keel brings it back upright](docs/boat.gif) ![A lighthouse keeper at a door, the knocking starts](docs/lighthouse.gif) ![A ship trapped in the ice, silhouettes](docs/endurance.gif)

*Three finished examples, all drawn by this engine from the files in `examples/`. The GIFs are silent previews.*

You write the narration and a short shot list. explainkit finds the second each word is spoken, starts every shot on its words, draws each frame in headless Chromium, writes the captions, ducks the music under the voice, normalizes loudness and encodes the file. No timeline, no editor, no upload: nothing leaves your computer.

## Quick start

You need Node 20+ and ffmpeg (`brew install ffmpeg`, `sudo apt install ffmpeg`, or `winget install Gyan.FFmpeg`).

```bash
git clone https://github.com/itzjk/explainkit && cd explainkit
npm install
npx playwright install chromium
npm run doctor      # checks ffmpeg, Chromium and the bundled fonts
npm run example     # renders examples/boat -> examples/boat/out/video.mp4
```

The first example renders with **no narration file**: timings are estimated from the script at a calm reading speed and the soundtrack is generated music. That is the storyboard mode, and it needs no voice, no account and no download. When you have a voice, drop it in:

```bash
npx explainkit build examples/boat --audio my-voice.mp3
```

### Your own video in four commands

```bash
npx explainkit new my-video          # starter project: script.txt, plan.js, scenes.js, mix.json
# edit my-video/script.txt and my-video/plan.js, put your voice at my-video/narration.mp3
npx explainkit frames my-video --at 2,10,25   # look at stills before rendering anything
npx explainkit build my-video                 # my-video/out/video.mp4
```

## The three formats in `examples/`

Each one is a complete project (script, plan, custom scenes, mix) written from scratch for this repository. Copy one and change the story.

| Example | Format | What to look at |
|---|---|---|
| [`examples/boat`](examples/boat) | "We build it, problem by problem": an object meets a problem, gets a fix, meets the next problem | One `tank` scene that draws five different situations from a parameter, and `card` scenes that number each PROBLEM and FIX |
| [`examples/lighthouse`](examples/lighthouse) | A "DAY N" series in the second person, with rules, a clock and a heart-rate monitor, ending on a vote | A scene wrapper that stamps the day and the clock on every shot, the `pulse` monitor driven from the plan |
| [`examples/endurance`](examples/endurance) | A real story told in silhouettes with the protagonist in every shot | Flat shapes, one color grade per shot, a `man()` silhouette that is reused in all scenes |

## How it works

```
script.txt ──┐
narration ───┼─► align ─► words.json ──┐
             │   (estimate | whisper | your file)
plan.js ─────┴──────────────────────────┼─► shots + captions ─► render (Chromium canvas ─► ffmpeg) ─► video.mp4
scenes.js ──────────────────────────────┘                                  ▲
mix.json + your music ─► mix (duck under voice, -14 LUFS) ─► audio-final.m4a ┘
```

1. **Script and plan.** `plan.js` is a list of shots: `['the words where it starts', 'sceneName', { params }, 'LABEL']`. A shot starts when the narrator says its anchor words and lasts until the next anchor, so the picture always follows the voice and changing the narration does not break the edit.
2. **Timings.** `explainkit align` writes `out/words.json` (`[{ "text", "start", "end" }]`).
   - `estimate` (default): spreads your words over the speech it finds in the audio, or over a reading-speed duration when there is no audio. On one 42-word test narration it was off by 0.25 s on average and 0.66 s at worst against whisper (measured Oct 31, 2026, one voice: treat it as a draft, not a guarantee).
   - `whisper`: `--engine whisper` uses [whisper.cpp](https://github.com/ggml-org/whisper.cpp) for exact word times. It needs `whisper-cli` and one model file that you download yourself: see [Exact word times](#exact-word-times-whispercpp).
   - bring your own `words.json`, or whisper.cpp JSON: both are read.
3. **Scenes.** A scene is a function `ESC.name = (p, P, T) => { ... }` that draws a whole shot on a 1080x1920 canvas: `p` is progress through the shot (0 to 1), `P` its params, `T` the absolute time. The same `T` always gives the same frame, so you can check any second without rendering the video (`explainkit frames`). `src/runtime/draw.js` has the drawing helpers (backgrounds, glow, stars, city skyline, clock, phone, speech bubble...), `character.js` an articulated character with eight expressions, `scenes.js` a few generic scenes (`title`, `face`, `dialogue`, `calendar`, `sunrise`...).
4. **Overlay.** Long shots re-frame every 2.3 s so a still scene still reads as cuts. Captions are 1-3 words, cut at punctuation and pauses, and never leave a word like "the" alone at the end. Optional heart-rate monitor (`"pulse": true`).
5. **Voice.** A voice is an audio file you provide. Optional adapters: `explainkit tts --engine command --cmd 'espeak-ng -f {in} -w {out}'` for any text-to-speech program, `--engine piper` for the fast local Piper voice with no Python ([docs/piper.md](docs/piper.md): what to download, the voice license, the exact command), or `--engine kokoro` for the open Kokoro-82M voice through the optional `kokoro-js` package (the model downloads on first use, about 90 MB, from Hugging Face). Check the license of whatever voice you use before you publish. The Kokoro adapter follows the package's documented API but has not been run end to end by the maintainers yet ([#14](https://github.com/itzjk/explainkit/issues/14)); the `command` adapter and the audio-file path are the verified ones. The Piper preset is tested against a stand-in program that follows Piper's options, not yet against a real Piper.
6. **Sound.** `mix.json` lists music tracks and hit sounds. Music ducks under the voice with sidechain compression and the result is normalized to -14 LUFS (a 42-second example measured -14.3 LUFS). Built-in `synth:pad`, `synth:drone`, `synth:boom`, `synth:tick` and `synth:rise` are computed from sine waves and noise, so there is no audio to license: bring your own tracks when you want real music, and only use music you have the rights to. This repository contains no recorded audio.
7. **Render.** Chromium draws frames, ffmpeg encodes H.264 + AAC. Fonts (Barlow Condensed, Barlow, JetBrains Mono, all SIL OFL) are loaded and checked before the first frame, so the text is identical on macOS, Linux and Windows. Measured on an Apple-silicon Mac: a 42 s video took 51 s end to end (timings, mix and render).

## Exact word times (whisper.cpp)

The default timings are an estimate. To get the second each word is really spoken, use [whisper.cpp](https://github.com/ggml-org/whisper.cpp). It needs two things, and explainkit downloads neither:

1. **`whisper-cli`**, the program. macOS: `brew install whisper.cpp`. Linux and Windows: build it as the whisper.cpp README says (`cmake -B build`, then `cmake --build build -j --config Release`) and put `build/bin` on your PATH.
2. **One model file**, `ggml-base.bin` (141 MiB, understands every language), from the whisper.cpp model repository. Save it where explainkit looks without being told, `~/.explainkit/models/ggml-base.bin` (Windows: `%USERPROFILE%\.explainkit\models\ggml-base.bin`):

```bash
curl -L --create-dirs -o ~/.explainkit/models/ggml-base.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin
```

Then:

```bash
npx explainkit align my-video --engine whisper     # writes my-video/out/words.json
npx explainkit doctor                              # shows the whisper-cli and the model it found
```

Keeping the model somewhere else? Pass `--model /path/to/ggml-base.bin` or set the `WHISPER_MODEL` environment variable. explainkit looks in this order: `--model`, `WHISPER_MODEL`, the models folder. A path you gave is never swapped for another, so a typo is reported instead of silently ignored.

When the file is wrong (a folder, empty, a saved web page, a Git LFS pointer, not a ggml model), the error says which of those it is and repeats the steps above. The models whose names contain `.en` only understand English, so explainkit refuses them for a project whose `language` is not `en`. Bigger models (`small`, `medium`) hear more words correctly and take longer; all of them are listed at [huggingface.co/ggerganov/whisper.cpp](https://huggingface.co/ggerganov/whisper.cpp/tree/main).

## Commands

```
explainkit new <dir>                      create a starter project
explainkit build <dir> [--audio file]     timings + mix + render -> <dir>/out/video.mp4
explainkit frames <dir> --at 3,40,95      stills at those seconds
explainkit sheet <dir> [--every 6]        contact sheet of the whole video
explainkit gif <dir> --from 2 --to 8      animated GIF of a section
explainkit render <dir> [--from --to]     render (or a section) from what is in out/
explainkit align <dir> [--engine estimate|whisper] [--model ggml.bin]
explainkit mix <dir>
explainkit tts <dir> --engine kokoro|piper|command [--voice af_heart|voice.onnx] [--cmd "..."] [--piper-bin piper]
explainkit doctor
```

`project.json`: `script`, `audio`, `words`, `plan`, `scenes` (list of files), `fixes` (rewrite how a word is captioned: `{ "from": "foo", "to": "FOO", "wholeWord": true, "times": 1 }`), `captions`, `pulse`, `reframes`, `labelY`, `captionY`, `tail`, `language` (`en`, `es`), `wordsPerSecond`.

## What it will not do

- No avatars and no lip-sync: it draws scenes, it does not generate people talking.
- It does not make a voice for you. The voice is a file.
- It is not a general video editor. It makes one thing well: narrated vertical explainers built from drawn scenes.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). Good first issues are labeled, and every one has a "done when" line. `npm test` renders every example, so a change that breaks a scene is caught.

## License

MIT for the code (see [LICENSE](LICENSE)). Fonts are SIL OFL 1.1 ([fonts/](fonts)). The example scripts are original to this repository and MIT too.
