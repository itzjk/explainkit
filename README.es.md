# explainkit

**Convierte un guion y una narración en un vídeo explicativo vertical en 2D (1080x1920, 30 fps), con escenas, subtítulos palabra por palabra y una banda sonora mezclada. Todo se ejecuta en tu equipo. Licencia MIT.**

[English](README.md) | [Español](README.es.md)

![Un barco de acero vuelca y luego una quilla lo endereza](docs/boat.gif) ![Un farero llega a una puerta y comienzan los golpes](docs/lighthouse.gif) ![Un barco atrapado en el hielo, en siluetas](docs/endurance.gif)

*Tres ejemplos terminados, dibujados por este motor a partir de los archivos de `examples/`. Los GIF son vistas previas sin sonido.*

Escribes la narración y una lista breve de escenas. explainkit encuentra el instante en que se pronuncia cada palabra, inicia cada escena con sus palabras de referencia, dibuja cada fotograma en Chromium sin interfaz, genera los subtítulos, baja el volumen de la música cuando se oye la voz, normaliza el volumen y codifica el vídeo. Sin línea de tiempo, sin editor y sin subir archivos: nada sale de tu equipo.

## Inicio rápido

Necesitas Node 20 o posterior y ffmpeg (`brew install ffmpeg`, `sudo apt install ffmpeg` o `winget install Gyan.FFmpeg`).

```bash
git clone https://github.com/itzjk/explainkit && cd explainkit
npm install
npx playwright install chromium
npm run doctor      # checks ffmpeg, Chromium and the bundled fonts
npm run example     # renders examples/boat -> examples/boat/out/video.mp4
```

El primer ejemplo se renderiza **sin un archivo de narración**: los tiempos se estiman a partir del guion con una velocidad de lectura tranquila y la banda sonora se genera automáticamente. Ese es el modo de storyboard; no necesita voz, cuenta ni descargas. Cuando tengas una voz, añádela así:

```bash
npx explainkit build examples/boat --audio my-voice.mp3
```

### Tu propio vídeo en cuatro comandos

```bash
npx explainkit new my-video          # starter project: script.txt, plan.js, scenes.js, mix.json
# edit my-video/script.txt and my-video/plan.js, put your voice at my-video/narration.mp3
npx explainkit frames my-video --at 2,10,25   # look at stills before rendering anything
npx explainkit build my-video                 # my-video/out/video.mp4
```

## Los tres formatos de `examples/`

Cada uno es un proyecto completo (guion, plan, escenas personalizadas y mezcla) creado desde cero para este repositorio. Copia uno y cambia la historia.

| Ejemplo | Formato | Qué observar |
|---|---|---|
| [`examples/boat`](examples/boat) | «Lo construimos, problema por problema»: un objeto encuentra un problema, recibe una solución y luego encuentra el siguiente | Una escena `tank` que dibuja cinco situaciones distintas a partir de un parámetro, y escenas `card` que numeran cada PROBLEMA y SOLUCIÓN |
| [`examples/lighthouse`](examples/lighthouse) | Una serie «DÍA N» en segunda persona, con reglas, un reloj y un monitor de ritmo cardíaco, que termina con una votación | Un envoltorio de escena que añade el día y el reloj a cada toma; el monitor `pulse` se controla desde el plan |
| [`examples/endurance`](examples/endurance) | Una historia real contada con siluetas, con la protagonista en cada toma | Formas planas, un grado de color por toma y una silueta `man()` reutilizada en todas las escenas |

## Cómo funciona

```
script.txt ──┐
narration ───┼─► align ─► words.json ──┐
             │   (estimate | whisper | your file)
plan.js ─────┴──────────────────────────┼─► shots + captions ─► render (Chromium canvas ─► ffmpeg) ─► video.mp4
scenes.js ─────────────────────────────┘                                  ▲
mix.json + your music ─► mix (duck under voice, -14 LUFS) ─► audio-final.m4a ┘
```

