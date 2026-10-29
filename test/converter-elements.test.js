// Element conversion: shapes, text, lines/arrows, images, freedraw, XML output.
const test = require('node:test');
const assert = require('node:assert/strict');
const { convertExcalidrawToDrawio } = require('../src/converter-drawio.js');
const { convert, cellsOf, parse, rect, ellipse, diamond, text, arrow } = require('./helpers');

test('accepts a JSON string or an object', () => {
  const scene = { type: 'excalidraw', elements: [rect()] };
  const fromObject = parse(convertExcalidrawToDrawio(scene)).cells;
  const fromString = parse(convertExcalidrawToDrawio(JSON.stringify(scene))).cells;
  assert.equal(fromObject.length, 1);
  assert.deepEqual(fromString, fromObject);
});

test('outputs an mxfile with root and default layer cells', () => {
  const { xml } = convert([rect()]);
  assert.match(xml, /^<mxfile /);
  assert.match(xml, /<mxCell id="0"\/>/);
  assert.match(xml, /<mxCell id="1" parent="0"\/>/);
});

test('empty scene converts to an empty diagram', () => {
  assert.deepEqual(cellsOf([]), []);
  assert.deepEqual(convert(undefined).cells, []);
});

test('maps rectangle, ellipse and diamond shapes', () => {
  const [r, e, d] = cellsOf([rect({ id: 'r' }), ellipse({ id: 'e' }), diamond({ id: 'd' })]);
  assert.equal(r.style.shape, 'rect');
  assert.equal(e.style.shape, 'ellipse');
  assert.equal(e.style.perimeter, 'ellipsePerimeter');
  assert.equal(d.style.shape, 'rhombus');
  assert.equal(d.style.perimeter, 'rhombusPerimeter');
  for(const c of [r, e, d]) assert.equal(c.vertex, '1');
});

test('keeps shape geometry', () => {
  const [c] = cellsOf([rect({ x: 10, y: 20, width: 120.4, height: 60.6 })]);
  assert.deepEqual(c.geometry, { x: 10, y: 20, width: 120, height: 61 });
});

test('shifts the whole scene so no coordinate is negative', () => {
  const [a, b] = cellsOf([rect({ id: 'a', x: -50, y: -30 }), rect({ id: 'b', x: 10, y: 10 })]);
  assert.deepEqual([a.geometry.x, a.geometry.y], [0, 0]);
  assert.deepEqual([b.geometry.x, b.geometry.y], [60, 40]);
});

test('skips deleted elements', () => {
  assert.equal(cellsOf([rect({ isDeleted: true }), rect({ id: 'r2' })]).length, 1);
});

test('ignores unsupported element types', () => {
  assert.deepEqual(cellsOf([{ type: 'embeddable', id: 'x', x: 0, y: 0, width: 10, height: 10 }]), []);
});

test('standalone text becomes a text cell', () => {
  const [c] = cellsOf([text({ text: 'Hello\nWorld', x: 5, y: 6, fontSize: 20, textAlign: 'center', verticalAlign: 'middle' })]);
  assert.equal(c.value, 'Hello<br>World');
  assert.equal(c.style.text, true);
  assert.equal(c.style.fontSize, '18'); // scaled by 0.9
  assert.equal(c.style.align, 'center');
  assert.equal(c.style.verticalAlign, 'middle');
  assert.equal(c.style.fontColor, '#1e1e1e');
  assert.equal(c.style.fillColor, 'none');
  assert.equal(c.style.strokeColor, 'none');
  assert.deepEqual([c.geometry.x, c.geometry.y], [5, 6]);
});

