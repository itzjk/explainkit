[English](README.md) · [Español](README.es.md) · **Português**

# explainkit

**Transforme um roteiro e uma narração em um vídeo explicativo 2D vertical (1080x1920, 30 fps) com planos, legendas palavra por palavra e uma trilha sonora mixada. Tudo roda na sua máquina. Licença MIT.**

![Um barco de aço emborca e uma quilha o endireita](docs/boat.gif) ![Um faroleiro diante de uma porta, as batidas começam](docs/lighthouse.gif) ![Um navio preso no gelo, silhuetas](docs/endurance.gif)

*Três exemplos prontos, todos desenhados por este motor a partir dos arquivos em `examples/`. Os GIFs são prévias sem som.*

Você escreve a narração e uma lista curta de planos (shots). explainkit descobre o segundo em que cada palavra é falada, faz cada plano começar nas suas palavras, desenha cada quadro no Chromium sem interface (headless), escreve as legendas, abaixa a música sob a voz (ducking), normaliza a sonoridade e codifica o arquivo. Sem linha do tempo, sem editor, sem upload: nada sai do seu computador.

## Início rápido

Você precisa do Node 20+ e do ffmpeg (`brew install ffmpeg`, `sudo apt install ffmpeg` ou `winget install Gyan.FFmpeg`).

```bash
git clone https://github.com/itzjk/explainkit && cd explainkit
npm install
npx playwright install chromium
npm run doctor      # checks ffmpeg, Chromium and the bundled fonts
npm run example     # renders examples/boat -> examples/boat/out/video.mp4
```

O primeiro exemplo é renderizado **sem arquivo de narração**: os tempos são estimados a partir do roteiro em uma velocidade de leitura calma e a trilha sonora é música gerada. Esse é o modo storyboard, e ele não precisa de voz, conta nem download. Quando você tiver uma voz, é só incluí-la:

```bash
npx explainkit build examples/boat --audio my-voice.mp3
```

### Seu próprio vídeo em quatro comandos

```bash
npx explainkit new my-video          # starter project: script.txt, plan.js, scenes.js, mix.json
# edit my-video/script.txt and my-video/plan.js, put your voice at my-video/narration.mp3
npx explainkit frames my-video --at 2,10,25   # look at stills before rendering anything
npx explainkit build my-video                 # my-video/out/video.mp4
```

## Os três formatos em `examples/`

Cada um é um projeto completo (roteiro, plano, cenas próprias, mixagem) escrito do zero para este repositório. Copie um e mude a história.

| Exemplo | Formato | O que observar |
|---|---|---|
| [`examples/boat`](examples/boat) | "Construímos, problema por problema": um objeto encontra um problema, ganha uma solução e encontra o próximo problema | Uma única cena `tank` que desenha cinco situações diferentes a partir de um parâmetro, e cenas `card` que numeram cada PROBLEM e FIX |
| [`examples/lighthouse`](examples/lighthouse) | Uma série "DAY N" em segunda pessoa, com regras, um relógio e um monitor de batimentos cardíacos, que termina em uma votação | Um wrapper de cena que carimba o dia e o relógio em cada plano, o monitor `pulse` controlado pelo arquivo de plano |
| [`examples/endurance`](examples/endurance) | Uma história real contada em silhuetas, com o protagonista em cada plano | Formas planas, uma correção de cor por plano, uma silhueta `man()` reaproveitada em todas as cenas |

## Como funciona

```
script.txt ──┐
narration ───┼─► align ─► words.json ──┐
             │   (estimate | whisper | your file)
plan.js ─────┴──────────────────────────┼─► shots + captions ─► render (Chromium canvas ─► ffmpeg) ─► video.mp4
scenes.js ──────────────────────────────┘                                  ▲
mix.json + your music ─► mix (duck under voice, -14 LUFS) ─► audio-final.m4a ┘
```

