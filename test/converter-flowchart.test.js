// Arrow bindings, routing and the flowchart export.
const test = require('node:test');
const assert = require('node:assert/strict');
const { internals } = require('../src/converter-drawio.js');
const { cellsOf, rect, ellipse, diamond, text, arrow } = require('./helpers');
const { flowchartRoles } = internals;

const link = (id, from, to, props) => arrow(Object.assign({ id, startBinding: from && { elementId: from }, endBinding: to && { elementId: to } }, props));

// --- Bindings & routing --------------------------------------------------------

test('connect=bind attaches arrows to the shapes they are bound to', () => {
  const [a, b, e] = cellsOf([rect({ id: 'a' }), rect({ id: 'b', y: 100 }), link('e', 'a', 'b')], { connect: 'bind' });
  assert.equal(e.source, a.id);
  assert.equal(e.target, b.id);
});

test('connect=bind works when the arrow comes before its shapes', () => {
  const [e, a, b] = cellsOf([link('e', 'a', 'b'), rect({ id: 'a' }), rect({ id: 'b', y: 100 })], { connect: 'bind' });
  assert.equal(e.source, a.id);
  assert.equal(e.target, b.id);
});

test('connect=free leaves arrows unattached', () => {
  const [, , e] = cellsOf([rect({ id: 'a' }), rect({ id: 'b', y: 100 }), link('e', 'a', 'b')], { connect: 'free' });
  assert.equal(e.source, '');
  assert.equal(e.target, '');
});

test('bindings to missing or non-shape elements are ignored', () => {
  const [, e] = cellsOf([rect({ id: 'a' }), link('e', 'a', 'ghost')], { connect: 'bind' });
  assert.equal(e.target, '');
  const [, e2] = cellsOf([link('x', null, null), link('e2', 'x', null)], { connect: 'bind' });
  assert.equal(e2.source, '');
});

test('elbow-arrow fixed points become exit/entry anchors', () => {
  const el = link('e', 'a', 'b', { elbowed: true });
  el.startBinding.fixedPoint = [1, 0.5];
  el.endBinding.fixedPoint = [0, 0.4999];
  const [, , e] = cellsOf([rect({ id: 'a' }), rect({ id: 'b', x: 300 }), el], { connect: 'bind' });
  assert.equal(e.style.exitX, '1');
  assert.equal(e.style.exitY, '0.5');
  assert.equal(e.style.entryX, '0');
  assert.equal(e.style.entryY, '0.5');
  const [, , free] = cellsOf([rect({ id: 'a' }), rect({ id: 'b', x: 300 }), el], { connect: 'free' });
  assert.equal(free.style.exitX, undefined);
});

test('orthogonal routing lets draw.io route connected arrows', () => {
  const pts = [[0, 0], [0, 50], [100, 50]];
  const [, , routed] = cellsOf([rect({ id: 'a' }), rect({ id: 'b', y: 100 }), link('e', 'a', 'b', { points: pts, roundness: { type: 2 } })], { connect: 'bind', edgeRouting: 'orthogonal' });
  assert.equal(routed.style.edgeStyle, 'orthogonalEdgeStyle');
  assert.equal(routed.style.curved, undefined);
  assert.deepEqual(routed.points, []);
  const [, halfFree] = cellsOf([rect({ id: 'a' }), link('e', 'a', null, { points: pts })], { connect: 'bind', edgeRouting: 'orthogonal' });
  assert.equal(halfFree.points.length, 1); // keeps its waypoints when an end is free
});

test('edgeRouting=keep follows the Excalidraw points', () => {
  const [, , e] = cellsOf([rect({ id: 'a' }), rect({ id: 'b', y: 100 }), link('e', 'a', 'b', { points: [[0, 0], [0, 50], [100, 50]] })], { connect: 'bind' });
  assert.equal(e.style.edgeStyle, undefined);
  assert.equal(e.points.length, 1);
});

// --- Flowchart roles -----------------------------------------------------------

test('rectangles are processes and diamonds decisions', () => {
  const roles = flowchartRoles([rect({ id: 'p' }), diamond({ id: 'd' }), text({ id: 't' })]);
  assert.deepEqual(roles, { p: 'process', d: 'decision' });
});

test('a flowchart without an end is fine: the only terminator is a start', () => {
  const roles = flowchartRoles([ellipse({ id: 's' }), rect({ id: 'p' }), link('a', 's', 'p')]);
  assert.equal(roles.s, 'start');
  assert.ok(!Object.values(roles).includes('end'));
});

test('an unconnected ellipse is a start', () => {
  assert.equal(flowchartRoles([ellipse({ id: 'e' })]).e, 'start');
});

test('an ellipse the flow only arrives at is an end', () => {
  const roles = flowchartRoles([rect({ id: 'p' }), ellipse({ id: 'e' }), link('a', 'p', 'e')]);
  assert.equal(roles.e, 'end');
});

