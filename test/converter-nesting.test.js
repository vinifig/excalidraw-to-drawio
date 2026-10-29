// Shapes inside shapes and draw order (z-order).
const test = require('node:test');
const assert = require('node:assert/strict');
const { internals } = require('../src/converter-drawio.js');
const { toMermaid, toPlantUML } = require('../src/converter-text.js');
const { cellsOf, rect, ellipse, diamond, text, arrow, frame } = require('./helpers');
const { nestShapes, inDrawOrder, containersFirst } = internals;

const label = (containerId, value) => text({ id: `${containerId}-label`, containerId, text: value });
const byValue = (cells, value) => cells.find(c => c.value === value);
const ids = list => list.map(el => el.id);

// The reported case: blocks drawn first, then a transparent block around them
// (on top in Excalidraw, but transparent so the blocks show through).
function blocks(){
  return [
    rect({ id: 'in1', x: 120, y: 120, width: 100, height: 60, backgroundColor: '#a5d8ff' }),
    rect({ id: 'in2', x: 260, y: 120, width: 100, height: 60 }),
    rect({ id: 'out', x: 100, y: 100, width: 300, height: 120 })
  ];
}

// --- Helpers -----------------------------------------------------------------

test('nestShapes picks the smallest shape that fully contains each element', () => {
  const parents = nestShapes([
    rect({ id: 'big', x: 0, y: 0, width: 1000, height: 1000 }),
    rect({ id: 'mid', x: 100, y: 100, width: 400, height: 400 }),
    rect({ id: 'small', x: 150, y: 150, width: 50, height: 50 }),
    rect({ id: 'across', x: 450, y: 450, width: 100, height: 100 }),
    rect({ id: 'outside', x: 2000, y: 0, width: 10, height: 10 })
  ], () => null);
  assert.deepEqual(parents, { mid: 'big', small: 'mid', across: 'big' });
});

test('nestShapes: identical shapes nest without a cycle (first drawn is outer)', () => {
  assert.deepEqual(nestShapes([rect({ id: 'a' }), rect({ id: 'b' })], () => null), { b: 'a' });
});

test('nestShapes: ellipses and diamonds contain, rotated shapes and other types do not', () => {
  const inner = rect({ id: 'in', x: 40, y: 40, width: 10, height: 10 });
  const box = { x: 0, y: 0, width: 100, height: 100 };
  assert.equal(nestShapes([ellipse(Object.assign({ id: 'e' }, box)), inner], () => null).in, 'e');
  assert.equal(nestShapes([diamond(Object.assign({ id: 'd' }, box)), inner], () => null).in, 'd');
  assert.equal(nestShapes([rect(Object.assign({ id: 'r', angle: 0.3 }, box)), inner], () => null).in, undefined);
  assert.equal(nestShapes([Object.assign({ type: 'image', id: 'i' }, box), inner], () => null).in, undefined);
});

test('nestShapes: labels, attached arrows and deleted shapes are not nested', () => {
  const parents = nestShapes([
    rect({ id: 'box', x: 0, y: 0, width: 200, height: 100 }),
    label('box', 'Title'),
    arrow({ id: 'edge', x: 0, y: 10, points: [[0, 0], [50, 0]], startBinding: { elementId: 'box' } }),
    arrow({ id: 'inside', x: 20, y: 50, points: [[0, 0], [50, 0]] }),
    rect({ id: 'gone', x: 10, y: 10, width: 20, height: 20, isDeleted: true })
  ], () => null);
  assert.deepEqual(parents, { inside: 'box' });
});

test('nestShapes only nests within the same frame', () => {
  const frameOf = el => el.frameId || null;
  const parents = nestShapes([
    rect({ id: 'framed', x: 0, y: 0, width: 200, height: 200, frameId: 'F' }),
    rect({ id: 'loose', x: 50, y: 50, width: 20, height: 20 }),
    rect({ id: 'sibling', x: 60, y: 60, width: 20, height: 20, frameId: 'F' })
  ], frameOf);
  assert.deepEqual(parents, { sibling: 'framed' });
});

test('inDrawOrder follows the fractional index when every element has one', () => {
  const els = [rect({ id: 'c', index: 'a2' }), rect({ id: 'a', index: 'a0' }), rect({ id: 'b', index: 'a1' })];
  assert.deepEqual(ids(inDrawOrder(els)), ['a', 'b', 'c']);
  assert.deepEqual(ids(inDrawOrder([rect({ id: 'x', index: 'a1' }), rect({ id: 'y' })])), ['x', 'y']);
});

test('containersFirst moves a container right before its earliest content', () => {
  const els = [rect({ id: 'x' }), rect({ id: 'child' }), rect({ id: 'y' }), rect({ id: 'box' }), rect({ id: 'z' })];
  assert.deepEqual(ids(containersFirst(els, { child: 'box' })), ['x', 'box', 'child', 'y', 'z']);
  assert.deepEqual(ids(containersFirst(els, {})), ['x', 'child', 'y', 'box', 'z']);
  // nested: grandchild first in Excalidraw order
  const deep = [rect({ id: 'gc' }), rect({ id: 'c' }), rect({ id: 'p' })];
  assert.deepEqual(ids(containersFirst(deep, { gc: 'c', c: 'p' })), ['p', 'c', 'gc']);
});

