// Summary of converted diagrams and "Open in draw.io" links.
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { summarize, drawioUrl } = require('../src/output.js');
const { convertExcalidrawToDrawio } = require('../src/converter-drawio.js');
const { rect, ellipse, text, arrow, frame } = require('./helpers');

test('summarize counts shapes, connectors, frames and texts', () => {
  const xml = convertExcalidrawToDrawio({ elements: [
    frame({ id: 'f' }), frame({ id: 'g', x: 1000 }),
    rect({ id: 'r', frameId: 'f' }), ellipse({ id: 'e', y: 100 }),
    arrow({ id: 'a' }), text({ id: 't', y: 200 }),
    text({ id: 'bound', containerId: 'r' })
  ] }, 'drawio');
  assert.deepEqual(summarize(xml), { shapes: 2, connectors: 1, frames: 2, texts: 1 });
});

test('summarize handles an empty diagram', () => {
  assert.deepEqual(summarize(convertExcalidrawToDrawio({ elements: [] })), { shapes: 0, connectors: 0, frames: 0, texts: 0 });
});

test('drawioUrl encodes the diagram the way draw.io decompresses it', async () => {
  const xml = convertExcalidrawToDrawio({ elements: [rect({ id: 'r' }), text({ id: 't', text: 'Olá & <tchau>' })] });
  const url = await drawioUrl(xml);
  assert.match(url, /^https:\/\/app\.diagrams\.net\/#R/);
  // draw.io: decodeURIComponent(inflateRaw(atob(data)))
  const data = decodeURIComponent(url.slice('https://app.diagrams.net/#R'.length));
  const inflated = zlib.inflateRawSync(Buffer.from(data, 'base64')).toString('latin1');
  assert.equal(decodeURIComponent(inflated), xml);
});
