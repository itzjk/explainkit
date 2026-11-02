[English](README.md) · **Español** · [Português](README.pt-BR.md)

# explainkit

**Convierte un guion y una narración en un video explicativo 2D vertical (1080x1920, 30 fps) con planos, subtítulos palabra por palabra y una banda sonora mezclada. Todo se ejecuta en tu máquina. Licencia MIT.**

![Un bote de acero se vuelca y una quilla lo endereza](docs/boat.gif) ![Un farero ante una puerta, empiezan los golpes](docs/lighthouse.gif) ![Un barco atrapado en el hielo, siluetas](docs/endurance.gif)

*Tres ejemplos terminados, todos dibujados por este motor a partir de los archivos de `examples/`. Los GIF son vistas previas sin sonido.*

Tú escribes la narración y una lista corta de planos. explainkit encuentra el segundo en que se dice cada palabra, hace que cada plano empiece con sus palabras, dibuja cada fotograma en Chromium sin interfaz (headless), escribe los subtítulos, atenúa la música bajo la voz (ducking), normaliza la sonoridad y codifica el archivo. Sin línea de tiempo, sin editor, sin subir nada: nada sale de tu equipo.

## Inicio rápido

Necesitas Node 20+ y ffmpeg (`brew install ffmpeg`, `sudo apt install ffmpeg` o `winget install Gyan.FFmpeg`).

```bash
git clone https://github.com/itzjk/explainkit && cd explainkit
npm install
npx playwright install chromium
npm run doctor      # checks ffmpeg, Chromium and the bundled fonts
npm run example     # renders examples/boat -> examples/boat/out/video.mp4
```

El primer ejemplo se renderiza **sin archivo de narración**: los tiempos se estiman a partir del guion con una velocidad de lectura pausada y la banda sonora es música generada. Ese es el modo storyboard, y no necesita voz, ni cuenta, ni descargas. Cuando tengas una voz, añádela:

```bash
npx explainkit build examples/boat --audio my-voice.mp3
```

### Tu propio video en cuatro comandos

```bash
npx explainkit new my-video          # starter project: script.txt, plan.js, scenes.js, mix.json
# edit my-video/script.txt and my-video/plan.js, put your voice at my-video/narration.mp3
npx explainkit frames my-video --at 2,10,25   # look at stills before rendering anything
npx explainkit build my-video                 # my-video/out/video.mp4
```

## Los tres formatos en `examples/`

Cada uno es un proyecto completo (guion, plan, escenas propias, mezcla) escrito desde cero para este repositorio. Copia uno y cambia la historia.

| Ejemplo | Formato | Qué mirar |
|---|---|---|
| [`examples/boat`](examples/boat) | "Lo construimos, problema por problema": un objeto se topa con un problema, recibe una solución y se topa con el siguiente problema | Una sola escena `tank` que dibuja cinco situaciones distintas a partir de un parámetro, y escenas `card` que numeran cada PROBLEM y FIX |
| [`examples/lighthouse`](examples/lighthouse) | Una serie "DAY N" en segunda persona, con reglas, un reloj y un monitor de ritmo cardíaco, que termina en una votación | Un envoltorio de escena que superpone el día y el reloj en cada plano, el monitor `pulse` controlado desde el plan |
| [`examples/endurance`](examples/endurance) | Una historia real contada con siluetas, con el protagonista en cada plano | Formas planas, una corrección de color distinta por plano, una silueta `man()` que se reutiliza en todas las escenas |

## Cómo funciona

```
script.txt ──┐
narration ───┼─► align ─► words.json ──┐
             │   (estimate | whisper | your file)
plan.js ─────┴──────────────────────────┼─► shots + captions ─► render (Chromium canvas ─► ffmpeg) ─► video.mp4
scenes.js ──────────────────────────────┘                                  ▲
mix.json + your music ─► mix (duck under voice, -14 LUFS) ─► audio-final.m4a ┘
```

