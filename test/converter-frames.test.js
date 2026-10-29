// Frames: containers, frame-relative children, swimlanes and nested frames.
const test = require('node:test');
const assert = require('node:assert/strict');
const { internals } = require('../src/converter-drawio.js');
const { cellsOf, rect, text, arrow, frame } = require('./helpers');
const { nestFrames, elementBox, boxContains } = internals;

const byValue = (cells, value) => cells.find(c => c.value === value);

test('frames become containers named after the frame', () => {
  const [f] = cellsOf([frame({ name: 'Login', x: 10, y: 20, width: 300, height: 200 })]);
  assert.equal(f.value, 'Login');
  assert.equal(f.style.container, '1');
  assert.equal(f.style.collapsible, '0');
  assert.deepEqual(f.geometry, { x: 10, y: 20, width: 300, height: 200 });
});

test('unnamed frames get a default name', () => {
  assert.equal(cellsOf([frame({ name: null })])[0].value, 'Frame');
  assert.equal(cellsOf([frame({ type: 'magicframe', name: undefined })])[0].value, 'AI Frame');
});

test('frame names are escaped', () => {
  assert.equal(cellsOf([frame({ name: 'A <B>' })])[0].value, 'A &lt;B&gt;');
});

test('frames have a white background unless they set one', () => {
  assert.equal(cellsOf([frame()])[0].style.fillColor, '#ffffff');
  assert.equal(cellsOf([frame({ backgroundColor: '#ffc9c9' })])[0].style.fillColor, '#ffc9c9');
  assert.equal(cellsOf([frame()], { frames: 'swimlane' })[0].style.swimlaneFillColor, '#ffffff');
  assert.equal(cellsOf([frame({ backgroundColor: '#ffc9c9' })], { frames: 'swimlane' })[0].style.swimlaneFillColor, '#ffc9c9');
});

test('frames are emitted before (behind) their children', () => {
  const cells = cellsOf([rect({ id: 'r', x: 150, y: 150, frameId: 'f' }), frame({ id: 'f', x: 100, y: 100 })]);
  assert.equal(cells[0].value, 'Frame');
  assert.equal(cells[1].parent, cells[0].id);
});

test('frame children use coordinates relative to the frame', () => {
  // Cells follow the Excalidraw draw order
  const [f, r, a, t] = cellsOf([
    frame({ id: 'f', x: 100, y: 100 }),
    rect({ id: 'r', x: 150, y: 160, frameId: 'f' }),
    arrow({ id: 'a', x: 120, y: 300, points: [[0, 0], [50, 0], [50, 50]], frameId: 'f' }),
    text({ id: 't', x: 300, y: 300, frameId: 'f' })
  ]);
  assert.equal(r.parent, f.id);
  assert.deepEqual([r.geometry.x, r.geometry.y], [50, 60]);
  assert.equal(a.parent, f.id);
  assert.deepEqual(a.sourcePoint, { x: 20, y: 200 });
  assert.deepEqual(a.points, [{ x: 70, y: 200 }]);
  assert.deepEqual(a.targetPoint, { x: 70, y: 250 });
  assert.equal(t.parent, f.id);
  assert.deepEqual([t.geometry.x, t.geometry.y], [200, 200]);
});

test('elements outside any frame stay on the default layer', () => {
  const [, r] = cellsOf([frame({ id: 'f' }), rect({ id: 'r', x: 500, y: 500 })]);
  assert.equal(r.parent, '1');
});

test('frameId pointing to a missing frame falls back to the default layer', () => {
  const [r] = cellsOf([rect({ id: 'r', x: 5, y: 5, frameId: 'gone' })]);
  assert.equal(r.parent, '1');
  assert.deepEqual([r.geometry.x, r.geometry.y], [5, 5]);
});

test('frames keep working with negative scene coordinates', () => {
  const [f, r] = cellsOf([frame({ id: 'f', x: -100, y: -50 }), rect({ id: 'r', x: -80, y: -40, frameId: 'f' })]);
  assert.deepEqual([f.geometry.x, f.geometry.y], [0, 0]);
  assert.deepEqual([r.geometry.x, r.geometry.y], [20, 10]);
});

test('swimlane frames grow a header above their contents', () => {
  const [f, r] = cellsOf([frame({ id: 'f', x: 100, y: 100, width: 400, height: 300 }), rect({ id: 'r', x: 150, y: 160, frameId: 'f' })], { frames: 'swimlane' });
  assert.equal(f.style.swimlane, true);
  assert.equal(f.style.startSize, '26');
  assert.deepEqual(f.geometry, { x: 100, y: 74, width: 400, height: 326 });
  assert.deepEqual([r.geometry.x, r.geometry.y], [50, 86]); // same page position as before
});