// --- draw.io export ------------------------------------------------------------

for(const preset of ['excalidraw', 'drawio', 'flowchart']){
  test(`${preset}: an outer block drawn last no longer hides the blocks inside it`, () => {
    const cells = cellsOf(blocks(), preset);
    const [outer, in1, in2] = cells;
    assert.deepEqual([outer.geometry.width, outer.geometry.height], [300, 120], 'outer block is drawn first');
    assert.equal(outer.style.container, '1');
    assert.equal(in1.parent, outer.id);
    assert.equal(in2.parent, outer.id);
    assert.deepEqual([in1.geometry.x, in1.geometry.y], [20, 20]);
    assert.deepEqual([in2.geometry.x, in2.geometry.y], [160, 20]);
  });
}

test('nesting=flat keeps shapes separate but still draws the outer block first', () => {
  const [outer, in1, in2] = cellsOf(blocks(), { preset: 'drawio', nesting: 'flat' });
  assert.equal(outer.geometry.width, 300);
  assert.equal(outer.style.container, undefined);
  assert.deepEqual([in1.parent, in2.parent], ['1', '1']);
  assert.deepEqual([in1.geometry.x, in1.geometry.y], [120, 120]);
});

test('an opaque outer block drawn on top is also moved below its contents', () => {
  const els = blocks();
  els[2].backgroundColor = '#ffec99';
  const [outer] = cellsOf(els);
  assert.equal(outer.style.fillColor, '#ffec99');
  assert.equal(outer.style.container, '1');
});

test('three levels of nesting keep page positions', () => {
  const cells = cellsOf([
    rect({ id: 'c', x: 140, y: 140, width: 20, height: 20 }),
    rect({ id: 'b', x: 120, y: 120, width: 100, height: 100 }),
    rect({ id: 'a', x: 100, y: 100, width: 300, height: 300 })
  ]);
  const [a, b, c] = cells;
  assert.equal(a.geometry.width, 300);
  assert.equal(b.parent, a.id);
  assert.equal(c.parent, b.id);
  assert.deepEqual([b.geometry.x, b.geometry.y], [20, 20]);
  assert.deepEqual([c.geometry.x, c.geometry.y], [20, 20]);
});

test('labels stay on their shape; free text, images and drawings inside a shape are nested', () => {
  const cells = cellsOf([
    rect({ id: 'box', x: 0, y: 0, width: 400, height: 300 }),
    label('box', 'Backend'),
    text({ id: 'note', x: 20, y: 250, text: 'note' }),
    { type: 'image', id: 'img', x: 300, y: 20, width: 50, height: 50, fileId: 'nope' },
    { type: 'freedraw', id: 'fd', x: 20, y: 20, points: [[0, 0], [30, 30]] }
  ], undefined, { files: {} });
  const box = cells[0];
  assert.match(box.value, /Backend/);
  assert.equal(cells.length, 4);
  for(const c of cells.slice(1)) assert.equal(c.parent, box.id);
  assert.equal(byValue(cells, 'note').geometry.y, 250);
});

test('arrows inside a shape are nested with relative points; arrows leaving it are not', () => {
  const cells = cellsOf([
    rect({ id: 'box', x: 100, y: 100, width: 400, height: 300 }),
    rect({ id: 'a', x: 120, y: 120, width: 50, height: 50 }),
    rect({ id: 'b', x: 300, y: 120, width: 50, height: 50 }),
    rect({ id: 'out', x: 700, y: 120, width: 50, height: 50 }),
    arrow({ id: 'in', x: 170, y: 145, points: [[0, 0], [130, 0]], startBinding: { elementId: 'a' }, endBinding: { elementId: 'b' } }),
    arrow({ id: 'leave', x: 350, y: 145, points: [[0, 0], [350, 0]], startBinding: { elementId: 'b' }, endBinding: { elementId: 'out' } })
  ], 'drawio');
  const [box, a, b, out] = cells.filter(c => c.vertex);
  const inside = cells.find(c => c.edge && c.source === a.id);
  const leaving = cells.find(c => c.edge && c.source === b.id);
  assert.equal(inside.parent, box.id);
  assert.deepEqual(inside.sourcePoint, { x: 70, y: 45 });
  assert.equal(leaving.parent, '1');
  assert.equal(leaving.target, out.id);
});

