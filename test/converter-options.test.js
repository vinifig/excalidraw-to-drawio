// Style options and presets: colors, corners, sketch, fonts, strokes, arrowheads, canvas.
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveOptions, PRESETS, OPTION_DEFS, internals } = require('../src/converter-drawio.js');
const { convert, cellsOf, rect, ellipse, diamond, text, arrow } = require('./helpers');
const { colorFamily, excalidrawCornerRadius, mapArrow, mapFont } = internals;

const one = (el, options) => cellsOf([el], options)[0];

// --- Presets & option resolution -------------------------------------------

test('every preset sets a valid value for every option', () => {
  for(const [name, preset] of Object.entries(PRESETS)){
    for(const def of OPTION_DEFS){
      assert.ok(def.choices.some(c => c[0] === preset[def.key]), `${name}.${def.key} = ${preset[def.key]}`);
    }
  }
});

test('resolveOptions defaults to the Excalidraw preset', () => {
  assert.deepEqual(resolveOptions(), PRESETS.excalidraw);
  assert.deepEqual(resolveOptions({ preset: 'unknown' }), PRESETS.excalidraw);
});

test('resolveOptions accepts a preset name', () => {
  assert.deepEqual(resolveOptions('drawio'), PRESETS.drawio);
  assert.deepEqual(resolveOptions('flowchart'), PRESETS.flowchart);
});

test('resolveOptions applies valid overrides and ignores invalid ones', () => {
  const opts = resolveOptions({ preset: 'drawio', colors: 'keep', roundness: 'bogus' });
  assert.equal(opts.colors, 'keep');
  assert.equal(opts.roundness, PRESETS.drawio.roundness);
  assert.equal(opts.font, PRESETS.drawio.font);
});

test('custom preset starts from the Excalidraw preset', () => {
  assert.deepEqual(resolveOptions({ preset: 'custom', sketch: 'on' }), Object.assign({}, PRESETS.excalidraw, { sketch: 'on' }));
});

test('converting does not mutate the presets', () => {
  const before = JSON.stringify(PRESETS);
  cellsOf([rect()], 'flowchart');
  assert.equal(JSON.stringify(PRESETS), before);
});

// --- Colors ------------------------------------------------------------------

test('colorFamily classifies Excalidraw palette colors', () => {
  const cases = {
    '#1e1e1e': 'black', '#000000': 'black', '#ffffff': 'white', '#868e96': 'gray',
    '#e03131': 'red', '#ffc9c9': 'red', '#e64980': 'red', '#f08c00': 'orange',
    '#ffec99': 'yellow', '#2f9e44': 'green', '#b2f2bb': 'green', '#1971c2': 'blue',
    '#a5d8ff': 'blue', '#6741d9': 'purple', '#fff': 'white', 'not-a-color': 'black'
  };
  for(const [color, family] of Object.entries(cases)) assert.equal(colorFamily(color), family, color);
});

test('colors=keep keeps Excalidraw colors', () => {
  const c = one(rect({ strokeColor: '#e03131', backgroundColor: '#ffc9c9' }));
  assert.equal(c.style.strokeColor, '#e03131');
  assert.equal(c.style.fillColor, '#ffc9c9');
});

test('colors=keep defaults a missing stroke to black', () => {
  assert.equal(one(rect({ strokeColor: undefined })).style.strokeColor, '#000000');
});

test('colors=palette maps to draw.io fill/stroke pairs', () => {
  const filled = one(rect({ strokeColor: '#1e1e1e', backgroundColor: '#a5d8ff' }), { colors: 'palette' });
  assert.equal(filled.style.fillColor, '#dae8fc');
  assert.equal(filled.style.strokeColor, '#6c8ebf'); // black outline follows the fill family
  const outlined = one(rect({ strokeColor: '#e03131' }), { colors: 'palette' });
  assert.equal(outlined.style.strokeColor, '#b85450');
  assert.equal(outlined.style.fillColor, 'none');
  const plain = one(rect({ strokeColor: '#1e1e1e' }), { colors: 'palette' });
  assert.equal(plain.style.strokeColor, undefined); // draw.io default black
});

test('colors=palette maps text colors', () => {
  assert.equal(one(text({ strokeColor: '#e03131' }), { colors: 'palette' }).style.fontColor, '#b85450');
  assert.equal(one(text({ strokeColor: '#1e1e1e' }), { colors: 'palette' }).style.fontColor, undefined);
});

