// Summary of converted diagrams and "Open in draw.io / Mermaid Live / PlantUML" links.
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { summarize, drawioUrl, mermaidLiveUrl, plantumlUrl, PLANTUML_ALPHABET } = require('../src/output.js');
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

test('mermaidLiveUrl stores the code in the Mermaid Live state', async () => {
  const code = 'flowchart TD\n  n1["Olá"] --> n2\n';
  const url = await mermaidLiveUrl(code);
  assert.match(url, /^https:\/\/mermaid\.live\/edit#pako:[A-Za-z0-9_-]+$/);
  const data = url.split('#pako:')[1].replace(/-/g, '+').replace(/_/g, '/');
  const state = JSON.parse(zlib.inflateSync(Buffer.from(data, 'base64')).toString('utf8'));
  assert.equal(state.code, code);
  assert.deepEqual(JSON.parse(state.mermaid), { theme: 'default' });
});

// Reverse of PlantUML's encoding, to check links decode to the original text
function plantumlDecode(encoded){
  const bytes = [];
  for(let i = 0; i < encoded.length; i += 4){
    const [c1, c2, c3, c4] = [0, 1, 2, 3].map(k => PLANTUML_ALPHABET.indexOf(encoded[i + k]));
    bytes.push((c1 << 2) | (c2 >> 4), ((c2 & 0xF) << 4) | (c3 >> 2), ((c3 & 0x3) << 6) | c4);
  }
  return zlib.inflateRawSync(Buffer.from(bytes), { finishFlush: zlib.constants.Z_SYNC_FLUSH }).toString('utf8');
}

test('PlantUML decoding matches the example from the PlantUML docs', () => {
  assert.equal(plantumlDecode('SyfFKj2rKt3CoKnELR1Io4ZDoSa70000'), 'Bob -> Alice : hello');
});

test('plantumlUrl encodes the diagram for the PlantUML server', async () => {
  const code = '@startuml\nrectangle "Olá" as n1\nn1 --> n1 : loop\n@enduml\n';
  const url = await plantumlUrl(code);
  assert.match(url, /^https:\/\/www\.plantuml\.com\/plantuml\/uml\/[0-9A-Za-z_-]+$/);
  assert.equal(plantumlDecode(url.split('/uml/')[1]), code);
});
