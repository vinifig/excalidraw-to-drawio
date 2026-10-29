// Helpers for the converted draw.io XML: a short summary of what it contains
// and a link that opens it directly in draw.io.
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

  // draw.io opens "#R<data>" links, where data is the URI-encoded diagram,
  // raw-deflated and base64-encoded (draw.io's Graph.compress format).
  async function drawioUrl(xml){
    const input = new TextEncoder().encode(encodeURIComponent(xml));
    const stream = new Blob([input]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
    return 'https://app.diagrams.net/#R' + encodeURIComponent(bytesToBase64(compressed));
  }

  const api = { summarize, drawioUrl };
  if(typeof module === 'object' && module.exports) module.exports = api;
  global.ExcOutput = api;
})(typeof window !== 'undefined' ? window : globalThis);
