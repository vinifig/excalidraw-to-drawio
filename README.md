# Excalidraw → draw.io

Client-side converter from Excalidraw scenes (`.excalidraw`, `.json` or exported `.svg`) to draw.io diagrams, Mermaid flowcharts or PlantUML diagrams. Open `index.html` in a browser. There's no build step and nothing is uploaded.

## Layout

```
index.html               page markup
styles.css               page styles
src/converter-drawio.js  Excalidraw JSON -> draw.io XML (presets, styles, frames, flowchart)
src/converter-text.js    Excalidraw JSON -> Mermaid / PlantUML (shapes, links, frames as groups)
src/svg-extract.js       finds the Excalidraw scene embedded in an exported SVG
src/output.js            diagram summary and "Open in draw.io / Mermaid Live / PlantUML" links
src/main.js              UI wiring (drop/paste input, style presets, result actions)
test/                    unit tests (node:test, no dependencies)
.github/workflows/       CI running the tests
```

The `src/` modules are plain scripts (no build step). They set `window.ExcDrawio`, `window.ExcText`, `window.ExcSvg` and `window.ExcOutput` in the browser and `module.exports` in Node.

## Converter API

```js
ExcDrawio.convertExcalidrawToDrawio(sceneJsonOrObject, options) // -> draw.io XML string
```

`options` is a preset name (`'excalidraw'`, `'drawio'`, `'flowchart'`) or `{ preset, ...overrides }`. See `OPTION_DEFS` and `PRESETS` in `src/converter-drawio.js` for every option and its values.

```js
ExcText.toMermaid(sceneJsonOrObject, { direction: 'auto' | 'TB' | 'LR', colors: 'keep' | 'none' })  // -> { text, stats, skipped }
ExcText.toPlantUML(sceneJsonOrObject, { direction, colors })                                       // -> { text, stats, skipped }
```

Text diagrams have no coordinates, so the scene is read as a graph: rectangles, ellipses and diamonds become nodes, arrows bound at both ends become links (labels, dashes and direction kept), and frames become subgraphs / frames. Free-floating text, images, freehand drawings and loose arrows are left out and counted in `skipped`. PlantUML output is a free-form (deployment-style) diagram: ellipses are `usecase`, diamonds `hexagon`, rectangles `rectangle`.

## Tests

Requires Node 20+, with no dependencies to install. CI runs them on every push to `main` and on pull requests.

```sh
npm test
```