1. **Roteiro e plano.** `plan.js` é uma lista de planos: `['the words where it starts', 'sceneName', { params }, 'LABEL']`. Um plano começa quando o narrador diz suas palavras-âncora e dura até a próxima âncora, então a imagem sempre acompanha a voz e mudar a narração não quebra a edição.
2. **Tempos.** `explainkit align` grava `out/words.json` (`[{ "text", "start", "end" }]`).
   - `estimate` (padrão): distribui suas palavras ao longo da fala que encontra no áudio, ou ao longo de uma duração calculada em velocidade de leitura quando não há áudio. Em uma narração de teste de 42 palavras, ele errou 0,25 s em média e 0,66 s no pior caso em relação ao whisper (medido em 31 de outubro de 2026, com uma só voz: trate como rascunho, não como garantia).
   - `whisper`: `--engine whisper --model ggml-base.bin` usa o [whisper.cpp](https://github.com/ggerganov/whisper.cpp) (`whisper-cli`) para obter os tempos exatos de cada palavra. O modelo você mesmo baixa.
   - traga seu próprio `words.json`, ou um JSON do whisper.cpp: os dois são lidos.
3. **Cenas.** Uma cena é uma função `ESC.name = (p, P, T) => { ... }` que desenha um plano inteiro em um canvas de 1080x1920: `p` é o progresso dentro do plano (de 0 a 1), `P` seus parâmetros e `T` o tempo absoluto. O mesmo `T` sempre gera o mesmo quadro, então você pode conferir qualquer segundo sem renderizar o vídeo (`explainkit frames`). `src/runtime/draw.js` traz as funções de desenho (fundos, brilho, estrelas, skyline de cidade, relógio, celular, balão de fala...), `character.js` um personagem articulado com oito expressões e `scenes.js` algumas cenas genéricas (`title`, `face`, `dialogue`, `calendar`, `sunrise`...).
4. **Sobreposição.** Planos longos são reenquadrados a cada 2,3 s para que uma cena parada ainda seja lida como cortes. As legendas têm de 1 a 3 palavras, são cortadas na pontuação e nas pausas, e nunca deixam uma palavra como "o" sozinha no fim. Monitor de batimentos cardíacos opcional (`"pulse": true`).
5. **Voz.** Uma voz é um arquivo de áudio que você fornece. Adaptadores opcionais: `explainkit tts --engine command --cmd 'espeak-ng -f {in} -w {out}'` para qualquer programa de texto para fala, ou `--engine kokoro` para a voz aberta Kokoro-82M por meio do pacote opcional `kokoro-js` (o modelo é baixado no primeiro uso, cerca de 90 MB, do Hugging Face). Verifique a licença de qualquer voz que você usar antes de publicar. O adaptador do Kokoro segue a API documentada do pacote, mas os mantenedores ainda não o executaram de ponta a ponta ([#14](https://github.com/itzjk/explainkit/issues/14)); o adaptador `command` e o caminho do arquivo de áudio são os verificados.
6. **Som.** `mix.json` lista as faixas de música e os sons de impacto. A música é abaixada sob a voz com compressão sidechain e o resultado é normalizado para -14 LUFS (um exemplo de 42 segundos mediu -14,3 LUFS). Os sons embutidos `synth:pad`, `synth:drone`, `synth:boom`, `synth:tick` e `synth:rise` são calculados a partir de ondas senoidais e ruído, então não há áudio para licenciar: traga suas próprias faixas quando quiser música de verdade, e use apenas música sobre a qual você tenha direitos. Este repositório não contém áudio gravado.
7. **Renderização.** O Chromium desenha os quadros e o ffmpeg codifica H.264 + AAC. As fontes (Barlow Condensed, Barlow, JetBrains Mono, todas SIL OFL) são carregadas e verificadas antes do primeiro quadro, então o texto é idêntico no macOS, no Linux e no Windows. Medido em um Mac com Apple silicon: um vídeo de 42 s levou 51 s de ponta a ponta (tempos, mixagem e renderização).

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

`project.json`: `script`, `audio`, `words`, `plan`, `scenes` (lista de arquivos), `fixes` (reescrevem como uma palavra aparece nas legendas: `{ "from": "foo", "to": "FOO", "wholeWord": true, "times": 1 }`), `captions`, `pulse`, `reframes`, `labelY`, `captionY`, `tail`, `language` (`en`, `es`, `pt`, `fr`), `wordsPerSecond`.

`language` é um código de duas letras e o padrão é `en`. Ele decide em quais palavras uma legenda nunca termina (artigos, preposições, conjunções e afins), de modo que "o" passa para a legenda seguinte em vez de ficar pendurado no fim desta. Existem listas para `en`, `es`, `pt` e `fr`; qualquer outro código usa a lista do inglês. Com `es`, um número escrito `1,000` aparece na legenda como `1.000`. O motor `whisper` também entrega o código ao whisper.cpp como o idioma a transcrever, então use o código que ele conhece: `pt`, não `pt-BR`.

## O que ele não faz

- Sem avatares e sem sincronia labial: ele desenha cenas, não gera pessoas falando.
- Ele não cria uma voz para você. A voz é um arquivo.
- Não é um editor de vídeo geral. Faz bem uma coisa só: vídeos explicativos verticais narrados, montados a partir de cenas desenhadas.

## Como contribuir

Issues e pull requests são bem-vindos. Veja o [CONTRIBUTING.md](CONTRIBUTING.md). Os "good first issue" são etiquetados e cada um tem uma linha "done when" que diz quando considerá-lo concluído. O `npm test` renderiza todos os exemplos, então qualquer mudança que quebre uma cena é detectada.

## Licença

MIT para o código (veja [LICENSE](LICENSE)). As fontes são SIL OFL 1.1 ([fonts/](fonts)). Os roteiros dos exemplos são originais deste repositório e também são MIT.