1. **Guion y plan.** `plan.js` es una lista de planos: `['the words where it starts', 'sceneName', { params }, 'LABEL']`. Un plano empieza cuando el narrador dice sus palabras ancla y dura hasta la siguiente ancla, así que la imagen siempre sigue a la voz y cambiar la narración no rompe el montaje.
2. **Tiempos.** `explainkit align` escribe `out/words.json` (`[{ "text", "start", "end" }]`).
   - `estimate` (por defecto): reparte tus palabras sobre el habla que encuentra en el audio, o sobre una duración calculada a velocidad de lectura cuando no hay audio. En una narración de prueba de 42 palabras se desvió 0,25 s en promedio y 0,66 s en el peor caso frente a whisper (medido el 31 de octubre de 2026, con una sola voz: tómalo como un borrador, no como una garantía).
   - `whisper`: `--engine whisper --model ggml-base.bin` usa [whisper.cpp](https://github.com/ggerganov/whisper.cpp) (`whisper-cli`) para obtener los tiempos exactos de cada palabra. El modelo lo descargas tú.
   - trae tu propio `words.json`, o un JSON de whisper.cpp: se leen ambos.
3. **Escenas.** Una escena es una función `ESC.name = (p, P, T) => { ... }` que dibuja un plano completo en un lienzo de 1080x1920: `p` es el progreso dentro del plano (de 0 a 1), `P` sus parámetros y `T` el tiempo absoluto. El mismo `T` siempre da el mismo fotograma, así que puedes revisar cualquier segundo sin renderizar el video (`explainkit frames`). `src/runtime/draw.js` tiene las funciones de dibujo (fondos, resplandor, estrellas, silueta de una ciudad, reloj, teléfono, globo de diálogo...), `character.js` un personaje articulado con ocho expresiones y `scenes.js` unas pocas escenas genéricas (`title`, `face`, `dialogue`, `calendar`, `sunrise`...).
4. **Superposición.** Los planos largos se reencuadran cada 2,3 s para que una escena estática se siga leyendo como cortes. Los subtítulos tienen de 1 a 3 palabras, se cortan en la puntuación y en las pausas, y nunca dejan una palabra como "el" suelta al final. Monitor de ritmo cardíaco opcional (`"pulse": true`). Encierra una palabra entre asteriscos en el guion (`Un bloque sólido *hunde* como una roca.`) para colorearla en dorado en su subtítulo; los asteriscos no se pronuncian.
5. **Voz.** Una voz es un archivo de audio que tú aportas. Adaptadores opcionales: `explainkit tts --engine command --cmd 'espeak-ng -f {in} -w {out}'` para cualquier programa de texto a voz, o `--engine kokoro` para la voz abierta Kokoro-82M mediante el paquete opcional `kokoro-js` (el modelo se descarga en el primer uso, unos 90 MB, desde Hugging Face). Revisa la licencia de la voz que uses antes de publicar. El adaptador de Kokoro sigue la API documentada del paquete, pero los mantenedores todavía no lo han ejecutado de principio a fin ([#14](https://github.com/itzjk/explainkit/issues/14)); el adaptador `command` y la ruta del archivo de audio son los verificados.
6. **Sonido.** `mix.json` lista las pistas de música y los sonidos de impacto. La música se atenúa bajo la voz con compresión sidechain y el resultado se normaliza a -14 LUFS (un ejemplo de 42 segundos midió -14,3 LUFS). Los sonidos integrados `synth:pad`, `synth:drone`, `synth:boom`, `synth:tick` y `synth:rise` se calculan a partir de ondas sinusoidales y ruido, así que no hay audio que licenciar: trae tus propias pistas cuando quieras música de verdad, y usa solo música sobre la que tengas derechos. Este repositorio no contiene audio grabado. `at` (para golpes) y `from` (para entradas de música) aceptan una ancla de palabras en lugar de un segundo fijo — `{ "file": "synth:boom", "at": { "words": "Ahora flota" } }` — así que el cue se mueve con las palabras cuando regrabas la narración. Un ancla que no se encuentra en el guion es un error claro que la nombra.
7. **Renderizado.** Chromium dibuja los fotogramas y ffmpeg codifica H.264 + AAC. Las fuentes (Barlow Condensed, Barlow, JetBrains Mono, todas SIL OFL) se cargan y se verifican antes del primer fotograma, así que el texto es idéntico en macOS, Linux y Windows. Medido en una Mac con Apple silicon: un video de 42 s tardó 51 s de principio a fin (tiempos, mezcla y renderizado).

## Comandos

```
explainkit new <dir>                      create a starter project
explainkit build <dir> [--audio file]     timings + mix + render -> <dir>/out/video.mp4
explainkit frames <dir> --at 3,40,95      stills at those seconds
explainkit sheet <dir> [--every 6]        contact sheet of the whole video
explainkit gallery [--out path]           one still per built-in scene -> out/gallery.jpg
explainkit gif <dir> --from 2 --to 8      animated GIF of a section
explainkit render <dir> [--from --to]     render (or a section) from what is in out/
explainkit align <dir> [--engine estimate|whisper] [--model ggml.bin]
explainkit mix <dir>
explainkit tts <dir> --engine kokoro|command [--voice af_heart] [--cmd "..."]
explainkit doctor
```

`project.json`: `script`, `audio`, `words`, `plan`, `scenes` (lista de archivos), `fixes` (reescriben cómo se escribe una palabra en los subtítulos: `{ "from": "foo", "to": "FOO", "wholeWord": true, "times": 1 }`), `captions`, `pulse`, `reframes`, `labelY`, `captionY`, `tail`, `language` (`en`, `es`, `pt`, `fr`, `de`), `wordsPerSecond`.

`language` es un código de dos letras y por defecto es `en`. Decide con qué palabras nunca termina un subtítulo (artículos, preposiciones, conjunciones y similares), de modo que "el" pasa al siguiente subtítulo en lugar de quedar colgado al final de este. Hay listas para `en`, `es`, `pt`, `fr` y `de`; cualquier otro código usa la lista en inglés. Con `es`, un número escrito `1,000` se muestra como `1.000`. El motor `whisper` también entrega el código a whisper.cpp como el idioma que debe transcribir, así que usa el código que este conoce: `pt`, no `pt-BR`.

## Lo que no hace

- Sin avatares y sin sincronización labial: dibuja escenas, no genera personas hablando.
- No crea una voz por ti. La voz es un archivo.
- No es un editor de video general. Hace bien una sola cosa: videos explicativos verticales con narración, construidos a partir de escenas dibujadas.

## Cómo contribuir

Los issues y pull requests son bienvenidos. Consulta [CONTRIBUTING.md](CONTRIBUTING.md). Los "good first issue" están etiquetados y cada uno tiene una línea "done when" que dice cuándo se da por terminado. `npm test` renderiza cada ejemplo, así que se detecta cualquier cambio que rompa una escena.

## Licencia

MIT para el código (ver [LICENSE](LICENSE)). Las fuentes son SIL OFL 1.1 ([fonts/](fonts)). Los guiones de los ejemplos son originales de este repositorio y también son MIT.
