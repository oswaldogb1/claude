# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

The production folder of a school play, **"O Mágico de Oz"** (script by the user, adapted from L. Frank Baum), plus **Mesa de Cena**, a Windows app that runs the play's projections and sound cues. The user is a Brazilian teacher: everything the user or the audience sees (app UI, `LEIA-ME.txt`, `deixas.json` texts, commit messages) is in **Brazilian Portuguese**. Code identifiers and comments are Portuguese too.

The repository root **is the play folder** the app reads at runtime:

- `O_Magico_de_Oz_VERSAO_PROFESSOR.docx`: the script. Its 16 empty 4-row tables are the "linhas para anotações de cena" where cues belong.
- Scene backgrounds (user's, 2752×1536 JPEG): `Casa.jpg`, `Vila.jpg`, `Esmeralda.jpg` (yellow brick road + Emerald City, used for every "on the road" transition), `Plantação.jpg`, `Floresta 1.jpg`, `Floresta 2.jpg`, `Sala Mágico.jpg`, `Ozfarsa.jpg`, `Bruxama.jpg`, `fada do sul.jpg`, `quartodorothy.jpg`. **`Sala Mágico.jpg` and `Ozfarsa.jpg` have the same framing** (the giant face becomes the machine), which the `revelar` transition exploits.
- `casa.mp4`: 986×720, silent; only the first 15 s have picture (house flying in the cyclone), the remaining 83 minutes are black. Cues play 0–14.95 s.
- `001`…`009 *.mp3`: the user's instrumental tracks, one per scene. Loudness differs by 12 dB; `deixas.json > midia > <file> > ganho` (dB) evens them out (measured with ffmpeg ebur128, target ≈ −18 LUFS, peak-limited).
- `efeitos/`: sound effects found online (CC0 / public domain / CC-BY), processed to OGG; `imagens/`: extra images; `CREDITOS.txt` lists author and license of each. Keep it updated when adding media.
- `deixas.json`: **the cue list** (see below). The app reads it at startup; editing it needs no rebuild.
- `Roteiro do Operador.docx`: the script with every cue written into the annotation tables (generated, see Commands).
- `Mesa de Cena - O Magico de Oz.exe`: the built app (portable, ~86 MB; GitHub's limit is 100 MB per file). It must sit in this folder.
- `app/`: the app source (Electron).

## Commands

```bash
cd app && npm install                      # electron 43 + electron-builder 26 (devDependencies)
npx electron app                           # run from the repo root (dev: the play folder is app/..)
cd app && npx electron-builder --win portable --x64   # -> app/dist/Mesa de Cena - O Magico de Oz.exe (works on Linux, no wine)
cp "app/dist/Mesa de Cena - O Magico de Oz.exe" .     # publish next to the media
python3 app/ferramentas/roteiro_operador.py .          # regenerate "Roteiro do Operador.docx" from deixas.json (python-docx)
```

There are no automated tests. To check a change, run the app under `xvfb-run -a -s "-screen 0 1920x1080x24"` and drive it with Playwright's `_electron` (press Enter on the mesa page, screenshot the palco page); `window.__mesa` (motor, audio, roteiro) and `window.__palco` expose internals. Env vars: `MESA_PASTA=<folder>` forces the play folder, `MESA_TESTE=1` skips the close confirmation. Ctrl+Shift+F12 opens DevTools on the mesa.

## Architecture (`app/`)

- `main.js`: two windows. **mesa** (operator UI) goes on the internal/laptop display; **palco** (projection) goes fullscreen on an external display, or a small window when there is only one screen (it moves by itself when a projector is plugged in). A privileged `oz://` protocol serves `oz://local/app/*` (the UI, from `app/ui`) and `oz://local/midia/*` (the play folder, with HTTP Range support so audio/video can seek). Same origin for both, so Web Audio can use the media elements. The play folder is found via `MESA_PASTA`, `PORTABLE_EXECUTABLE_DIR` (set by the portable exe), the exe's folder, `app/..`, or a folder the user picked (saved in `%APPDATA%/…/config.json`). Also: blocks display sleep, stops Ctrl+R/F5 reloads, forwards key presses from the palco window to the mesa, saves the session (`sessao.json`) for "continue where you stopped".
- `ui/mesa.js`: operator UI. ENTER = next cue (repeat presses within `prefs.intervalo` are ignored), Backspace = undo, ↑/↓ = choose next cue, Esc = fade all sound (twice = cut), B = blackout, PageDown/PageUp for presentation clickers. Renders the script with cue markers, a live preview of the projector (`capturePage` every 0.7 s), sound panel and bus faders.
- `ui/motor-deixas.js`: cue engine. Every action in a cue updates a declarative **model** (`reduzir`) and is executed (now or after `em` seconds). Before each cue a snapshot (model + live audio positions) is stored so **undo** can restore it; **comecarDe(i)** rebuilds the model by replaying cues 0…i−1 (only looping music is restored). The `raios` generator pairs lightning flashes with thunder at fixed `tempos` (synced to music accents) and/or random `intervalo`.
- `ui/motor-audio.js`: Web Audio. Buses música/ambiente/efeitos → master → limiter. One music at a time (HTMLAudioElement, crossfaded), looping ambiences and one-shot effects (decoded AudioBuffers, preloaded at startup). Volumes are 0–100 % mapped as (v/100)².
- `ui/palco.js` + `ui/efeitos.js`: projection renderer. Background layers with transitions (`dissolver`, `corte`, `preto`, `branco`, `redemoinho`, `cortina`, `revelar`, `zoom`, `magia`), CSS filters (`sepia` for Kansas), Ken Burns `movimento`, video layer, overlay images, flash/tremor/escuro/tinta/blackout/títulos, and canvas effects on two canvases (normal, and "luz" blended with `screen`). Effect positions are fractions **of the background image** (converted to the screen by `paraTela`, so they stay on the painted torches/window even when the projector crops). `estado` applies a whole model (used by undo, "start here" and when the palco window reloads).

## deixas.json

`roteiro` is the script in order: `{"cena"}`, `{"fala", "texto"}`, `{"rubrica"}`, and `{"deixa": {"nome", "quando", "acoes": [...]}}`. Cue numbers are just their order. Each action has one verb key plus options, and an optional `em` (delay in seconds):

- sound: `musica` (`volume`, `fadeIn`, `inicio`, `fim`, `loop`, `transicao`), `musicaVolume`, `pararMusica`, `ambiente` (+`id`), `ambienteVolume`, `pararAmbiente` (id or `"todos"`), `som` (`volume`, `velocidade`, `pan`, `duracao`, `fadeOut`), `silencio`.
- image: `imagem` (`transicao`, `duracao`, `filtro` {brilho, contraste, saturacao, sepia, matiz, desfoque}, `movimento`, `limparEfeitos`), `filtro` (+`fade`), `video` (`inicio`, `fim`, `duracao`), `pararVideo`, `limparFundo`, `sobrepor`/`tirar`, `titulo`/`pararTitulo`, `escuro`, `tinta`, `blackout`, `flash`, `tremor`.
- effects: `efeito` = chuva, detritos, poeira, brilhos (modo campo/chuva/subir/explosao/espiral), vagalumes, nevoa, fumaca, vapor, chamas (+`rajadas`, `disparar`), raiosDeLuz, bolha, coracao (`batidas`), redemoinho, estrelas, tremeluzir, vinheta, anel, clarao. Persistent effects (no `duracao`) are cleared on the next `imagem` unless `fixo: true`. `parar` stops an effect or generator by id (or `"todos"`). `raios` = lightning+thunder generator.

The cue list was generated once by a script and is now maintained by hand. When cues change, regenerate the operator docx and rebuild nothing (the exe reads the JSON).
