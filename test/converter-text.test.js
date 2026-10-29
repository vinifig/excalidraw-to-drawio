// Mermaid and PlantUML exports.
const test = require('node:test');
const assert = require('node:assert/strict');
const { toMermaid, toPlantUML, buildGraph, resolveTextOptions, TEXT_DEFAULTS } = require('../src/converter-text.js');
const { rect, ellipse, diamond, text, arrow, frame } = require('./helpers');

const label = (containerId, value, id) => text({ id: id || `${containerId}-label`, containerId, text: value });
const link = (id, from, to, props) => arrow(Object.assign({ id, startBinding: from && { elementId: from }, endBinding: to && { elementId: to }, endArrowhead: 'arrow' }, props));
const lines = out => out.text.trim().split('\n').map(l => l.trim());

// A small flowchart: Start -> Process -> Decision -yes-> End, inside a frame
function flow(){
  return { elements: [
    frame({ id: 'F', name: 'Checkout', x: 0, y: 0, width: 600, height: 600 }),
    ellipse({ id: 's', x: 50, y: 20, frameId: 'F', backgroundColor: '#b2f2bb', strokeColor: '#2f9e44' }), label('s', 'Start'),
    rect({ id: 'p', x: 50, y: 120, frameId: 'F' }), label('p', 'Process'),
    diamond({ id: 'd', x: 50, y: 220, frameId: 'F' }), label('d', 'OK?'),
    ellipse({ id: 'e', x: 50, y: 320, frameId: 'F' }), label('e', 'End'),
    link('a1', 's', 'p'), link('a2', 'p', 'd'), link('a3', 'd', 'e'), label('a3', 'yes')
  ] };
}

// --- Options -----------------------------------------------------------------

test('resolveTextOptions defaults and ignores invalid values', () => {
  assert.deepEqual(resolveTextOptions(), TEXT_DEFAULTS);
  assert.deepEqual(resolveTextOptions({ direction: 'LR', colors: 'pink' }), { direction: 'LR', colors: 'keep' });
});

// --- Graph extraction ----------------------------------------------------------

test('buildGraph: shapes become nodes with kinds and labels', () => {
  const g = buildGraph(flow());
  assert.deepEqual(g.nodes.map(n => [n.id, n.kind, n.label]), [
    ['n1', 'terminator', 'Start'], ['n2', 'process', 'Process'], ['n3', 'decision', 'OK?'], ['n4', 'terminator', 'End']
  ]);
  assert.deepEqual(g.nodes.map(n => n.role), ['start', 'process', 'decision', 'end']);
});

test('buildGraph: rounded rectangles are "round" nodes', () => {
  assert.equal(buildGraph({ elements: [rect({ roundness: { type: 3 } })] }).nodes[0].kind, 'round');
});

test('buildGraph: bound arrows become edges with labels', () => {
  const g = buildGraph(flow());
  assert.deepEqual(g.edges.map(e => [e.from, e.to, e.dir, e.label]), [
    ['n1', 'n2', 'forward', ''], ['n2', 'n3', 'forward', ''], ['n3', 'n4', 'forward', 'yes']
  ]);
});

test('buildGraph: arrow direction follows the arrowheads', () => {
  const shapes = [rect({ id: 'a' }), rect({ id: 'b', x: 300 })];
  const dir = props => buildGraph({ elements: shapes.concat(link('x', 'a', 'b', props)) }).edges[0];
  assert.deepEqual([dir({}).dir, dir({}).from], ['forward', 'n1']);
  const backwards = dir({ startArrowhead: 'arrow', endArrowhead: null });
  assert.deepEqual([backwards.dir, backwards.from, backwards.to], ['forward', 'n2', 'n1']);
  assert.equal(dir({ startArrowhead: 'dot' }).dir, 'both');
  assert.equal(dir({ endArrowhead: null }).dir, 'none');
  assert.equal(dir({ type: 'line', endArrowhead: undefined }).dir, 'none');
  assert.equal(dir({ type: 'arrow', endArrowhead: undefined }).dir, 'forward');
  assert.equal(dir({ strokeStyle: 'dotted' }).dashed, true);
});