test('shapes inside shapes inside a frame', () => {
  for(const frames of ['excalidraw', 'swimlane']){
    const cells = cellsOf([
      frame({ id: 'F', name: 'Area', x: 0, y: 0, width: 600, height: 600 }),
      rect({ id: 'in', x: 120, y: 120, width: 50, height: 50, frameId: 'F' }),
      rect({ id: 'box', x: 100, y: 100, width: 300, height: 300, frameId: 'F' })
    ], { frames });
    const f = byValue(cells, 'Area');
    const [box, inner] = cells.slice(1);
    assert.equal(box.parent, f.id);
    assert.equal(inner.parent, box.id);
    assert.deepEqual([inner.geometry.x, inner.geometry.y], [20, 20]);
    const header = frames === 'swimlane' ? 26 : 0;
    assert.deepEqual([box.geometry.x, box.geometry.y], [100, 100 + header]);
  }
});

test('free text keeps its place in the draw order', () => {
  // the rectangle overlaps the text without containing it
  const cells = cellsOf([
    text({ id: 't', x: 500, y: 500, text: 'behind' }),
    rect({ id: 'r', x: 520, y: 490, width: 100, height: 40, backgroundColor: '#ffec99' })
  ]);
  assert.equal(cells[0].value, 'behind');
  assert.equal(cells[1].parent, '1');
});

test('draw.io output follows the Excalidraw fractional index', () => {
  const cells = cellsOf([
    rect({ id: 'top', x: 0, y: 0, index: 'a2', backgroundColor: '#ffc9c9' }),
    rect({ id: 'bottom', x: 500, y: 0, index: 'a1', backgroundColor: '#a5d8ff' })
  ]);
  assert.deepEqual(cells.map(c => c.style.fillColor), ['#a5d8ff', '#ffc9c9']);
});

// --- Mermaid / PlantUML ----------------------------------------------------------

function services(){
  const l = (id, c, v) => text({ id, containerId: c, text: v });
  return { elements: [
    rect({ id: 'api', x: 120, y: 120, width: 100, height: 60 }), l('t1', 'api', 'API'),
    rect({ id: 'db', x: 260, y: 120, width: 100, height: 60, backgroundColor: '#a5d8ff' }), l('t2', 'db', 'DB'),
    rect({ id: 'cache', x: 270, y: 130, width: 40, height: 30 }), l('t3', 'cache', 'Cache'),
    rect({ id: 'backend', x: 100, y: 100, width: 300, height: 120 }), l('t4', 'backend', 'Backend'),
    rect({ id: 'client', x: 100, y: 400, width: 100, height: 60 }), l('t5', 'client', 'Client'),
    arrow({ id: 'a1', x: 150, y: 400, points: [[0, 0], [0, -180]], startBinding: { elementId: 'client' }, endBinding: { elementId: 'backend' }, endArrowhead: 'arrow' }),
    arrow({ id: 'a2', x: 220, y: 150, points: [[0, 0], [40, 0]], startBinding: { elementId: 'api' }, endBinding: { elementId: 'db' }, endArrowhead: 'arrow' })
  ] };
}

test('Mermaid: shapes with shapes inside become subgraphs that keep their links', () => {
  const out = toMermaid(services(), { direction: 'TB' });
  assert.deepEqual(out.text.trim().split('\n').map(l => l.trimEnd()), [
    'flowchart TD',
    '  subgraph n4["Backend"]',
    '    n1["API"]',
    '    subgraph n2["DB"]',
    '      n3["Cache"]',
    '    end',
    '  end',
    '  n5["Client"]',
    '  n5 --> n4',
    '  n1 --> n2',
    '  style n2 fill:#a5d8ff'
  ]);
  assert.deepEqual(out.stats, { nodes: 5, connections: 2, groups: 2 });
});

test('PlantUML: shapes with shapes inside become rectangles with a body', () => {
  const out = toPlantUML(services(), { direction: 'TB' }).text;
  assert.match(out, /^rectangle "Backend" as n4 \{\n {2}rectangle "API" as n1\n {2}rectangle "DB" as n2 #a5d8ff \{\n {4}rectangle "Cache" as n3\n {2}\}\n\}$/m);
  assert.match(out, /^n5 --> n4$/m);
});

test('PlantUML: an ellipse with shapes inside is written as a rectangle group', () => {
  const out = toPlantUML({ elements: [
    ellipse({ id: 'e', x: 0, y: 0, width: 300, height: 300 }),
    rect({ id: 'r', x: 100, y: 100, width: 50, height: 50 })
  ] }).text;
  assert.match(out, /^rectangle " " as n1 \{\n {2}rectangle " " as n2\n\}$/m);
});

test('Text exports nest shape groups inside frame groups', () => {
  const out = toMermaid({ elements: [
    frame({ id: 'F', name: 'Area', x: 0, y: 0, width: 600, height: 600 }),
    rect({ id: 'box', x: 100, y: 100, width: 300, height: 300, frameId: 'F' }),
    rect({ id: 'in', x: 120, y: 120, width: 50, height: 50, frameId: 'F' })
  ] }).text;
  assert.match(out, /subgraph g1\["Area"\]\n {4}subgraph n1\[" "\]\n {6}n2\[" "\]\n {4}end\n {2}end/);
});
