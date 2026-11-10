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
    toast._t = setTimeout(() => { t.hidden = true; }, 3200);
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
  function loadText(text, name, original, dirty, handle) {
    let obj;
    try { obj = JSON.parse(text); } catch (e) { toast('Not a valid JSON file: ' + e.message, true); return false; }
    const err = M.validateScene(obj);
    if (err) { toast('Unknown format: ' + err, true); return false; }
    S.scene = obj;
    S.original = original ? JSON.parse(original) : M.deepClone(obj);
    S.fileName = name || 'scene.oxie16';
    S.fileHandle = handle || null;
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
    const slotSel = el('select', null, [...Array(16).keys()].map(i =>
      el('option', { value: i + 1, selected: i + 1 === (S.settings.lastSlot || 1) }, 'Slot ' + (i + 1))));
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
      status.textContent = best ? 'Connected to "' + best.name + '".' : 'No E16 found. Check USB and close the OXI App.';
    }
    btnConnect.addEventListener('click', async () => {
      try { await connectMidi(); } catch (e) { status.textContent = e.message; }
      if (S.midi) fillPorts();
    });
    if (S.midi) fillPorts();
    btnGo.addEventListener('click', async () => {
      if (S.lib.busy) { status.textContent = 'The E16 is busy, please wait.'; return; }
      const slot = Number(slotSel.value);
      S.settings.lastSlot = slot; saveSettings();
      const access = S.midi.access;
      const output = access.outputs.get(portSel.value);
      // Matching input: same name, or the E16 input found automatically.
      const input = [...access.inputs.values()].find(i => i.name === output.name) || X.findPorts(access).input;
      const msgs = X.encodeScene(S.scene, slot);
      bar.max = msgs.length; bar.value = 0;
      btnGo.disabled = btnConnect.disabled = true;
      status.textContent = 'Sending …';
      try {
        await X.sendScene(msgs, { input, output }, (n, total) => { bar.value = n; status.textContent = 'Sending … ' + n + '/' + total; });
        status.textContent = 'Done: "' + S.scene.title + '" is now in slot ' + slot + '.';
        toast('Sent to E16 (slot ' + slot + ')');
      } catch (e) {
        status.textContent = 'Error: ' + e.message;
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
      row('MIDI port', portSel),
      el('div', { class: 'inl' }, btnConnect, btnGo, btnSyx),
      bar, status,
      el('p', { class: 'muted' }, 'Linux without a browser: save as .syx and send it e.g. with amidi -p hw:X -s file.syx -i 100.'),
    ]);
  }

  /* Save: write back to the scene folder file when there is one, otherwise download. */
  async function download() {
    const text = JSON.stringify(S.scene);
    if (S.fileHandle) {
      try {
        await window.E16Library.write(S.fileHandle, text);
        S.dirty = false; S.original = M.deepClone(S.scene); saveSession(); render();
        toast('Saved ' + S.fileName);
        refreshFolder();
        return;
      } catch (e) { toast('Could not write ' + S.fileName + ': ' + e.message + ' – downloading instead.', true); }
    }
    const blob = new Blob([text], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: S.fileName });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    S.dirty = false; saveSession(); renderTop();
  }

  // ---------- MIDI connection (shared by library and send dialog) ----------
  async function connectMidi() {
    const X = window.E16Sysex;
    if (!S.midi) {
      const access = await X.midiAccess();
      S.midi = { access };
      access.onstatechange = () => { updatePorts(); renderLibrary(); };
    }
    updatePorts();
    if (!S.midi.output) throw new Error('No E16 found. Check USB and close the OXI App.');
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
      toast(e.message, true);
    } finally {
      S.lib.busy = false; S.lib.status = ''; renderLibrary();
    }
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
    catch (e) { S.lib.files = []; toast('Could not read the folder: ' + e.message, true); }
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
    } catch (e) { if (e.name !== 'AbortError') toast(e.message, true); }
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
      loadText(JSON.stringify(scene), L().fileNameFor(scene.title), null, false, null);
      toast('Loaded "' + scene.title + '" from slot ' + slot + ' (not saved yet)');
    });
  }
  /* Save a slot into the scene folder, or as a browser download when no folder is available. */
  function saveSlotToFolder(slot) {
    return deviceOp('Downloading slot ' + slot, async (midi, report) => {
      const scene = await readSlot(slot, report);
      const name = L().fileNameFor(scene.title);
      if (!S.lib.dir) {
        downloadText(name, JSON.stringify(scene));
        toast('Downloaded slot ' + slot + ' as ' + name);
        return;
      }
      if (await L().exists(S.lib.dir, name) && !confirm(name + ' already exists. Overwrite?')) return;
      await L().save(S.lib.dir, name, JSON.stringify(scene));
      toast('Saved slot ' + slot + ' as ' + name);
      await refreshFolder();
    });
  }
  function sendToSlot(scene, slot, label) {
    const problems = X().checkScene(scene);
    if (problems.length) { toast(problems.join(' '), true); return; }
    const cur = S.lib.slots && S.lib.slots[slot - 1];
    if (!confirm('Send "' + label + '" to slot ' + slot + (cur ? ' (replaces "' + cur.title + '")' : '') + '?')) return;
    return deviceOp('Sending to slot ' + slot, async (midi, report) => {
      await X().sendScene(X().encodeScene(scene, slot), midi, report);
      if (S.lib.slots) S.lib.slots[slot - 1] = { slot, title: scene.title, color: scene.color, scriptName: (scene.code || {}).scriptName || '' };
      toast('Sent "' + scene.title + '" to slot ' + slot);
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
    else if (!S.lib.dir) files.replaceChildren(el('p', { class: 'muted pad' }, 'Choose the folder that holds your .oxie16 files, e.g. the OXI App storage folder. A "Scenes" subfolder is used automatically.'));
    else if (!S.lib.files.length) files.replaceChildren(el('p', { class: 'muted pad' }, 'No .oxie16 files in this folder.'));
    else {
      files.replaceChildren(...S.lib.files.map(f => el('div', {
        class: 'librow' + (S.fileHandle && S.fileName === f.name ? ' current' : ''), draggable: 'true',
        ondragstart: e => { e.dataTransfer.setData('text/x-e16-file', f.name); e.dataTransfer.effectAllowed = 'copy'; },
        ondblclick: () => openFromFolder(f),
      },
      el('i', { class: 'libcolor', style: { background: M.colorCss(f.color) } }),
      el('span', { class: 'libname' }, f.name.replace(/\.oxie16$/i, '')),
      el('button', { class: 'btn small', onclick: () => openFromFolder(f) }, 'Edit'))));
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
      S.scene ? el('button', { class: 'btn small', disabled: S.lib.busy, title: 'Send the scene open in the editor to this slot', onclick: () => sendToSlot(S.scene, s.slot, S.scene.title) }, 'Send current') : null);
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
    if (S.tab === 'pages') { renderPageBar(); renderPageSettings(); renderGrid(); renderSide(); }
    if (S.tab === 'overview') renderOverview();
    if (S.tab === 'scene') renderScene();
  }

  function renderTop() {
    $('#btnDownload').disabled = !S.scene;
    $('#btnDownload').textContent = S.fileHandle ? 'Save' : 'Download';
    $('#btnDownload').title = S.fileHandle ? 'Save to ' + S.fileName + ' in the scene folder (Ctrl+S)' : 'Download as .oxie16 (Ctrl+S)';
    $('#btnSend').disabled = !S.scene;
    $('#btnLibrary').textContent = S.view === 'library' && S.scene ? 'Back to editor' : 'Library';
    $('#btnUndo').disabled = !S.undo.length;
    $('#btnRedo').disabled = !S.redo.length;
    $('#fileInfo').textContent = S.scene ? S.fileName + (S.dirty ? ' (modified)' : '') : '';
  }

  function renderPageBar() {
    const bar = $('#pageBar');
    bar.replaceChildren(...S.scene.pages.map((p, i) =>
      el('button', {
        class: 'pagebtn' + (i === S.page ? ' active' : ''),
        onclick: () => { S.page = i; S.sel = new Set(); S.anchor = null; render(); },
        title: 'Channel ' + M.pageChannel(p, S.settings),
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
    );
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
      row('Color', el('span', { class: 'colorpick' },
        el('input', { type: 'range', min: 0, max: 100, value: enc.color, onchange: e => commit(() => { enc.color = Number(e.target.value); }),
          oninput: e => { e.target.nextSibling.style.background = M.colorCss(Number(e.target.value)); e.target.nextSibling.nextSibling.textContent = e.target.value; } }),
        el('span', { class: 'swatch', style: { background: M.colorCss(enc.color) } }),
        el('span', { class: 'cval' }, enc.color))),
      row('color2', numEl(enc.color2, v => commit(() => { enc.color2 = v; }), { min: 0, max: 100, class: 'w-num' }), 'Second color (swap), raw value'),
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
    cc: { role: 'd1', start: 1, step: 1, skipUsed: false, setTypeIfOff: true, channel: 'keep' },
    push: { source: 'offset', offset: 16, start: 1, mode: 0, pval: 127, rval: 0, copyChannel: true },
    field: { role: 'd1', key: 'type', value: 3 },
    name: { pattern: 'CC{cc}', start: 1, target: 'both' },
    color: { mode: 'fixed', a: 0, b: 90 },
    page: { target: 1, withSettings: true },
  };

  const FIELD_KEYS = {
    enc: ['color', 'color2'],
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
      el('button', { class: 'btn primary', onclick: e => { e.preventDefault(); runCC(); } }, 'Distribute'));
  }
  function runCC() {
    const o = bulkState.cc;
    const t = targets();
    const res = commit(() => M.distributeCC(S.scene, S.settings, t, o));
    if (!res) return;
    toast(res.assigned + ' CCs assigned' + (res.last !== null ? ' (up to CC ' + res.last + ')' : '') +
      (res.overflow ? ', ' + res.overflow + ' without a free CC (> 127)' : ''), res.overflow > 0);
  }

  function bulkPush() {
    const o = bulkState.push;
    return el('fieldset', null, el('legend', null, 'Set up Push as CC'),
      row('CC number', selectEl({ 0: { label: 'Dest 1 CC + offset', sure: true }, 1: { label: 'Sequential from', sure: true } },
        o.source === 'offset' ? 0 : 1, v => { o.source = v ? 'seq' : 'offset'; render(); })),
      o.source === 'offset'
        ? row('Offset', numEl(o.offset, v => { o.offset = v; }, { min: -127, max: 127, class: 'w-num' }))
        : row('Start CC', numEl(o.start, v => { o.start = v; }, { min: 0, max: 127, class: 'w-num' })),
      row('Behavior', selectEl(M.PUSH_MODES, o.mode, v => { o.mode = v; })),
      row('P.Val', numEl(o.pval, v => { o.pval = v; }, { min: 0, max: 127, class: 'w-num' })),
      row('R.Val', numEl(o.rval, v => { o.rval = v; }, { min: 0, max: 127, class: 'w-num' })),
      row('Channel from Dest 1', el('input', { type: 'checkbox', checked: o.copyChannel, onchange: e => { o.copyChannel = e.target.checked; } })),
      el('button', { class: 'btn primary', onclick: e => { e.preventDefault(); runPush(); } }, 'Apply'));
  }
  function runPush() {
    const o = bulkState.push;
    let n = 0, skipped = 0, cc = o.start;
    commit(() => {
      for (const t of targets()) {
        const enc = S.scene.pages[t.p].encoders[t.e];
        const d1 = M.getAction(enc, 'd1');
        const pa = enc.push_action;
        let num;
        if (o.source === 'offset') {
          if (!M.isCC('d1', d1)) { skipped++; continue; }
          num = d1.nr1 + o.offset;
        } else num = cc++;
        if (num < 0 || num > 127) { skipped++; continue; }
        pa.type = 2; pa.nr1 = num; pa.mode = o.mode; pa.lower = o.pval; pa.upper = o.rval;
        if (o.copyChannel) pa.channel = d1.channel;
        n++;
      }
    });
    toast(n + ' Push actions set' + (skipped ? ', ' + skipped + ' skipped' : ''), skipped > 0);
  }

  function bulkField() {
    const o = bulkState.field;
    const rOpts = { 0: { label: 'Encoder', sure: true }, 1: { label: 'Dest 1', sure: true }, 2: { label: 'Dest 2', sure: true }, 3: { label: 'Push', sure: true } };
    const rKeys = ['enc', 'd1', 'd2', 'push'];
    const keys = FIELD_KEYS[o.role];
    if (!keys.includes(o.key)) o.key = keys[0];
    const kOpts = {};
    keys.forEach((k, i) => { kOpts[i] = { label: k, sure: true }; });
    let valCtl;
    if (o.key === 'type' && o.role !== 'enc') {
      const tbl = M.typeTable(o.role);
      if (!(o.value in tbl)) o.value = 0;
      valCtl = selectEl(tbl, o.value, v => { o.value = v; });
    } else if (o.key === 'mode' && o.role === 'push') {
      if (!(o.value in M.PUSH_MODES)) o.value = 0;
      valCtl = selectEl(M.PUSH_MODES, o.value, v => { o.value = v; });
    } else if (o.key === 'channel') {
      const t = { 0: { label: 'Page', sure: true } };
      for (let i = 1; i <= 16; i++) t[i] = { label: String(i), sure: true };
      if (!(o.value in t)) o.value = 0;
      valCtl = selectEl(t, o.value, v => { o.value = v; });
    } else valCtl = numEl(o.value, v => { o.value = v; }, { class: 'w-num' });
    return el('fieldset', null, el('legend', null, 'Set field'),
      row('Section', selectEl(rOpts, rKeys.indexOf(o.role), v => { o.role = rKeys[v]; render(); })),
      row('Field', selectEl(kOpts, keys.indexOf(o.key), v => { o.key = keys[v]; render(); })),
      row('Value', valCtl),
      el('button', { class: 'btn primary', onclick: e => { e.preventDefault(); runField(); } }, 'Set'));
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
    toast(o.key + ' = ' + o.value + ' on ' + n + ' encoders');
  }

  function bulkName() {
    const o = bulkState.name;
    return el('fieldset', null, el('legend', null, 'Assign names'),
      row('Pattern', textEl(o.pattern, v => { o.pattern = v; }), 'Placeholders: {n} running number, {cc} CC of Dest 1, {e} encoder number, {p} page number. Max. 4 characters.'),
      row('Start {n}', numEl(o.start, v => { o.start = v; }, { class: 'w-num' })),
      row('Target', selectEl({ 0: { label: 'Name + Abbr', sure: true }, 1: { label: 'Name only', sure: true }, 2: { label: 'Abbr only', sure: true } },
        ['both', 'name', 'abbr'].indexOf(o.target), v => { o.target = ['both', 'name', 'abbr'][v]; })),
      el('p', { class: 'muted' }, 'Placeholders: {n} {cc} {e} {p}'),
      el('button', { class: 'btn primary', onclick: e => { e.preventDefault(); runName(); } }, 'Rename'));
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
    const sw = v => el('span', { class: 'swatch', style: { background: M.colorCss(v) } });
    return el('fieldset', null, el('legend', null, 'Color'),
      row('Mode', selectEl({ 0: { label: 'Fixed', sure: true }, 1: { label: 'Gradient', sure: true } }, o.mode === 'fixed' ? 0 : 1,
        v => { o.mode = v ? 'grad' : 'fixed'; render(); })),
      row(o.mode === 'fixed' ? 'Color' : 'From', el('span', { class: 'inl' }, numEl(o.a, v => { o.a = v; render(); }, { min: 0, max: 100, class: 'w-num' }), sw(o.a))),
      o.mode === 'grad' ? row('To', el('span', { class: 'inl' }, numEl(o.b, v => { o.b = v; render(); }, { min: 0, max: 100, class: 'w-num' }), sw(o.b))) : null,
      el('button', { class: 'btn primary', onclick: e => { e.preventDefault(); runColor(); } }, 'Apply color'));
  }
  function runColor() {
    const o = bulkState.color;
    const t = targets();
    commit(() => {
      t.forEach((x, k) => {
        const v = o.mode === 'fixed' || t.length < 2 ? o.a : Math.round(o.a + (o.b - o.a) * k / (t.length - 1));
        S.scene.pages[x.p].encoders[x.e].color = Math.max(0, Math.min(100, v));
      });
    }, 'Colors set');
  }

  function bulkPage(pageNums) {
    const o = bulkState.page;
    return el('fieldset', null, el('legend', null, 'Copy / swap Page'),
      row('Target page', selectEl(pageNums, o.target, v => { o.target = v; })),
      row('Include name/channel/output', el('input', { type: 'checkbox', checked: o.withSettings, onchange: e => { o.withSettings = e.target.checked; } })),
      el('div', { class: 'inl' },
        el('button', { class: 'btn', onclick: e => { e.preventDefault(); runPage(false); } }, 'Copy Page ' + (S.page + 1) + ' to target'),
        el('button', { class: 'btn', onclick: e => { e.preventDefault(); runPage(true); } }, 'Swap')));
  }
  function runPage(swap) {
    const o = bulkState.page;
    const ti = o.target - 1;
    if (ti === S.page) return toast('Target is the current Page', true);
    commit(() => {
      const pages = S.scene.pages;
      const src = pages[S.page], dst = pages[ti];
      if (swap) {
        if (o.withSettings) [pages[S.page], pages[ti]] = [dst, src];
        else [src.encoders, dst.encoders] = [dst.encoders, src.encoders];
      } else {
        dst.encoders = M.deepClone(src.encoders);
        if (o.withSettings) Object.keys(src).forEach(k => { if (k !== 'encoders') dst[k] = M.deepClone(src[k]); });
      }
    }, swap ? 'Pages swapped' : 'Page copied');
  }

  // ---------- clipboard ----------
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
    const start = sel.length ? sel[0] : 0;
    // Paste into selection if sizes match, else sequentially from first selected.
    const dest = sel.length === S.clip.length ? sel : S.clip.map((_, k) => start + k).filter(i => i < 16);
    commit(() => { dest.forEach((d, k) => { curPage().encoders[d] = M.deepClone(S.clip[k]); }); }, dest.length + ' encoder(s) pasted');
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
      row('Color', el('span', { class: 'inl' }, numEl(s.color, v => commit(() => { s.color = v; }), { min: 0, max: 100, class: 'w-num' }),
        el('span', { class: 'swatch', style: { background: M.colorCss(s.color) } }))),
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
  function showDialog(nodes) {
    $('#dlgBody').replaceChildren(...nodes);
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
        li('Unverified (?)', 'Dest type 11 and Push type 12 (Script, found in community scenes), Push behavior 1, Navigate options lower/upper, instrument/parameter'),
        li('Color', 'Palette 0–99 from the app\'s color picker'),
      ),
    ]);
  }

  // ---------- wiring ----------
  function wire() {
    $('#fileInput').addEventListener('change', e => { const f = e.target.files[0]; if (f && confirmDiscard()) openFile(f); e.target.value = ''; });
    $('#btnLibrary').addEventListener('click', () => showView(S.view === 'library' ? 'editor' : 'library'));
    $('#libPick').addEventListener('click', pickFolder);
    $('#libRefresh').addEventListener('click', refreshFolder);
    $('#libConnect').addEventListener('click', listSlots);
    $('#btnDownload').addEventListener('click', download);
    $('#btnSend').addEventListener('click', sendDialog);
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
      else if (k === 's') { e.preventDefault(); download(); }
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
        btn.addEventListener('click', () => loadText(sess.json, sess.name, sess.original, sess.dirty));
      }
    } catch (e) { /* storage unavailable */ }
    render();
    initFolder();
  }

  wire();
})();