test('colors=default drops all colors', () => {
  const c = one(rect({ strokeColor: '#e03131', backgroundColor: '#ffc9c9' }), { colors: 'default' });
  assert.equal(c.style.strokeColor, undefined);
  assert.equal(c.style.fillColor, undefined);
  assert.equal(one(text({ strokeColor: '#e03131' }), { colors: 'default' }).style.fontColor, undefined);
});

test('transparentFill controls shapes without a background', () => {
  assert.equal(one(rect(), { transparentFill: 'keep' }).style.fillColor, 'none');
  assert.equal(one(rect(), { transparentFill: 'white' }).style.fillColor, undefined);
  assert.equal(one(rect(), { colors: 'default', transparentFill: 'keep' }).style.fillColor, 'none');
});

test('edges use the resolved stroke color', () => {
  assert.equal(one(arrow({ strokeColor: '#2f9e44' })).style.strokeColor, '#2f9e44');
  assert.equal(one(arrow({ strokeColor: '#2f9e44' }), { colors: 'palette' }).style.strokeColor, '#82b366');
  assert.equal(one(arrow({ strokeColor: '#2f9e44' }), { colors: 'default' }).style.strokeColor, undefined);
});

// --- Corners -----------------------------------------------------------------

test('excalidrawCornerRadius follows Excalidraw adaptive / proportional radius', () => {
  assert.equal(excalidrawCornerRadius({ width: 100, height: 50, roundness: { type: 3 } }), 12.5);
  assert.equal(excalidrawCornerRadius({ width: 400, height: 200, roundness: { type: 3 } }), 32);
  assert.equal(excalidrawCornerRadius({ width: 100, height: 50, roundness: { type: 3, value: 10 } }), 10);
  assert.equal(excalidrawCornerRadius({ width: 100, height: 50, roundness: { type: 2 } }), 12.5);
  assert.equal(excalidrawCornerRadius({ width: 400, height: 200, roundness: { type: 2 } }), 50);
});

test('roundness=keep uses the exact Excalidraw radius', () => {
  const c = one(rect({ roundness: { type: 3 } }));
  assert.equal(c.style.rounded, '1');
  assert.equal(c.style.absoluteArcSize, '1');
  assert.equal(c.style.arcSize, '25');
  assert.equal(one(rect({ roundness: null })).style.rounded, undefined);
});

test('roundness=drawio uses draw.io rounding only for rounded shapes', () => {
  const rounded = one(rect({ roundness: { type: 3 } }), { roundness: 'drawio' });
  assert.equal(rounded.style.rounded, '1');
  assert.equal(rounded.style.arcSize, undefined);
  assert.equal(one(rect({ roundness: null }), { roundness: 'drawio' }).style.rounded, undefined);
});

test('roundness=square and roundness=round force corners', () => {
  assert.equal(one(rect({ roundness: { type: 3 } }), { roundness: 'square' }).style.rounded, undefined);
  assert.equal(one(rect({ roundness: null }), { roundness: 'round' }).style.rounded, '1');
  assert.equal(one(diamond({ roundness: null }), { roundness: 'round' }).style.rounded, '1');
  assert.equal(one(ellipse(), { roundness: 'round' }).style.rounded, undefined);
});

test('curved lines: roundness + more than two points, not elbow arrows', () => {
  const pts = [[0, 0], [50, 30], [100, 0]];
  assert.equal(one(arrow({ points: pts, roundness: { type: 2 } })).style.curved, '1');
  assert.equal(one(arrow({ points: pts, roundness: null })).style.curved, undefined);
  assert.equal(one(arrow({ points: pts, roundness: null })).style.rounded, '0');
  assert.equal(one(arrow({ points: pts, roundness: { type: 2 }, elbowed: true })).style.curved, undefined);
  assert.equal(one(arrow({ roundness: { type: 2 } })).style.curved, undefined); // two points
  assert.equal(one(arrow({ points: pts, roundness: { type: 2 } }), { roundness: 'square' }).style.curved, undefined);
  assert.equal(one(arrow({ points: pts }), { roundness: 'round' }).style.rounded, '1');
});

// --- Sketch ------------------------------------------------------------------