test('escapes XML special characters in text', () => {
  const { xml, cells } = convert([text({ text: '<a> & "b"' })]);
  assert.equal(cells[0].value, '&lt;a&gt; &amp; &quot;b&quot;');
  assert.doesNotMatch(xml, /value="<a>/);
});

test('bound text is merged into its container shape', () => {
  const cells = cellsOf([
    rect({ id: 'box', width: 200 }),
    text({ id: 't', containerId: 'box', text: 'Label', textAlign: 'center', verticalAlign: 'middle', fontSize: 20 })
  ]);
  assert.equal(cells.length, 1);
  assert.match(cells[0].value, /Label/);
  assert.match(cells[0].value, /width: 200\.0px/);
  assert.equal(cells[0].style.align, 'center');
  assert.equal(cells[0].style.verticalAlign, 'middle');
  assert.equal(cells[0].style.fontSize, '20');
  assert.equal(cells[0].style.fontColor, '#1e1e1e');
  assert.equal(cells[0].style.whiteSpace, 'wrap');
});

test('bound text on an arrow becomes the edge label', () => {
  const cells = cellsOf([arrow({ id: 'a' }), text({ containerId: 'a', text: 'yes', fontSize: 10 })]);
  assert.equal(cells.length, 1);
  assert.equal(cells[0].value, 'yes');
  assert.equal(cells[0].style.fontSize, '9');
});

test('arrows become edges with source, target and waypoints', () => {
  const [c] = cellsOf([arrow({ x: 10, y: 20, points: [[0, 0], [50, 0], [50, 40]] })]);
  assert.equal(c.edge, '1');
  assert.deepEqual(c.sourcePoint, { x: 10, y: 20 });
  assert.deepEqual(c.targetPoint, { x: 60, y: 60 });
  assert.deepEqual(c.points, [{ x: 60, y: 20 }]);
  assert.equal(c.source, '');
  assert.equal(c.target, '');
});

test('arrows without points use width/height', () => {
  const [c] = cellsOf([arrow({ x: 0, y: 0, width: 30, height: 40, points: undefined })]);
  assert.deepEqual(c.targetPoint, { x: 30, y: 40 });
});

test('lines become edges without arrowheads by default', () => {
  const [c] = cellsOf([arrow({ type: 'line' })]);
  assert.equal(c.style.startArrow, 'none');
  assert.equal(c.style.endArrow, 'none');
});

test('arrows from old files without arrowhead fields get an arrow end', () => {
  const [old] = cellsOf([arrow({})]);
  assert.equal(old.style.endArrow, 'open');
  const [none] = cellsOf([arrow({ endArrowhead: null })]);
  assert.equal(none.style.endArrow, 'none');
});

test('images embed the file data URL (without ;base64)', () => {
  const files = { f1: { dataURL: 'data:image/png;base64,AAAA' } };
  const [c] = cellsOf([{ type: 'image', id: 'i', x: 0, y: 0, width: 40, height: 30, fileId: 'f1' }], undefined, { files });
  assert.equal(c.style.shape, 'image');
  assert.equal(c.style.image, 'data:image/png,AAAA');
  assert.equal(c.style.sketch, undefined);
});

test('images accept base64 + mimeType file entries', () => {
  const files = { f1: { base64: 'BBBB', mimeType: 'image/jpeg' } };
  const [c] = cellsOf([{ type: 'image', id: 'i', x: 0, y: 0, width: 40, height: 30, fileId: 'f1' }], undefined, { files });
  assert.equal(c.style.image, 'data:image/jpeg,BBBB');
});

test('images with a missing file get a placeholder', () => {
  const [c] = cellsOf([{ type: 'image', id: 'i', x: 0, y: 0, width: 40, height: 30, fileId: 'nope' }], undefined, { files: {} });
  assert.match(c.style.image, /^data:image\/svg\+xml,/);
  assert.match(decodeURIComponent(c.style.image), /IMG\?/);
});

test('freedraw becomes an SVG image sized to its points', () => {
  const [c] = cellsOf([{ type: 'freedraw', id: 'fd', x: 100, y: 100, width: 30, height: 20, points: [[0, 0], [10, 20], [30, 5]], strokeColor: '#e03131', strokeWidth: 2 }]);
  assert.deepEqual(c.geometry, { x: 100, y: 100, width: 30, height: 20 });
  assert.match(c.style.image, /^data:image\/svg\+xml,/);
  const svg = decodeURIComponent(c.style.image.slice('data:image/svg+xml,'.length));
  assert.match(svg, /d='M0\.00 0\.00 L10\.00 20\.00 L30\.00 5\.00'/);
  assert.match(svg, /stroke='#e03131'/);
  assert.match(svg, /stroke-width='2'/);
  assert.equal(c.style.process, undefined);
});

test('closed freedraw paths are closed in the SVG', () => {
  const [c] = cellsOf([{ type: 'freedraw', id: 'fd', x: 0, y: 0, points: [[0, 0], [10, 0], [10, 10], [0, 0]] }]);
  assert.match(decodeURIComponent(c.style.image), / Z'/);
});