// --- Nested frames -----------------------------------------------------------

test('elementBox handles shapes and lines with negative points', () => {
  assert.deepEqual(elementBox({ x: 10, y: 20, width: 30, height: 40 }), { x1: 10, y1: 20, x2: 40, y2: 60 });
  assert.deepEqual(elementBox({ x: 10, y: 20, points: [[0, 0], [-5, 30], [20, -10]] }), { x1: 5, y1: 10, x2: 30, y2: 50 });
});

test('boxContains includes touching edges', () => {
  const outer = { x1: 0, y1: 0, x2: 100, y2: 100 };
  assert.ok(boxContains(outer, { x1: 0, y1: 0, x2: 100, y2: 100 }));
  assert.ok(boxContains(outer, { x1: 10, y1: 10, x2: 20, y2: 20 }));
  assert.ok(!boxContains(outer, { x1: 90, y1: 90, x2: 110, y2: 95 }));
});

test('nestFrames picks the smallest containing frame', () => {
  const big = frame({ id: 'big', x: 0, y: 0, width: 1000, height: 1000 });
  const mid = frame({ id: 'mid', x: 100, y: 100, width: 500, height: 500 });
  const small = frame({ id: 'small', x: 200, y: 200, width: 100, height: 100 });
  const apart = frame({ id: 'apart', x: 2000, y: 0, width: 100, height: 100 });
  const overlap = frame({ id: 'overlap', x: 550, y: 550, width: 100, height: 100 });
  assert.deepEqual(nestFrames([small, apart, big, overlap, mid]), { small: 'mid', mid: 'big', overlap: 'big' });
});

test('nestFrames nests identical frames without a cycle', () => {
  const a = frame({ id: 'a' }), b = frame({ id: 'b' });
  assert.deepEqual(nestFrames([a, b]), { b: 'a' });
});

test('a frame inside another frame becomes its child container', () => {
  const cells = cellsOf([
    frame({ id: 'inner', name: 'Inner', x: 150, y: 150, width: 200, height: 150 }),
    frame({ id: 'outer', name: 'Outer', x: 100, y: 100, width: 500, height: 400 }),
    frame({ id: 'side', name: 'Side', x: 700, y: 100, width: 100, height: 100 })
  ]);
  const outer = byValue(cells, 'Outer'), inner = byValue(cells, 'Inner'), side = byValue(cells, 'Side');
  assert.equal(outer.parent, '1');
  assert.equal(side.parent, '1');
  assert.equal(inner.parent, outer.id);
  assert.deepEqual([inner.geometry.x, inner.geometry.y], [50, 50]);
  assert.ok(cells.indexOf(outer) < cells.indexOf(inner), 'outer frame is emitted first');
});

test('elements of the outer frame that sit inside a nested frame move into it', () => {
  const cells = cellsOf([
    frame({ id: 'outer', name: 'Outer', x: 100, y: 100, width: 500, height: 400 }),
    frame({ id: 'inner', name: 'Inner', x: 150, y: 150, width: 200, height: 150 }),
    rect({ id: 'in', x: 170, y: 170, width: 50, height: 30, frameId: 'outer' }),
    rect({ id: 'out', x: 400, y: 400, width: 50, height: 30, frameId: 'outer' }),
    rect({ id: 'across', x: 300, y: 200, width: 100, height: 30, frameId: 'outer' })
  ]);
  const outer = byValue(cells, 'Outer'), inner = byValue(cells, 'Inner');
  const [inside, outside, across] = cells.slice(2);
  assert.equal(inside.parent, inner.id);
  assert.deepEqual([inside.geometry.x, inside.geometry.y], [20, 20]);
  assert.equal(outside.parent, outer.id);
  assert.deepEqual([outside.geometry.x, outside.geometry.y], [300, 300]);
  assert.equal(across.parent, outer.id);
});

test('nested swimlanes keep page positions', () => {
  const cells = cellsOf([
    frame({ id: 'outer', name: 'Outer', x: 100, y: 100, width: 500, height: 400 }),
    frame({ id: 'inner', name: 'Inner', x: 150, y: 150, width: 200, height: 150 }),
    rect({ id: 'r', x: 170, y: 170, frameId: 'inner' })
  ], { frames: 'swimlane' });
  const outer = byValue(cells, 'Outer'), inner = byValue(cells, 'Inner'), r = cells[2];
  assert.deepEqual([outer.geometry.x, outer.geometry.y], [100, 74]);
  assert.deepEqual([inner.geometry.x, inner.geometry.y], [50, 50]); // 150-26 relative to 74
  assert.equal(r.parent, inner.id);
  assert.deepEqual([r.geometry.x, r.geometry.y], [20, 46]); // 170 relative to 124
});
