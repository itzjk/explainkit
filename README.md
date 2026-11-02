**English** · [Español](README.es.md) · [Português](README.pt-BR.md)

# explainkit

**Turn a script and a narration into a vertical 2D explainer video (1080x1920, 30 fps; 4:5 and 1:1 too) with shots, word-by-word captions and a mixed soundtrack. Everything runs on your machine. MIT licensed.**

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
3. **Scenes.** A scene is a function `ESC.name = (p, P, T) => { ... }` that draws a whole shot on the 1080x1920 stage (4:5 and 1:1 videos keep the middle of it, see [Output sizes](#output-sizes)): `p` is progress through the shot (0 to 1), `P` its params, `T` the absolute time. The same `T` always gives the same frame, so you can check any second without rendering the video (`explainkit frames`). `src/runtime/draw.js` has the drawing helpers (backgrounds, glow, stars, city skyline, clock, phone, speech bubble...), `character.js` an articulated character with eight expressions, `scenes.js` a few generic scenes (`title`, `face`, `dialogue`, `calendar`, `sunrise`...). Run `explainkit gallery` for a contact sheet of all of them.
4. **Overlay.** Long shots re-frame every 2.3 s so a still scene still reads as cuts. Captions are 1-3 words, cut at punctuation and pauses, and never leave a word like "the" alone at the end. Optional heart-rate monitor (`"pulse": true`). Wrap a word in asterisks in the script (`A solid block *sinks* like a stone.`) to color it gold in its caption; the asterisks are not spoken.
5. **Voice.** A voice is an audio file you provide. Optional adapters: `explainkit tts --engine command --cmd 'espeak-ng -f {in} -w {out}'` for any text-to-speech program, `--engine piper` for the fast local Piper voice with no Python ([docs/piper.md](docs/piper.md): what to download, the voice license, the exact command), or `--engine kokoro` for the open Kokoro-82M voice through the optional `kokoro-js` package (the model downloads on first use, about 90 MB, from Hugging Face). Check the license of whatever voice you use before you publish. The Kokoro adapter follows the package's documented API but has not been run end to end by the maintainers yet ([#14](https://github.com/itzjk/explainkit/issues/14)); the `command` adapter and the audio-file path are the verified ones. The Piper preset is tested against a stand-in program that follows Piper's options, not yet against a real Piper.
6. **Sound.** `mix.json` lists music tracks and hit sounds. Music ducks under the voice with sidechain compression and the result is normalized to -14 LUFS (a 42-second example measured -14.3 LUFS). Built-in `synth:pad`, `synth:drone`, `synth:boom`, `synth:tick` and `synth:rise` are computed from sine waves and noise, so there is no audio to license: bring your own tracks when you want real music, and only use music you have the rights to. This repository contains no recorded audio. `at` (for hits) and `from` (for music entries) accept a word anchor instead of a fixed second — `{ "file": "synth:boom", "at": { "words": "Now it floats" } }` — so the cue moves with the words when you re-record the narration. An anchor that is not found in the script is a clear error that names it.
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

## Output sizes

The default is 1080x1920 (9:16). For feeds, set `"output"` in `project.json`, or pass `--output` to any command (the flag wins over the file):

| `output` | Video | Part of the 1080x1920 stage that is kept | Label, captions, pulse monitor (pixels from the top of the video) |
|---|---|---|---|
| `9:16` (default) | 1080x1920 | all of it | 300, 1395, 1700 |
| `4:5` | 1080x1350 | rows 285 to 1634 | 220, 1110, 44 |
| `1:1` | 1080x1080 | rows 420 to 1499 | 220, 936, 44 |

The pixel size (`1080x1350`) works in place of the ratio. Any other value is an error that lists the accepted ones.

**What is cropped.** Scenes keep drawing on the 1080x1920 stage. A 4:5 or 1:1 video is the middle band of that stage at full width, copied pixel for pixel (nothing is scaled), so whatever a scene draws above or below the band is cut: 285 rows at the top and at the bottom for 4:5, 420 for 1:1. Keep what matters in rows 420 to 1499 and it survives every size. In the examples the cut shows in a few shots, for instance: the DAY tag and the clock in `lighthouse` (both sizes), its `KNOCK` bubble (cut in half in 4:5, gone in 1:1) and its `YOUR CALL` headline (clipped in 1:1); the title of the density chart in `boat` (both sizes), whose steel bar and `7.85` value also run past the top in 1:1, and the `PROBLEM` and `FIX` card headings in 1:1; the date tag in `endurance` (a sliver in 4:5, gone in 1:1).

**What is not cropped.** The label, the captions and the pulse monitor are not part of the stage: they are drawn on the cropped frame, so they are always fully inside it. Captions keep the stage row they have in 9:16 (1395) in 4:5, so they sit against the scenes the way the scenes were composed, and sit 80 px above the bottom edge in 1:1. In the feed sizes the pulse monitor moves to the top right corner because there is no room under the captions. The vignette is scaled to the frame. Reframes (the zoom every 2.3 s) happen on the stage before the crop, around its center, which is also the center of the band.

`labelY` and `captionY` are pixels from the top of the video, so a project that sets them for 9:16 needs new values for another size. A value that would cut the text is refused, with the range that fits. The video is written to `out/video.mp4` whatever its size: move it away before you build another size of the same project.

## Safe-area guides

```bash
npx explainkit frames my-video --at 5 --guides    # writes out/stills/t0005-guides.jpg
```

`--guides` tints the parts of a 1080x1920 frame that a full screen vertical player covers with its own interface: the top 14% (269 px), the bottom 35% (672 px) and 6% (65 px) on each side. Keep captions and labels clear of them, or check on the still that you meant to overlap. The guides exist only on stills, which are saved under another name (`t0005-guides.jpg`, next to the plain `t0005.jpg`). `build`, `render`, `sheet` and `gif` never draw them, `--guides` on any command but `frames` is an error, and a 4:5 or 1:1 project refuses it because the bands describe a 9:16 player.

**Where the numbers come from.** Meta's Ads Guide for Instagram Reels ads ("Awareness Image Ad Specs on Instagram Reels") says to leave roughly 14% of the top, 35% of the bottom and 6% on each side free from text (read on 2026-11-01). It gives percentages, so the pixels are computed from them. They are the bands for Reels ads, which carry ad copy and a call to action. **Not verified:** that organic Reels, TikTok or YouTube Shorts cover the same bands. TikTok publishes its In-Feed safe zone as template files without numbers, and no official pixel figures for Shorts were found. Check a test upload on the platform you publish to. The three percentages are one constant, `UI_ZONES` in `src/guides.mjs`, with its sources in the comment above it.

## Commands

```
explainkit new <dir>                      create a starter project
explainkit build <dir> [--audio file]     timings + mix + render -> <dir>/out/video.mp4
explainkit frames <dir> --at 3,40,95 [--guides]   stills at those seconds (--guides tints the platform UI zones)
explainkit sheet <dir> [--every 6]        contact sheet of the whole video
explainkit gallery [--out path]           one still per built-in scene -> out/gallery.jpg
explainkit gif <dir> --from 2 --to 8      animated GIF of a section
explainkit srt <dir>                      the captions as files: <dir>/out/captions.srt and captions.vtt
explainkit render <dir> [--from --to]     render (or a section) from what is in out/
explainkit align <dir> [--engine estimate|whisper] [--model ggml.bin]
explainkit mix <dir>
explainkit tts <dir> --engine kokoro|piper|command [--voice af_heart|voice.onnx] [--cmd "..."] [--piper-bin piper]
explainkit doctor
```

Every command that reads a project also takes `--output 9:16|4:5|1:1` (see [Output sizes](#output-sizes)).

`project.json`: `script`, `audio`, `words`, `plan`, `scenes` (list of files), `fixes` (rewrite how a word is captioned: `{ "from": "foo", "to": "FOO", "wholeWord": true, "times": 1 }`), `output` (`9:16`, `4:5` or `1:1`), `captions`, `pulse`, `reframes`, `labelY` and `captionY` (pixels from the top of the video, the defaults depend on `output`), `tail`, `language` (`en`, `es`, `pt`, `fr`, `de`), `wordsPerSecond`.

`language` is a two-letter code and defaults to `en`. It decides which words a caption never ends on (articles, prepositions, conjunctions and the like), so "the" moves to the next caption instead of hanging at the end of this one. Lists exist for `en`, `es`, `pt`, `fr` and `de`; any other code uses the English list. With `es`, a number written `1,000` is captioned `1.000`. The `whisper` engine also hands the code to whisper.cpp as the language to transcribe, so use the code it knows: `pt`, not `pt-BR`.

## Caption files (.srt and .vtt)

The captions are drawn into the video, and `explainkit srt` writes the same captions as files you can open in an editor or upload next to the video:

```bash
npx explainkit srt my-video     # my-video/out/captions.srt and my-video/out/captions.vtt
```

Nothing is rendered, so it runs in a moment and does not need Chromium. It reads the caption list the renderer draws, so the text and the times are the ones in the video: one to three words per cue, in capitals, with your `fixes` applied. It also works with `"captions": false` in `project.json`, for a video that has no burned-in captions.

- **Timings** come from `out/words.json` (written by `build` or `align`). Without that file they are estimated from the script, or spread over the narration when there is audio, and the command tells you so. For exact times run `explainkit align my-video --engine whisper --model ggml-base.bin` first, then `srt`.
- **SubRip (`.srt`)**: numbered cues like `00:01:02,500 --> 00:01:04,000`, a blank line after each. SubRip has no way to escape text, and some players read `<b>`, `<i>`, `<u>` and `<font>` in it as formatting.
- **WebVTT (`.vtt`)**: a `WEBVTT` line, then the same cues with a dot before the milliseconds (`00:01:02.500`). `&`, `<` and `>` are escaped, so this is the safer file when your text can contain them.
- Both files are UTF-8 without a byte order mark, with LF line ends. A caption with no text or no length on screen is left out, and the numbers stay continuous.
- They cover the whole video. A clip made with `render --from --to` has its own timeline, so shift the times before you use the files with a clip.

## What it will not do

- No avatars and no lip-sync: it draws scenes, it does not generate people talking.
- It does not make a voice for you. The voice is a file.
- It is not a general video editor. It makes one thing well: narrated vertical explainers built from drawn scenes.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). Good first issues are labeled, and every one has a "done when" line. `npm test` renders every example, so a change that breaks a scene is caught.

## License

MIT for the code (see [LICENSE](LICENSE)). Fonts are SIL OFL 1.1 ([fonts/](fonts)). The example scripts are original to this repository and MIT too.
