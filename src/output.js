// Helpers for converted output: a short summary of a draw.io diagram and links
// that open a result directly in draw.io, Mermaid Live or the PlantUML server.
// Works in the browser (window.ExcOutput) and in Node (module.exports) for tests.

(function(global){
  'use strict';

  // Counts the cells of a converted diagram, e.g. { shapes: 3, connectors: 2, frames: 1, texts: 1 }
  function summarize(xml){
    const counts = { shapes: 0, connectors: 0, frames: 0, texts: 0 };
    for(const m of String(xml).matchAll(/<mxCell [^>]*?(edge|vertex)="1"[^>]*>/g)){
      const style = (m[0].match(/style="([^"]*)"/) || [])[1] || '';
      if(m[1] === 'edge') counts.connectors++;
      else if(/(^|;)container=1(;|$)/.test(style)) counts.frames++;
      else if(/^text(;|$)/.test(style)) counts.texts++;
      else counts.shapes++;
    }
    return counts;
  }

  function bytesToBase64(bytes){
    let bin = '';
    for(let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  // format: 'deflate' (zlib) or 'deflate-raw'
  async function compress(text, format){
    const stream = new Blob([new TextEncoder().encode(text)]).stream().pipeThrough(new CompressionStream(format));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  // draw.io opens "#R<data>" links, where data is the URI-encoded diagram,
  // raw-deflated and base64-encoded (draw.io's Graph.compress format).
  async function drawioUrl(xml){
    const compressed = await compress(encodeURIComponent(xml), 'deflate-raw');
    return 'https://app.diagrams.net/#R' + encodeURIComponent(bytesToBase64(compressed));
  }

  // Mermaid Live keeps its state in the hash: "pako:" + base64url(zlib(JSON state)).
  // Nothing is sent to a server.
  async function mermaidLiveUrl(code){
    const state = JSON.stringify({ code, mermaid: JSON.stringify({ theme: 'default' }, null, 2), autoSync: true, updateDiagram: true });
    const b64 = bytesToBase64(await compress(state, 'deflate')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return 'https://mermaid.live/edit#pako:' + b64;
  }

  // PlantUML server URLs: raw-deflated UTF-8 text in PlantUML's own base64
  // alphabet (0-9A-Za-z-_). Opening it sends the diagram to plantuml.com.
  const PLANTUML_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';
  function plantumlEncode64(bytes){
    let out = '';
    for(let i = 0; i < bytes.length; i += 3){
      const b1 = bytes[i], b2 = i + 1 < bytes.length ? bytes[i + 1] : 0, b3 = i + 2 < bytes.length ? bytes[i + 2] : 0;
      out += PLANTUML_ALPHABET[b1 >> 2] + PLANTUML_ALPHABET[((b1 & 0x3) << 4) | (b2 >> 4)] +
        PLANTUML_ALPHABET[((b2 & 0xF) << 2) | (b3 >> 6)] + PLANTUML_ALPHABET[b3 & 0x3F];
    }
    return out;
  }

  async function plantumlUrl(code){
    return 'https://www.plantuml.com/plantuml/uml/' + plantumlEncode64(await compress(code, 'deflate-raw'));
  }

  const api = { summarize, drawioUrl, mermaidLiveUrl, plantumlUrl, PLANTUML_ALPHABET };
  if(typeof module === 'object' && module.exports) module.exports = api;
  global.ExcOutput = api;
})(typeof window !== 'undefined' ? window : globalThis);