test('sketch=keep follows fill style and roughness', () => {
  const hachure = one(rect({ fillStyle: 'hachure', roughness: 1 }));
  assert.equal(hachure.style.sketch, '1');
  assert.equal(hachure.style.fillStyle, 'hachure');
  assert.equal(hachure.style.sketchFactor, '0.50');
  const rough = one(rect({ fillStyle: 'solid', roughness: 2 }));
  assert.equal(rough.style.sketch, '1');
  assert.equal(rough.style.fillStyle, 'solid');
  assert.equal(one(rect({ fillStyle: 'solid', roughness: 1 })).style.sketch, undefined);
});

test('sketch=on / off force the hand-drawn look', () => {
  assert.equal(one(rect({ fillStyle: 'solid', roughness: 0 }), { sketch: 'on' }).style.sketch, '1');
  assert.equal(one(rect({ fillStyle: 'cross-hatch' }), { sketch: 'off' }).style.sketch, undefined);
  const edge = one(arrow({ fillStyle: 'hachure' }), { sketch: 'on' });
  assert.equal(edge.style.sketch, '1');
  assert.equal(edge.style.fillStyle, undefined);
});

// --- Fonts -------------------------------------------------------------------

test('mapFont maps Excalidraw font ids', () => {
  const keep = { font: 'keep' };
  assert.equal(mapFont(1, keep).family, 'Architects Daughter');
  assert.equal(mapFont(5, keep).family, 'Architects Daughter');
  assert.match(decodeURIComponent(mapFont(5, keep).source), /fonts\.googleapis\.com\/css\?family=Architects\+Daughter/);
  assert.equal(mapFont(2, keep).family, 'Helvetica');
  assert.equal(mapFont(4, keep).family, 'Helvetica');
  assert.equal(mapFont(3, keep).family, 'Courier New');
  assert.equal(mapFont(8, keep).family, 'Courier New');
  assert.equal(mapFont(6, keep).family, 'Nunito');
  assert.equal(mapFont(7, keep).family, 'Lilita One');
  assert.equal(mapFont(99, keep).family, 'Helvetica');
  assert.deepEqual(mapFont(1, { font: 'default' }), { family: 'Helvetica' });
});

test('text cells carry the font family and source', () => {
  const c = one(text({ fontFamily: 5 }));
  assert.equal(c.style.fontFamily, 'Architects Daughter');
  assert.ok(c.style.fontSource);
  assert.equal(one(text({ fontFamily: 5 }), { font: 'default' }).style.fontFamily, 'Helvetica');
  assert.equal(one(text({ fontFamily: undefined })).style.fontFamily, undefined);
});

// --- Strokes, opacity, rotation, line shape -----------------------------------

test('strokeWidth keep / default', () => {
  assert.equal(one(rect({ strokeWidth: 4 })).style.strokeWidth, '4');
  assert.equal(one(rect({ strokeWidth: 0.5 })).style.strokeWidth, '1');
  assert.equal(one(rect({ strokeWidth: 4 }), { strokeWidth: 'default' }).style.strokeWidth, undefined);
});

test('strokeStyle dashed / dotted / forced solid', () => {
  assert.equal(one(rect({ strokeStyle: 'dashed' })).style.dashed, '1');
  const dotted = one(arrow({ strokeStyle: 'dotted' }));
  assert.equal(dotted.style.dashed, '1');
  assert.equal(dotted.style.dashPattern, '2 2');
  assert.equal(one(rect({ strokeStyle: 'dashed' }), { strokeStyle: 'solid' }).style.dashed, undefined);
});

test('opacity keep / ignore', () => {
  assert.equal(one(rect({ opacity: 50 })).style.opacity, '50.0');
  assert.equal(one(rect({ opacity: 100 })).style.opacity, undefined);
  assert.equal(one(rect({ opacity: 50 }), { opacity: 'ignore' }).style.opacity, undefined);
});

test('rotation is converted to degrees', () => {
  assert.equal(one(rect({ angle: Math.PI / 2 })).style.rotation, '90');
  assert.equal(one(text({ angle: Math.PI })).style.rotation, '180');
});

test('edgeShape filled / standard', () => {
  const filled = one(arrow());
  assert.equal(filled.style.shape, 'filledEdge');
  assert.equal(filled.style.fillColor, 'none');
  const standard = one(arrow(), { edgeShape: 'standard' });
  assert.equal(standard.style.shape, undefined);
  assert.equal(standard.style.fillColor, undefined);
});

