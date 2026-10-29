// Extracting the Excalidraw scene embedded in exported SVGs.
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { extractExcalidrawFromSVG, decodeEmbeddedExcalidrawPayload, decodeHTMLEntities, isLikelyExcalidrawJSON, findFirstJSON } = require('../src/svg-extract.js');

const scene = { type: 'excalidraw', version: 2, elements: [{ type: 'rectangle', id: 'r', x: 0, y: 0, width: 10, height: 10 }] };
const sceneText = JSON.stringify(scene);
const pretty = JSON.stringify(scene, null, 2);
// Excalidraw base64-encodes a latin1 ("byte string") JSON payload
const toBase64 = obj => Buffer.from(JSON.stringify(obj), 'latin1').toString('base64');
const svg = inner => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${inner}<rect width="10" height="10"/></svg>`;

test('reads the compressed payload Excalidraw embeds in exported SVGs', async () => {
  const encoded = zlib.deflateSync(Buffer.from(sceneText)).toString('latin1');
  const payload = toBase64({ version: '1', encoding: 'bstring', compressed: true, encoded });
  const out = await extractExcalidrawFromSVG(svg(`<metadata><!-- payload-type:application/vnd.excalidraw+json --><!-- payload-version:2 --><!-- payload-start -->${payload}<!-- payload-end --></metadata>`));
  assert.equal(out, pretty);
});

test('reads an uncompressed payload with a data field', async () => {
  const payload = toBase64({ data: scene });
  assert.equal(await decodeEmbeddedExcalidrawPayload(payload), pretty);
});

test('payload that is not an Excalidraw scene is rejected', async () => {
  assert.equal(await decodeEmbeddedExcalidrawPayload(toBase64({ data: { hello: 1 } })), null);
  assert.equal(await decodeEmbeddedExcalidrawPayload(Buffer.from('not json').toString('base64')), null);
});

test('reads an entity-encoded <excalidraw> tag', async () => {
  const encoded = sceneText.replace(/"/g, '&quot;');
  assert.equal(await extractExcalidrawFromSVG(svg(`<excalidraw>${encoded}</excalidraw>`)), pretty);
});

test('reads plain JSON inside <metadata>', async () => {
  assert.equal(await extractExcalidrawFromSVG(svg(`<metadata>${sceneText}</metadata>`)), pretty);
});

test('finds scene JSON anywhere in the SVG as a last resort', async () => {
  assert.equal(await extractExcalidrawFromSVG(svg(`<desc>${sceneText}</desc>`)), pretty);
});

test('returns null for an SVG without a scene', async () => {
  assert.equal(await extractExcalidrawFromSVG(svg('')), null);
});

test('decodeHTMLEntities decodes the common entities', () => {
  assert.equal(decodeHTMLEntities('&quot;a&quot; &#39;b&#39; &lt;c&gt; &amp;'), `"a" 'b' <c> &`);
});

test('isLikelyExcalidrawJSON accepts scenes and rejects other JSON', () => {
  assert.ok(isLikelyExcalidrawJSON(sceneText));
  assert.ok(isLikelyExcalidrawJSON('{"elements":[]}'));
  assert.ok(!isLikelyExcalidrawJSON('{"type":"other"}'));
  assert.ok(!isLikelyExcalidrawJSON('nope'));
});

test('findFirstJSON returns the first balanced object matching the pattern', () => {
  const hay = `junk {"a":1} more {"type":"excalidraw","nested":{"x":{}}} tail`;
  assert.equal(findFirstJSON(hay, /"type"\s*:\s*"excalidraw"/), '{"type":"excalidraw","nested":{"x":{}}}');
  assert.equal(findFirstJSON(hay), '{"a":1}');
  assert.equal(findFirstJSON('no json here', /x/), null);
});
