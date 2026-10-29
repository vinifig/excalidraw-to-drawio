// Test helpers: run the converter and read its draw.io XML back as plain objects.
const { convertExcalidrawToDrawio } = require('../src/converter-drawio.js');

function decodeXml(s){
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function attrs(tag){
  const out = {};
  for(const m of tag.matchAll(/([\w:]+)="([^"]*)"/g)) out[m[1]] = decodeXml(m[2]);
  return out;
}

// "a=1;b;c=x" -> { a: '1', b: true, c: 'x' }
function parseStyle(style){
  const out = {};
  for(const part of (style || '').split(';')){
    if(!part) continue;
    const i = part.indexOf('=');
    if(i < 0) out[part] = true;
    else out[part.slice(0, i)] = part.slice(i + 1);
  }
  return out;
}

const num = v => (v === undefined ? undefined : Number(v));

// Each mxCell is serialized on its own line
function parse(xml){
  const model = attrs(xml.match(/<mxGraphModel [^>]*>/)[0]);
  const cells = [];
  for(const line of xml.split('\n')){
    const open = line.match(/<mxCell ([^>]*?)\/?>/);
    if(!open) continue;
    const cell = attrs(open[1]);
    if(cell.id === '0' || cell.id === '1') continue;
    cell.style = parseStyle(cell.style);
    const geom = line.match(/<mxGeometry ([^>]*?)\/?>/);
    if(geom){
      const g = attrs(geom[1]);
      cell.geometry = { x: num(g.x), y: num(g.y), width: num(g.width), height: num(g.height) };
    }
    cell.points = [];
    for(const p of line.matchAll(/<mxPoint ([^>]*?)\/>/g)){
      const a = attrs(p[1]);
      const pt = { x: num(a.x), y: num(a.y) };
      if(a.as === 'sourcePoint') cell.sourcePoint = pt;
      else if(a.as === 'targetPoint') cell.targetPoint = pt;
      else cell.points.push(pt);
    }
    cells.push(cell);
  }
  return { xml, model, cells };
}

// convert([...elements], options, { appState, files }) -> { xml, model, cells }
function convert(elements, options, extra){
  return parse(convertExcalidrawToDrawio(Object.assign({ type: 'excalidraw', elements }, extra), options));
}

// Convert and return the cells in output order (one per converted element)
function cellsOf(elements, options, extra){
  return convert(elements, options, extra).cells;
}

// Minimal element factories with Excalidraw-like defaults
const rect = (props) => Object.assign({ type: 'rectangle', id: 'r', x: 0, y: 0, width: 100, height: 50, strokeColor: '#1e1e1e', backgroundColor: 'transparent', strokeWidth: 1 }, props);
const ellipse = (props) => rect(Object.assign({ type: 'ellipse', id: 'e' }, props));
const diamond = (props) => rect(Object.assign({ type: 'diamond', id: 'd' }, props));
const text = (props) => Object.assign({ type: 'text', id: 't', x: 0, y: 0, width: 50, height: 25, text: 'Hi', fontSize: 20, strokeColor: '#1e1e1e' }, props);
const arrow = (props) => Object.assign({ type: 'arrow', id: 'a', x: 0, y: 0, width: 100, height: 0, points: [[0, 0], [100, 0]], strokeColor: '#1e1e1e', strokeWidth: 1 }, props);
const frame = (props) => Object.assign({ type: 'frame', id: 'f', x: 0, y: 0, width: 400, height: 300, name: 'Frame' }, props);

module.exports = { convert, cellsOf, parse, parseStyle, rect, ellipse, diamond, text, arrow, frame };