// --- Arrowheads --------------------------------------------------------------

test('mapArrow covers every Excalidraw arrowhead', () => {
  const keep = { arrowheads: 'keep' };
  const cases = {
    arrow: ['open', 0], triangle: ['block', 1], triangle_outline: ['block', 0],
    dot: ['oval', 1], circle: ['oval', 1], circle_outline: ['oval', 0],
    diamond: ['diamond', 1], diamond_outline: ['diamond', 0], bar: ['dash', 0],
    crowfoot_one: ['ERone', 0], crowfoot_many: ['ERmany', 0], crowfoot_one_or_many: ['ERoneToMany', 0],
    none: ['none', 0], null: ['none', 0], something_new: ['open', 0]
  };
  for(const [head, [shape, fill]] of Object.entries(cases)){
    assert.deepEqual(mapArrow(head === 'null' ? null : head, keep), { shape, fill }, head);
  }
  assert.deepEqual(mapArrow(undefined, keep), { shape: 'none', fill: 0 });
  assert.deepEqual(mapArrow('arrow', { arrowheads: 'drawio' }), { shape: 'classic', fill: 1 });
});

test('edges carry start and end arrowheads', () => {
  const c = one(arrow({ startArrowhead: 'dot', endArrowhead: 'triangle' }));
  assert.equal(c.style.startArrow, 'oval');
  assert.equal(c.style.startFill, '1');
  assert.equal(c.style.endArrow, 'block');
  assert.equal(c.style.endFill, '1');
  assert.equal(c.style.endSize, '6');
  const drawio = one(arrow({ endArrowhead: 'arrow' }), { arrowheads: 'drawio' });
  assert.equal(drawio.style.endArrow, 'classic');
  assert.equal(drawio.style.endSize, undefined);
});

// --- Canvas ------------------------------------------------------------------

test('canvas=keep keeps background color and grid', () => {
  const { model } = convert([rect()], 'excalidraw', { appState: { viewBackgroundColor: '#fff9db', gridSize: 20, gridModeEnabled: true } });
  assert.equal(model.background, '#fff9db');
  assert.equal(model.grid, '1');
  assert.equal(model.gridSize, '20');
});

test('canvas=keep: white background is omitted, grid off when disabled', () => {
  const white = convert([rect()], 'excalidraw', { appState: { viewBackgroundColor: '#ffffff', gridSize: 20, gridModeEnabled: false } }).model;
  assert.equal(white.background, undefined);
  assert.equal(white.grid, '0');
  const legacy = convert([rect()], 'excalidraw', { appState: { gridSize: null } }).model;
  assert.equal(legacy.grid, '0');
  const legacyOn = convert([rect()], 'excalidraw', { appState: { gridSize: 10 } }).model;
  assert.equal(legacyOn.grid, '1');
});

test('canvas=default uses draw.io defaults', () => {
  const { model } = convert([rect()], { canvas: 'default' }, { appState: { viewBackgroundColor: '#fff9db', gridModeEnabled: false } });
  assert.equal(model.background, undefined);
  assert.equal(model.grid, '1');
  assert.equal(model.gridSize, '10');
});

// --- draw.io preset end to end -------------------------------------------------

test('drawio preset produces draw.io-default styling', () => {
  const [shape, edge, label] = cellsOf([
    rect({ id: 'r', strokeColor: '#1e1e1e', backgroundColor: '#ffec99', strokeWidth: 2, roughness: 2, fillStyle: 'hachure', roundness: { type: 3 } }),
    arrow({ id: 'a', y: 100, endArrowhead: 'arrow' }),
    text({ id: 't', y: 200, fontFamily: 5 })
  ], 'drawio');
  assert.equal(shape.style.fillColor, '#fff2cc');
  assert.equal(shape.style.strokeColor, '#d6b656');
  assert.equal(shape.style.strokeWidth, undefined);
  assert.equal(shape.style.sketch, undefined);
  assert.equal(shape.style.rounded, '1');
  assert.equal(shape.style.arcSize, undefined);
  assert.equal(edge.style.shape, undefined);
  assert.equal(edge.style.endArrow, 'classic');
  assert.equal(label.style.fontFamily, 'Helvetica');
});
