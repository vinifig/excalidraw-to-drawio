// Excalidraw -> Mermaid / PlantUML text diagrams.
// Text diagrams have no coordinates, so the drawing is read as a graph:
// shapes become nodes, arrows bound to two shapes become connections, frames
// become groups (nested frames nest) and a shape with other shapes drawn inside
// it becomes a group around them. Free-floating text, images, freehand
// drawings and arrows that aren't attached at both ends are left out and
// reported in `skipped`.
// Works in the browser (window.ExcText, after converter-drawio.js) and in
// Node (module.exports) for tests.

(function(global){
  'use strict';

  const core = (typeof module === 'object' && module.exports) ? require('./converter-drawio.js') : global.ExcDrawio;
  const { flowchartRoles, assignFrames, nestShapes, inDrawOrder, colorFamily } = core.internals;

  const TEXT_OPTION_DEFS = [
    { key: 'direction', label: 'Direction', choices: [
      ['auto', 'Auto (from the drawing)'],
      ['TB', 'Top to bottom'],
      ['LR', 'Left to right']
    ]},
    { key: 'colors', label: 'Colors', choices: [
      ['keep', 'Keep Excalidraw colors'],
      ['none', 'No colors']
    ]}
  ];
  const TEXT_DEFAULTS = { direction: 'auto', colors: 'keep' };

  function resolveTextOptions(options){
    const opts = Object.assign({}, TEXT_DEFAULTS);
    for(const def of TEXT_OPTION_DEFS){
      const v = options && options[def.key];
      if(def.choices.some(c => c[0] === v)) opts[def.key] = v;
    }
    return opts;
  }

  // ---------------------------------------------------------------------------
  // Graph extraction
  // ---------------------------------------------------------------------------

  const SHAPE_TYPES = ['rectangle', 'ellipse', 'diamond'];
  const FRAME_TYPES = ['frame', 'magicframe'];
  const LINE_TYPES = ['arrow', 'line'];

  function hasHead(head){ return head != null && head !== 'none'; }

  // { nodes, edges, groups, skipped, direction }
  function buildGraph(scene){
    const data = (typeof scene === 'string') ? JSON.parse(scene) : (scene || {});
    const elements = inDrawOrder((data.elements || []).filter(el => el && !el.isDeleted));
    const roles = flowchartRoles(elements);

    // Text bound to a shape or an arrow is that element's label
    const labels = {};
    for(const el of elements){
      if(el.type === 'text' && el.containerId){
        labels[el.containerId] = labels[el.containerId] ? labels[el.containerId] + '\n' + el.text : String(el.text || '');
      }
    }

    // Arrows may also bind to a free text element: it then acts as a node
    const boundIds = new Set();
    for(const el of elements){
      if(!LINE_TYPES.includes(el.type)) continue;
      if(el.startBinding && el.startBinding.elementId) boundIds.add(el.startBinding.elementId);
      if(el.endBinding && el.endBinding.elementId) boundIds.add(el.endBinding.elementId);
    }

    // Frames -> groups, and shapes inside shapes, nested like in the draw.io export
    const { frames, frameParents, frameOf } = assignFrames(elements);
    const shapeParents = nestShapes(elements, frameOf);

    const groups = [];
    const groupOfFrame = {};
    frames.forEach((f, i) => {
      groupOfFrame[f.id] = `g${i + 1}`;
      const name = f.name != null ? f.name : (f.type === 'magicframe' ? 'AI Frame' : 'Frame');
      groups.push({ id: `g${i + 1}`, name: String(name), parent: null, frameId: f.id });
    });
    for(const g of groups){
      const parentFrame = frameParents[g.frameId];
      g.parent = parentFrame ? groupOfFrame[parentFrame] : null;
    }

    const nodes = [];
    const nodeOf = {};
    const skipped = { texts: 0, arrows: 0, images: 0, drawings: 0, other: 0 };
    for(const el of elements){
      let kind = null;
      if(el.type === 'rectangle') kind = (el.roundness && el.roundness.type) ? 'round' : 'process';
      else if(el.type === 'diamond') kind = 'decision';
      else if(el.type === 'ellipse') kind = 'terminator';
      else if(el.type === 'text' && !el.containerId && boundIds.has(el.id)) kind = 'text';

      if(kind){
        const id = `n${nodes.length + 1}`;
        const frameId = frameOf(el);
        nodes.push({
          id, kind, elementId: el.id, parentNode: null, isGroup: false,
          role: roles[el.id] || null,
          label: kind === 'text' ? String(el.text || '') : (labels[el.id] || ''),
          group: frameId ? groupOfFrame[frameId] : null,
          fill: (el.backgroundColor && el.backgroundColor !== 'transparent') ? el.backgroundColor : null,
          stroke: (el.strokeColor && colorFamily(el.strokeColor) !== 'black') ? el.strokeColor : null,
          center: { x: el.x + (el.width || 0) / 2, y: el.y + (el.height || 0) / 2 }
        });
        nodeOf[el.id] = id;
      }
      else if(el.type === 'text'){ if(!el.containerId) skipped.texts++; }
      else if(el.type === 'image') skipped.images++;
      else if(el.type === 'freedraw') skipped.drawings++;
      else if(!LINE_TYPES.includes(el.type) && !FRAME_TYPES.includes(el.type) && !SHAPE_TYPES.includes(el.type)) skipped.other++;
    }

    // A node inside another node: drawn inside it, the outer one becomes a group
    for(const n of nodes){
      const parentEl = shapeParents[n.elementId];
      n.parentNode = (parentEl && nodeOf[parentEl]) || null;
    }
    const nodeById = {};
    for(const n of nodes) nodeById[n.id] = n;
    for(const n of nodes) if(n.parentNode) nodeById[n.parentNode].isGroup = true;

    const edges = [];
    for(const el of elements){
      if(!LINE_TYPES.includes(el.type)) continue;
      let from = nodeOf[el.startBinding && el.startBinding.elementId];
      let to = nodeOf[el.endBinding && el.endBinding.elementId];
      if(!from || !to){ skipped.arrows++; continue; }
      const startHead = hasHead(el.startArrowhead);
      const endHead = hasHead(el.endArrowhead !== undefined ? el.endArrowhead : (el.type === 'arrow' ? 'arrow' : null));
      let dir = 'none';
      if(startHead && endHead) dir = 'both';
      else if(endHead) dir = 'forward';
      else if(startHead){ dir = 'forward'; [from, to] = [to, from]; }
      edges.push({ from, to, dir, dashed: el.strokeStyle === 'dashed' || el.strokeStyle === 'dotted', label: labels[el.id] || '' });
    }

    return { nodes, edges, groups, skipped, direction: guessDirection(nodes, edges) };
  }

  // Left-to-right when connections mostly run horizontally
  function guessDirection(nodes, edges){
    const byId = {};
    for(const n of nodes) byId[n.id] = n;
    let dx = 0, dy = 0;
    for(const e of edges){
      const a = byId[e.from].center, b = byId[e.to].center;
      dx += Math.abs(b.x - a.x);
      dy += Math.abs(b.y - a.y);
    }
    return dx > dy ? 'LR' : 'TB';
  }

  // Frame groups that contain a node, directly or through a nested group
  function usedGroups(graph){
    const parentOf = {};
    for(const g of graph.groups) parentOf[g.id] = g.parent;
    const used = new Set();
    for(const n of graph.nodes){
      for(let g = n.group; g && !used.has(g); g = parentOf[g]) used.add(g);
    }
    return graph.groups.filter(g => used.has(g.id));
  }

  // Walks frames, then nodes, depth-first. A node with nodes inside it is
  // written as a group: openNode(n) ... closeNode(n); others as nodeLine(n).
  function renderTree(graph, open, close, nodeLine, openNode, closeNode){
    const groups = usedGroups(graph);
    const lines = [];
    function node(n, indent){
      const pad = '  '.repeat(indent);
      if(!n.isGroup){ lines.push(pad + nodeLine(n)); return; }
      lines.push(pad + openNode(n));
      for(const child of graph.nodes.filter(c => c.parentNode === n.id)) node(child, indent + 1);
      lines.push(pad + closeNode(n));
    }
    function level(groupId, indent){
      const pad = '  '.repeat(indent);
      for(const g of groups.filter(g => g.parent === groupId)){
        lines.push(pad + open(g));
        level(g.id, indent + 1);
        lines.push(pad + close(g));
      }
      for(const n of graph.nodes.filter(n => n.group === groupId && !n.parentNode)) node(n, indent);
    }
    level(null, 1);
    return lines;
  }

  function stats(graph){
    const groups = usedGroups(graph).length + graph.nodes.filter(n => n.isGroup).length;
    return { nodes: graph.nodes.length, connections: graph.edges.length, groups };
  }

  // ---------------------------------------------------------------------------
  // Mermaid
  // ---------------------------------------------------------------------------

  function mermaidText(text){
    const s = String(text).replace(/"/g, '#quot;').replace(/\r?\n/g, '<br>');
    return `"${s || ' '}"`;
  }

  const MERMAID_SHAPES = {
    process:    l => `[${l}]`,
    round:      l => `(${l})`,
    decision:   l => `{${l}}`,
    terminator: l => `([${l}])`,
    text:       l => `[${l}]`
  };

  function mermaidArrow(e){
    const body = e.dashed
      ? { none: '-.-', forward: '-.->', both: '<-.->' }[e.dir]
      : { none: '---', forward: '-->', both: '<-->' }[e.dir];
    return e.label ? `${body}|${mermaidText(e.label)}|` : body;
  }

  function toMermaid(scene, options){
    const opts = resolveTextOptions(options);
    const graph = buildGraph(scene);
    const direction = opts.direction === 'auto' ? graph.direction : opts.direction;
    const lines = [`flowchart ${direction === 'LR' ? 'LR' : 'TD'}`];
    lines.push(...renderTree(graph,
      g => `subgraph ${g.id}[${mermaidText(g.name)}]`,
      () => 'end',
      n => n.id + MERMAID_SHAPES[n.kind](mermaidText(n.label)),
      // Links can point at a subgraph, so the group keeps the node's id
      n => `subgraph ${n.id}[${mermaidText(n.label)}]`,
      () => 'end'
    ));
    for(const e of graph.edges) lines.push(`  ${e.from} ${mermaidArrow(e)} ${e.to}`);
    if(opts.colors === 'keep'){
      for(const n of graph.nodes){
        const parts = [];
        if(n.fill) parts.push(`fill:${n.fill}`);
        if(n.stroke) parts.push(`stroke:${n.stroke}`);
        if(n.kind === 'text') parts.push('stroke-width:0px', 'fill:none');
        if(parts.length) lines.push(`  style ${n.id} ${parts.join(',')}`);
      }
    } else {
      for(const n of graph.nodes.filter(n => n.kind === 'text')) lines.push(`  style ${n.id} stroke-width:0px,fill:none`);
    }
    return { text: lines.join('\n') + '\n', stats: stats(graph), skipped: graph.skipped };
  }

  // ---------------------------------------------------------------------------
  // PlantUML (deployment-style diagram: free-form nodes, arrows and frames)
  // ---------------------------------------------------------------------------

  function plantText(text){
    // PlantUML strings can't escape double quotes
    const s = String(text).replace(/"/g, "'").replace(/\r?\n/g, '\\n');
    return `"${s || ' '}"`;
  }

  const PLANT_SHAPES = {
    process: 'rectangle',
    round: 'rectangle',
    decision: 'hexagon',
    terminator: 'usecase',
    text: 'label'
  };

  function plantColor(n, opts){
    return (opts.colors === 'keep' && n.fill && /^#[0-9a-f]{3,8}$/i.test(n.fill)) ? ` ${n.fill}` : '';
  }

  function plantArrow(e){
    const body = e.dashed
      ? { none: '..', forward: '..>', both: '<..>' }[e.dir]
      : { none: '--', forward: '-->', both: '<-->' }[e.dir];
    const label = e.label ? ` : ${String(e.label).replace(/\r?\n/g, '\\n')}` : '';
    return `${e.from} ${body} ${e.to}${label}`;
  }

  function toPlantUML(scene, options){
    const opts = resolveTextOptions(options);
    const graph = buildGraph(scene);
    const direction = opts.direction === 'auto' ? graph.direction : opts.direction;
    const lines = ['@startuml'];
    if(direction === 'LR') lines.push('left to right direction');
    lines.push(...renderTree(graph,
      g => `frame ${plantText(g.name)} as ${g.id} {`,
      () => '}',
      n => `${PLANT_SHAPES[n.kind]} ${plantText(n.label)} as ${n.id}${plantColor(n, opts)}`,
      // Only some PlantUML elements can hold others: a containing shape is a rectangle
      n => `rectangle ${plantText(n.label)} as ${n.id}${plantColor(n, opts)} {`,
      () => '}'
    ).map(l => l.slice(2))); // top level has no indentation in PlantUML
    for(const e of graph.edges) lines.push(plantArrow(e));
    lines.push('@enduml');
    return { text: lines.join('\n') + '\n', stats: stats(graph), skipped: graph.skipped };
  }

  const api = { toMermaid, toPlantUML, buildGraph, TEXT_OPTION_DEFS, TEXT_DEFAULTS, resolveTextOptions };
  if(typeof module === 'object' && module.exports) module.exports = api;
  global.ExcText = api;
})(typeof window !== 'undefined' ? window : globalThis);
