(function(){
  const fileInput = document.getElementById('fileInput');
  const inputText = document.getElementById('inputText');
  const downloadBtn = document.getElementById('downloadBtn');
  const outputText = document.getElementById('outputText');
  const info = document.getElementById('info');
  const sampleBtn = document.getElementById('sampleBtn');
  const presetSelect = document.getElementById('presetSelect');
  const optionGrid = document.getElementById('optionGrid');

  let lastOutput = '';
  let fileBaseName = 'diagram';

  // Style options: one <select> per converter option, driven by the preset
  const { OPTION_DEFS, PRESETS } = window.ExcDrawio;
  const STORAGE_KEY = 'excdrawio.styleOptions';
  const optionSelects = {};
  for(const def of OPTION_DEFS){
    const label = document.createElement('label');
    const span = document.createElement('span');
    span.textContent = def.label;
    const select = document.createElement('select');
    for(const [value, text] of def.choices){
      const opt = document.createElement('option');
      opt.value = value; opt.textContent = text;
      select.appendChild(opt);
    }
    select.addEventListener('change', () => {
      // Tweaking any option turns the preset into a custom one
      presetSelect.value = 'custom';
      onOptionsChanged();
    });
    label.append(span, select);
    optionGrid.appendChild(label);
    optionSelects[def.key] = select;
  }

  function applyPreset(name){
    const preset = PRESETS[name];
    if(!preset) return;
    for(const key in optionSelects) optionSelects[key].value = preset[key];
  }

  function currentOptions(){
    const opts = { preset: presetSelect.value };
    for(const key in optionSelects) opts[key] = optionSelects[key].value;
    return opts;
  }

  function onOptionsChanged(){
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(currentOptions())); } catch{ /* storage unavailable */ }
    if(inputText.value.trim()) performConversion();
  }

  presetSelect.addEventListener('change', () => {
    applyPreset(presetSelect.value);
    onOptionsChanged();
  });

  (function restoreOptions(){
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch{ /* ignore */ }
    if(saved && (saved.preset === 'custom' || PRESETS[saved.preset])){
      presetSelect.value = saved.preset;
      applyPreset(saved.preset === 'custom' ? 'excalidraw' : saved.preset);
      if(saved.preset === 'custom'){
        for(const key in optionSelects){
          if(saved[key] && [...optionSelects[key].options].some(o => o.value === saved[key])) optionSelects[key].value = saved[key];
        }
      }
    } else {
      applyPreset(presetSelect.value);
    }
  })();

  async function performConversion(){
    info.textContent = '';
    outputText.value = '';
    downloadBtn.disabled = true;
    try {
      const data = inputText.value.trim();
      if(!data) return;
      const out = window.ExcDrawio.convertExcalidrawToDrawio(data, currentOptions());
      outputText.value = out;
      lastOutput = out;
      downloadBtn.disabled = false;
      info.textContent = `Conversion successful. Ready to download ${fileBaseName}.drawio`;
    } catch(err){
      console.error(err);
      info.textContent = 'Error: ' + (err && err.message ? err.message : String(err));
    }
  }

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if(!file) return;
    let rawText = await file.text();

    let extracted = false;
    if(/\.svg$/i.test(file.name) || /<svg[\s>]/i.test(rawText.slice(0, 500))){
      try {
        const sceneJSON = await window.ExcSvg.extractExcalidrawFromSVG(rawText);
        if(sceneJSON){
          rawText = sceneJSON; extracted = true;
          info.textContent = `Extracted embedded Excalidraw scene from SVG (${file.name}). Converting...`;
        } else {
          info.textContent = `No embedded Excalidraw scene found in SVG (${file.name}).`;
        }
      } catch(ex){
        console.warn('SVG extraction failed:', ex);
        info.textContent = `Failed to extract Excalidraw data from SVG: ${ex.message}`;
      }
    }

    inputText.value = rawText;
    const base = file.name.replace(/(\.excalidraw|\.json|\.svg)$/i,'') || 'diagram';
    fileBaseName = base;
    if(!info.textContent)
      info.textContent = `Loaded file: ${file.name} (${file.size} bytes). Converting...`;
    if(extracted || /^[\s\r\n]*\{/.test(rawText)){
      await performConversion();
    } else {
      downloadBtn.disabled = true;
    }
  });

  sampleBtn.addEventListener('click', async () => {
    const tiny = JSON.stringify({
      type: 'excalidraw', version: 2, source: 'web',
      appState: { viewBackgroundColor: '#ffffff', gridSize: 10 },
      elements: [
        { type: 'rectangle', id: 'r1', x: 50, y: 50, width: 120, height: 60, strokeColor: '#1f2937', backgroundColor: 'transparent', strokeWidth: 2, strokeStyle: 'solid', opacity: 100, angle: 0, roundness: { type: 0 } },
        { type: 'text', id: 't1', x: 60, y: 60, width: 100, height: 20, text: 'Hello', fontSize: 18, fontFamily: 1, textAlign: 'left', verticalAlign: 'top', strokeColor: '#111827', opacity: 100 }
      ],
      files: {}
    }, null, 2);
    inputText.value = tiny; fileBaseName = 'sample';
    info.textContent = 'Loaded tiny inline sample. Converting...';
    await performConversion();
  });

  let debounceTimer;
  inputText.addEventListener('input', () => {
    if(debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if(!fileInput.files?.length) fileBaseName = 'diagram';
      performConversion();
    }, 500);
  });

  downloadBtn.addEventListener('click', () => {
    if(!lastOutput) return;
    const blob = new Blob([lastOutput], { type: 'application/xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${fileBaseName}.drawio`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
})();