test('buildGraph: frames become (nested) groups, empty frames are dropped from output', () => {
  const g = buildGraph({ elements: [
    frame({ id: 'outer', name: 'Outer', x: 0, y: 0, width: 1000, height: 1000 }),
    frame({ id: 'inner', name: 'Inner', x: 100, y: 100, width: 300, height: 300 }),
    frame({ id: 'empty', name: 'Empty', x: 2000, y: 0, width: 100, height: 100 }),
    rect({ id: 'r1', x: 150, y: 150, frameId: 'outer' }),
    rect({ id: 'r2', x: 600, y: 600, frameId: 'outer' }),
    rect({ id: 'r3', x: 3000, y: 0 })
  ] });
  const byName = Object.fromEntries(g.groups.map(gr => [gr.name, gr]));
  assert.equal(byName.Inner.parent, byName.Outer.id);
  assert.deepEqual(g.nodes.map(n => n.group), [byName.Inner.id, byName.Outer.id, null]);
  const mermaid = toMermaid({ elements: [frame({ id: 'empty', name: 'Empty' })] }).text;
  assert.doesNotMatch(mermaid, /subgraph/);
});

test('buildGraph: reports what a text diagram leaves out', () => {
  const g = buildGraph({ elements: [
    rect({ id: 'a' }),
    text({ id: 'free', text: 'note' }),
    { type: 'image', id: 'img', x: 0, y: 0, width: 10, height: 10 },
    { type: 'freedraw', id: 'fd', x: 0, y: 0, points: [[0, 0]] },
    { type: 'embeddable', id: 'emb', x: 0, y: 0, width: 10, height: 10 },
    link('loose', 'a', null),
    rect({ id: 'gone', isDeleted: true })
  ] });
  assert.deepEqual(g.skipped, { texts: 1, arrows: 1, images: 1, drawings: 1, other: 1 });
  assert.equal(g.nodes.length, 1);
});

test('buildGraph: free text that arrows point to becomes a node', () => {
  const g = buildGraph({ elements: [rect({ id: 'a' }), text({ id: 't', text: 'Note', x: 300 }), link('x', 'a', 't')] });
  assert.equal(g.nodes[1].kind, 'text');
  assert.equal(g.nodes[1].label, 'Note');
  assert.equal(g.edges.length, 1);
  assert.equal(g.skipped.texts, 0);
});

test('buildGraph: guesses the direction from the connections', () => {
  const vertical = buildGraph(flow());
  assert.equal(vertical.direction, 'TB');
  const horizontal = buildGraph({ elements: [rect({ id: 'a' }), rect({ id: 'b', x: 400 }), link('x', 'a', 'b')] });
  assert.equal(horizontal.direction, 'LR');
});

test('buildGraph accepts a JSON string', () => {
  assert.equal(buildGraph(JSON.stringify(flow())).nodes.length, 4);
});

// --- Mermaid -----------------------------------------------------------------

test('toMermaid writes a flowchart with subgraphs, shapes and labeled edges', () => {
  const out = toMermaid(flow());
  assert.deepEqual(lines(out), [
    'flowchart TD',
    'subgraph g1["Checkout"]',
    'n1(["Start"])',
    'n2["Process"]',
    'n3{"OK?"}',
    'n4(["End"])',
    'end',
    'n1 --> n2',
    'n2 --> n3',
    'n3 -->|"yes"| n4',
    'style n1 fill:#b2f2bb,stroke:#2f9e44'
  ]);
  assert.deepEqual(out.stats, { nodes: 4, connections: 3, groups: 1 });
});

test('toMermaid escapes quotes and line breaks', () => {
  const out = toMermaid({ elements: [rect({ id: 'a' }), label('a', 'Say "hi"\nnow')] });
  assert.match(out.text, /n1\["Say #quot;hi#quot;<br>now"\]/);
});

test('toMermaid uses a blank label for unlabeled shapes', () => {
  assert.match(toMermaid({ elements: [rect()] }).text, /n1\[" "\]/);
});

test('toMermaid edge styles: dashed, both ways, undirected', () => {
  const shapes = [rect({ id: 'a' }), rect({ id: 'b', y: 200 })];
  const edge = props => lines(toMermaid({ elements: shapes.concat(link('x', 'a', 'b', props)) })).find(l => l.startsWith('n1 '));
  assert.equal(edge({ strokeStyle: 'dashed' }), 'n1 -.-> n2');
  assert.equal(edge({ startArrowhead: 'arrow' }), 'n1 <--> n2');
  assert.equal(edge({ endArrowhead: null }), 'n1 --- n2');
  assert.equal(edge({ endArrowhead: null, strokeStyle: 'dashed' }), 'n1 -.- n2');
  assert.equal(edge({ startArrowhead: 'arrow', strokeStyle: 'dotted' }), 'n1 <-.-> n2');
});

test('toMermaid direction option overrides the guess', () => {
  assert.match(toMermaid(flow(), { direction: 'LR' }).text, /^flowchart LR/);
  assert.match(toMermaid(flow(), { direction: 'TB' }).text, /^flowchart TD/);
});

