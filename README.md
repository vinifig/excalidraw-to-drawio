# Excalidraw → draw.io

Client-side converter from Excalidraw scenes (`.excalidraw`, `.json` or exported `.svg`) to draw.io diagrams. Open `index.html` in a browser. There's no build step and nothing is uploaded.

## Layout

```
index.html               page markup
styles.css               page styles
src/converter-drawio.js  Excalidraw JSON -> draw.io XML (presets, styles, frames, flowchart)
src/svg-extract.js       finds the Excalidraw scene embedded in an exported SVG
src/main.js              UI wiring (file input, style options, download)
test/                    unit tests (node:test, no dependencies)
```

`src/converter-drawio.js` and `src/svg-extract.js` are plain scripts. They set `window.ExcDrawio` / `window.ExcSvg` in the browser and `module.exports` in Node.

## Converter API

```js
ExcDrawio.convertExcalidrawToDrawio(sceneJsonOrObject, options) // -> draw.io XML string
```

`options` is a preset name (`'excalidraw'`, `'drawio'`, `'flowchart'`) or `{ preset, ...overrides }`. See `OPTION_DEFS` and `PRESETS` in `src/converter-drawio.js` for every option and its values.

## Tests

Requires Node 18+, with no dependencies to install:

```sh
npm test
```
