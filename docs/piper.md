# A local voice with Piper

[Piper](https://github.com/rhasspy/piper) is a fast text-to-speech program that runs on your computer. Its release builds are one folder with a program in it and no Python. explainkit does not include Piper or any voice, and never downloads them: you get two things, then `--engine piper` does the rest.

## 1. The program

Release `2023.11.14-2` (14 Nov 2023) of `rhasspy/piper`, the last release of that project (it is archived, MIT). Take the file for your computer from <https://github.com/rhasspy/piper/releases/tag/2023.11.14-2>:

| Computer | File |
|---|---|
| Linux x86-64 | `piper_linux_x86_64.tar.gz` |
| Linux ARM64 | `piper_linux_aarch64.tar.gz` |
| Linux ARMv7 | `piper_linux_armv7l.tar.gz` |
| macOS Apple silicon | `piper_macos_aarch64.tar.gz` |
| macOS Intel | `piper_macos_x64.tar.gz` |
| Windows 64-bit | `piper_windows_amd64.zip` |

Unpack it and keep the folder together: `piper` looks for `espeak-ng-data` next to the program. If macOS refuses to open it after a browser download, `xattr -dr com.apple.quarantine <folder>` clears the block.

Already have Python? `pip install piper-tts` (the maintained continuation, [OHF-Voice/piper1-gpl](https://github.com/OHF-Voice/piper1-gpl), GPL-3.0) accepts the same options. Use `--piper-bin "python3 -m piper"`.

## 2. A voice

Two files, saved in the same folder, from the [piper-voices](https://huggingface.co/rhasspy/piper-voices) repository (pinned to its `v1.0.0` tag):

- <https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/ljspeech/medium/en_US-ljspeech-medium.onnx> (63,531,379 bytes, 61 MiB)
- <https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/ljspeech/medium/en_US-ljspeech-medium.onnx.json> (4,972 bytes)

**License.** The [model card](https://huggingface.co/rhasspy/piper-voices/blob/v1.0.0/en/en_US/ljspeech/medium/MODEL_CARD) of `en_US-ljspeech-medium` says its training data (LJ Speech) is **public domain**, so narration made with it can be published. That is why it is the voice in this recipe. Read the card of any other voice before you choose it: several English voices are non-commercial (`ryan` and `hfc_male` are CC BY-NC-SA 4.0) or say only "See URL". Model cards read on 2026-11-01.

## 3. Make the narration

```bash
npx explainkit tts my-video --engine piper --voice voices/en_US-ljspeech-medium.onnx --piper-bin piper-folder/piper --out my-video/narration.mp3
```

| Option | |
|---|---|
| `--voice file.onnx` | The voice. Required. Its `.onnx.json` must sit next to it. |
| `--piper-bin` | The program: a path (spaces are fine) or a command line such as `python3 -m piper`. Default `piper`, found on your PATH. |
| `--piper-config` | The voice config, only if it is not `<voice>.onnx.json` next to the voice. |
| `--out` | Where the narration goes. Default: the project's `audio`, or `narration.wav`. Folders are created. |

What it runs is this line, with `{in}` the script text (comments and `[notes]` removed) and `{out}` a temporary wav:

```
piper -m 'voices/en_US-ljspeech-medium.onnx' --sentence_silence 0.3 -f {out} < {in}
```

- Piper reads all the lines of the text as one passage and writes one wav. It has no idea of paragraphs, so every sentence is followed by 0.3 s of silence (the Kokoro adapter leaves the same gap). To change the gap, or any other Piper option, write the line yourself with `--engine command`; explainkit fills in `{in}` and `{out}` with quotes already around them, and you quote your own paths with double quotes, which works in `sh` and in `cmd.exe`:

  ```bash
  npx explainkit tts my-video --engine command --cmd 'piper -m "voices/en_US-ljspeech-medium.onnx" --sentence_silence 0.5 -f {out} < {in}'
  ```
- The wav has the sample rate of the voice (`audio.sample_rate` in its `.onnx.json`: 22,050 Hz for medium voices, 16,000 Hz for low ones). A `.wav` output is kept as it is. Any other extension, such as the `narration.mp3` that `explainkit new` asks for, is converted by ffmpeg so the file is what its name says. The mix resamples everything to 48 kHz, so there is no sample rate to set.
- A missing program, voice or config stops the command before Piper starts and says which file to download.

## What was checked, and what was not

Read in the source on 2026-11-01, not run: the options and the stdin handling of `src/cpp/main.cpp` at the `2023.11.14-2` tag (`-m`, `-c`, `-f`, `--sentence_silence`; all lines joined with a space into one wav) and of `src/piper/__main__.py` at `v1.8.0` of `piper-tts` (the same options, text from stdin).

Run: the preset, against a stand-in program that follows those options (`fixtures/fake-piper.mjs`, `test/piper.test.mjs`): paths with spaces, a missing output folder, `.wav` kept and `.mp3` converted, a bad voice or program reported before anything runs.

**Not run: a real Piper and a real voice, on any computer.** Nothing was downloaded to write this page, so no one has reproduced this recipe on Linux, macOS or Windows yet. If you do, please open an issue with your platform and the first lines of the output, whichever way it went.