test('an ellipse with arrows in and out is a start', () => {
  const roles = flowchartRoles([rect({ id: 'p' }), ellipse({ id: 'e' }), link('a', 'p', 'e'), link('b', 'e', 'p')]);
  assert.equal(roles.e, 'start');
});

test('terminator labels decide start / end (English and Portuguese)', () => {
  for(const label of ['End', 'end process', 'Stop', 'Finish', 'Exit', 'Fim', 'Término', 'Final', 'Sair']){
    const roles = flowchartRoles([ellipse({ id: 'e' }), rect({ id: 'p' }), text({ containerId: 'e', text: label }), link('a', 'e', 'p')]);
    assert.equal(roles.e, 'end', label);
  }
  for(const label of ['Start', 'Begin', 'Início', 'Inicio', 'Começo']){
    const roles = flowchartRoles([rect({ id: 'p' }), ellipse({ id: 'e' }), text({ containerId: 'e', text: label }), link('a', 'p', 'e')]);
    assert.equal(roles.e, 'start', label);
  }
});

test('labels only match whole words', () => {
  const roles = flowchartRoles([ellipse({ id: 'e' }), text({ containerId: 'e', text: 'Endpoint' })]);
  assert.equal(roles.e, 'start');
});

test('arrows drawn backwards count in the direction they point', () => {
  // Arrow bound start=a end=b, but its head is at the start: flow goes b -> a
  const roles = flowchartRoles([ellipse({ id: 'a' }), ellipse({ id: 'b' }), link('x', 'a', 'b', { startArrowhead: 'arrow', endArrowhead: null })]);
  assert.equal(roles.a, 'end');
  assert.equal(roles.b, 'start');
});

test('deleted arrows are ignored', () => {
  const roles = flowchartRoles([rect({ id: 'p' }), ellipse({ id: 'e' }), link('a', 'p', 'e', { isDeleted: true })]);
  assert.equal(roles.e, 'start');
});

// --- Flowchart export ------------------------------------------------------------

test('flowchart preset: shapes, fixed colors and connected arrows', () => {
  const [start, proc, dec, end, a1, a2, a3] = cellsOf([
    ellipse({ id: 's', strokeColor: '#e03131', backgroundColor: '#ffc9c9' }),
    rect({ id: 'p', y: 100, backgroundColor: '#b2f2bb' }),
    diamond({ id: 'd', y: 200 }),
    ellipse({ id: 'e', y: 300 }),
    link('a1', 's', 'p'), link('a2', 'p', 'd'), link('a3', 'd', 'e')
  ], 'flowchart');
  assert.equal(start.style.shape, 'mxgraph.flowchart.terminator');
  assert.deepEqual([start.style.fillColor, start.style.strokeColor], ['#d5e8d4', '#82b366']);
  assert.equal(proc.style.shape, 'rect');
  assert.deepEqual([proc.style.fillColor, proc.style.strokeColor], ['#dae8fc', '#6c8ebf']);
  assert.equal(dec.style.shape, 'rhombus');
  assert.deepEqual([dec.style.fillColor, dec.style.strokeColor], ['#fff2cc', '#d6b656']);
  assert.equal(end.style.shape, 'mxgraph.flowchart.terminator');
  assert.deepEqual([end.style.fillColor, end.style.strokeColor], ['#f8cecc', '#b85450']);
  assert.deepEqual([a1.source, a1.target, a2.source, a2.target, a3.source, a3.target], [start.id, proc.id, proc.id, dec.id, dec.id, end.id]);
  for(const e of [a1, a2, a3]){
    assert.equal(e.style.edgeStyle, 'orthogonalEdgeStyle');
    assert.equal(e.style.endArrow, 'classic');
    assert.equal(e.style.strokeColor, undefined);
  }
});

test('flowchart preset: text uses default black, other elements get no fixed color', () => {
  const [shape, label] = cellsOf([
    rect({ id: 'p' }),
    text({ id: 't', y: 100, strokeColor: '#e03131' }),
    text({ id: 'in', containerId: 'p', strokeColor: '#e03131' })
  ], 'flowchart');
  assert.equal(label.style.fontColor, undefined);
  assert.equal(shape.style.fontColor, undefined);
  assert.doesNotMatch(shape.value, /color:/);
  const [fd] = cellsOf([{ type: 'freedraw', id: 'fd', x: 0, y: 0, points: [[0, 0], [5, 5]], strokeColor: '#e03131' }], 'flowchart');
  assert.match(decodeURIComponent(fd.style.image), /stroke='#000000'/);
});

test('shapes=keep with flowchart colors keeps ellipses as ellipses', () => {
  const [e] = cellsOf([ellipse()], { preset: 'flowchart', shapes: 'keep' });
  assert.equal(e.style.shape, 'ellipse');
  assert.equal(e.style.fillColor, '#d5e8d4');
});
