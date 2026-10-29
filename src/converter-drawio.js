// Excalidraw -> draw.io (mxGraph) minimal client-side converter
// NOTE: This is a heuristic lightweight mapping for common primitive shapes
// (rectangle, ellipse, diamond, text, line/arrow, frame). Images and freedraw are
// embedded as data URIs (images) or paths (simplified) inside a shape.
// draw.io file format is an XML <mxfile> containing <diagram> with a base64
// compressed/zlib+base64 encoded mxGraphModel by default. For simplicity
// here we output a plain (uncompressed) <mxfile><diagram> containing raw
// mxGraphModel XML; draw.io will still import it.
// We assign incremental IDs; parent layer is id=0, default layer = 1.
// Excalidraw frames become draw.io containers; elements with a frameId are
// nested inside them using coordinates relative to the frame. Excalidraw can't
// nest frames, so a frame drawn entirely inside another one is nested here.
//
// Styling is driven by conversion options (see OPTION_DEFS / PRESETS):
// "excalidraw" keeps the original look, "drawio" maps everything to draw.io's
// default conventions (palette, fonts, square/rounded shapes, swimlanes...),
// "flowchart" exports a draw.io flowchart (terminator / process / decision
// shapes with a fixed color each, connected orthogonal arrows), and any
// single option can be overridden on top of a preset.