test('toMermaid colors=none drops style lines', () => {
  assert.doesNotMatch(toMermaid(flow(), { colors: 'none' }).text, /style /);
});

test('toMermaid: black strokes are not styled, free-text nodes have no box', () => {
  const out = toMermaid({ elements: [rect({ id: 'a', strokeColor: '#1e1e1e', backgroundColor: '#ffec99' }), text({ id: 't', text: 'Note', x: 300 }), link('x', 'a', 't')] });
  assert.match(out.text, /style n1 fill:#ffec99\n/);
  assert.match(out.text, /style n2 stroke-width:0px,fill:none/);
});

test('toMermaid nests subgraphs for nested frames', () => {
  const out = lines(toMermaid({ elements: [
    frame({ id: 'outer', name: 'Outer', x: 0, y: 0, width: 1000, height: 1000 }),
    frame({ id: 'inner', name: 'Inner', x: 100, y: 100, width: 300, height: 300 }),
    rect({ id: 'r', x: 150, y: 150, frameId: 'outer' })
  ] }));
  assert.deepEqual(out.slice(1), ['subgraph g1["Outer"]', 'subgraph g2["Inner"]', 'n1[" "]', 'end', 'end']);
});

test('toMermaid on an empty scene is a valid empty flowchart', () => {
  assert.equal(toMermaid({ elements: [] }).text, 'flowchart TD\n');
});

// --- PlantUML ----------------------------------------------------------------

test('toPlantUML writes frames, shapes, colors and labeled arrows', () => {
  const out = toPlantUML(flow());
  assert.deepEqual(lines(out), [
    '@startuml',
    'frame "Checkout" as g1 {',
    'usecase "Start" as n1 #b2f2bb',
    'rectangle "Process" as n2',
    'hexagon "OK?" as n3',
    'usecase "End" as n4',
    '}',
    'n1 --> n2',
    'n2 --> n3',
    'n3 --> n4 : yes',
    '@enduml'
  ]);
  assert.deepEqual(out.stats, { nodes: 4, connections: 3, groups: 1 });
});

test('toPlantUML indents nested frames', () => {
  const out = toPlantUML({ elements: [
    frame({ id: 'outer', name: 'Outer', x: 0, y: 0, width: 1000, height: 1000 }),
    frame({ id: 'inner', name: 'Inner', x: 100, y: 100, width: 300, height: 300 }),
    rect({ id: 'r', x: 150, y: 150, frameId: 'outer' })
  ] }).text;
  assert.match(out, /^frame "Outer" as g1 \{\n {2}frame "Inner" as g2 \{\n {4}rectangle " " as n1\n {2}\}\n\}$/m);
});

test('toPlantUML escapes quotes and line breaks', () => {
  const out = toPlantUML({ elements: [rect({ id: 'a' }), rect({ id: 'b', y: 200 }), label('a', 'Say "hi"\nnow'), link('x', 'a', 'b'), label('x', 'two\nlines')] }).text;
  assert.match(out, /rectangle "Say 'hi'\\nnow" as n1/);
  assert.match(out, /n1 --> n2 : two\\nlines/);
});

test('toPlantUML edge styles and direction', () => {
  const shapes = [rect({ id: 'a' }), rect({ id: 'b', x: 400 })];
  const out = props => toPlantUML({ elements: shapes.concat(link('x', 'a', 'b', props)) }).text;
  assert.match(out({}), /^left to right direction$/m);
  assert.match(out({ strokeStyle: 'dashed' }), /^n1 \.\.> n2$/m);
  assert.match(out({ startArrowhead: 'arrow' }), /^n1 <--> n2$/m);
  assert.match(out({ endArrowhead: null }), /^n1 -- n2$/m);
  assert.doesNotMatch(toPlantUML(flow()).text, /direction/);
  assert.match(toPlantUML(flow(), { direction: 'LR' }).text, /left to right direction/);
});

test('toPlantUML colors=none and non-hex colors are left out', () => {
  assert.doesNotMatch(toPlantUML(flow(), { colors: 'none' }).text, /#b2f2bb/);
  assert.doesNotMatch(toPlantUML({ elements: [rect({ backgroundColor: 'red' })] }).text, /red/);
});

test('toPlantUML free-text nodes become labels', () => {
  const out = toPlantUML({ elements: [rect({ id: 'a' }), text({ id: 't', text: 'Note', x: 300 }), link('x', 'a', 't')] }).text;
  assert.match(out, /^label "Note" as n2$/m);
});
