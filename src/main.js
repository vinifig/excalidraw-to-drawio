// Page wiring: input (file, drop, paste), style presets / advanced options, result actions.
(function(){
  'use strict';

  const { convertExcalidrawToDrawio, OPTION_DEFS, PRESETS } = window.ExcDrawio;
  const { extractExcalidrawFromSVG, isLikelyExcalidrawJSON } = window.ExcSvg;
  const { summarize, drawioUrl } = window.ExcOutput;
  const $ = id => document.getElementById(id);

  const ui = {
    dropzone: $('dropzone'), fileInput: $('fileInput'), dzTitle: $('dzTitle'), dzHint: $('dzHint'),
    sampleBtn: $('sampleBtn'), inputText: $('inputText'),
    presetCards: $('presetCards'), advanced: $('advanced'), optionGroups: $('optionGroups'),
    customBadge: $('customBadge'), resetBtn: $('resetBtn'),
    status: $('status'), emptyState: $('emptyState'), resultBody: $('resultBody'),
    outName: $('outName'), stats: $('stats'), outputText: $('outputText'),
    downloadBtn: $('downloadBtn'), openBtn: $('openBtn'), copyBtn: $('copyBtn')
  };

  const PRESET_INFO = [
    { name: 'excalidraw', title: 'Excalidraw look', desc: 'Keeps colors, hand-drawn strokes and fonts.',
      thumb: '<svg viewBox="0 0 120 56"><path d="M20 14c18-2 40-1 52 1 2 9 1 19-1 27-17 2-35 1-51-1-2-9-2-18 0-27z" fill="#a5d8ff" stroke="#1971c2" stroke-width="2" stroke-linejoin="round"/><path d="M80 28c8-1 15-1 22 0" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M97 23l6 5-6 5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>' },
    { name: 'drawio', title: 'draw.io look', desc: 'Clean shapes, draw.io colors and connected arrows.',
      thumb: '<svg viewBox="0 0 120 56"><rect x="16" y="14" width="56" height="28" rx="4" fill="#dae8fc" stroke="#6c8ebf" stroke-width="1.5"/><path d="M72 28h28" stroke="currentColor" stroke-width="1.5"/><path d="M98 24l6 4-6 4z" fill="currentColor"/></svg>' },
    { name: 'flowchart', title: 'Flowchart', desc: 'Start, process and decision shapes with fixed colors.',
      thumb: '<svg viewBox="0 0 120 56"><rect x="6" y="18" width="30" height="20" rx="10" fill="#d5e8d4" stroke="#82b366" stroke-width="1.5"/><path d="M36 28h8" stroke="currentColor" stroke-width="1.5"/><rect x="45" y="18" width="30" height="20" fill="#dae8fc" stroke="#6c8ebf" stroke-width="1.5"/><path d="M75 28h8" stroke="currentColor" stroke-width="1.5"/><path d="M99 14l14 14-14 14-14-14z" fill="#fff2cc" stroke="#d6b656" stroke-width="1.5"/></svg>' }
  ];

  const STORAGE_KEY = 'excdrawio.style.v2';
  const LEGACY_STORAGE_KEY = 'excdrawio.styleOptions';

  const state = {
    preset: 'excalidraw',
    values: Object.assign({}, PRESETS.excalidraw),
    scene: null,          // Excalidraw JSON text currently loaded
    baseName: 'diagram',
    output: ''
  };

  // ---------------------------------------------------------------------------
  // Style: preset cards + advanced options
  // ---------------------------------------------------------------------------

  const optionSelects = {};

  function buildStyleControls(){
    for(const info of PRESET_INFO){
      const card = document.createElement('label');
      card.className = 'preset';
      card.innerHTML = `<input type="radio" name="preset" value="${info.name}" />
        <span class="preset-thumb" aria-hidden="true">${info.thumb}</span>
        <span class="preset-title">${info.title}</span>
        <span class="preset-desc">${info.desc}</span>`;
      card.querySelector('input').addEventListener('change', () => setPreset(info.name));
      ui.presetCards.appendChild(card);
    }

    const groups = new Map();
    for(const def of OPTION_DEFS){
      const groupName = def.group || 'Other';
      if(!groups.has(groupName)){
        const group = document.createElement('div');
        group.className = 'option-group';
        group.innerHTML = `<h3>${groupName}</h3>`;
        groups.set(groupName, group);
        ui.optionGroups.appendChild(group);
      }
      const label = document.createElement('label');
      label.className = 'option';
      const span = document.createElement('span');
      span.textContent = def.label;
      const select = document.createElement('select');
      for(const [value, text] of def.choices) select.add(new Option(text, value));
      select.addEventListener('change', () => setOption(def.key, select.value));
      label.append(span, select);
      groups.get(groupName).appendChild(label);
      optionSelects[def.key] = select;
    }

    ui.resetBtn.addEventListener('click', () => setPreset(state.preset));
  }

  function isCustomized(){
    const preset = PRESETS[state.preset];
    return OPTION_DEFS.some(def => state.values[def.key] !== preset[def.key]);
  }

  function renderStyle(){
    for(const input of ui.presetCards.querySelectorAll('input')) input.checked = input.value === state.preset;
    const preset = PRESETS[state.preset];
    for(const def of OPTION_DEFS){
      const select = optionSelects[def.key];
      select.value = state.values[def.key];
      select.parentElement.classList.toggle('changed', state.values[def.key] !== preset[def.key]);
    }
    const customized = isCustomized();
    ui.customBadge.hidden = !customized;
    ui.resetBtn.hidden = !customized;
  }

  function setPreset(name){
    state.preset = name;
    state.values = Object.assign({}, PRESETS[name]);
    styleChanged();
  }

  function setOption(key, value){
    state.values[key] = value;
    styleChanged();
  }

  function styleChanged(){
    renderStyle();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ preset: state.preset, values: state.values })); } catch{ /* storage unavailable */ }
    if(state.scene) convert();
  }

  function restoreStyle(){
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if(!saved){
        // Earlier versions stored { preset: 'custom' | name, ...values }
        const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || 'null');
        if(legacy) saved = { preset: PRESETS[legacy.preset] ? legacy.preset : 'excalidraw', values: legacy };
      }
    } catch{ /* ignore */ }
    if(!saved || !PRESETS[saved.preset]) return;
    state.preset = saved.preset;
    state.values = Object.assign({}, PRESETS[saved.preset]);
    for(const def of OPTION_DEFS){
      const v = saved.values && saved.values[def.key];
      if(def.choices.some(c => c[0] === v)) state.values[def.key] = v;
    }
    if(isCustomized()) ui.advanced.open = true;
  }

  // ---------------------------------------------------------------------------
  // Input: file picker, drag & drop, clipboard, pasted JSON, sample
  // ---------------------------------------------------------------------------

  // A failed load must not leave the previous result downloadable
  function failLoad(message){
    state.scene = null;
    state.output = '';
    ui.resultBody.hidden = true;
    ui.emptyState.hidden = false;
    ui.dropzone.classList.remove('loaded');
    ui.dzTitle.innerHTML = 'Drop a file here or <u>browse</u>';
    ui.dzHint.textContent = '.excalidraw, .json, or an .svg exported with “Embed scene”';
    showStatus('err', message);
  }

  async function loadFile(file){
    if(!file) return;
    const baseName = file.name.replace(/\.(excalidraw|json|svg)$/i, '') || 'diagram';
    let text;
    try { text = await file.text(); }
    catch(err){ return failLoad(`Couldn't read ${file.name}.`); }

    if(/\.svg$/i.test(file.name) || /<svg[\s>]/i.test(text.slice(0, 500))){
      showStatus('info', `Reading the drawing embedded in ${file.name}…`);
      const scene = await extractExcalidrawFromSVG(text).catch(() => null);
      if(!scene){
        return failLoad(`${file.name} has no Excalidraw drawing inside. In Excalidraw, export the SVG with “Embed scene” turned on.`);
      }
      text = scene;
    }
    loadScene(text, baseName, `${file.name} · ${formatSize(file.size)}`);
  }

  function loadScene(text, baseName, label){
    let parsed;
    try { parsed = JSON.parse(text); }
    catch(err){ return failLoad(`That doesn't look like Excalidraw JSON (${err.message}).`); }
    if(!parsed || !Array.isArray(parsed.elements)){
      return failLoad('That JSON has no Excalidraw elements in it.');
    }
    state.scene = text;
    state.baseName = baseName;
    ui.dropzone.classList.add('loaded');
    ui.dzTitle.textContent = label;
    ui.dzHint.textContent = 'Drop or browse to replace it';
    convert();
  }

  function formatSize(bytes){
    if(bytes < 1024) return `${bytes} B`;
    if(bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function bindInput(){
    ui.fileInput.addEventListener('change', () => {
      loadFile(ui.fileInput.files[0]);
      ui.fileInput.value = ''; // allow picking the same file again
    });

    // Dropping anywhere on the page works; the dropzone lights up while dragging
    let dragDepth = 0;
    window.addEventListener('dragenter', e => { e.preventDefault(); dragDepth++; ui.dropzone.classList.add('dragging'); });
    window.addEventListener('dragleave', () => { if(--dragDepth <= 0){ dragDepth = 0; ui.dropzone.classList.remove('dragging'); } });
    window.addEventListener('dragover', e => e.preventDefault());
    window.addEventListener('drop', e => {
      e.preventDefault();
      dragDepth = 0;
      ui.dropzone.classList.remove('dragging');
      const file = e.dataTransfer && e.dataTransfer.files[0];
      if(file) loadFile(file);
    });

    // Ctrl/Cmd+V with shapes copied from Excalidraw (or any scene JSON)
    document.addEventListener('paste', e => {
      if(e.target === ui.inputText) return;
      const text = e.clipboardData && e.clipboardData.getData('text/plain');
      if(text && isLikelyExcalidrawJSON(text)){
        e.preventDefault();
        loadScene(text, 'pasted', 'Pasted from clipboard');
      }
    });

    let debounce;
    ui.inputText.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        const text = ui.inputText.value.trim();
        if(text) loadScene(text, 'diagram', 'Pasted JSON');
      }, 400);
    });

    ui.sampleBtn.addEventListener('click', () => {
      const json = JSON.stringify(sampleScene(), null, 2);
      ui.inputText.value = json;
      loadScene(json, 'sample-flowchart', 'Sample flowchart');
    });
  }

  // ---------------------------------------------------------------------------
  // Conversion & result
  // ---------------------------------------------------------------------------

  let urlToken = 0;

  function convert(){
    let xml;
    try {
      xml = convertExcalidrawToDrawio(state.scene, Object.assign({ preset: state.preset }, state.values));
    } catch(err){
      console.error(err);
      state.output = '';
      ui.resultBody.hidden = true;
      ui.emptyState.hidden = false;
      return showStatus('err', `Conversion failed: ${err && err.message ? err.message : err}`);
    }
    state.output = xml;
    ui.outputText.value = xml;
    ui.outName.textContent = `${state.baseName}.drawio`;
    renderStats(summarize(xml));
    ui.emptyState.hidden = true;
    ui.resultBody.hidden = false;
    hideStatus();

    // The draw.io link is compressed asynchronously; ignore stale results
    const token = ++urlToken;
    ui.openBtn.setAttribute('aria-disabled', 'true');
    drawioUrl(xml).then(url => {
      if(token !== urlToken) return;
      ui.openBtn.href = url;
      ui.openBtn.setAttribute('aria-disabled', 'false');
    }).catch(() => { /* leave the button disabled */ });
  }

  function renderStats(counts){
    const labels = { shapes: ['shape', 'shapes'], connectors: ['connector', 'connectors'], frames: ['frame', 'frames'], texts: ['text', 'texts'] };
    ui.stats.textContent = '';
    for(const [key, [one, many]] of Object.entries(labels)){
      if(!counts[key]) continue;
      const li = document.createElement('li');
      li.textContent = `${counts[key]} ${counts[key] === 1 ? one : many}`;
      ui.stats.appendChild(li);
    }
    if(!ui.stats.children.length){
      const li = document.createElement('li');
      li.textContent = 'Empty drawing';
      ui.stats.appendChild(li);
    }
  }

  function showStatus(kind, message){
    ui.status.className = `status ${kind}`;
    ui.status.textContent = message;
    ui.status.hidden = false;
  }

  function hideStatus(){ ui.status.hidden = true; }

  function bindResult(){
    ui.downloadBtn.addEventListener('click', () => {
      if(!state.output) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([state.output], { type: 'application/xml' }));
      a.download = `${state.baseName}.drawio`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });

    ui.copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(state.output);
        flash(ui.copyBtn, 'Copied!');
      } catch{
        flash(ui.copyBtn, 'Copy failed');
      }
    });
  }

  function flash(button, text){
    const original = button.dataset.label || button.textContent;
    button.dataset.label = original;
    button.textContent = text;
    clearTimeout(button._flash);
    button._flash = setTimeout(() => { button.textContent = original; }, 1500);
  }

  // ---------------------------------------------------------------------------
  // Sample: a small flowchart inside a frame, with Excalidraw colors and bindings
  // ---------------------------------------------------------------------------

  function sampleScene(){
    const base = { strokeWidth: 2, strokeStyle: 'solid', roughness: 1, opacity: 100, angle: 0, fillStyle: 'solid', frameId: 'frame' };
    const shape = (type, id, x, y, w, h, stroke, bg, extra) => Object.assign({ type, id, x, y, width: w, height: h, strokeColor: stroke, backgroundColor: bg }, base, extra);
    const label = (id, containerId, x, y, w, text) => Object.assign({ type: 'text', id, x, y, width: w, height: 25, text, fontSize: 20, fontFamily: 5, textAlign: 'center', verticalAlign: 'middle', containerId, strokeColor: '#1e1e1e' }, base);
    const link = (id, from, to, x, y, points) => Object.assign({ type: 'arrow', id, x, y, width: 0, height: 0, points, strokeColor: '#1e1e1e', backgroundColor: 'transparent', startBinding: { elementId: from }, endBinding: { elementId: to }, endArrowhead: 'arrow', roundness: { type: 2 } }, base);
    return {
      type: 'excalidraw', version: 2, source: 'excalidraw-to-drawio sample',
      appState: { viewBackgroundColor: '#ffffff', gridSize: 20 },
      elements: [
        { type: 'frame', id: 'frame', x: 0, y: 0, width: 520, height: 420, name: 'Checkout' },
        shape('ellipse', 'start', 40, 40, 140, 60, '#2f9e44', '#b2f2bb'), label('startText', 'start', 60, 57, 100, 'Start'),
        shape('rectangle', 'cart', 40, 160, 140, 60, '#1971c2', '#a5d8ff', { roundness: { type: 3 } }), label('cartText', 'cart', 50, 177, 120, 'Add to cart'),
        shape('diamond', 'paid', 30, 280, 160, 100, '#f08c00', '#ffec99'), label('paidText', 'paid', 70, 317, 80, 'Paid?'),
        shape('ellipse', 'done', 320, 300, 140, 60, '#e03131', '#ffc9c9'), label('doneText', 'done', 340, 317, 100, 'Done'),
        link('a1', 'start', 'cart', 110, 100, [[0, 0], [0, 60]]),
        link('a2', 'cart', 'paid', 110, 220, [[0, 0], [0, 60]]),
        link('a3', 'paid', 'done', 190, 330, [[0, 0], [130, 0]]), label('yesText', 'a3', 235, 318, 40, 'yes')
      ],
      files: {}
    };
  }

  // ---------------------------------------------------------------------------

  buildStyleControls();
  restoreStyle();
  renderStyle();
  bindInput();
  bindResult();
})();