(function(global){
  'use strict';

  // ---------------------------------------------------------------------------
  // Conversion options
  // ---------------------------------------------------------------------------

  const OPTION_DEFS = [
    { key: 'shapes', label: 'Shapes', choices: [
      ['keep', 'Keep Excalidraw shapes'],
      ['flowchart', 'Flowchart (ellipse = start/end)']
    ]},
    { key: 'colors', label: 'Colors', choices: [
      ['keep', 'Keep Excalidraw colors'],
      ['palette', 'Map to draw.io palette'],
      ['flowchart', 'Fixed color per flowchart shape'],
      ['default', 'draw.io default (no colors)']
    ]},
    { key: 'transparentFill', label: 'Transparent fills', choices: [
      ['keep', 'Keep transparent'],
      ['white', 'draw.io default (white)']
    ]},
    { key: 'roundness', label: 'Corners', choices: [
      ['keep', 'Keep Excalidraw radius'],
      ['drawio', 'draw.io rounded when rounded'],
      ['square', 'Always square'],
      ['round', 'Always rounded']
    ]},
    { key: 'sketch', label: 'Hand-drawn (sketch)', choices: [
      ['keep', 'Keep (from roughness / fill style)'],
      ['on', 'Always sketch'],
      ['off', 'Never sketch']
    ]},
    { key: 'font', label: 'Fonts', choices: [
      ['keep', 'Closest to Excalidraw fonts'],
      ['default', 'draw.io default (Helvetica)']
    ]},
    { key: 'strokeWidth', label: 'Stroke width', choices: [
      ['keep', 'Keep Excalidraw width'],
      ['default', 'draw.io default (1)']
    ]},
    { key: 'strokeStyle', label: 'Dashed / dotted', choices: [
      ['keep', 'Keep'],
      ['solid', 'Always solid']
    ]},
    { key: 'arrowheads', label: 'Arrowheads', choices: [
      ['keep', 'Closest to Excalidraw'],
      ['drawio', 'draw.io classic arrow']
    ]},
    { key: 'connect', label: 'Arrow bindings', choices: [
      ['free', 'Free-floating arrows'],
      ['bind', 'Connect arrows to shapes']
    ]},
    { key: 'edgeRouting', label: 'Arrow routing', choices: [
      ['keep', 'Follow Excalidraw points'],
      ['orthogonal', 'draw.io orthogonal (auto)']
    ]},
    { key: 'edgeShape', label: 'Lines', choices: [
      ['filled', 'Filled edge'],
      ['standard', 'Standard connector']
    ]},
    { key: 'opacity', label: 'Opacity', choices: [
      ['keep', 'Keep'],
      ['ignore', 'Ignore (fully opaque)']
    ]},
    { key: 'frames', label: 'Frames', choices: [
      ['excalidraw', 'Excalidraw-like frame'],
      ['swimlane', 'draw.io container (swimlane)']
    ]},
    { key: 'canvas', label: 'Canvas', choices: [
      ['keep', 'Keep background & grid'],
      ['default', 'draw.io default']
    ]}
  ];

  const PRESETS = {
    excalidraw: {
      shapes: 'keep', connect: 'free', edgeRouting: 'keep',
      colors: 'keep', transparentFill: 'keep', roundness: 'keep', sketch: 'keep',
      font: 'keep', strokeWidth: 'keep', strokeStyle: 'keep', arrowheads: 'keep',
      edgeShape: 'filled', opacity: 'keep', frames: 'excalidraw', canvas: 'keep'
    },
    drawio: {
      shapes: 'keep', connect: 'bind', edgeRouting: 'keep',
      colors: 'palette', transparentFill: 'white', roundness: 'drawio', sketch: 'off',
      font: 'default', strokeWidth: 'default', strokeStyle: 'keep', arrowheads: 'drawio',
      edgeShape: 'standard', opacity: 'keep', frames: 'swimlane', canvas: 'default'
    },
    flowchart: {
      shapes: 'flowchart', connect: 'bind', edgeRouting: 'orthogonal',
      colors: 'flowchart', transparentFill: 'white', roundness: 'drawio', sketch: 'off',
      font: 'default', strokeWidth: 'default', strokeStyle: 'keep', arrowheads: 'drawio',
      edgeShape: 'standard', opacity: 'ignore', frames: 'swimlane', canvas: 'default'
    }
  };

  // Accepts undefined, a preset name ("drawio") or { preset, ...overrides }
  function resolveOptions(options){
    if(typeof options === 'string') options = { preset: options };
    options = options || {};
    const base = PRESETS[options.preset] || PRESETS.excalidraw;
    const opts = Object.assign({}, base);
    for(const def of OPTION_DEFS){
      const v = options[def.key];
      if(v != null && def.choices.some(c => c[0] === v)) opts[def.key] = v;
    }
    return opts;
  }

  // ---------------------------------------------------------------------------
  // Colors
  // ---------------------------------------------------------------------------

  // draw.io's standard style palette (fill / stroke pairs)
  const DRAWIO_PALETTE = {
    gray:   { fill: '#f5f5f5', stroke: '#666666' },
    blue:   { fill: '#dae8fc', stroke: '#6c8ebf' },
    green:  { fill: '#d5e8d4', stroke: '#82b366' },
    orange: { fill: '#ffe6cc', stroke: '#d79b00' },
    yellow: { fill: '#fff2cc', stroke: '#d6b656' },
    red:    { fill: '#f8cecc', stroke: '#b85450' },
    purple: { fill: '#e1d5e7', stroke: '#9673a6' }
  };

  // Fixed colors per flowchart role (draw.io palette)
  const FLOWCHART_COLORS = {
    start:    DRAWIO_PALETTE.green,
    end:      DRAWIO_PALETTE.red,
    process:  DRAWIO_PALETTE.blue,
    decision: DRAWIO_PALETTE.yellow
  };

  const START_WORDS = /^(start|begin|in[ií]cio|come[cç]o|iniciar|come[cç]ar)\b/i;
  const END_WORDS = /^(end|stop|finish|exit|fim|t[eé]rmino|final|finalizar|encerrar|sair)\b/i;

  // Flowchart role of a shape: rectangles are processes, diamonds are
  // decisions and ellipses are terminators. A flowchart doesn't need an end:
  // a terminator is only an end when its label says so (End, Fim, Stop...) or
  // when the flow only arrives at it; otherwise it is a start.
  function flowchartRoles(elements){
    const incoming = {}, outgoing = {}, labels = {};
    const count = (map, id) => { if(id) map[id] = (map[id] || 0) + 1; };
    for(const el of elements){
      if(el.isDeleted) continue;
      if(el.type === 'text' && el.containerId) labels[el.containerId] = String(el.text || '').trim();
      if(!['arrow','line'].includes(el.type)) continue;
      let from = el.startBinding && el.startBinding.elementId;
      let to = el.endBinding && el.endBinding.elementId;
      // An arrow drawn backwards (head only at its start) flows end -> start
      const startHead = el.startArrowhead && el.startArrowhead !== 'none';
      const endHead = (el.endArrowhead !== undefined ? el.endArrowhead : (el.type === 'arrow' ? 'arrow' : null));
      if(startHead && (!endHead || endHead === 'none')) [from, to] = [to, from];
      count(outgoing, from);
      count(incoming, to);
    }
    const roles = {};
    for(const el of elements){
      if(el.type === 'ellipse'){
        const label = labels[el.id] || '';
        if(END_WORDS.test(label)) roles[el.id] = 'end';
        else if(START_WORDS.test(label)) roles[el.id] = 'start';
        else roles[el.id] = (incoming[el.id] && !outgoing[el.id]) ? 'end' : 'start';
      }
      else if(el.type === 'rectangle') roles[el.id] = 'process';
      else if(el.type === 'diamond') roles[el.id] = 'decision';
    }
    return roles;
  }

  function parseHex(color){
    if(typeof color !== 'string') return null;
    const m = color.trim().match(/^#([0-9a-f]{3,8})$/i);
    if(!m) return null;
    let h = m[1];
    if(h.length === 3 || h.length === 4) h = h.split('').map(c => c + c).join('');
    if(h.length !== 6 && h.length !== 8) return null;
    return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  }

  // Classify a color into a draw.io palette family, or 'black' / 'white'
  function colorFamily(color){
    const rgb = parseHex(color);
    if(!rgb) return 'black';
    const [r, g, b] = rgb;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    if(l < 0.22) return 'black';
    if(l > 0.95 && s < 0.5) return 'white';
    if(s < 0.15) return 'gray';
    let hue;
    if(max === r) hue = ((g - b) / d) % 6;
    else if(max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue = (hue * 60 + 360) % 360;
    if(hue < 15 || hue >= 335) return 'red';
    if(hue < 40) return 'orange';
    if(hue < 70) return 'yellow';
    if(hue < 170) return 'green';
    if(hue < 250) return 'blue';
    return 'purple';
  }

  // Returns { stroke, fill, font }: a color string, 'none' (transparent) or
  // null (omit and let draw.io apply its default).
  function resolveColors(el, opts){
    const rawStroke = el.strokeColor || '#000000';
    const hasBg = el.backgroundColor && el.backgroundColor !== 'transparent';
    const transparent = opts.transparentFill === 'white' ? null : 'none';
    if(opts.colors === 'default'){
      return { stroke: null, fill: hasBg ? null : transparent, font: null };
    }
    if(opts.colors === 'flowchart'){
      const pair = FLOWCHART_COLORS[opts.roles[el.id]];
      if(pair) return { stroke: pair.stroke, fill: pair.fill, font: null };
      return { stroke: null, fill: transparent, font: null };
    }
    if(opts.colors === 'palette'){
      const sFam = colorFamily(rawStroke);
      const bFam = hasBg ? colorFamily(el.backgroundColor) : null;
      const fillFam = (bFam && DRAWIO_PALETTE[bFam]) ? bFam : null;
      let fill;
      if(fillFam) fill = DRAWIO_PALETTE[fillFam].fill;
      else if(bFam === 'white') fill = null;
      else if(bFam === 'black') fill = '#333333';
      else fill = transparent;
      let stroke;
      if(sFam === 'black') stroke = fillFam ? DRAWIO_PALETTE[fillFam].stroke : null;
      else if(sFam === 'white') stroke = '#ffffff';
      else stroke = DRAWIO_PALETTE[sFam].stroke;
      let font;
      if(sFam === 'black') font = null;
      else if(sFam === 'white') font = '#ffffff';
      else font = DRAWIO_PALETTE[sFam].stroke;
      return { stroke, fill, font };
    }
    return { stroke: rawStroke, fill: hasBg ? el.backgroundColor : transparent, font: rawStroke };
  }

  function colorParts(colors){
    const parts = [];
    if(colors.fill) parts.push(`fillColor=${colors.fill}`);
    if(colors.stroke) parts.push(`strokeColor=${colors.stroke}`);
    return parts;
  }

  // ---------------------------------------------------------------------------
  // Shared style pieces
  // ---------------------------------------------------------------------------

  function encodeXml(text){
    return String(text)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&apos;');
  }

  function strokeWidthParts(el, opts){
    if(opts.strokeWidth === 'default') return [];
    return [`strokeWidth=${Math.max(1, Math.round(el.strokeWidth || 1))}`];
  }

  function dashParts(el, opts){
    if(opts.strokeStyle === 'solid') return [];
    if(el.strokeStyle === 'dashed') return ['dashed=1'];
    if(el.strokeStyle === 'dotted') return ['dashed=1', 'dashPattern=2 2'];
    return [];
  }

  function opacityParts(el, opts){
    if(opts.opacity === 'ignore') return [];
    if(typeof el.opacity === 'number' && el.opacity !== 100){
      return [`opacity=${Number(el.opacity).toFixed(1)}`];
    }
    return [];
  }

  function rotationParts(el){
    if(!el.angle) return [];
    return [`rotation=${(el.angle * 180 / Math.PI) % 360}`];
  }

  function sketchParts(el, opts, withFill){
    let on;
    if(opts.sketch === 'on') on = true;
    else if(opts.sketch === 'off') on = false;
    // Hand-drawn feel: draw.io supports sketch=1; we add it for hachure/cross-hatch or higher roughness.
    else on = ['hachure','cross-hatch','zigzag'].includes(el.fillStyle) || (typeof el.roughness === 'number' && el.roughness > 1);
    if(!on) return [];
    const parts = ['sketch=1'];
    // optional: tweak factor (draw.io: sketchFactor default 0.5) map roughness ~ [0,2]
    if(typeof el.roughness === 'number'){
      parts.push(`sketchFactor=${Math.min(2, Math.max(0.1, el.roughness / 2)).toFixed(2)}`);
    }
    // draw.io's sketch renderer (rough.js) understands the same fill styles as Excalidraw
    if(withFill && ['hachure','cross-hatch','zigzag','solid'].includes(el.fillStyle)){
      parts.push(`fillStyle=${el.fillStyle}`);
    }
    return parts;
  }

  // Excalidraw corner radius (see getCornerRadius in Excalidraw's math utils)
  function excalidrawCornerRadius(el){
    const x = Math.min(el.width || 0, el.height || 0);
    const type = el.roundness && el.roundness.type;
    if(type === 3){
      const fixed = (el.roundness.value != null) ? el.roundness.value : 32;
      return x <= fixed / 0.25 ? x * 0.25 : fixed;
    }
    return x * 0.25; // legacy (1) and proportional (2)
  }

  function roundnessParts(el, opts){
    if(!['rectangle','diamond'].includes(el.type)) return [];
    const isRounded = !!(el.roundness && el.roundness.type > 0);
    switch(opts.roundness){
      case 'square': return [];
      case 'round': return ['rounded=1'];
      case 'drawio': return isRounded ? ['rounded=1'] : [];
      default:
        if(!isRounded) return [];
        // absoluteArcSize: arcSize is the corner diameter in px
        return ['rounded=1', 'absoluteArcSize=1', `arcSize=${Math.round(excalidrawCornerRadius(el) * 2)}`];
    }
  }

  function styleForElement(el, opts, extra){
    let shape = 'rect';
    if(el.type === 'ellipse') shape = opts.shapes === 'flowchart' ? 'mxgraph.flowchart.terminator' : 'ellipse';
    else if(el.type === 'diamond') shape = 'rhombus';
    else if(el.type === 'freedraw') shape = 'process'; // generic fallback
    else if(el.type === 'image') shape = 'image';

    const parts = [];
    // If extra already sets shape=image (freedraw/image override) don't duplicate base shape
    if(!(extra && /(^|;)shape=image(;|$)/.test(extra))){
      parts.push(`shape=${shape}`);
    }
    if(shape === 'ellipse') parts.push('perimeter=ellipsePerimeter');
    if(shape === 'rhombus') parts.push('perimeter=rhombusPerimeter');
    if(opts.shapes === 'flowchart') parts.push('html=1', 'whiteSpace=wrap');
    parts.push(...roundnessParts(el, opts));
    parts.push(...colorParts(resolveColors(el, opts)));
    parts.push(...strokeWidthParts(el, opts));
    parts.push(...dashParts(el, opts));
    if(el.type !== 'image') parts.push(...sketchParts(el, opts, true));
    parts.push(...opacityParts(el, opts));
    parts.push(...rotationParts(el));
    // Text handled separately by styleForTextElement
    if(extra) parts.push(extra);
    return parts.join(';');
  }

  // ---------------------------------------------------------------------------
  // Fonts
  // ---------------------------------------------------------------------------

  function googleFont(name){
    return { family: name, source: encodeURIComponent('https://fonts.googleapis.com/css?family=' + name.replace(/ /g, '+')) };
  }

  function mapFont(code, opts){
    if(opts.font === 'default') return { family: 'Helvetica' };
    // Excalidraw FONT_FAMILY ids
    switch(code){
      case 1: // Virgil
      case 5: // Excalifont
        return googleFont('Architects Daughter'); // draw.io's own hand-drawn font
      case 3: // Cascadia
      case 8: // Comic Shanns
        return { family: 'Courier New' };
      case 6: return googleFont('Nunito');
      case 7: return googleFont('Lilita One');
      case 2: // Helvetica
      case 4: // Liberation Sans
      default: return { family: 'Helvetica' };
    }
  }

  function fontFamilyParts(el, opts){
    if(!el.fontFamily && opts.font !== 'default') return [];
    const f = mapFont(el.fontFamily, opts);
    const parts = [`fontFamily=${f.family}`];
    if(f.source) parts.push(`fontSource=${f.source}`);
    return parts;
  }

  // Slight downscale to reduce text size so it fits boxes closer to original Excalidraw rendering.
  const FONT_SCALE = 0.90;
  function scaleFont(size){ return Math.max(4, Math.round(size * FONT_SCALE)); }

  // ---------------------------------------------------------------------------
  // Lines & arrows
  // ---------------------------------------------------------------------------

  function mapArrow(head, opts){
    // Returns object {shape, fill} where fill is 1 or 0 for start/endFill flags.
    switch(head){
      case 'arrow':
        return opts.arrowheads === 'drawio' ? { shape: 'classic', fill: 1 } : { shape: 'open', fill: 0 };
      case 'triangle': return { shape: 'block', fill: 1 };
      case 'triangle_outline': return { shape: 'block', fill: 0 };
      case 'dot':
      case 'circle': return { shape: 'oval', fill: 1 };
      case 'circle_outline': return { shape: 'oval', fill: 0 };
      case 'diamond': return { shape: 'diamond', fill: 1 };
      case 'diamond_outline': return { shape: 'diamond', fill: 0 };
      case 'bar': return { shape: 'dash', fill: 0 };
      case 'crowfoot_one': return { shape: 'ERone', fill: 0 };
      case 'crowfoot_many': return { shape: 'ERmany', fill: 0 };
      case 'crowfoot_one_or_many': return { shape: 'ERoneToMany', fill: 0 };
      case 'none':
      case undefined:
      case null:
        return { shape: 'none', fill: 0 };
      default:
        return { shape: 'open', fill: 0 };
    }
  }

  function lineStyle(el, opts){
    let endHead = el.endArrowhead !== undefined ? el.endArrowhead : el.arrowhead;
    // Old files omit the field; Excalidraw restores arrows with an "arrow" end
    if(endHead === undefined && el.type === 'arrow') endHead = 'arrow';
    const startArrowObj = mapArrow(el.startArrowhead, opts);
    const endArrowObj = mapArrow(endHead, opts);
    const colors = resolveColors(el, opts);

    // Excalidraw lines with roundness are curved; elbow arrows are orthogonal
    const multiPoint = el.points && el.points.length > 2;
    const isCurved = multiPoint && !el.elbowed && (el.curve === true || el.isCurve === true || !!(el.roundness && el.roundness.type));

    const arr = [];
    if(opts.edgeShape === 'filled') arr.push('shape=filledEdge');
    arr.push('html=1');
    arr.push(...strokeWidthParts(el, opts));
    if(colors.stroke) arr.push(`strokeColor=${colors.stroke}`);
    if(opts.edgeShape === 'filled') arr.push('fillColor=none');
    arr.push(`startArrow=${startArrowObj.shape}`);
    arr.push(`startFill=${startArrowObj.fill}`);
    arr.push(`endArrow=${endArrowObj.shape}`);
    arr.push(`endFill=${endArrowObj.fill}`);
    if(opts.arrowheads === 'keep'){
      arr.push('startSize=6');
      arr.push('endSize=6');
    }
    let curved = false, rounded = false;
    switch(opts.roundness){
      case 'square': break;
      case 'round': rounded = true; break;
      default: curved = isCurved;
    }
    if(opts.edgeRouting === 'orthogonal'){
      arr.push('edgeStyle=orthogonalEdgeStyle', 'orthogonalLoop=1', 'jettySize=auto');
      curved = false;
    }
    // Arrows bound to a fixed point of a shape (elbow arrows) keep that anchor
    if(opts.connect === 'bind'){
      for(const [binding, prefix] of [[el.startBinding, 'exit'], [el.endBinding, 'entry']]){
        const fp = binding && binding.fixedPoint;
        if(Array.isArray(fp) && fp.length === 2){
          const clamp = v => Math.min(1, Math.max(0, Number(v) || 0)).toFixed(3).replace(/\.?0+$/, '');
          arr.push(`${prefix}X=${clamp(fp[0])}`, `${prefix}Y=${clamp(fp[1])}`, `${prefix}Dx=0`, `${prefix}Dy=0`);
        }
      }
    }
    if(curved){
      arr.push('edgeStyle=none'); // don't orthogonally route
      arr.push('curved=1');
    }
    arr.push(`rounded=${rounded ? 1 : 0}`);
    arr.push(...dashParts(el, opts));
    arr.push('fixDash=1');
    arr.push(...sketchParts(el, opts, false));
    arr.push(...opacityParts(el, opts));
    return arr.join(';');
  }

  // ---------------------------------------------------------------------------
  // Frames
  // ---------------------------------------------------------------------------

  const FRAME_TYPES = ['frame','magicframe'];
  const SWIMLANE_HEADER = 26;

  function frameStyle(el, opts){
    if(opts.frames === 'swimlane'){
      // draw.io's canonical container; header sits above the frame contents
      const body = (el.backgroundColor && el.backgroundColor !== 'transparent') ? el.backgroundColor : '#ffffff';
      return ['swimlane','html=1','whiteSpace=wrap','container=1','collapsible=0','recursiveResize=0',`startSize=${SWIMLANE_HEADER}`,`swimlaneFillColor=${body}`]
        .concat(opacityParts(el, opts)).join(';');
    }
    // Excalidraw frames: thin grey border, white body (easier to see on the canvas), name above the top-left corner
    const parts = ['rounded=0','html=1','whiteSpace=wrap','container=1','collapsible=0','recursiveResize=0'];
    const stroke = (el.strokeColor && el.strokeColor !== '#000000' && el.strokeColor !== 'transparent') ? el.strokeColor : '#bbbbbb';
    parts.push(`strokeColor=${stroke}`);
    parts.push((el.backgroundColor && el.backgroundColor !== 'transparent') ? `fillColor=${el.backgroundColor}` : 'fillColor=#ffffff');
    parts.push('strokeWidth=1');
    parts.push('align=left');
    parts.push('verticalAlign=bottom');
    parts.push('labelPosition=center');
    parts.push('verticalLabelPosition=top');
    parts.push('spacingLeft=0');
    parts.push('spacingBottom=2');
    parts.push('fontSize=14');
    parts.push('fontColor=#999999');
    parts.push(...opacityParts(el, opts));
    return parts.join(';');
  }

  // Axis-aligned bounding box in scene coordinates
  function elementBox(el){
    if(Array.isArray(el.points) && el.points.length){
      const xs = el.points.map(p => p[0]), ys = el.points.map(p => p[1]);
      return { x1: el.x + Math.min(...xs), y1: el.y + Math.min(...ys), x2: el.x + Math.max(...xs), y2: el.y + Math.max(...ys) };
    }
    return { x1: el.x, y1: el.y, x2: el.x + (el.width || 0), y2: el.y + (el.height || 0) };
  }

  function boxContains(outer, inner){
    return inner.x1 >= outer.x1 && inner.y1 >= outer.y1 && inner.x2 <= outer.x2 && inner.y2 <= outer.y2;
  }

  // Parent frame id for each frame: the smallest frame that fully contains it
  function nestFrames(frames){
    const parents = {};
    const area = f => (f.width || 0) * (f.height || 0);
    frames.forEach((f, i) => {
      const box = elementBox(f);
      let best = null;
      frames.forEach((g, j) => {
        if(i === j || !boxContains(elementBox(g), box)) return;
        // Identical boxes contain each other: the one listed first is the outer one
        if(j > i && boxContains(box, elementBox(g))) return;
        if(!best || area(g) < area(best)) best = g;
      });
      if(best) parents[f.id] = best.id;
    });
    return parents;
  }

  // ---------------------------------------------------------------------------
  // Images
  // ---------------------------------------------------------------------------

  function resolveImageDataURL(data, el){
    if(!data.files || !el.fileId) return null;
    const f = data.files[el.fileId];
    if(!f) return null;
    // Excalidraw file objects sometimes store under .dataURL or .data or base64
    if(f.dataURL) return sanitizeDataUrl(f.dataURL);
    if(f.data) return sanitizeDataUrl(f.data); // assume already dataURL or base64 (we won't attempt to guess mime)
    if(f.base64){
      const mime = f.mimeType || 'image/png';
      return sanitizeDataUrl(`data:${mime};base64,${f.base64}`);
    }
    return null;
  }

  function sanitizeDataUrl(url){
    if(typeof url !== 'string') return url;
    // draw.io exports often omit ';base64' even when data is base64 encoded.
    // We strip it to maximize compatibility: data:image/png;base64,XXXX -> data:image/png,XXXX
    // Only do this for common image mime types to avoid altering other embedded formats.
    return url.replace(/^(data:image\/(?:png|jpeg|jpg|gif|webp|svg\+xml));base64,/i, '$1,');
  }

  // ---------------------------------------------------------------------------
  // Conversion
  // ---------------------------------------------------------------------------

  function convert(excalidata, options){
    const data = (typeof excalidata === 'string') ? JSON.parse(excalidata) : excalidata;
    const opts = resolveOptions(options);
    const elements = data.elements || [];
    opts.roles = flowchartRoles(elements);
    const appState = data.appState || {};

    // Compute bounding box offsets so we don't get negative coords
    let minX = 0, minY = 0;
    for(const el of elements){
      if(el.x < minX) minX = el.x;
      if(el.y < minY) minY = el.y;
    }
    if(minX > 0) minX = 0; if(minY > 0) minY = 0;
    // We'll build structured cell objects first to allow a second pass for container text & edge labels
    let idCounter = 2; // 0=root,1=layer
    function nextId(){ return (idCounter++).toString(); }

    const cellObjs = [];
    const elementToCell = {}; // excalidraw element id -> mx cell id
    const deferredText = [];  // store text elements for second pass
    const frameOrigins = {};  // excalidraw frame id -> origin of its children (page coords)
    const frames = elements.filter(el => !el.isDeleted && FRAME_TYPES.includes(el.type));
    const frameParents = nestFrames(frames);
    const frameChildren = {}; // excalidraw frame id -> frames nested directly inside it
    for(const f of frames){
      const parentId = frameParents[f.id];
      if(parentId) (frameChildren[parentId] = frameChildren[parentId] || []).push(f);
    }

    // An element belongs to its Excalidraw frame, or to the innermost frame
    // nested in it that fully contains the element.
    function frameOf(el){
      let frameId = el.frameId;
      if(!frameId || !frameOrigins[frameId]) return null;
      const box = elementBox(el);
      for(let inner = true; inner;){
        inner = false;
        for(const child of frameChildren[frameId] || []){
          if(boxContains(elementBox(child), box)){ frameId = child.id; inner = true; break; }
        }
      }
      return frameId;
    }

    // Resolve the parent cell for an element: its frame container (with
    // coordinates relative to the frame) or the default layer.
    function placement(el){
      const frameId = FRAME_TYPES.includes(el.type) ? frameParents[el.id] : frameOf(el);
      const origin = frameId && frameOrigins[frameId];
      if(origin && elementToCell[frameId]){
        return { parent: elementToCell[frameId], dx: origin.x, dy: origin.y };
      }
      return { parent: '1', dx: 0, dy: 0 };
    }

    // Helper to push a vertex
    function addVertex(el, style, value, parentId, x, y, w, h){
      const id = nextId();
      cellObjs.push({ id, value: value||'', style, vertex:1, parent: parentId||'1', geom:{x,y,w,h} });
      elementToCell[el.id] = id;
      return id;
    }
    // Helper to push edge
    function addEdge(el, style, value, sourcePoint, targetPoint, parentId){
      const id = nextId();
      cellObjs.push({ id, value: value||'', style, edge:1, parent: parentId||'1', sourcePoint, targetPoint });
      elementToCell[el.id] = id;
      return id;
    }

    // Frames first so containers exist (and render behind) before their children;
    // outer frames before the frames nested in them
    const frameDepth = f => frameParents[f.id] ? 1 + frameDepth(frames.find(g => g.id === frameParents[f.id])) : 0;
    const orderedFrames = frames.map(f => ({ f, depth: frameDepth(f) }))
      .sort((a, b) => a.depth - b.depth).map(e => e.f);
    for(const el of orderedFrames){
      const x = (el.x - minX) || 0;
      const y = (el.y - minY) || 0;
      const w = Math.max(1, Math.round(el.width || 100));
      const h = Math.max(1, Math.round(el.height || 100));
      const name = el.name != null ? el.name : (el.type === 'magicframe' ? 'AI Frame' : 'Frame');
      // A swimlane's header is part of the cell, so grow it upwards to keep contents in place
      const header = opts.frames === 'swimlane' ? SWIMLANE_HEADER : 0;
      const pl = placement(el);
      frameOrigins[el.id] = { x, y: y - header };
      addVertex(el, frameStyle(el, opts), encodeXml(name), pl.parent, x - pl.dx, y - header - pl.dy, w, h + header);
    }

    for(const el of elements){
      if(el.isDeleted || FRAME_TYPES.includes(el.type)) continue;
      if(el.type === 'text'){
        // process later (to attach to container / edge if needed)
        deferredText.push(el);
        continue;
      }
      if(['rectangle','ellipse','diamond','freedraw','image'].includes(el.type)){
        const x = (el.x - minX) || 0;
        const y = (el.y - minY) || 0;
        const w = Math.max(1, Math.round(el.width || 100));
        const h = Math.max(1, Math.round(el.height || 50));
        let extraStyle = '';
        if(el.type === 'image'){
          const dataUrl = resolveImageDataURL(data, el);
          if(dataUrl){
            extraStyle = 'shape=image;verticalLabelPosition=bottom;labelBackgroundColor=none;imageAspect=1;aspect=fixed;image=' + dataUrl;
          } else {
            const placeholder = encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='64' height='64' fill='#eee' stroke='#999'/><text x='32' y='36' font-size='10' text-anchor='middle' fill='#666'>IMG?</text></svg>");
            extraStyle = 'shape=image;image=data:image/svg+xml,'+placeholder;
          }
        }
        let geomX = x, geomY = y, geomW = w, geomH = h;
        if(el.type === 'freedraw'){
          const payload = freedrawImagePayload(el, opts);
          if(payload){
            extraStyle = 'shape=image;image=' + payload.dataUri;
            // adjust geometry to bounding box top-left (x + minX/minY) if offsets differ
            geomX = (el.x + payload.offsetX) - minX;
            geomY = (el.y + payload.offsetY) - minY;
            geomW = payload.width; geomH = payload.height;
          }
        }
        const style = styleForElement(el, opts, extraStyle);
        const pl = placement(el);
        addVertex(el, style, '', pl.parent, geomX - pl.dx, geomY - pl.dy, geomW, geomH);
      } else if(['line','arrow'].includes(el.type)){
        const style = lineStyle(el, opts);
        let x1 = el.x, y1 = el.y;
        let x2 = el.x + (el.width || 0), y2 = el.y + (el.height || 0);
        let waypoints = [];
        if(el.points && el.points.length > 1){
          x1 = el.x + el.points[0][0]; y1 = el.y + el.points[0][1];
          const lp = el.points[el.points.length - 1];
            x2 = el.x + lp[0]; y2 = el.y + lp[1];
          if(el.points.length > 2){
            for(let i=1;i<el.points.length-1;i++){
              const p = el.points[i];
              waypoints.push({x: (el.x + p[0]) - minX, y: (el.y + p[1]) - minY});
            }
          }
        }
        // Edge geometry is expressed in its parent's coordinate space
        const pl = placement(el);
        x1 -= minX + pl.dx; y1 -= minY + pl.dy; x2 -= minX + pl.dx; y2 -= minY + pl.dy;
        for(const wp of waypoints){ wp.x -= pl.dx; wp.y -= pl.dy; }
        const edgeId = addEdge(el, style, '', {x:x1,y:y1}, {x:x2,y:y2}, pl.parent);
        const edgeObj = cellObjs.find(c => c.id === edgeId);
        if(waypoints.length) edgeObj.points = waypoints; // store for serialization
        edgeObj.bindings = {
          start: el.startBinding && el.startBinding.elementId,
          end: el.endBinding && el.endBinding.elementId
        };
      }
    }

    // Connect arrows to the shapes they are bound to (all vertices exist now)
    if(opts.connect === 'bind'){
      const vertexIds = new Set(cellObjs.filter(c => c.vertex).map(c => c.id));
      for(const c of cellObjs){
        if(!c.edge || !c.bindings) continue;
        const src = elementToCell[c.bindings.start];
        const tgt = elementToCell[c.bindings.end];
        if(src && vertexIds.has(src)) c.source = src;
        if(tgt && vertexIds.has(tgt)) c.target = tgt;
        // draw.io routes connected orthogonal edges itself
        if(opts.edgeRouting === 'orthogonal' && c.source && c.target) delete c.points;
      }
    }

    // Second pass: text elements
    for(const el of deferredText){
      const rawValue = buildPlainTextValue(el); // simpler value (preserve line breaks & special chars)
      const style = styleForTextElement(el, opts);
      const fontColor = resolveColors(el, opts).font;
      const w = Math.max(1, Math.round(el.width || (el.fontSize?el.fontSize*6:100)));
      const h = Math.max(1, Math.round(el.height || (el.fontSize?el.fontSize*1.2:40)));
      const x = (el.x - minX) || 0;
      const y = (el.y - minY) || 0;

      if(el.containerId && elementToCell[el.containerId]){
        const containerEl = elements.find(e => e.id === el.containerId);
        const parentCellId = elementToCell[el.containerId];
        // If the container is an edge, attach as label to edge cell
        if(containerEl && ['arrow','line'].includes(containerEl.type)){
          // Find edge cell object and update its value/style
            const edgeObj = cellObjs.find(c => c.id === parentCellId);
            if(edgeObj){
              edgeObj.value = rawValue; // draw.io will render HTML since html=1 in style
              // ensure html=1 present
              if(!/html=1/.test(edgeObj.style)) edgeObj.style += ';html=1';
              // Add font styling if absent
              const edgeAdditions = [];
              if(el.fontSize && !/fontSize=/.test(edgeObj.style)) edgeAdditions.push(`fontSize=${scaleFont(el.fontSize)}`);
              if(!/fontFamily=/.test(edgeObj.style)) edgeAdditions.push(...fontFamilyParts(el, opts));
              if(fontColor && !/fontColor=/.test(edgeObj.style)) edgeAdditions.push(`fontColor=${fontColor}`);
              if(edgeAdditions.length) edgeObj.style += ';' + edgeAdditions.join(';');
            }
            continue;
        }
        // If container is a shape (rectangle/ellipse/diamond/image/freedraw), merge text into parent shape cell
        if(containerEl && ['rectangle','ellipse','diamond','image','freedraw'].includes(containerEl.type)){
          const parentObj = cellObjs.find(c => c.id === parentCellId);
          if(parentObj){
            // Build richer HTML value using container width, not auto-resized text width
            const htmlValue = buildContainerTextValue(el, Math.round(containerEl.width || w), fontColor);
            parentObj.value = htmlValue;
            // Augment style with text properties
            const additions = [];
            if(!/html=1/.test(parentObj.style)) additions.push('html=1');
            // Align
            if(!/;align=/.test(parentObj.style)) additions.push(`align=${el.textAlign||'left'}`);
            const vAlign = el.verticalAlign === 'middle' ? 'middle' : (el.verticalAlign === 'bottom' ? 'bottom' : 'top');
            if(!/verticalAlign=/.test(parentObj.style)) additions.push(`verticalAlign=${vAlign}`);
            if(el.fontSize && !/fontSize=/.test(parentObj.style)) additions.push(`fontSize=${Math.round(el.fontSize)}`);
            if(!/fontFamily=/.test(parentObj.style)) additions.push(...fontFamilyParts(el, opts));
            if(fontColor && !/fontColor=/.test(parentObj.style)) additions.push(`fontColor=${fontColor}`);
            if(!/whiteSpace=/.test(parentObj.style)) additions.push('whiteSpace=wrap');
            if(additions.length) parentObj.style += ';' + additions.join(';');
          }
          continue;
        }
        // Fallback: treat as child vertex
        const relX = el.x - (containerEl ? containerEl.x : 0);
        const relY = el.y - (containerEl ? containerEl.y : 0);
        addVertex(el, style, rawValue, parentCellId, relX, relY, w, h);
      } else {
        // standalone text (possibly inside a frame)
        const pl = placement(el);
        addVertex(el, style, rawValue, pl.parent, x - pl.dx, y - pl.dy, w, h);
      }
    }

    // Root and layer
    const rootXml = ['<mxCell id="0"/>','<mxCell id="1" parent="0"/>'];
    const cellXml = cellObjs.map(c => {
      if(c.vertex){
        return `<mxCell id="${c.id}" value="${encodeXml(c.value)}" style="${encodeXml(c.style)}" vertex="1" parent="${c.parent}"><mxGeometry x="${c.geom.x}" y="${c.geom.y}" width="${c.geom.w}" height="${c.geom.h}" as="geometry"/></mxCell>`;
      } else if(c.edge){
        let pointsXml = '';
        if(c.points && c.points.length){
          pointsXml = '<Array as="points">' + c.points.map(p => `<mxPoint x="${p.x}" y="${p.y}"/>`).join('') + '</Array>';
        }
        return `<mxCell id="${c.id}" value="${encodeXml(c.value)}" style="${encodeXml(c.style)}" edge="1" parent="${c.parent}" source="${c.source||''}" target="${c.target||''}"><mxGeometry relative="1" as="geometry">${pointsXml}<mxPoint x="${c.sourcePoint.x}" y="${c.sourcePoint.y}" as="sourcePoint"/><mxPoint x="${c.targetPoint.x}" y="${c.targetPoint.y}" as="targetPoint"/></mxGeometry></mxCell>`;
      }
      return '';
    });

    // Canvas: Excalidraw background color & grid, or draw.io defaults
    let grid = 1, gridSize = 10, background = '';
    if(opts.canvas === 'keep'){
      const gridOn = appState.gridModeEnabled != null ? !!appState.gridModeEnabled : !!appState.gridSize;
      grid = gridOn ? 1 : 0;
      if(appState.gridSize) gridSize = appState.gridSize;
      const bg = appState.viewBackgroundColor;
      if(bg && bg !== 'transparent' && !/^#f{3}(f{3})?$/i.test(bg)) background = ` background="${encodeXml(bg)}"`;
    }

    const diagramName = 'Page-1';
    // Pretty-print with 2-space indentation
    const IND = '  ';
    const lines = [];
    lines.push(`<mxfile host="app.diagrams.net" modified="${new Date().toISOString()}" agent="excalidraw-converter" version="20.6.3" type="device">`);
    lines.push(`${IND}<diagram id="d1" name="${diagramName}">`);
    lines.push(`${IND}${IND}<mxGraphModel dx="1024" dy="1024" grid="${grid}" gridSize="${gridSize}" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" pageWidth="850" pageHeight="1100" math="0" shadow="0"${background}>`);
    lines.push(`${IND}${IND}${IND}<root>`);
    for(const c of rootXml){ lines.push(`${IND}${IND}${IND}${IND}${c}`); }
    for(const c of cellXml){ lines.push(`${IND}${IND}${IND}${IND}${c}`); }
    lines.push(`${IND}${IND}${IND}</root>`);
    lines.push(`${IND}${IND}</mxGraphModel>`);
    lines.push(`${IND}</diagram>`);
    lines.push(`</mxfile>`);
    return lines.join('\n');
  }

  function styleForTextElement(el, opts){
    const parts = ['text','html=1','nl2Br=0'];
    const align = el.textAlign || 'left';
    const vAlign = el.verticalAlign === 'middle' ? 'middle' : (el.verticalAlign === 'bottom' ? 'bottom' : 'top');
    parts.push(`align=${align}`);
    parts.push(`verticalAlign=${vAlign}`);
    if(el.fontSize) parts.push(`fontSize=${scaleFont(el.fontSize)}`);
    parts.push(...fontFamilyParts(el, opts));
    const fontColor = resolveColors(el, opts).font;
    if(fontColor) parts.push(`fontColor=${fontColor}`);
    parts.push('spacingLeft=0');
    parts.push('spacingRight=0');
    parts.push('spacingTop=0');
    parts.push('spacingBottom=0');
    parts.push('whiteSpace=wrap');
    parts.push('strokeColor=none');
    parts.push('fillColor=none');
    parts.push(...rotationParts(el));
    parts.push(...opacityParts(el, opts));
    return parts.join(';');
  }

  // Simpler plain text value (allow < & > etc), multi-line via <br>
  function buildPlainTextValue(el){
    const raw = el.text || '';
    return raw.split(/\n/).map(line => encodeXml(line)).join('<br>');
  }

  function buildContainerTextValue(el, containerWidth, color){
    const raw = el.text || '';
    const lines = raw.split(/\n/).map(l => encodeXml(l));
    const align = el.textAlign || 'left';
    const fontSize = scaleFont(el.fontSize || 16);
    const colorCss = color ? `color: ${color}; ` : '';
    const outerWidth = (containerWidth || fontSize * 6).toFixed(1);
    return `<div style="width: ${outerWidth}px;height:auto;word-break: break-word;line-height:1em;"><div align="${align}"><span style="font-size: ${fontSize}px; line-height: 0;"><span style="line-height: 0;"><span style="${colorCss}font-size: ${fontSize}px; line-height: 16.5px;">${lines.join('<br>')}</span><br></span></span></div></div>`;
  }

  function freedrawImagePayload(el, opts){
    if(!el.points || el.points.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for(const [px,py] of el.points){
      if(px < minX) minX = px; if(py < minY) minY = py;
      if(px > maxX) maxX = px; if(py > maxY) maxY = py;
    }
    if(!isFinite(minX) || !isFinite(minY)) return null;
    // normalized path
    const normPts = el.points.map(([px,py]) => [px - minX, py - minY]);
    const width = Math.max(1, Math.round(maxX - minX));
    const height = Math.max(1, Math.round(maxY - minY));
    const colors = resolveColors(el, opts);
    const stroke = colors.stroke || '#000000';
    const strokeWidth = opts.strokeWidth === 'default' ? 1 : Math.max(1, Math.round(el.strokeWidth || 1));
    const hasFill = el.backgroundColor && el.backgroundColor !== 'transparent' && colors.fill && colors.fill !== 'none';
    const fillColor = hasFill ? colors.fill : 'none';
    const isClosed = el.points.length > 2 && Math.abs(el.points[0][0]-el.points[el.points.length-1][0]) < 0.01 && Math.abs(el.points[0][1]-el.points[el.points.length-1][1]) < 0.01;
    const d = normPts.map((p,i)=> (i===0?`M${p[0].toFixed(2)} ${p[1].toFixed(2)}`:`L${p[0].toFixed(2)} ${p[1].toFixed(2)}`)).join(' ') + (isClosed? ' Z':'');
    const translucent = opts.opacity !== 'ignore' && typeof el.opacity === 'number' && el.opacity !== 100;
    const fillOpacity = translucent ? (el.opacity/100).toFixed(2) : (hasFill ? '1' : '0');
    const strokeOpacity = translucent ? (el.opacity/100).toFixed(2) : '1';
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}' viewBox='0 0 ${width} ${height}'><path d='${d}' stroke='${stroke}' stroke-width='${strokeWidth}' stroke-linecap='round' stroke-linejoin='round' fill='${fillColor}' fill-opacity='${fillOpacity}' stroke-opacity='${strokeOpacity}'/></svg>`;
    return { dataUri: 'data:image/svg+xml,' + encodeURIComponent(svg), offsetX: minX, offsetY: minY, width, height };
  }

  const api = {
    convertExcalidrawToDrawio: convert,
    OPTION_DEFS,
    PRESETS,
    resolveOptions,
    // Exposed for unit tests
    internals: {
      colorFamily, resolveColors, excalidrawCornerRadius, mapArrow, mapFont,
      flowchartRoles, nestFrames, elementBox, boxContains, sanitizeDataUrl
    }
  };
  if(typeof module === 'object' && module.exports) module.exports = api;
  global.ExcDrawio = api;
})(typeof window !== 'undefined' ? window : globalThis);
