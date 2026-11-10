/* knobOx - UI layer. Depends on window.E16 (model.js), E16Sysex (sysex.js) and E16Library (library.js). */
(function () {
  'use strict';
  const M = window.E16;

  // ---------- state ----------
  const S = {
    scene: null,
    original: null,
    fileName: 'scene.oxie16',
    page: 0,
    sel: new Set(),
    anchor: null,
    undo: [],
    redo: [],
    dirty: false,
    clip: null,
    navMode: 'follow',    // page swap: 'follow' = nav pushes move with their page, targets remapped; 'stay' = nav pushes keep their position
    pasteParts: { name: true, abbr: true, color: true, d1: true, d2: true, push: true },
    tab: 'pages',
    side: 'edit',
    ovChannel: null,
    ovOpts: { d1: true, d2: true, push: true, lsb: true },
    bulk: { scope: 'sel', from: 1, to: 12, order: 'row' },
    settings: loadSettings(),
    view: 'library',      // 'library' | 'editor'
    fileHandle: null,     // set when the scene was opened from the scene folder
    lib: { dir: null, pending: null, files: [], slots: null, busy: false, status: '' },
    midi: null,           // { access, input, output }
  };
  const UNDO_MAX = 200;
  const LS_SESSION = 'e16ed.session';
  const LS_OPEN = 'e16ed.openSection';
  const LS_SETTINGS = 'e16ed.settings';

  function loadSettings() {
    try { return Object.assign({}, JSON.parse(localStorage.getItem(LS_SETTINGS) || '{}')); }
    catch (e) { return {}; }
  }
  function saveSettings() {
    try { localStorage.setItem(LS_SETTINGS, JSON.stringify(S.settings)); } catch (e) { /* storage unavailable */ }
  }
  function saveSession() {
    try {
      localStorage.setItem(LS_SESSION, JSON.stringify({
        name: S.fileName, json: JSON.stringify(S.scene), original: JSON.stringify(S.original), dirty: S.dirty,
      }));
    } catch (e) { /* storage unavailable */ }
  }

  // ---------- dom helpers ----------
  const $ = (q, r) => (r || document).querySelector(q);
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'style' && typeof v === 'object') for (const [sk, sv] of Object.entries(v)) n.style.setProperty(sk.replace(/[A-Z]/g, m => '-' + m.toLowerCase()), sv);
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (k === 'value') n.value = v;
      else if (v === true) n.setAttribute(k, '');
      else n.setAttribute(k, v);
    }
    for (const c of kids.flat()) {
      if (c === null || c === undefined || c === false) continue;
      n.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return n;
  }
  function toast(msg, isErr) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast' + (isErr ? ' err' : '');
    t.hidden = false;
    clearTimeout(toast._t);
    // Long error texts (e.g. the Linux/Flatpak hint) stay up long enough to read.
    toast._t = setTimeout(() => { t.hidden = true; }, isErr ? Math.max(3200, msg.length * 70) : 3200);
  }
  function optionsFor(table, current) {
    const opts = Object.entries(table).map(([v, d]) =>
      el('option', { value: v, selected: Number(v) === current }, d.label + (d.sure ? '' : ' (?)')));
    if (current !== undefined && !(current in table)) opts.push(el('option', { value: current, selected: true }, current + ' (unknown)'));
    return opts;
  }
  function selectEl(table, current, onchange, attrs) {
    return el('select', Object.assign({ onchange: e => onchange(Number(e.target.value)) }, attrs || {}), optionsFor(table, current));
  }
  function numEl(value, onchange, attrs) {
    return el('input', Object.assign({
      type: 'number', value: value,
      onchange: e => { const v = parseInt(e.target.value, 10); if (!Number.isNaN(v)) onchange(v); },
    }, attrs || {}));
  }
  function textEl(value, onchange, attrs) {
    return el('input', Object.assign({ type: 'text', value: value, onchange: e => onchange(e.target.value) }, attrs || {}));
  }
  /* Color index 0..99: number input plus a swatch button that opens the 10x10 palette. */
  function colorEl(value, onchange) {
    const max = M.PALETTE.length - 1;
    const sw = el('button', { type: 'button', class: 'swatch btnswatch', title: 'Choose from palette', style: { background: M.colorCss(value) } });
    const num = el('input', { type: 'number', min: 0, max, value, class: 'w-num',
      oninput: e => { sw.style.background = M.colorCss(parseInt(e.target.value, 10)); },
      onchange: e => { const v = parseInt(e.target.value, 10); if (!Number.isNaN(v)) onchange(Math.max(0, Math.min(max, v))); } });
    const pop = el('div', { class: 'cpop', hidden: true },
      M.PALETTE.map((c, i) => el('button', { type: 'button', class: 'cpcell' + (i === value ? ' cur' : ''), title: String(i), style: { background: c },
        onclick: e => { e.preventDefault(); pop.hidden = true; onchange(i); } })));
    sw.addEventListener('click', e => {
      e.preventDefault();
      const open = pop.hidden;
      document.querySelectorAll('.cpop').forEach(x => { x.hidden = true; });
      pop.hidden = !open;
    });
    return el('span', { class: 'colorpick' }, num, sw, pop);
  }
  document.addEventListener('mousedown', e => {
    if (!e.target.closest('.colorpick')) document.querySelectorAll('.cpop').forEach(x => { x.hidden = true; });
  });
  function row(label, control, hint) {
    return el('label', { class: 'frow', title: hint || null }, el('span', { class: 'flabel' }, label), control);
  }

  // ---------- undo / commit ----------
  function commit(fn, msg) {
    const before = JSON.stringify(S.scene);
    const res = fn();
    const after = JSON.stringify(S.scene);
    if (before !== after) {
      S.undo.push(before);
      if (S.undo.length > UNDO_MAX) S.undo.shift();
      S.redo = [];
      S.dirty = true;
      saveSession();
      if (msg) toast(msg);
    }
    render();
    return res;
  }
  function undo() {
    if (!S.undo.length) return;
    S.redo.push(JSON.stringify(S.scene));
    S.scene = JSON.parse(S.undo.pop());
    S.dirty = true; saveSession(); render();
  }
  function redo() {
    if (!S.redo.length) return;
    S.undo.push(JSON.stringify(S.scene));
    S.scene = JSON.parse(S.redo.pop());
    S.dirty = true; saveSession(); render();
  }

  // ---------- file io ----------
  /*
   * source describes where the scene came from and drives the save buttons:
   *   { kind: 'device', slot, scriptMissing } | { kind: 'folder' } | { kind: 'file' } | { kind: 'session' }
   */
  function loadText(text, name, original, dirty, handle, source) {
    let obj;
    try { obj = JSON.parse(text); } catch (e) { toast('Not a valid JSON file: ' + e.message, true); return false; }
    const err = M.validateScene(obj);
    if (err) { toast('Unknown format: ' + err, true); return false; }
    S.scene = obj;
    S.original = original ? JSON.parse(original) : M.deepClone(obj);
    S.fileName = name || 'scene.oxie16';
    S.fileHandle = handle || null;
    S.source = source || (handle ? { kind: 'folder' } : { kind: 'file' });
    S.page = Math.min(S.page, obj.pages.length - 1);
    S.sel = new Set(); S.undo = []; S.redo = []; S.dirty = !!dirty;
    saveSession();
    S.view = 'editor';
    render();
    return true;
  }
  function openFile(file) {
    const r = new FileReader();
    r.onload = () => { S.page = 0; loadText(r.result, file.name); };
    r.readAsText(file);
  }
  function confirmDiscard() { return !S.dirty || confirm('Discard unsaved changes?'); }
  // ---------- send to device (Web MIDI SysEx, see docs/PROTOCOL.md) ----------
  function sendDialog() {
    const X = window.E16Sysex;
    const problems = X.checkScene(S.scene);
    const slotSel = el('select');
    const slotLabel = i => 'Slot ' + (i + 1) + (S.lib.slots && S.lib.slots[i] ? ' – ' + S.lib.slots[i].title : '');
    function fillSlots() {
      const cur = slotSel.value ? Number(slotSel.value) : (S.source && S.source.kind === 'device' ? S.source.slot : (S.settings.lastSlot || 1));
      slotSel.replaceChildren(...[...Array(16).keys()].map(i => el('option', { value: i + 1, selected: i + 1 === cur }, slotLabel(i))));
    }
    fillSlots();
    const nameIn = el('input', { type: 'text', value: S.scene.title, maxlength: 7, class: 'w-name', title: 'Scene name shown on the E16 (up to 7 characters)' });
    /* Read the slot names from the E16 once per connection, so the slot list shows what gets replaced. */
    async function loadSlotNames() {
      if (S.lib.slots || !S.midi || !S.midi.output || S.lib.busy) return;
      S.lib.busy = true;
      status.textContent = 'Reading slot names …';
      try { S.lib.slots = await X.listScenes(S.midi); fillSlots(); status.textContent = 'Connected to "' + S.midi.output.name + '".'; }
      catch (e) { status.textContent = 'Could not read the slot names: ' + transferError(e); }
      finally { S.lib.busy = false; }
    }
    const portSel = el('select', { disabled: true }, el('option', null, '– not connected yet –'));
    const status = el('p', { class: 'muted' }, problems.length ? problems.join(' ') : 'Ready. The OXI App must be closed.');
    const bar = el('progress', { max: 14, value: 0, class: 'sendbar' });
    const btnConnect = el('button', { class: 'btn', type: 'button' }, 'Connect');
    const btnGo = el('button', { class: 'btn primary', type: 'button', disabled: true }, 'Send');
    const btnSyx = el('button', { class: 'btn', type: 'button', disabled: problems.length > 0 }, 'Save as .syx');

    function fillPorts() {
      const access = S.midi.access;
      const outs = [...access.outputs.values()];
      const best = S.midi.output;
      portSel.replaceChildren(...(outs.length ? outs.map(p => el('option', { value: p.id, selected: best && p.id === best.id }, p.name)) : [el('option', null, 'no MIDI outputs')]));
      portSel.disabled = !outs.length;
      btnGo.disabled = !best || problems.length > 0;
      status.textContent = best ? 'Connected to "' + best.name + '".' : notFoundMsg();
      if (best) loadSlotNames();
    }
    btnConnect.addEventListener('click', async () => {
      try { await connectMidi(); } catch (e) { status.textContent = e.message; }
      if (S.midi) fillPorts();
    });
    if (S.midi) fillPorts();
    btnGo.addEventListener('click', async () => {
      if (S.lib.busy) { status.textContent = 'The E16 is busy, please wait.'; return; }
      const slot = Number(slotSel.value);
      const cur = S.lib.slots && S.lib.slots[slot - 1];
      const title = nameIn.value.trim().slice(0, 7);
      if (!title) { status.textContent = 'Enter a scene name.'; return; }
      if (!confirm('Overwrite slot ' + slot + (cur ? ' ("' + cur.title + '")' : '') + ' on the E16 with "' + title + '"?')) return;
      if (title !== S.scene.title) commit(() => { S.scene.title = title; }, 'Scene renamed to "' + title + '"');
      S.settings.lastSlot = slot; saveSettings();
      const access = S.midi.access;
      const output = access.outputs.get(portSel.value);
      // Matching input: same name, or the E16 input found automatically.
      const input = [...access.inputs.values()].find(i => i.name === output.name) || X.findPorts(access).input;
      bar.max = X.encodeScene(S.scene, slot).length; bar.value = 0;
      btnGo.disabled = btnConnect.disabled = true;
      status.textContent = 'Sending …';
      try {
        const res = await X.uploadScene(S.scene, slot, { input, output }, (n, total) => {
          bar.value = n;
          status.textContent = n === total - 1 ? 'Scene sent, waiting for the script block …' : 'Sending … ' + n + '/' + total;
        });
        bar.value = bar.max;
        status.textContent = 'Done: "' + S.scene.title + '" is now in slot ' + slot + '.' + (res.scriptBlockFailed ? ' ' + scriptBlockNote() : '');
        toast('Sent to E16 (slot ' + slot + ')' + (res.scriptBlockFailed ? ', checked by reading it back' : ''));
        if (S.lib.slots) { S.lib.slots[slot - 1] = { slot, title: S.scene.title, color: S.scene.color, scriptName: (S.scene.code || {}).scriptName || '' }; fillSlots(); }
        if (S.source && S.source.kind === 'device' && S.source.slot === slot) markSaved();
      } catch (e) {
        status.textContent = 'Error: ' + transferError(e);
      } finally {
        btnGo.disabled = btnConnect.disabled = false;
      }
    });
    btnSyx.addEventListener('click', () => {
      const slot = Number(slotSel.value);
      const blob = new Blob([X.toSyx(X.encodeScene(S.scene, slot))], { type: 'application/octet-stream' });
      const a = el('a', { href: URL.createObjectURL(blob), download: S.fileName.replace(/\.[^.]+$/, '') + '_slot' + slot + '.syx' });
      document.body.append(a); a.click(); a.remove();
    });
    showDialog([
      el('h2', null, 'Send to E16'),
      el('p', null, 'Transfers the scene over USB-MIDI, like the OXI App. The selected slot is overwritten.'),
      row('Slot', slotSel),
      row('Scene name', nameIn, 'Renames the scene before sending'),
      row('MIDI port', portSel),
      el('div', { class: 'inl' }, btnConnect, btnGo, btnSyx),
      bar, status,
      el('p', { class: 'muted' }, 'Linux without a browser: save as .syx and send it e.g. with amidi -p hw:X -s file.syx -i 100.'),
    ]);
  }

  function markSaved() { S.dirty = false; S.original = M.deepClone(S.scene); saveSession(); render(); }

  /*
   * Save to computer: write back to the folder file it came from; otherwise save it into the
   * scene folder as <title>.oxie16 (asking before overwriting); without a folder, download it.
   */
  async function saveLocal() {
    if (!S.scene) return;
    const text = JSON.stringify(S.scene);
    if (S.fileHandle) {
      if (!confirm('Overwrite ' + S.fileName + ' with the scene in the editor?\n\nUse "Save as …" to save it under a different name.')) return;
      try {
        await L().write(S.fileHandle, text);
        markSaved(); toast('Saved ' + S.fileName); refreshFolder();
        return;
      } catch (e) { toast('Could not write ' + S.fileName + ': ' + e.message + (onLinux() ? ' ' + FOLDER_FLATPAK : ''), true); return; }
    }
    if (S.lib.dir) {
      const name = S.source && S.source.kind === 'device' ? L().fileNameFor(S.scene.title) : S.fileName;
      const res = await saveToFolder(S.scene, name, S.source && S.source.scriptMissing, 'the scene in the editor');
      if (!res) return;
      S.fileHandle = res.handle; S.fileName = name;
      S.source = Object.assign({}, S.source, { kind: S.source && S.source.kind === 'device' ? 'device' : 'folder', savedTo: name });
      markSaved(); toast('Saved ' + name + res.note, !!res.warn); refreshFolder();
      return;
    }
    downloadText(S.fileName, text);
    markSaved(); toast('Downloaded ' + S.fileName);
  }

  /*
   * Save as: ask for a file name. With a scene folder the file goes there (asking before overwriting an
   * existing file); otherwise the browser's save dialog is used where available, else a download.
   */
  async function saveAs() {
    if (!S.scene) return;
    let name = prompt('Save as (file name):', S.fileName || L().fileNameFor(S.scene.title));
    if (name === null) return;
    name = name.trim().replace(/[\\/:*?"<>|]/g, '_');
    if (!name) return toast('No file name given', true);
    if (!/\.oxie16$/i.test(name)) name += '.oxie16';
    const text = JSON.stringify(S.scene);
    const scriptMissing = S.source && S.source.scriptMissing;
    if (S.lib.dir) {
      let res;
      try { res = await saveToFolder(S.scene, name, scriptMissing, 'the scene in the editor'); }
      catch (e) { toast('Could not write ' + name + ': ' + e.message + (onLinux() ? ' ' + FOLDER_FLATPAK : ''), true); return; }
      if (!res) return;
      S.fileHandle = res.handle; S.fileName = name;
      S.source = Object.assign({}, S.source, { kind: 'folder', savedTo: name });
      markSaved(); toast('Saved as ' + name + res.note, !!res.warn); refreshFolder();
      return;
    }
    if (window.showSaveFilePicker) {
      try {
        // The browser's own dialog asks before replacing an existing file.
        const handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'OXI E16 scene', accept: { 'application/json': ['.oxie16'] } }] });
        await L().write(handle, text);
        S.fileHandle = handle; S.fileName = handle.name;
        S.source = Object.assign({}, S.source, { kind: 'folder', savedTo: handle.name });
        markSaved(); toast('Saved as ' + handle.name);
      } catch (e) { if (e.name !== 'AbortError') toast('Could not save: ' + e.message, true); }
      return;
    }
    downloadText(name, text);
    S.fileName = name;
    markSaved(); toast('Downloaded ' + name);
  }

  /* Save to E16: choose the slot in the send dialog; a scene read from the E16 starts on its own slot. */
  function saveDevice() {
    if (!S.scene) return;
    sendDialog();
  }

  /* Close the scene and go back to the library. */
  function closeScene() {
    if (!S.scene || !confirmDiscard()) return;
    S.scene = null; S.original = null; S.fileHandle = null; S.source = null;
    S.dirty = false; S.undo = []; S.redo = []; S.sel = new Set();
    S.view = 'library';
    render();
  }

  // ---------- MIDI connection (shared by library and send dialog) ----------
  /* Shown when Web MIDI works but no E16 port shows up. On Linux the usual cause is a Flatpak browser:
     Chromium needs /run/udev to list hardware MIDI ports, and the Flatpak sandbox hides it. */
  const onLinux = () => /Linux/.test(navigator.userAgent) && !/Android/.test(navigator.userAgent);
  /* Folder access in a Flatpak browser: the sandbox only sees a few folders (e.g. Downloads), so other
     scene folders are missing in the picker, look empty or can't be written. */
  const FOLDER_FLATPAK = 'Linux with a Flatpak browser? If your folder is missing in the picker, looks empty or cannot be saved to, '
    + 'give the browser access to it, then fully restart the browser: flatpak override --user --filesystem=~/path/to/scenes com.brave.Browser';
  const flatpakNote = () => onLinux() ? [el('p', { class: 'muted pad' }, FOLDER_FLATPAK)] : [];
  function notFoundMsg() {
    let m = 'No E16 found. Check USB and close the OXI App.';
    if (onLinux()) {
      m += ' Linux with a Flatpak browser (e.g. Brave or Chromium from Flathub)? Allow it to see MIDI devices, then fully restart the browser: '
        + 'flatpak override --user --filesystem=/run/udev:ro com.brave.Browser (or org.chromium.Chromium).';
    }
    return m;
  }
  async function connectMidi() {
    const X = window.E16Sysex;
    if (!S.midi) {
      const access = await X.midiAccess();
      S.midi = { access };
      access.onstatechange = () => { updatePorts(); renderLibrary(); };
    }
    updatePorts();
    if (!S.midi.output) throw new Error(notFoundMsg());
    return S.midi;
  }
  function updatePorts() {
    if (!S.midi) return;
    const p = window.E16Sysex.findPorts(S.midi.access);
    S.midi.input = p.input; S.midi.output = p.output;
    if (!p.output) S.lib.slots = null;
  }
  /* Serialize device operations; show status in the library. */
  async function deviceOp(label, fn) {
    if (S.lib.busy) { toast('The E16 is busy, please wait.', true); return; }
    S.lib.busy = true; S.lib.status = label + ' …'; renderLibrary();
    try {
      const midi = await connectMidi();
      return await fn(midi, (n, total) => { S.lib.status = label + ' … ' + n + '/' + total; renderLibrary(); });
    } catch (e) {
      toast(transferError(e), true);
    } finally {
      S.lib.busy = false; S.lib.status = ''; renderLibrary();
    }
  }
  /*
   * Error text for device transfers. On Linux, the ALSA sequencer's MIDI output buffer is 4 KB by default
   * (snd_seq_midi output_buffer_size); the kernel silently drops what does not fit of a larger SysEx
   * message, so the 9 KB script block arrives incomplete and the E16 never answers it.
   */
  const ALSA_BUFFER_HINT = 'Linux: the kernel\'s MIDI output buffer (4 KB by default) is too small for the 9 KB script block, so the block arrived incomplete. '
    + 'Increase it, then reload this page: sudo sh -c "echo 32768 > /sys/module/snd_seq_midi/parameters/output_buffer_size". '
    + 'To keep it after a reboot: echo "options snd-seq-midi output_buffer_size=32768" | sudo tee /etc/modprobe.d/snd-seq-midi.conf';
  /* The scene arrived and was verified, only the (empty) script block got no reply. */
  function scriptBlockNote() {
    return 'Checked by reading it back: settings and all pages arrived. Only the empty script block was not confirmed'
      + (onLinux() ? ' (Linux: the MIDI output buffer is too small, see README)' : '')
      + '. If this slot had a script before, it may still be there.';
  }
  function transferError(e) {
    return e.message + (e.timeout && e.size > 4096 && onLinux() ? ' ' + ALSA_BUFFER_HINT : '');
  }

  // ---------- library: scene folder + device slots ----------
  const L = () => window.E16Library;
  const X = () => window.E16Sysex;

  async function initFolder() {
    if (!L().supported()) return;
    const d = await L().storedFolder(false);
    if (d && d.pending) S.lib.pending = d; else if (d) S.lib.dir = d;
    await refreshFolder();
  }
  async function refreshFolder() {
    if (!S.lib.dir) { renderLibrary(); return; }
    try { S.lib.files = await L().list(S.lib.dir); }
    catch (e) { S.lib.files = []; toast('Could not read the folder: ' + e.message + (onLinux() ? ' ' + FOLDER_FLATPAK : ''), true); }
    renderLibrary();
  }
  async function pickFolder() {
    try {
      if (S.lib.pending) {
        const d = await L().storedFolder(true);
        if (d && !d.pending) { S.lib.dir = d; S.lib.pending = null; return refreshFolder(); }
      }
      S.lib.dir = await L().pickFolder(); S.lib.pending = null;
      await refreshFolder();
    } catch (e) { if (e.name !== 'AbortError') toast(e.message + (onLinux() ? ' ' + FOLDER_FLATPAK : ''), true); }
  }
  async function openFromFolder(f) {
    if (!confirmDiscard()) return;
    S.page = 0;
    loadText(await L().read(f.handle), f.name, null, false, f.handle);
  }
  function downloadText(name, text) {
    const a = el('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function listSlots() {
    return deviceOp('Reading slots', async midi => { S.lib.slots = await X().listScenes(midi); });
  }
  async function readSlot(slot, report) {
    return X().readScene(S.midi, slot, report);
  }
  function openSlot(slot) {
    if (!confirmDiscard()) return;
    return deviceOp('Reading slot ' + slot, async (midi, report) => {
      const scene = await readSlot(slot, report);
      S.page = 0;
      loadText(JSON.stringify(scene), L().fileNameFor(scene.title), null, false, null,
        { kind: 'device', slot, scriptMissing: !!scene.scriptMissing });
      toast(scene.scriptMissing ? scriptMissingText(scene) : 'Loaded "' + scene.title + '" from E16 slot ' + slot, scene.scriptMissing);
    });
  }
  function scriptMissingText(scene) {
    return '"' + scene.title + '" uses the script "' + scene.code.scriptName + '", which cannot be read from the E16 yet. ' +
      'Pages and settings were loaded; the script itself is missing, so this copy cannot be sent back.';
  }

  /*
   * Write a scene into the scene folder as `name`, asking before overwriting. When the scene's script
   * could not be read from the device, the script of an existing file with the same script name is kept.
   * Returns { handle, note, warn } or null if cancelled.
   */
  async function saveToFolder(scene, name, scriptMissing, label) {
    const existing = S.lib.files.find(f => f.name.toLowerCase() === name.toLowerCase());
    let note = '', warn = false;
    if (existing) {
      let old = null;
      try { old = JSON.parse(await L().read(existing.handle)); } catch (e) { /* unreadable: plain overwrite */ }
      const keepScript = scriptMissing && old && old.code && old.code.code && old.code.scriptName === scene.code.scriptName;
      const w = scriptMissing && !keepScript ? '\n\nWarning: the script cannot be read from the E16, the saved file will not contain it.' : '';
      if (!confirm(name + ' already exists. Overwrite it with ' + label + '?' + (keepScript ? '\n\nThe script "' + scene.code.scriptName + '" from the existing file is kept.' : '') + w)) return null;
      if (keepScript) { scene.code.code = old.code.code; scene.code.fullScript = old.code.fullScript || ''; note = ' (script kept from the existing file)'; }
      else if (scriptMissing) { note = ' – without its script'; warn = true; }
    } else if (scriptMissing) {
      note = ' – without its script, which cannot be read from the E16 yet'; warn = true;
    }
    const handle = await L().save(S.lib.dir, name, JSON.stringify(scene));
    return { handle, note, warn };
  }

  /* Save a slot into the scene folder, or as a browser download when no folder is available. */
  function saveSlotToFolder(slot) {
    return deviceOp('Downloading slot ' + slot, (midi, report) => saveSlot(slot, report));
  }
  /* Read a slot and save it. Returns false if the user cancelled. Call inside deviceOp. */
  async function saveSlot(slot, report) {
    const scene = await readSlot(slot, report);
    const name = L().fileNameFor(scene.title);
    if (!S.lib.dir) {
      downloadText(name, JSON.stringify(scene));
      toast(scene.scriptMissing ? scriptMissingText(scene) : 'Downloaded slot ' + slot + ' as ' + name, scene.scriptMissing);
      return true;
    }
    const res = await saveToFolder(scene, name, scene.scriptMissing, 'slot ' + slot);
    if (!res) return false;
    toast('Saved slot ' + slot + ' as ' + name + res.note, res.warn);
    await refreshFolder();
    return true;
  }

  /*
   * "Delete" a slot: the E16 has no known delete command, so the slot is overwritten with the
   * factory-empty scene ("S. <slot>"), byte-identical to what an unused slot holds.
   */
  function deleteSlotDialog(slot) {
    const cur = S.lib.slots && S.lib.slots[slot - 1];
    const title = cur ? cur.title : 'S. ' + slot;
    const close = () => $('#dlg').close();
    const where = S.lib.dir ? 'to the scene folder' : 'as a download';
    showDialog([
      el('h2', null, 'Delete slot ' + slot + '?'),
      el('p', null, '"' + title + '" will be removed from the E16. The slot becomes empty ("S. ' + slot + '"). This cannot be undone on the device.'),
      cur && cur.scriptName ? el('p', { class: 'muted' }, 'Note: the script "' + cur.scriptName + '" cannot be read from the E16 yet, so a saved copy will not contain it.') : null,
      el('div', { class: 'dlgactions' },
        el('button', { class: 'btn primary', type: 'button', onclick: () => { close(); deleteSlot(slot, true); } }, 'Save ' + where + ', then delete'),
        el('button', { class: 'btn danger', type: 'button', onclick: () => { close(); deleteSlot(slot, false); } }, 'Delete without saving'),
        el('button', { class: 'btn', type: 'button', onclick: close }, 'Cancel')),
    ].filter(Boolean), true);
  }
  function deleteSlot(slot, saveFirst) {
    return deviceOp('Deleting slot ' + slot, async (midi, report) => {
      const cur = S.lib.slots && S.lib.slots[slot - 1];
      if (saveFirst && !(await saveSlot(slot, report))) { toast('Not deleted: slot ' + slot + ' was not saved.', true); return; }
      const empty = X().emptyScene(slot);
      await X().uploadScene(empty, slot, midi, report);
      if (S.lib.slots) S.lib.slots[slot - 1] = { slot, title: empty.title, color: empty.color, scriptName: '' };
      // This toast replaces the one from saveSlot, so repeat its script warning.
      const noScript = saveFirst && cur && cur.scriptName;
      toast('Slot ' + slot + ' deleted' + (noScript ? '. The saved copy does not contain the script "' + cur.scriptName + '".' : ''), !!noScript);
    });
  }
  /* Delete a file from the scene folder. The File System Access API has no trash, so ask first. */
  function deleteFileDialog(f) {
    const close = () => $('#dlg').close();
    const isOpen = S.fileHandle && S.fileName === f.name;
    showDialog([
      el('h2', null, 'Delete "' + f.name + '"?'),
      el('p', null, 'The file is removed from the folder "' + S.lib.dir.name + '". It does not go to the trash and cannot be undone.'),
      isOpen ? el('p', { class: 'muted' }, 'The scene stays open in the editor and can be saved again.') : null,
      el('div', { class: 'dlgactions' },
        el('button', { class: 'btn danger', type: 'button', onclick: () => { close(); deleteFile(f); } }, 'Delete file'),
        el('button', { class: 'btn', type: 'button', onclick: close }, 'Cancel')),
    ].filter(Boolean), true);
  }
  async function deleteFile(f) {
    try { await L().remove(S.lib.dir, f.name); }
    catch (e) { toast('Could not delete ' + f.name + ': ' + e.message + (onLinux() ? ' ' + FOLDER_FLATPAK : ''), true); return; }
    if (S.fileHandle && S.fileName === f.name) {
      // The open scene no longer has a file behind it; keep it as unsaved so it isn't lost by accident.
      S.fileHandle = null;
      S.source = { kind: 'file' };
      S.dirty = true; saveSession();
    }
    toast('Deleted ' + f.name);
    await refreshFolder();
    render();
  }

  function sendToSlot(scene, slot, label) {
    const problems = X().checkScene(scene);
    if (problems.length) { toast(problems.join(' '), true); return; }
    const cur = S.lib.slots && S.lib.slots[slot - 1];
    if (!confirm('Send "' + label + '" to slot ' + slot + (cur ? ' (replaces "' + cur.title + '")' : '') + '?')) return;
    return deviceOp('Sending to slot ' + slot, async (midi, report) => {
      const res = await X().uploadScene(scene, slot, midi, report);
      if (S.lib.slots) S.lib.slots[slot - 1] = { slot, title: scene.title, color: scene.color, scriptName: (scene.code || {}).scriptName || '' };
      toast('Saved "' + scene.title + '" to E16 slot ' + slot + (res.scriptBlockFailed ? '. ' + scriptBlockNote() : ''), !!res.scriptBlockFailed);
      return true;
    });
  }
  async function sendFileToSlot(name, slot) {
    const f = S.lib.files.find(x => x.name === name);
    if (!f) return;
    try { await sendToSlot(JSON.parse(await L().read(f.handle)), slot, f.name); }
    catch (e) { toast(e.message, true); }
  }

  function renderLibrary() {
    const lib = $('#library');
    if (!lib || lib.hidden) return;
    const fsOk = L().supported();
    $('#libFolderName').textContent = S.lib.dir ? S.lib.dir.name : S.lib.pending ? S.lib.pending.name + ' (click to allow access)' : '';
    $('#libPick').textContent = S.lib.pending ? 'Allow access' : S.lib.dir ? 'Change folder' : 'Choose folder';
    $('#libPick').disabled = !fsOk;
    $('#libRefresh').disabled = !S.lib.dir;

    const files = $('#libFiles');
    if (!fsOk) {
      const h = L().enableHint();
      files.replaceChildren(el('div', { class: 'pad enablehint' },
        el('p', null, el('b', null, 'Folder access is not available in ' + h.browser + '.')),
        h.steps
          ? [el('p', null, 'To enable it:'), el('ol', null, h.steps.map(s => el('li', null, s)))]
          : el('p', null, h.browser + ' does not support the File System Access API. Use Chrome, Chromium, Edge or Brave (with the flag enabled) to work with a scene folder.'),
        el('p', { class: 'muted' }, 'Until then you can still open files with "Open" and download slots with "Save".')));
    }
    else if (S.lib.pending) files.replaceChildren(el('div', { class: 'pad' },
      el('p', null, 'Last used folder: ', el('b', null, S.lib.pending.name)),
      el('button', { class: 'btn primary', onclick: pickFolder }, 'Open "' + S.lib.pending.name + '"'),
      el('p', { class: 'muted' }, 'The folder is remembered, but after a browser restart the browser asks once for access. '
        + 'If it offers "Allow on every visit", choose that and this step is skipped from then on.')));
    else if (!S.lib.dir) files.replaceChildren(el('p', { class: 'muted pad' }, 'Choose the folder that holds your .oxie16 files, e.g. the OXI App storage folder. A "Scenes" subfolder is used automatically.'),
      ...flatpakNote());
    else if (!S.lib.files.length) files.replaceChildren(el('p', { class: 'muted pad' }, 'No .oxie16 files in this folder.'),
      ...flatpakNote());
    else {
      files.replaceChildren(...S.lib.files.map(f => el('div', {
        class: 'librow' + (S.fileHandle && S.fileName === f.name ? ' current' : ''), draggable: 'true',
        ondragstart: e => { e.dataTransfer.setData('text/x-e16-file', f.name); e.dataTransfer.effectAllowed = 'copy'; },
        ondblclick: () => openFromFolder(f),
      },
      el('i', { class: 'libcolor', style: { background: M.colorCss(f.color) } }),
      el('span', { class: 'libname' }, f.name.replace(/\.oxie16$/i, '')),
      el('button', { class: 'btn small', onclick: () => openFromFolder(f) }, 'Edit'),
      el('button', { class: 'btn small danger', title: 'Delete this file from the scene folder', 'aria-label': 'Delete ' + f.name, onclick: () => deleteFileDialog(f) }, '✕'))));
    }
    // Drop target for device slots → save to folder.
    files.ondragover = e => { if (e.dataTransfer.types.includes('text/x-e16-slot')) { e.preventDefault(); files.classList.add('dropping'); } };
    files.ondragleave = () => files.classList.remove('dropping');
    files.ondrop = e => {
      files.classList.remove('dropping');
      const slot = Number(e.dataTransfer.getData('text/x-e16-slot'));
      if (slot) { e.preventDefault(); e.stopPropagation(); saveSlotToFolder(slot); }
    };

    const dev = $('#libDevice');
    $('#libDeviceName').textContent = S.lib.status || (S.midi && S.midi.output ? S.midi.output.name : '');
    $('#libConnect').textContent = S.lib.slots ? '↻' : 'Connect E16';
    $('#libConnect').title = S.lib.slots ? 'Reload slots from the E16' : '';
    $('#libConnect').disabled = S.lib.busy;
    if (!S.lib.slots) {
      dev.replaceChildren(el('p', { class: 'muted pad' }, 'Connect the E16 via USB, close the OXI App and click "Connect E16". The browser asks for MIDI (SysEx) access.'));
      return;
    }
    dev.replaceChildren(...S.lib.slots.map(s => {
      const r = el('div', {
        class: 'librow', draggable: 'true',
        ondragstart: e => { e.dataTransfer.setData('text/x-e16-slot', String(s.slot)); e.dataTransfer.effectAllowed = 'copy'; },
        ondragover: e => { if (e.dataTransfer.types.includes('text/x-e16-file')) { e.preventDefault(); r.classList.add('dropping'); } },
        ondragleave: () => r.classList.remove('dropping'),
        ondrop: e => {
          r.classList.remove('dropping');
          const name = e.dataTransfer.getData('text/x-e16-file');
          if (name) { e.preventDefault(); e.stopPropagation(); sendFileToSlot(name, s.slot); }
        },
      },
      el('span', { class: 'libslot' }, s.slot),
      el('i', { class: 'libcolor', style: { background: M.colorCss(s.color) } }),
      el('span', { class: 'libname' }, s.title, s.scriptName ? el('span', { class: 'muted' }, ' · ' + s.scriptName) : null),
      el('button', { class: 'btn small', disabled: S.lib.busy, onclick: () => openSlot(s.slot) }, 'Edit'),
      el('button', { class: 'btn small', disabled: S.lib.busy, title: S.lib.dir ? 'Save to the scene folder' : 'Download as .oxie16', onclick: () => saveSlotToFolder(s.slot) }, 'Save'),
      S.scene ? el('button', { class: 'btn small', disabled: S.lib.busy, title: 'Send the scene open in the editor to this slot', onclick: () => sendToSlot(S.scene, s.slot, S.scene.title) }, 'Send current') : null,
      el('button', { class: 'btn small danger', disabled: S.lib.busy, title: 'Delete this scene from the E16 (the slot becomes empty)', 'aria-label': 'Delete slot ' + s.slot, onclick: () => deleteSlotDialog(s.slot) }, '✕'));
      return r;
    }));
  }

  function showView(v) {
    S.view = v === 'editor' && S.scene ? 'editor' : 'library';
    render();
    if (S.view === 'library') renderLibrary();
  }

  // ---------- helpers on scene ----------
  const curPage = () => S.scene.pages[S.page];
  function encChanged(p, e) {
    const o = S.original && S.original.pages[p] && S.original.pages[p].encoders[e];
    return !o || JSON.stringify(o) !== JSON.stringify(S.scene.pages[p].encoders[e]);
  }
  function selected() { return [...S.sel].sort((a, b) => a - b); }

  function targets() {
    const b = S.bulk;
    const out = [];
    if (b.scope === 'pages') {
      const from = Math.max(1, Math.min(b.from, b.to)), to = Math.min(S.scene.pages.length, Math.max(b.from, b.to));
      for (let p = from - 1; p < to; p++) M.orderIndices([...Array(16).keys()], b.order).forEach(e => out.push({ p, e }));
    } else {
      const idx = b.scope === 'sel' && S.sel.size ? selected() : [...Array(curPage().encoders.length).keys()];
      M.orderIndices(idx, b.order).forEach(e => out.push({ p: S.page, e }));
    }
    return out;
  }
  function scopeText() {
    const b = S.bulk;
    if (b.scope === 'pages') return 'Pages ' + Math.min(b.from, b.to) + '–' + Math.max(b.from, b.to);
    if (b.scope === 'sel' && S.sel.size) return S.sel.size + ' selected encoders';
    return 'whole Page ' + (S.page + 1);
  }

  // ---------- render ----------
  function render() {
    renderTop();
    const lib = S.view === 'library' || !S.scene;
    $('#library').hidden = !lib;
    $('#editor').hidden = lib;
    if (lib) { renderLibrary(); return; }
    document.querySelectorAll('#mainTabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === S.tab));
    ['pages', 'overview', 'scene'].forEach(t => { $('#tab-' + t).hidden = t !== S.tab; });
    renderSourceBar();
    if (S.tab === 'pages') { renderPageBar(); renderPageSettings(); renderGrid(); renderSide(); }
    if (S.tab === 'overview') renderOverview();
    if (S.tab === 'scene') renderScene();
  }

  /* Where the scene in the editor comes from, shown prominently above the tabs. */
  function sourceText() {
    const src = S.source || {};
    if (src.kind === 'device') return ['E16', 'slot ' + src.slot + ' on the E16' + (src.savedTo ? ' · copy saved as ' + src.savedTo : '')];
    if (src.kind === 'folder') return ['Folder', S.fileName + ' in ' + (S.lib.dir ? S.lib.dir.name : 'the scene folder')];
    if (src.kind === 'session') return ['Restored', S.fileName + ' (from the last session)'];
    return ['File', S.fileName + ' (opened from disk; saving downloads a copy or uses the scene folder)'];
  }
  function renderSourceBar() {
    const bar = $('#sourceBar');
    if (!S.scene) { bar.replaceChildren(); return; }
    const [tag, text] = sourceText();
    bar.className = 'sourcebar src-' + ((S.source && S.source.kind) || 'file');
    bar.replaceChildren(...[
      el('i', { class: 'libcolor', style: { background: M.colorCss(S.scene.color) } }),
      el('span', { class: 'srctag' }, tag),
      el('b', { class: 'srctitle' }, S.scene.title || '(untitled)'),
      el('span', { class: 'muted' }, text),
      S.dirty ? el('span', { class: 'badge warn' }, 'unsaved changes') : null,
      S.source && S.source.scriptMissing ? el('span', { class: 'badge warn', title: 'The script cannot be read from the E16 yet' }, 'script not loaded') : null,
    ].filter(Boolean));
  }

  function renderTop() {
    const has = !!S.scene, src = S.source || {};
    $('#btnSaveLocal').disabled = !has;
    $('#btnSaveLocal').title = S.fileHandle ? 'Save to ' + S.fileName + ' (Ctrl+S)'
      : S.lib.dir ? 'Save into the scene folder (Ctrl+S)' : 'Download as .oxie16 (Ctrl+S)';
    $('#btnSaveAs').disabled = !has;
    $('#btnSaveAs').title = (S.lib.dir ? 'Save into the scene folder under a new name' : 'Save under a new name') + ' (Ctrl+Shift+S)';
    $('#btnSaveDevice').disabled = !has || !!src.scriptMissing;
    $('#btnSaveDevice').textContent = 'Save to E16 …';
    $('#btnSaveDevice').title = src.scriptMissing ? 'Disabled: the script of this scene could not be read from the E16'
      : src.kind === 'device' ? 'Choose a slot (slot ' + src.slot + ' preselected) and send the scene to the E16' : 'Choose a slot and send the scene to the E16';
    $('#btnClose').disabled = !has;
    $('#btnLibrary').textContent = S.view === 'library' && S.scene ? 'Back to editor' : 'Library';
    $('#btnUndo').disabled = !S.undo.length;
    $('#btnRedo').disabled = !S.redo.length;
    $('#fileInfo').textContent = '';
    if (S.scene && S.view !== 'library') renderSourceBar();
  }

  function renderPageBar() {
    const bar = $('#pageBar');
    bar.replaceChildren(...S.scene.pages.map((p, i) =>
      el('button', {
        class: 'pagebtn' + (i === S.page ? ' active' : ''),
        onclick: () => { S.page = i; S.sel = new Set(); S.anchor = null; render(); },
        title: 'Channel ' + M.pageChannel(p, S.settings) + '\nDrag onto another Page to swap, with Alt or Ctrl to copy',
        draggable: 'true',
        ondragstart: ev => { ev.dataTransfer.setData('text/x-e16-page', String(i)); ev.dataTransfer.effectAllowed = 'copyMove'; },
        ondragover: ev => { if (ev.dataTransfer.types.includes('text/x-e16-page')) { ev.preventDefault(); ev.currentTarget.classList.add('dropping'); } },
        ondragleave: ev => ev.currentTarget.classList.remove('dropping'),
        ondrop: ev => {
          ev.preventDefault();
          const from = parseInt(ev.dataTransfer.getData('text/x-e16-page'), 10);
          if (Number.isNaN(from) || from === i) return render();
          if (ev.altKey || ev.ctrlKey) copyPage(from, i, true);
          else swapPages(from, i, true);
        },
      }, el('span', { class: 'pnum' }, 'P' + (i + 1)), el('span', { class: 'ptitle' }, p.title))));
  }

  function renderPageSettings() {
    const p = curPage();
    const chOpts = {};
    for (let i = 1; i <= 16; i++) chOpts[i] = { label: String(i), sure: true };
    $('#pageSettings').replaceChildren(
      row('Page name', textEl(p.title, v => commit(() => { p.title = v.slice(0, 7); }), { maxlength: 7, class: 'w-name' })),
      row('Channel', selectEl(chOpts, M.pageChannel(p, S.settings), v => commit(() => M.setPageChannel(p, v, S.settings)))),
      row('Output', selectEl(M.PAGE_OUTPUTS, p.output, v => commit(() => { p.output = v; })),
        'Other values not decoded yet'),
      row('Nav on swap', navModeEl(), NAV_MODE_HINT),
    );
  }
  const NAV_MODE_HINT = 'What happens to "Nav → P…" pushes when two Pages are swapped (drag and drop or bulk edit).\n'
    + 'Move with page: they are swapped with the rest of the page. A push that leads to one of the two swapped pages gets that page\'s new number.\n'
    + 'Stay in place: they are pinned to their page position with their target. A push arriving there is overwritten, a Nav push arriving elsewhere is turned off.';
  function navModeEl() {
    return selectEl({ 0: { label: 'Move with page', sure: true }, 1: { label: 'Stay in place', sure: true } },
      S.navMode === 'stay' ? 1 : 0, v => { S.navMode = v ? 'stay' : 'follow'; render(); });
  }
  function clearNames(t, target) {
    commit(() => t.forEach(x => {
      const enc = S.scene.pages[x.p].encoders[x.e];
      // Reset to the encoder number (E1 … E16), not the CC, which may differ from the position.
      const def = 'E' + (x.e + 1);
      if (target !== 'abbr') enc.name = def;
      if (target !== 'name') enc.abbr = def;
    }), 'Names reset to E1 … E16 (' + t.length + ' encoders)');
  }
  function setWhite(t) {
    commit(() => t.forEach(x => { S.scene.pages[x.p].encoders[x.e].color = M.WHITE; }), 'Colors set to white (' + t.length + ' encoders)');
  }

  function renderGrid() {
    const p = curPage();
    const grid = $('#encGrid');
    const cells = p.encoders.map((enc, i) => {
      const lines = M.ROLES.map(r => {
        const s = M.actionSummary(r, M.getAction(enc, r), p, S.settings);
        return el('div', { class: 'eline' + (s ? '' : ' off') }, el('span', { class: 'erole' }, r === 'push' ? 'P' : r === 'd1' ? '1' : '2'), s || '–');
      });
      return el('div', {
        class: 'enc' + (S.sel.has(i) ? ' sel' : '') + (encChanged(S.page, i) ? ' changed' : ''),
        draggable: 'true',
        'data-i': i,
        style: { '--ring': M.colorCss(enc.color) },
        onclick: ev => clickEnc(i, ev),
        ondragstart: ev => { ev.dataTransfer.setData('text/x-e16-enc', String(i)); ev.dataTransfer.effectAllowed = 'copyMove'; },
        ondragover: ev => { ev.preventDefault(); ev.currentTarget.classList.add('dropping'); },
        ondragleave: ev => ev.currentTarget.classList.remove('dropping'),
        ondrop: ev => {
          ev.preventDefault();
          const from = parseInt(ev.dataTransfer.getData('text/x-e16-enc'), 10);
          if (Number.isNaN(from) || from === i) return render();
          const copy = ev.altKey || ev.ctrlKey;
          commit(() => {
            const encs = curPage().encoders;
            if (copy) encs[i] = M.deepClone(encs[from]);
            else [encs[from], encs[i]] = [encs[i], encs[from]];
          }, copy ? 'Encoder copied' : 'Encoders swapped');
          S.sel = new Set([i]);
          render();
        },
      },
        el('div', { class: 'ehead' }, el('span', { class: 'ering' }), el('span', { class: 'eabbr' }, enc.abbr || '–'), el('span', { class: 'enum' }, i + 1)),
        el('div', { class: 'ename' }, enc.name),
        lines);
    });
    grid.replaceChildren(...cells);
    $('#clipInfo').textContent = S.clip ? S.clip.length + ' encoder(s) on the clipboard' : '';
    renderPasteParts();
  }

  function renderPasteParts() {
    const pp = S.pasteParts;
    let box = $('#pasteParts');
    if (!box) {
      box = el('span', { class: 'pasteparts', id: 'pasteParts' });
      $('#btnPaste').after(box);
    }
    box.replaceChildren(el('span', { class: 'hint' }, 'Paste:'),
      ...PASTE_PARTS.map(([k, label]) => el('label', { class: 'chk', title: 'Include ' + label + ' when pasting' },
        el('input', { type: 'checkbox', checked: pp[k], onchange: e => { pp[k] = e.target.checked; } }), label)));
  }

  function clickEnc(i, ev) {
    if (ev.shiftKey && S.anchor !== null) {
      const [a, b] = [Math.min(S.anchor, i), Math.max(S.anchor, i)];
      if (!ev.ctrlKey && !ev.metaKey) S.sel = new Set();
      for (let k = a; k <= b; k++) S.sel.add(k);
    } else if (ev.ctrlKey || ev.metaKey) {
      S.sel.has(i) ? S.sel.delete(i) : S.sel.add(i);
      S.anchor = i;
    } else {
      S.sel = new Set([i]);
      S.anchor = i;
    }
    render();
  }

  function renderSide() {
    document.querySelectorAll('#sideTabs button').forEach(b => b.classList.toggle('active', b.dataset.side === S.side));
    $('#side-edit').hidden = S.side !== 'edit';
    $('#side-bulk').hidden = S.side !== 'bulk';
    if (S.side === 'edit') renderEditor(); else renderBulk();
    makeAccordion($('#side-' + S.side), S.side);
  }

  /*
   * Side pane sections as an accordion: clicking a section title opens it and closes the one open before;
   * clicking the open one closes it. General and Scope stay open. The open section per pane is remembered.
   */
  const ACC_PINNED = ['General', 'Scope'];
  const ACC_DEFAULT = { edit: 'Dest 1', bulk: 'Distribute CCs' };
  let openSection;
  try { openSection = Object.assign({}, ACC_DEFAULT, JSON.parse(localStorage.getItem(LS_OPEN) || '{}')); } catch (e) { openSection = Object.assign({}, ACC_DEFAULT); }
  function makeAccordion(pane, prefix) {
    const sections = [];
    pane.querySelectorAll(':scope > fieldset').forEach(fs => {
      const lg = fs.querySelector(':scope > legend');
      if (!lg) return;
      // Legends can carry a status suffix, e.g. "Dest 2 (inactive, ...)".
      const key = lg.textContent.split(' (')[0];
      if (ACC_PINNED.includes(key)) return;
      const inner = el('div', { class: 'accinner' });
      [...fs.childNodes].filter(n => n !== lg).forEach(n => inner.append(n));
      fs.append(el('div', { class: 'accbody' }, inner));
      fs.classList.add('acc');
      const isOpen = openSection[prefix] === key;
      fs.classList.toggle('open', isOpen);
      fs.classList.toggle('settled', isOpen);
      sections.push({ fs, key });
      lg.addEventListener('click', () => {
        const opening = !fs.classList.contains('open');
        sections.forEach(x => x.fs.classList.remove('open', 'settled'));
        openSection[prefix] = opening ? key : null;
        try { localStorage.setItem(LS_OPEN, JSON.stringify(openSection)); } catch (e) { /* storage unavailable */ }
        if (!opening) return;
        fs.classList.add('open');
        const body = fs.querySelector(':scope > .accbody');
        const done = () => {
          body.removeEventListener('transitionend', done);
          if (!fs.classList.contains('open')) return;
          fs.classList.add('settled');
          fs.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        };
        body.addEventListener('transitionend', done);
        // Fallback when no transition runs (reduced motion).
        setTimeout(done, 400);
      });
    });
  }

  // ---------- single encoder editor ----------
  function renderEditor() {
    const pane = $('#side-edit');
    const sel = selected();
    if (!sel.length) {
      pane.replaceChildren(el('p', { class: 'muted' }, 'Click an encoder in the grid to edit it. For multiple selections, use Bulk edit.'));
      return;
    }
    const i = sel[0];
    const p = curPage();
    const enc = p.encoders[i];
    const head = el('div', { class: 'edhead' },
      el('h3', null, 'Encoder ' + (i + 1)),
      sel.length > 1 ? el('span', { class: 'muted' }, sel.length + ' selected, edits only affect encoder ' + (i + 1)) : null);

    const general = el('fieldset', null, el('legend', null, 'General'),
      row('Name', textEl(enc.name, v => commit(() => { enc.name = v.slice(0, 4); }), { maxlength: 4, class: 'w-name' })),
      row('Abbr', textEl(enc.abbr, v => commit(() => { enc.abbr = v.slice(0, 4); }), { maxlength: 4, class: 'w-name' })),
      row('Color', colorEl(enc.color, v => commit(() => { enc.color = v; }))),
      extraKeys(enc, ['name', 'abbr', 'color', 'color2', 'push_action', 'turn_actions']),
    );

    const sections = M.ROLES.map(role => {
      const a = M.getAction(enc, role);
      if (!a) return null;
      return el('fieldset', { class: a.type === 0 ? 'inactive' : '' },
        el('legend', null, M.ROLE_LABEL[role] + (role === 'd2' && M.getAction(enc, 'd1').type === 0 ? ' (inactive, Dest 1 is Off)' : '')),
        actionEditor(role, a, p));
    });
    pane.replaceChildren(head, general, ...sections);
  }

  function extraKeys(obj, known) {
    const keys = Object.keys(obj).filter(k => !known.includes(k));
    return keys.map(k => typeof obj[k] === 'number'
      ? row(k, numEl(obj[k], v => commit(() => { obj[k] = v; }), { class: 'w-num' }), 'Unknown field, raw value')
      : typeof obj[k] === 'string'
        ? row(k, textEl(obj[k], v => commit(() => { obj[k] = v; })), 'Unknown field, raw value')
        : row(k, el('code', null, JSON.stringify(obj[k]).slice(0, 60)), 'Read-only'));
  }

  function actionEditor(role, a, page) {
    const fields = M.actionFields(role, a, S.scene.pages);
    return fields.map(f => {
      let ctl;
      const set = v => commit(() => { a[f.key] = v; });
      if (f.kind === 'select') ctl = selectEl(f.options, a[f.key], set);
      else if (f.kind === 'num') {
        ctl = numEl(a[f.key], set, { min: f.min, max: f.max, class: 'w-num' });
        if (f.note) ctl = el('span', { class: 'inl' }, ctl, el('span', { class: 'muted' }, M.noteName(a[f.key])));
        if (f.key === 'nr1' && /CC/.test(f.label)) ctl = el('span', { class: 'inl' }, ctl, ccStatus(role, a, page));
      } else ctl = textEl(a[f.key], set);
      return row(f.label + (f.raw ? ' *' : ''), ctl, f.hint || (f.raw ? 'Raw value, meaning not fully known' : null));
    });
  }

  function ccStatus(role, a, page) {
    if (!M.isCC(role, a)) return null;
    const ch = M.effectiveChannel(page, a, S.settings);
    const list = M.collectCCUses(S.scene, S.settings).get(ch + ':' + a.nr1) || [];
    const n = M.distinctOwners(list);
    return el('span', { class: 'badge' + (n > 1 ? ' warn' : ''), title: list.map(u => usageText(u)).join('\n') },
      'Ch' + ch + (n > 1 ? ' · used ' + n + '×' : ' · unique'));
  }

  function usageText(u) {
    const enc = S.scene.pages[u.p].encoders[u.e];
    return 'P' + (u.p + 1) + ' E' + (u.e + 1) + ' ' + (enc.abbr || enc.name) + ' ' + M.ROLE_LABEL[u.role] + (u.part ? ' ' + u.part : '');
  }

  // ---------- bulk tools ----------
  const bulkState = {
    cc: { role: 'd1', start: 1, step: 1, skipUsed: false, setTypeIfOff: true, keepOther: true, channel: 'keep' },
    push: { source: 'offset', offset: 16, start: 1, mode: 0, pval: 127, rval: 0, copyChannel: true, setTypeIfOff: true, keepOther: true },
    field: { role: 'd1', key: 'type', value: 3 },
    name: { pattern: 'CC{cc}', start: 1, target: 'both' },
    color: { mode: 'fixed', a: 0, b: 90 },
    page: { target: 1, withSettings: true },
  };

  const FIELD_KEYS = {
    enc: ['color'],
    d1: ['type', 'channel', 'output', 'nr2', 'lower', 'upper', 'defaultValue', 'mode', 'display', 'instrument'],
    d2: ['type', 'channel', 'output', 'nr2', 'lower', 'upper', 'defaultValue', 'mode', 'display', 'instrument'],
    push: ['type', 'channel', 'output', 'mode', 'nr2', 'lower', 'upper', 'scriptId'],
  };

  function renderBulk() {
    const pane = $('#side-bulk');
    const b = S.bulk;
    const nPages = S.scene.pages.length;
    const pageNums = {};
    for (let i = 1; i <= nPages; i++) pageNums[i] = { label: String(i), sure: true };

    const scope = el('fieldset', null, el('legend', null, 'Scope'),
      row('Applies to', selectEl({ 0: { label: 'Selection', sure: true }, 1: { label: 'Current Page', sure: true }, 2: { label: 'Page range', sure: true } },
        { sel: 0, page: 1, pages: 2 }[b.scope], v => { b.scope = ['sel', 'page', 'pages'][v]; render(); })),
      b.scope === 'pages' ? row('From / to', el('span', { class: 'inl' },
        selectEl(pageNums, b.from, v => { b.from = v; render(); }), selectEl(pageNums, b.to, v => { b.to = v; render(); }))) : null,
      row('Order', selectEl({ 0: { label: 'By row (1-2-3-4)', sure: true }, 1: { label: 'By column (1-5-9-13)', sure: true } },
        b.order === 'col' ? 1 : 0, v => { b.order = v ? 'col' : 'row'; render(); })),
      el('p', { class: 'muted' }, 'Current: ' + scopeText() + ' (' + targets().length + ' encoders)'),
    );

    pane.replaceChildren(scope, bulkCC(), bulkPush(), bulkField(), bulkName(), bulkColor(), bulkPage(pageNums));
  }

  const roleOpts = { 0: { label: 'Dest 1', sure: true }, 1: { label: 'Dest 2', sure: true }, 2: { label: 'Push', sure: true } };
  const roleIdx = r => M.ROLES.indexOf(r);

  function bulkCC() {
    const o = bulkState.cc;
    const chOpts = { '-1': { label: 'Unchanged', sure: true }, 0: { label: 'Page', sure: true } };
    for (let i = 1; i <= 16; i++) chOpts[i] = { label: String(i), sure: true };
    return el('fieldset', null, el('legend', null, 'Distribute CCs'),
      row('Target', selectEl(roleOpts, roleIdx(o.role), v => { o.role = M.ROLES[v]; })),
      row('Start CC', numEl(o.start, v => { o.start = v; }, { min: 0, max: 127, class: 'w-num' })),
      row('Step', numEl(o.step, v => { o.step = v; }, { min: 1, max: 127, class: 'w-num' })),
      row('Set channel', selectEl(chOpts, o.channel === 'keep' ? -1 : o.channel, v => { o.channel = v === -1 ? 'keep' : v; })),
      row('Skip used CCs', el('input', { type: 'checkbox', checked: o.skipUsed, onchange: e => { o.skipUsed = e.target.checked; } }),
        'Skips CCs that are already used outside the scope on the effective channel'),
      row('Activate Off targets', el('input', { type: 'checkbox', checked: o.setTypeIfOff, onchange: e => { o.setTypeIfOff = e.target.checked; } }),
        'Changes type Off to CC Abs (Dest) or CC (Push)'),
      row('Keep navigation & other functions', el('input', { type: 'checkbox', checked: o.keepOther, onchange: e => { o.keepOther = e.target.checked; } }),
        'Skips actions that are neither Off nor CC, e.g. Page navigation, Script, Note or PC. They keep their function and use no CC number.'),
      el('button', { class: 'btn primary', onclick: e => { e.preventDefault(); runCC(); } }, 'Distribute'));
  }
  function runCC() {
    const o = bulkState.cc;
    const t = targets();
    const res = commit(() => M.distributeCC(S.scene, S.settings, t, o));
    if (!res) return;
    toast(res.assigned + ' CCs assigned' + (res.last !== null ? ' (up to CC ' + res.last + ')' : '') +
      (res.kept ? ', ' + res.kept + ' kept (navigation or other function)' : '') +
      (res.overflow ? ', ' + res.overflow + ' without a free CC (> 127)' : ''), res.overflow > 0);
  }

  function bulkPush() {
    const o = bulkState.push;
    const hintText = v => o.source === 'offset'
      ? (() => {
        // Example base chosen so that negative offsets give a valid result too.
        const base = v < 0 ? Math.min(127, 1 - v) : 3, res = base + v;
        return 'Push CC = Dest 1 CC ' + (v < 0 ? '− ' + -v : '+ ' + v) + ', e.g. Dest 1 CC ' + base + ' → Push CC '
          + (res >= 0 && res <= 127 ? res : res + ' (out of range, skipped)') + '. Encoders without a Dest 1 CC or outside 0–127 are skipped.';
      })()
      : 'Push CCs ' + v + ', ' + (v + 1) + ', ' + (v + 2) + ' … in the order chosen under Scope.';
    const hint = el('p', { class: 'muted' }, hintText(o.source === 'offset' ? o.offset : o.start));
    const live = () => e => { const v = parseInt(e.target.value, 10); if (!Number.isNaN(v)) hint.textContent = hintText(v); };
    return el('fieldset', null, el('legend', null, 'Set up Push as CC'),
      row('CC number', selectEl({ 0: { label: 'Dest 1 CC + offset', sure: true }, 1: { label: 'Sequential from', sure: true } },
        o.source === 'offset' ? 0 : 1, v => { o.source = v ? 'seq' : 'offset'; render(); })),
      o.source === 'offset'
        ? row('Offset', numEl(o.offset, v => { o.offset = v; }, { min: -127, max: 127, class: 'w-num', oninput: live() }))
        : row('Start CC', numEl(o.start, v => { o.start = v; }, { min: 0, max: 127, class: 'w-num', oninput: live() })),
      hint,
      row('Behavior', selectEl(M.PUSH_MODES, o.mode, v => { o.mode = v; })),
      row('P.Val', numEl(o.pval, v => { o.pval = v; }, { min: 0, max: 127, class: 'w-num' })),
      row('R.Val', numEl(o.rval, v => { o.rval = v; }, { min: 0, max: 127, class: 'w-num' })),
      row('Channel from Dest 1', el('input', { type: 'checkbox', checked: o.copyChannel, onchange: e => { o.copyChannel = e.target.checked; } })),
      row('Activate Off targets', el('input', { type: 'checkbox', checked: o.setTypeIfOff, onchange: e => { o.setTypeIfOff = e.target.checked; } }),
        'Changes Push type Off to CC. Unchecked, Off pushes get their CC number and values but stay Off.'),
      row('Keep navigation & other functions', el('input', { type: 'checkbox', checked: o.keepOther, onchange: e => { o.keepOther = e.target.checked; } }),
        'Only Push actions that are Off or already CC are changed; Page navigation, Set to Default, Script etc. stay as they are.'),
      el('button', { class: 'btn primary', onclick: e => { e.preventDefault(); runPush(); } }, 'Apply'));
  }
  function runPush() {
    const o = bulkState.push;
    let n = 0, skipped = 0, kept = 0, leftOff = 0, cc = o.start;
    commit(() => {
      for (const t of targets()) {
        const enc = S.scene.pages[t.p].encoders[t.e];
        const d1 = M.getAction(enc, 'd1');
        const pa = enc.push_action;
        if (o.keepOther && pa.type !== 0 && !M.isCC('push', pa)) { kept++; continue; }
        let num;
        if (o.source === 'offset') {
          if (!M.isCC('d1', d1)) { skipped++; continue; }
          num = d1.nr1 + o.offset;
        } else num = cc++;
        if (num < 0 || num > 127) { skipped++; continue; }
        if (pa.type !== 0 || o.setTypeIfOff) pa.type = 2;
        else leftOff++;
        pa.nr1 = num; pa.mode = o.mode; pa.lower = o.pval; pa.upper = o.rval;
        if (o.copyChannel) pa.channel = d1.channel;
        n++;
      }
    });
    toast(n + ' Push actions set' + (leftOff ? ' (' + leftOff + ' left Off)' : '') + (kept ? ', ' + kept + ' kept (navigation or other function)' : '') +
      (skipped ? ', ' + skipped + ' skipped' : ''), skipped > 0);
  }

  function bulkField() {
    const o = bulkState.field;
    const rOpts = { 0: { label: 'Encoder', sure: true }, 1: { label: 'Dest 1', sure: true }, 2: { label: 'Dest 2', sure: true }, 3: { label: 'Push', sure: true } };
    const rKeys = ['enc', 'd1', 'd2', 'push'];
    const keys = FIELD_KEYS[o.role];
    if (!keys.includes(o.key)) o.key = keys[0];
    const defs = fieldDefs(o.role);
    const kOpts = {};
    keys.forEach((k, i) => { kOpts[i] = { label: defs[k] ? defs[k].label : k, sure: true }; });
    const def = defs[o.key];
    let valCtl;
    if (o.role === 'enc' && o.key === 'color') valCtl = colorEl(o.value, v => { o.value = v; });
    else if (def && def.kind === 'select') {
      if (!(o.value in def.options)) o.value = Number(Object.keys(def.options)[0]);
      valCtl = selectEl(def.options, o.value, v => { o.value = v; });
    } else valCtl = numEl(o.value, v => { o.value = v; }, { class: 'w-num', min: def && def.min, max: def && def.max });
    return el('fieldset', null, el('legend', null, 'Set field'),
      row('Section', selectEl(rOpts, rKeys.indexOf(o.role), v => { o.role = rKeys[v]; render(); })),
      row('Field', selectEl(kOpts, keys.indexOf(o.key), v => { o.key = keys[v]; render(); })),
      row('Value', valCtl),
      el('button', { class: 'btn primary', onclick: e => { e.preventDefault(); runField(); } }, 'Set'));
  }
  /* Field definitions (label, kind, options) per key for a bulk section, taken from the encoder editor's fields. */
  function fieldDefs(role) {
    if (role === 'enc') return { color: { label: 'Color', kind: 'color' } };
    const sample = { type: role === 'push' ? 2 : 3 };
    const out = {};
    M.actionFields(role, sample, S.scene.pages).forEach(f => { out[f.key] = f; });
    return out;
  }
  function runField() {
    const o = bulkState.field;
    let n = 0;
    commit(() => {
      for (const t of targets()) {
        const enc = S.scene.pages[t.p].encoders[t.e];
        const obj = o.role === 'enc' ? enc : M.getAction(enc, o.role);
        if (obj && o.key in obj) { obj[o.key] = o.value; n++; }
      }
    });
    const def = fieldDefs(o.role)[o.key];
    const shown = def && def.kind === 'select' && def.options[o.value] ? def.options[o.value].label : o.value;
    toast((def ? def.label : o.key) + ' = ' + shown + ' on ' + n + ' encoders');
  }

  function bulkName() {
    const o = bulkState.name;
    return el('fieldset', null, el('legend', null, 'Assign names'),
      row('Pattern', textEl(o.pattern, v => { o.pattern = v; }), 'Placeholders: {n} running number, {cc} CC of Dest 1, {e} encoder number, {p} page number. Max. 4 characters.'),
      row('Start {n}', numEl(o.start, v => { o.start = v; }, { class: 'w-num' })),
      row('Target', selectEl({ 0: { label: 'Name + Abbr', sure: true }, 1: { label: 'Name only', sure: true }, 2: { label: 'Abbr only', sure: true } },
        ['both', 'name', 'abbr'].indexOf(o.target), v => { o.target = ['both', 'name', 'abbr'][v]; })),
      el('p', { class: 'muted' }, 'Placeholders: {n} {cc} {e} {p}'),
      el('span', { class: 'inl' },
        el('button', { class: 'btn primary', onclick: e => { e.preventDefault(); runName(); } }, 'Rename'),
        el('button', { class: 'btn', title: 'Reset the names of the encoders in scope to E1 … E16 by position (Target applies)', onclick: e => { e.preventDefault(); clearNames(targets(), o.target); } }, 'Reset names')));
  }
  function runName() {
    const o = bulkState.name;
    let n = o.start, cut = 0;
    commit(() => {
      for (const t of targets()) {
        const enc = S.scene.pages[t.p].encoders[t.e];
        let s = o.pattern.replace(/\{n\}/g, n).replace(/\{cc\}/g, enc.turn_actions[0].nr1)
          .replace(/\{e\}/g, t.e + 1).replace(/\{p\}/g, t.p + 1);
        if (s.length > 4) { cut++; s = s.slice(0, 4); }
        if (o.target !== 'abbr') enc.name = s;
        if (o.target !== 'name') enc.abbr = s;
        n++;
      }
    });
    toast('Names assigned' + (cut ? ', ' + cut + ' truncated to 4 characters' : ''), cut > 0);
  }

  function bulkColor() {
    const o = bulkState.color;
    return el('fieldset', null, el('legend', null, 'Color'),
      row('Mode', selectEl({ 0: { label: 'Fixed', sure: true }, 1: { label: 'Gradient', sure: true } }, o.mode === 'fixed' ? 0 : 1,
        v => { o.mode = v ? 'grad' : 'fixed'; render(); })),
      row(o.mode === 'fixed' ? 'Color' : 'From', colorEl(o.a, v => { o.a = v; render(); })),
      o.mode === 'grad' ? row('To', colorEl(o.b, v => { o.b = v; render(); })) : null,
      el('span', { class: 'inl' },
        el('button', { class: 'btn primary', onclick: e => { e.preventDefault(); runColor(); } }, 'Apply color'),
        el('button', { class: 'btn', title: 'Set the encoders in scope to white (color ' + M.WHITE + ')', onclick: e => { e.preventDefault(); setWhite(targets()); } }, 'All white')));
  }
  function runColor() {
    const o = bulkState.color;
    const t = targets();
    commit(() => {
      t.forEach((x, k) => {
        const v = o.mode === 'fixed' || t.length < 2 ? o.a : Math.round(o.a + (o.b - o.a) * k / (t.length - 1));
        S.scene.pages[x.p].encoders[x.e].color = Math.max(0, Math.min(M.PALETTE.length - 1, v));
      });
    }, 'Colors set');
  }

  function bulkPage(pageNums) {
    const o = bulkState.page;
    return el('fieldset', null, el('legend', null, 'Copy / swap Page'),
      row('Target page', selectEl(pageNums, o.target, v => { o.target = v; })),
      row('Include name/channel/output', el('input', { type: 'checkbox', checked: o.withSettings, onchange: e => { o.withSettings = e.target.checked; render(); } })),
      row('Nav on swap', navModeEl(), NAV_MODE_HINT),
      el('div', { class: 'inl' },
        el('button', { class: 'btn', onclick: e => { e.preventDefault(); runPage(false); } }, 'Copy Page ' + (S.page + 1) + ' to target'),
        el('button', { class: 'btn', onclick: e => { e.preventDefault(); runPage(true); } }, 'Swap')));
  }
  function runPage(swap) {
    const o = bulkState.page;
    const ti = o.target - 1;
    if (ti === S.page) return toast('Target is the current Page', true);
    if (swap) swapPages(S.page, ti, o.withSettings);
    else copyPage(S.page, ti, o.withSettings);
  }

  /*
   * Swaps two pages, with settings as whole pages, otherwise only their encoders.
   * Page navigation pushes (type 6, nr2 = page index) depend on S.navMode:
   *   'follow': they move with their page; with settings, pushes leading to one of the two pages get its new number.
   *   'stay':   they are pinned to their page position. A push arriving at a pinned position is overwritten,
   *             a Nav push arriving at a free position is turned off.
   * The current page follows the moved page.
   */
  function swapPages(a, b, withSettings) {
    const isNav = x => !!x && x.type === 6;
    const pages0 = S.scene.pages;
    const pinned = { [a]: pages0[a].encoders.map(enc => isNav(enc.push_action) ? enc.push_action : null),
                     [b]: pages0[b].encoders.map(enc => isNav(enc.push_action) ? enc.push_action : null) };
    let kept = 0, overwritten = 0, cleared = 0, renumbered = 0;
    if (S.navMode !== 'stay' && withSettings) {
      pages0.forEach(p => p.encoders.forEach(enc => { if (isNav(enc.push_action) && [a, b].includes(enc.push_action.nr2)) renumbered++; }));
    }
    if (S.navMode === 'stay') {
      // Each page's pushes arrive at the other page's positions.
      [[a, b], [b, a]].forEach(([to, from]) => pages0[from].encoders.forEach((enc, e) => {
        const arriving = enc.push_action;
        if (pinned[to][e]) {
          kept++;
          if (arriving && arriving.type !== 0 && !isNav(arriving)) overwritten++;
        } else if (isNav(arriving)) cleared++;
      }));
    }
    commit(() => {
      const pages = S.scene.pages;
      if (withSettings) [pages[a], pages[b]] = [pages[b], pages[a]];
      else [pages[a].encoders, pages[b].encoders] = [pages[b].encoders, pages[a].encoders];
      if (S.navMode === 'stay') {
        [a, b].forEach(idx => pages[idx].encoders.forEach((enc, e) => {
          if (pinned[idx][e]) enc.push_action = pinned[idx][e];
          else if (isNav(enc.push_action)) enc.push_action = Object.assign({}, enc.push_action, { type: 0 });
        }));
      } else if (withSettings) {
        pages.forEach(p => p.encoders.forEach(enc => {
          const pa = enc.push_action;
          if (!isNav(pa)) return;
          if (pa.nr2 === a) pa.nr2 = b;
          else if (pa.nr2 === b) pa.nr2 = a;
        }));
      }
    }, 'Pages ' + (a + 1) + ' and ' + (b + 1) + ' swapped'
      + (kept ? ', ' + kept + ' Nav push(es) kept in place' : '')
      + (overwritten ? ', ' + overwritten + ' push(es) overwritten' : '')
      + (cleared ? ', ' + cleared + ' Nav push(es) turned off' : '')
      + (renumbered ? ', ' + renumbered + ' Nav target(s) renumbered' : ''));
    if (S.page === a) S.page = b;
    else if (S.page === b) S.page = a;
    S.sel = new Set(); S.anchor = null;
    render();
  }

  /* Copies page a onto page b (encoders, with settings also name, channel and output). */
  function copyPage(a, b, withSettings) {
    commit(() => {
      const src = S.scene.pages[a], dst = S.scene.pages[b];
      dst.encoders = M.deepClone(src.encoders);
      if (withSettings) Object.keys(src).forEach(k => { if (k !== 'encoders') dst[k] = M.deepClone(src[k]); });
    }, 'Page ' + (a + 1) + ' copied to Page ' + (b + 1));
  }

  // ---------- clipboard ----------
  const PASTE_PARTS = [['name', 'Name'], ['abbr', 'Abbr'], ['color', 'Color'], ['d1', 'Dest 1'], ['d2', 'Dest 2'], ['push', 'Push']];

  /* Applies the parts of src chosen in S.pasteParts to dst. With every part chosen, dst becomes a full copy of src. */
  function pasteInto(dst, src) {
    const pp = S.pasteParts;
    if (PASTE_PARTS.every(([k]) => pp[k])) return M.deepClone(src);
    const out = M.deepClone(dst);
    ['name', 'abbr', 'color'].forEach(k => { if (pp[k]) out[k] = src[k]; });
    if (pp.push) out.push_action = M.deepClone(src.push_action);
    if (pp.d1 || pp.d2) {
      out.turn_actions = (out.turn_actions || []).slice();
      if (pp.d1) out.turn_actions[0] = M.deepClone((src.turn_actions || [])[0]);
      if (pp.d2) out.turn_actions[1] = M.deepClone((src.turn_actions || [])[1]);
    }
    return out;
  }

  function copySel() {
    const sel = selected();
    if (!sel.length) return toast('Nothing selected', true);
    S.clip = sel.map(i => M.deepClone(curPage().encoders[i]));
    toast(S.clip.length + ' encoder(s) copied');
    renderGrid();
  }
  function pasteSel() {
    if (!S.clip) return toast('Clipboard is empty', true);
    const sel = selected();
    if (!sel.length) return toast('Select the encoder to paste into first', true);
    const parts = PASTE_PARTS.filter(([k]) => S.pasteParts[k]).map(([, label]) => label);
    if (!parts.length) return toast('Choose at least one part to paste', true);
    const partial = parts.length < PASTE_PARTS.length;
    const one = S.clip.length === 1;
    let dest;
    if (one || sel.length === S.clip.length) {
      // One copied encoder fills every selected encoder; same count pastes one to one.
      dest = sel;
    } else {
      // Otherwise paste consecutively, starting at the encoder clicked last.
      const start = S.anchor !== null && S.sel.has(S.anchor) ? S.anchor : sel[0];
      dest = S.clip.map((_, k) => start + k).filter(i => i < curPage().encoders.length);
    }
    const cut = one ? 0 : S.clip.length - dest.length;
    const encs = curPage().encoders;
    commit(() => { dest.forEach((d, k) => { encs[d] = pasteInto(encs[d], S.clip[one ? 0 : k]); }); },
      dest.length + ' encoder(s) pasted' + (partial ? ' (' + parts.join(', ') + ')' : '') + (cut ? ', ' + cut + ' did not fit on the page' : ''));
    S.sel = new Set(dest); render();
  }

  // ---------- overview ----------
  function renderOverview() {
    const pane = $('#tab-overview');
    const o = S.ovOpts;
    const uses = M.collectCCUses(S.scene, S.settings, o);
    const chk = (k, label) => el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: o[k], onchange: e => { o[k] = e.target.checked; render(); } }), label);
    const opts = el('div', { class: 'ovopts' }, chk('d1', 'Dest 1'), chk('d2', 'Dest 2'), chk('push', 'Push'), chk('lsb', 'Count CC14 LSB'),
      el('span', { class: 'muted' }, 'Covers CC types (CC Abs/Rel/CC14, Push CC) across all Pages, using the effective channel (Page resolved). Outputs are not distinguished.'));

    const head = el('tr', null, el('th', null, 'Channel'), el('th', null, 'used'), el('th', null, 'multi'),
      el('th', { class: 'mxhead' }, el('div', { class: 'mxscale' }, [0, 16, 32, 48, 64, 80, 96, 112].map(n => el('span', null, n)))));
    const rows = [];
    for (let ch = 1; ch <= 16; ch++) {
      let used = 0, multi = 0;
      const cells = [];
      for (let cc = 0; cc < 128; cc++) {
        const list = uses.get(ch + ':' + cc);
        const n = list ? M.distinctOwners(list) : 0;
        if (n) used++;
        if (n > 1) multi++;
        cells.push(el('span', { class: 'mx' + (n > 1 ? ' multi' : n ? ' used' : ''), title: 'Ch' + ch + ' CC ' + cc + (list ? '\n' + list.map(usageText).join('\n') : ' free') }));
      }
      rows.push(el('tr', { class: 'mxrow' + (S.ovChannel === ch ? ' active' : '') + (used ? '' : ' empty'), onclick: () => { S.ovChannel = ch; render(); } },
        el('td', null, ch), el('td', null, used || ''), el('td', { class: multi ? 'warn' : '' }, multi || ''), el('td', null, el('div', { class: 'mxcells' }, cells))));
    }
    const table = el('table', { class: 'matrix' }, el('thead', null, head), el('tbody', null, rows));

    if (S.ovChannel === null) {
      for (let ch = 1; ch <= 16; ch++) if ([...uses.keys()].some(k => k.startsWith(ch + ':'))) { S.ovChannel = ch; break; }
      if (S.ovChannel === null) S.ovChannel = 1;
    }
    pane.replaceChildren(el('h2', null, 'CC usage per channel'), opts, table, renderChannelDetail(S.ovChannel, uses));
  }

  function renderChannelDetail(ch, uses) {
    const free = [];
    const cells = [];
    for (let cc = 0; cc < 128; cc++) {
      const list = uses.get(ch + ':' + cc) || [];
      const n = M.distinctOwners(list);
      if (!n) free.push(cc);
      cells.push(el('div', { class: 'ccell' + (n > 1 ? ' multi' : n ? ' used' : ''), title: list.map(usageText).join('\n') || 'free' },
        el('div', { class: 'ccnum' }, cc),
        list.slice(0, 3).map(u => el('a', {
          class: 'ccuse', href: '#',
          onclick: e => { e.preventDefault(); S.tab = 'pages'; S.page = u.p; S.sel = new Set([u.e]); S.anchor = u.e; S.side = 'edit'; render(); },
        }, 'P' + (u.p + 1) + '.' + (u.e + 1) + ' ' + (S.scene.pages[u.p].encoders[u.e].abbr || '') + (u.role === 'push' ? ' P' : u.role === 'd2' ? ' D2' : '') + (u.part === 'LSB' ? ' L' : ''))),
        list.length > 3 ? el('div', { class: 'muted' }, '+' + (list.length - 3)) : null));
    }
    const freeTxt = M.rangesText(free);
    return el('div', { class: 'chdetail' },
      el('h3', null, 'Channel ' + ch),
      el('div', { class: 'cclegend' },
        el('span', null, el('code', null, 'P1.6 DELY P'), ' = Page 1, Encoder 6, abbr DELY, sent via …'),
        el('span', null, el('code', null, '(none)'), ' Turn'),
        el('span', null, el('code', null, 'P'), ' Push'),
        el('span', null, el('code', null, 'D2'), ' Destination 2'),
        el('span', null, el('code', null, 'L'), ' CC14 LSB'),
        el('span', null, el('i', { class: 'lg used' }), 'single'),
        el('span', null, el('i', { class: 'lg multi' }), 'multiple'),
        el('span', null, el('i', { class: 'lg' }), 'free')),
      el('div', { class: 'freebox' }, el('b', null, 'Free (' + free.length + '): '), el('span', { class: 'freelist' }, freeTxt || 'none'),
        el('button', { class: 'btn small', onclick: () => { navigator.clipboard && navigator.clipboard.writeText(freeTxt).then(() => toast('Copied')); } }, 'Copy')),
      el('div', { class: 'ccgrid' }, cells));
  }

  // ---------- scene tab ----------
  function renderScene() {
    const s = S.scene;
    const pane = $('#tab-scene');
    const known = ['title', 'icon', 'color', 'pages', 'code'];
    const general = el('fieldset', null, el('legend', null, 'Scene'),
      row('Name', textEl(s.title, v => commit(() => { s.title = v.slice(0, 7); }), { maxlength: 7, class: 'w-name' })),
      row('Color', colorEl(s.color, v => commit(() => { s.color = v; }))),
    );
    const raw = el('fieldset', null, el('legend', null, 'Other scene fields (raw values)'),
      el('p', { class: 'muted' }, 'Meaning inferred from field names. The value encoding is partly undocumented.'),
      extraKeys(s, known));

    const icon = el('fieldset', null, el('legend', null, 'Icon (16×16)'), iconEditor(s));
    const code = s.code ? el('fieldset', null, el('legend', null, 'Script'),
      row('scriptName', el('code', null, s.code.scriptName || '–')),
      row('code', el('span', null, (s.code.code || '').length + ' characters')),
      row('fullScript', el('span', null, (s.code.fullScript || '').length + ' characters')),
      el('p', { class: 'muted' }, 'Scripts are kept unchanged.')) : null;
    pane.replaceChildren(el('div', { class: 'scenecols' }, el('div', null, general, icon, code), el('div', null, raw)));
  }

  function iconEditor(s) {
    if (!Array.isArray(s.icon) || s.icon.length < 32) return el('p', { class: 'muted' }, 'No icon present.');
    let painting = null;
    const grid = el('div', { class: 'icongrid', onmouseleave: () => { if (painting !== null) { painting = null; finish(); } } });
    const work = s.icon.slice();
    function finish() { commit(() => { s.icon = work.slice(); }); }
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const px = el('span', { class: 'px' + (M.iconGet(work, x, y) ? ' on' : '') });
      px.addEventListener('mousedown', e => { e.preventDefault(); painting = !M.iconGet(work, x, y); M.iconSet(work, x, y, painting); px.classList.toggle('on', painting); });
      px.addEventListener('mouseenter', () => { if (painting === null) return; M.iconSet(work, x, y, painting); px.classList.toggle('on', painting); });
      px.addEventListener('mouseup', () => { if (painting !== null) { painting = null; finish(); } });
      grid.append(px);
    }
    return el('div', null, grid, el('div', { class: 'inl' },
      el('button', { class: 'btn small', onclick: e => { e.preventDefault(); commit(() => { s.icon = s.icon.map(() => 0); }); } }, 'Clear'),
      el('button', { class: 'btn small', onclick: e => { e.preventDefault(); commit(() => { s.icon = s.icon.map(b => (~b) & 255); }); } }, 'Invert')));
  }

  // ---------- dialogs ----------
  function showDialog(nodes, ownButtons) {
    $('#dlgBody').replaceChildren(...nodes);
    $('#dlg .dlgfoot').hidden = !!ownButtons; // dialogs with their own buttons hide "Close"
    $('#dlg').showModal();
  }
  function settingsDialog() {
    const s = S.settings;
    showDialog([
      el('h2', null, 'Settings'),
      el('p', { class: 'muted' }, 'The Page channel is stored directly as MIDI channel 1–16 (verified against the OXI App). Channels in destinations: 0 = Page, 1–16 = MIDI channel.'),
    ]);
  }
  function infoDialog() {
    const li = (t, d) => el('li', null, el('b', null, t + ': '), d);
    showDialog([
      el('h2', null, 'Format info'),
      el('p', null, 'The .oxie16 format is not officially documented. The mapping is based on comparison with the OXI App and the community project github.com/brentvatne/oxi-e16-config. Unknown fields and values are saved unchanged.'),
      el('ul', null,
        li('Structure', 'Scene → 12 Pages → 16 encoders → Dest 1, Dest 2 (turn_actions) and Push (push_action)'),
        li('Verified', 'Types, Output, channel (Page channel = MIDI channel 1–16, destination channel 0 = Page), Accel Mode, Display, color 0–99'),
        li('Unverified (?)', 'Push behavior 1 (Press + Release), Page navigation options lower/upper, instrument/parameter'),
        li('Color', 'Palette 0–99 from the app\'s color picker'),
      ),
      el('h3', null, 'Old version after an update?'),
      el('p', null, 'The browser caches the editor\'s files. knobOx checks for a newer version when it starts and offers a reload. '
        + 'If something still looks outdated, reload without cache: Ctrl+Shift+R (Mac: Cmd+Shift+R).'),
    ]);
  }

  // ---------- update check ----------
  /*
   * Browsers keep the app files in their HTTP cache (GitHub Pages: 10 minutes plus CDN; a plain local
   * server sends no cache headers, so the browser guesses and may keep old files much longer).
   * Compare the cached copy of every app file with the server's copy and offer a reload when they differ.
   * The revalidating request also refreshes the cache, so a normal reload then gets the new files.
   */
  const APP_FILES = ['src/app.js', 'src/model.js', 'src/sysex.js', 'src/library.js', 'src/style.css'];
  const UPDATE_RECHECK_MS = 5 * 60 * 1000;
  let lastUpdateCheck = 0;
  async function checkForUpdate() {
    if (!/^https?:$/.test(location.protocol) || $('#updateBar')) return;
    lastUpdateCheck = Date.now();
    const urls = [location.origin + location.pathname, ...APP_FILES.map(p => new URL(p, location.href).href)];
    try {
      const changed = await Promise.all(urls.map(async u => {
        const cached = await (await fetch(u, { cache: 'force-cache' })).text();
        const fresh = await (await fetch(u, { cache: 'no-cache' })).text();
        return cached !== fresh;
      }));
      if (changed.some(Boolean)) showUpdateBar();
    } catch (e) { /* offline: no check */ }
  }
  function showUpdateBar() {
    document.body.append(el('div', { id: 'updateBar', class: 'updatebar', role: 'status' },
      el('span', null, 'A newer version of knobOx is available.'),
      el('button', { class: 'btn primary small', onclick: () => location.reload() }, 'Reload'),
      el('button', { class: 'btn small', 'aria-label': 'Dismiss', onclick: e => e.target.closest('.updatebar').remove() }, '✕')));
  }

  // ---------- wiring ----------
  function wire() {
    $('#fileInput').addEventListener('change', e => { const f = e.target.files[0]; if (f && confirmDiscard()) openFile(f); e.target.value = ''; });
    $('#btnLibrary').addEventListener('click', () => showView(S.view === 'library' ? 'editor' : 'library'));
    $('#libPick').addEventListener('click', pickFolder);
    $('#libRefresh').addEventListener('click', refreshFolder);
    $('#libConnect').addEventListener('click', listSlots);
    $('#btnSaveLocal').addEventListener('click', saveLocal);
    if (!$('#btnSaveAs')) $('#btnSaveLocal').after(el('button', { class: 'btn', id: 'btnSaveAs', disabled: true }, 'Save as …'));
    $('#btnSaveAs').addEventListener('click', saveAs);
    $('#btnSaveDevice').addEventListener('click', saveDevice);
    $('#btnClose').addEventListener('click', closeScene);
    $('#btnUndo').addEventListener('click', undo);
    $('#btnRedo').addEventListener('click', redo);
    $('#btnSettings').addEventListener('click', settingsDialog);
    $('#btnInfo').addEventListener('click', infoDialog);
    $('#selAll').addEventListener('click', () => { S.sel = new Set([...Array(16).keys()]); render(); });
    $('#selNone').addEventListener('click', () => { S.sel = new Set(); render(); });
    $('#btnCopy').addEventListener('click', copySel);
    $('#btnPaste').addEventListener('click', pasteSel);
    document.querySelectorAll('#mainTabs button').forEach(b => b.addEventListener('click', () => { S.tab = b.dataset.tab; render(); }));
    document.querySelectorAll('#sideTabs button').forEach(b => b.addEventListener('click', () => { S.side = b.dataset.side; render(); }));

    const dz = document.body;
    dz.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); document.body.classList.add('filedrag'); } });
    dz.addEventListener('dragleave', e => { if (e.target === document.body || e.clientX === 0) document.body.classList.remove('filedrag'); });
    dz.addEventListener('drop', e => {
      document.body.classList.remove('filedrag');
      if (!e.dataTransfer.files.length) return;
      e.preventDefault();
      if (!confirmDiscard()) return;
      openFile(e.dataTransfer.files[0]);
    });

    document.addEventListener('keydown', e => {
      const inField = /INPUT|SELECT|TEXTAREA/.test(document.activeElement && document.activeElement.tagName);
      const mod = e.ctrlKey || e.metaKey;
      if (!S.scene || !mod) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !inField) { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if (k === 'y' && !inField) { e.preventDefault(); redo(); }
      else if (k === 's') { e.preventDefault(); e.shiftKey ? saveAs() : saveLocal(); }
      else if (S.tab === 'pages' && !inField) {
        if (k === 'c') { e.preventDefault(); copySel(); }
        else if (k === 'v') { e.preventDefault(); pasteSel(); }
        else if (k === 'a') { e.preventDefault(); S.sel = new Set([...Array(16).keys()]); render(); }
      }
    });
    window.addEventListener('beforeunload', e => { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });

    try {
      const sess = JSON.parse(localStorage.getItem(LS_SESSION) || 'null');
      if (sess && sess.json) {
        const btn = $('#btnRestore');
        btn.hidden = false;
        btn.textContent = 'Restore last session (' + sess.name + (sess.dirty ? ', unsaved' : '') + ')';
        btn.addEventListener('click', () => loadText(sess.json, sess.name, sess.original, sess.dirty, null, { kind: 'session' }));
      }
    } catch (e) { /* storage unavailable */ }
    render();
    initFolder();
    checkForUpdate();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - lastUpdateCheck > UPDATE_RECHECK_MS) checkForUpdate();
    });
  }

  wire();
})();