1. **Guion y plan.** `plan.js` es una lista de tomas: `['the words where it starts', 'sceneName', { params }, 'LABEL']`. Cada toma empieza cuando la narración dice sus palabras de referencia y dura hasta las palabras de referencia siguientes. Así, la imagen sigue siempre la voz y cambiar la narración no desajusta la edición.
2. **Tiempos.** `explainkit align` escribe `out/words.json` (`[{ "text", "start", "end" }]`).
   - `estimate` (opción predeterminada): distribuye las palabras a lo largo del habla detectada en el audio o, si no hay audio, según una duración calculada con la velocidad de lectura. En una narración de prueba de 42 palabras, el error medio frente a whisper fue de 0,25 s y el máximo de 0,66 s (medido el 31 de octubre de 2026, con una voz; úsalo como borrador, no como garantía).
   - `whisper`: `--engine whisper --model ggml-base.bin` usa [whisper.cpp](https://github.com/ggerganov/whisper.cpp) (`whisper-cli`) para obtener tiempos exactos por palabra. Tú descargas el modelo.
   - También puedes proporcionar tu propio `words.json` o un JSON de whisper.cpp; se admiten ambos.
3. **Escenas.** Una escena es una función `ESC.name = (p, P, T) => { ... }` que dibuja una toma completa en un lienzo de 1080x1920: `p` es el progreso de la toma (de 0 a 1), `P` son sus parámetros y `T` es el tiempo absoluto. El mismo valor de `T` siempre produce el mismo fotograma, así que puedes revisar cualquier segundo sin renderizar el vídeo (`explainkit frames`). `src/runtime/draw.js` contiene las herramientas de dibujo (fondos, resplandor, estrellas, silueta de ciudad, reloj, teléfono, globo de diálogo, etc.); `character.js` contiene un personaje articulado con ocho expresiones y `scenes.js` incluye escenas genéricas (`title`, `face`, `dialogue`, `calendar`, `sunrise`...).
4. **Superposición.** Las tomas largas cambian el encuadre cada 2,3 s para que una escena fija siga pareciendo una sucesión de cortes. Los subtítulos tienen de 1 a 3 palabras, se dividen en la puntuación y las pausas, y nunca dejan sola al final una palabra como «the». También puedes activar el monitor de ritmo cardíaco (`"pulse": true`).
5. **Voz.** La voz es un archivo de audio que proporcionas. Hay adaptadores opcionales: `explainkit tts --engine command --cmd 'espeak-ng -f {in} -w {out}'` para cualquier programa de texto a voz, o `--engine kokoro` para la voz abierta Kokoro-82M mediante el paquete opcional `kokoro-js` (el modelo se descarga desde Hugging Face la primera vez; ocupa unos 90 MB). Comprueba la licencia de la voz que uses antes de publicar. El adaptador Kokoro sigue la API documentada del paquete, pero los responsables aún no lo han ejecutado de principio a fin ([#14](https://github.com/itzjk/explainkit/issues/14)); el adaptador `command` y el flujo con archivo de audio sí se han verificado.
6. **Sonido.** `mix.json` enumera pistas musicales y efectos. La música baja de volumen cuando se oye la voz mediante compresión sidechain y el resultado se normaliza a -14 LUFS (un ejemplo de 42 segundos midió -14,3 LUFS). Los sonidos integrados `synth:pad`, `synth:drone`, `synth:boom`, `synth:tick` y `synth:rise` se calculan con ondas sinusoidales y ruido, así que no requieren audio con licencia: aporta tus pistas si quieres música real y usa solo música cuyos derechos tengas. Este repositorio no contiene audio grabado.
7. **Renderizado.** Chromium dibuja los fotogramas y ffmpeg codifica H.264 + AAC. Las fuentes (Barlow Condensed, Barlow y JetBrains Mono, todas con licencia SIL OFL) se cargan y verifican antes del primer fotograma, para que el texto sea idéntico en macOS, Linux y Windows. En un Mac con Apple Silicon, un vídeo de 42 s tardó 51 s de principio a fin (tiempos, mezcla y renderizado).

## Comandos

```
explainkit new <dir>                      create a starter project
explainkit build <dir> [--audio file]     timings + mix + render -> <dir>/out/video.mp4
explainkit frames <dir> --at 3,40,95      stills at those seconds
explainkit sheet <dir> [--every 6]        contact sheet of the whole video
explainkit gif <dir> --from 2 --to 8      animated GIF of a section
explainkit render <dir> [--from --to]     render (or a section) from what is in out/
explainkit align <dir> [--engine estimate|whisper] [--model ggml.bin]
explainkit mix <dir>
explainkit tts <dir> --engine kokoro|command [--voice af_heart] [--cmd "..."]
explainkit doctor
```

`project.json`: `script`, `audio`, `words`, `plan`, `scenes` (lista de archivos), `fixes` (reescribe cómo se subtitula una palabra: `{ "from": "foo", "to": "FOO", "wholeWord": true, "times": 1 }`), `captions`, `pulse`, `reframes`, `labelY`, `captionY`, `tail`, `language` (`en`, `es`), `wordsPerSecond`.

## Lo que no hará

- No crea avatares ni sincroniza labios: dibuja escenas, no genera personas hablando.
- No crea una voz por ti. La voz debe ser un archivo.
- No es un editor de vídeo general. Hace bien una cosa: vídeos explicativos verticales narrados y creados a partir de escenas dibujadas.

## Contribuir

Se aceptan incidencias y pull requests. Consulta [CONTRIBUTING.md](CONTRIBUTING.md). Las incidencias para principiantes están etiquetadas y cada una incluye una condición que indica cuándo está terminada. `npm test` renderiza todos los ejemplos para detectar cambios que rompan una escena.

## Licencia

El código está bajo la licencia MIT (consulta [LICENSE](LICENSE)). Las fuentes usan SIL OFL 1.1 ([fonts/](fonts)). Los guiones de ejemplo son originales de este repositorio y también están bajo MIT.
