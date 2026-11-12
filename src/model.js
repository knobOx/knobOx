/*
 * E16 scene model: enums, field descriptors and pure editing operations.
 * Works in the browser (window.E16) and in Node (module.exports) for tests.
 */
(function (root) {
  'use strict';

  // Enum tables. "sure" = verified in the OXI App or documented by the community project
  // github.com/brentvatne/oxi-e16-config. Values without "sure" occur in real scenes but are undocumented.
  const TURN_TYPES = {
    0: { label: 'Off', sure: true },
    1: { label: 'CC Rel1', sure: true },
    2: { label: 'CC Rel2', sure: true },
    3: { label: 'CC Abs', sure: true },
    4: { label: 'CC14', sure: true },
    5: { label: 'PC', sure: true },
    6: { label: 'PB', sure: true },
    7: { label: 'AT', sure: true },
    8: { label: 'Note', sure: true },
    9: { label: 'NRPN', sure: true },
    10: { label: 'Snapshot', sure: true },
    11: { label: 'Script', sure: true },  // used with scriptId in scenes that carry a Lua script
  };

  const PUSH_TYPES = {
    0: { label: 'Off', sure: true },
    1: { label: 'Note', sure: true },
    2: { label: 'CC', sure: true },
    3: { label: 'PC', sure: true },
    4: { label: 'Set to Default', sure: true },
    5: { label: 'AT', sure: true },
    6: { label: 'Navigation', sure: true },
    7: { label: 'Record', sure: true },
    8: { label: 'Play/Pause Rec', sure: true },
    12: { label: 'Script', sure: true },
  };

  // 1 is not documented anywhere; kept so existing files stay editable.
  const PUSH_MODES = {
    0: { label: 'Press only', sure: true },
    1: { label: 'Press + Release' },
    2: { label: 'Toggle', sure: true },
  };

  // Action output (port). 0-6, 12, 15 verified in the app, 13/14 from the community docs.
  // 7 and 8 are rejected by the app ("ControlMidiOutput: Invalid value").
  const ACTION_OUTPUTS = {
    0: { label: 'ALL', sure: true },
    1: { label: 'TRS1', sure: true }, 2: { label: 'TRS2', sure: true },
    3: { label: 'USB1', sure: true }, 4: { label: 'USB2', sure: true }, 5: { label: 'USB3', sure: true },
    6: { label: 'BLE', sure: true },
    12: { label: 'Page', sure: true },
    13: { label: 'ALL -BLE', sure: true }, 14: { label: 'ALL -USB', sure: true },
    15: { label: 'Page (15)', sure: true },
  };
  // Page output uses the same port list (verified in the app).
  const PAGE_OUTPUTS = {
    0: { label: 'ALL', sure: true },
    1: { label: 'TRS1', sure: true }, 2: { label: 'TRS2', sure: true }, 3: { label: 'USB1', sure: true },
    4: { label: 'USB2', sure: true }, 5: { label: 'USB3', sure: true }, 6: { label: 'BLE', sure: true },
    13: { label: 'ALL -BLE', sure: true }, 14: { label: 'ALL -USB', sure: true },
  };
  // Turn "mode" is the app's "Accel Mode" (14 = Scene verified in the app).
  const ACCEL_MODES = {
    0: { label: 'Div8', sure: true }, 1: { label: 'Div4', sure: true }, 2: { label: 'Div2', sure: true },
    3: { label: 'Acc0', sure: true }, 4: { label: 'Acc1', sure: true }, 5: { label: 'Acc2', sure: true },
    6: { label: 'Acc3', sure: true }, 7: { label: 'Acc4', sure: true },
    8: { label: 'LSp2', sure: true }, 9: { label: 'LSp4', sure: true }, 10: { label: 'LSp6', sure: true },
    14: { label: 'Scene', sure: true },
  };
  // Turn display (verified on the device). "pos" is the position in the device menu.
  const DISPLAYS = {
    0: { label: 'Off', sure: true, pos: 0 }, 10: { label: 'Standard', sure: true, pos: 1 },
    1: { label: '127', sure: true, pos: 2 }, 2: { label: '100', sure: true, pos: 3 },
    3: { label: '1000', sure: true, pos: 4 }, 4: { label: 'Bipolar', sure: true, pos: 5 },
    8: { label: '9999', sure: true, pos: 6 }, 11: { label: 'High Res', sure: true, pos: 7 },
    12: { label: 'Always On', sure: true, pos: 8 },
  };

  // E16 color palette 0..99, sampled from the app's color picker (10x10 grid, row-major).
  const PALETTE = [
    '#954aff', '#864aff', '#804aff', '#744aff', '#6b4aff', '#5f4aff', '#5242ff', '#4538ff', '#3730ff', '#3c36ff',
    '#3e3bff', '#4340ff', '#4242ff', '#4747ff', '#4d4fff', '#5254ff', '#5c6cff', '#6682ff', '#6e94ff', '#78a7ff',
    '#80a8ff', '#8aabff', '#91adff', '#99afff', '#9ea9ff', '#a6a7ff', '#b3abff', '#c0b0ff', '#cdb8ff', '#d7bdff',
    '#ceadff', '#c39cff', '#d7bdff', '#ebdeff', '#ffffff', '#ffe8f8', '#ffd9cf', '#f5ffb8', '#e8ffb2', '#d6ffab',
    '#ddff99', '#ebff87', '#f3ff85', '#f9ff85', '#fffd82', '#f5ffd9', '#b5faff', '#ffebff', '#ffc2ff', '#ffb0f7',
    '#ff9eed', '#ff8ce0', '#ff7ace', '#ff80bd', '#ff85ad', '#ff69aa', '#ff4da9', '#ff1c1c', '#ff1c1c', '#ff1c1c',
    '#ff1c1c', '#ff1c1c', '#ff1c1c', '#ff1c1c', '#ff42b4', '#ff42b4', '#ff42b4', '#ff40d2', '#ff3def', '#ff3dff',
    '#f23dff', '#e354ff', '#d969ff', '#d280ff', '#b175ff', '#8b6bff', '#8ca3ff', '#4f8aff', '#1281ff', '#128cff',
    '#1298ff', '#12a8ff', '#12b4ff', '#0dc6ff', '#05deff', '#00f2ff', '#00ffea', '#00ebbc', '#00d68f', '#00e08e',
    '#00e887', '#00eb8d', '#00f098', '#00f59f', '#00f7a5', '#00faaf', '#00ffb7', '#00f0b4', '#00e0ac', '#00d4a9',
  ];

  const WHITE = PALETTE.indexOf('#ffffff');

  const TURN_CC_TYPES = [1, 2, 3, 4];
  const PUSH_CC_TYPES = [2];

  const ROLES = ['d1', 'd2', 'push'];
  const ROLE_LABEL = { d1: 'Dest 1', d2: 'Dest 2', push: 'Push' };

  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  function noteName(n) {
    if (!Number.isInteger(n) || n < 0 || n > 127) return '';
    return NOTE_NAMES[n % 12] + (Math.floor(n / 12) - 2);
  }

  function getAction(enc, role) {
    if (role === 'push') return enc.push_action;
    return enc.turn_actions ? enc.turn_actions[role === 'd1' ? 0 : 1] : undefined;
  }

  function typeTable(role) {
    return role === 'push' ? PUSH_TYPES : TURN_TYPES;
  }

  function typeLabel(role, type) {
    const t = typeTable(role)[type];
    return t ? t.label : 'Type ' + type;
  }

  function isCC(role, a) {
    if (!a) return false;
    return role === 'push' ? PUSH_CC_TYPES.includes(a.type) : TURN_CC_TYPES.includes(a.type);
  }

  /*
   * Channel handling.
   * page.channel is stored as the MIDI channel 1..16 (verified: file 1 = app "1", file 12 = app "12").
   * action.channel: 0 = "Page" (verified), 1..16 = explicit MIDI channel.
   * All functions return the MIDI channel as 1..16.
   */
  function pageChannel(page) {
    return page.channel;
  }
  function setPageChannel(page, ch) {
    page.channel = ch;
  }
  function effectiveChannel(page, a, settings) {
    return a.channel > 0 ? a.channel : pageChannel(page, settings);
  }

  /* Field descriptors for the action editor, depending on role and type. */
  // Types whose nr2 has no meaning: turn Off, CC Rel1/2, CC Abs, PC, PB, AT; push Off, CC, PC, Set to Default, AT.
  const TURN_NR2_UNUSED = [0, 1, 2, 3, 5, 6, 7];
  const PUSH_NR2_UNUSED = [0, 2, 3, 4, 5];

  function actionFields(role, a, pages) {
    const f = [];
    const t = a.type;
    // Keys left out on purpose (unused for this type); their values are kept in the file as they are.
    const hidden = new Set();
    const chOpts = { 0: { label: 'Page', sure: true } };
    for (let i = 1; i <= 16; i++) chOpts[i] = { label: String(i), sure: true };

    f.push({ key: 'type', label: 'Type', kind: 'select', options: typeTable(role) });
    f.push({ key: 'channel', label: 'Channel', kind: 'select', options: chOpts });
    f.push({ key: 'output', label: 'Output', kind: 'select', options: ACTION_OUTPUTS,
      hint: '12 and 15 both show "Page"; the app rejects 7 and 8' });

    if (role !== 'push') {
      let n1 = 'nr1', n2 = 'nr2', range = [0, 127];
      if ([1, 2, 3].includes(t)) n1 = 'CC #';
      if (t === 4) { n1 = 'MSB (CC)'; n2 = 'LSB (CC)'; }
      if (t === 9) { n1 = 'LSB'; n2 = 'MSB'; range = [0, 16383]; }
      if (t === 6) range = [-8192, 8191];
      f.push({ key: 'nr1', label: n1, kind: 'num', min: 0, max: 127 });
      // nr2 is unused for Off, CC Rel/Abs, PC, PB and AT (the OXI App leaves stale values there).
      if (TURN_NR2_UNUSED.includes(t)) hidden.add('nr2');
      else f.push({ key: 'nr2', label: n2, kind: 'num', min: 0, max: 127, raw: ![4, 9].includes(t) });
      f.push({ key: 'lower', label: t === 8 ? 'Min Note' : 'Min', kind: 'num', min: range[0], max: range[1], note: t === 8 });
      f.push({ key: 'upper', label: t === 8 ? 'Max Note' : 'Max', kind: 'num', min: range[0], max: range[1], note: t === 8 });
      f.push({ key: 'defaultValue', label: 'Default', kind: 'num', min: range[0], max: range[1] });
      f.push({ key: 'mode', label: 'Accel Mode', kind: 'select', options: ACCEL_MODES });
      f.push({ key: 'display', label: 'Display', kind: 'select', options: DISPLAYS });
    } else {
      let n1 = 'nr1', n2 = 'nr2';
      if (t === 2) n1 = 'CC #';
      if (t === 1) n1 = 'Note';
      if (t === 3) n1 = 'PC #';
      f.push({ key: 'nr1', label: n1, kind: 'num', min: 0, max: 127, note: t === 1 });
      if (t === 6) {
        const opts = {};
        // nr2 = target page, 0-based (verified on the device).
        (pages || []).forEach((p, i) => { opts[i] = { label: 'P' + (i + 1) + ' ' + p.title, sure: true }; });
        f.push({ key: 'nr2', label: 'Target page', kind: 'select', options: opts });
      } else if (PUSH_NR2_UNUSED.includes(t)) {
        hidden.add('nr2');
      } else {
        f.push({ key: 'nr2', label: n2, kind: 'num', min: 0, max: 127, raw: true });
      }
      f.push({ key: 'mode', label: 'Behavior', kind: 'select', options: PUSH_MODES });
      if (t === 6) {
        f.push({ key: 'lower', label: 'lower', kind: 'num', min: 0, max: 65535, raw: true, hint: 'Navigation options, raw value' });
        f.push({ key: 'upper', label: 'upper', kind: 'num', min: 0, max: 65535, raw: true, hint: 'Navigation options, raw value' });
      } else {
        f.push({ key: 'lower', label: 'P.Val', kind: 'num', min: 0, max: 16383 });
        f.push({ key: 'upper', label: 'R.Val', kind: 'num', min: 0, max: 16383 });
      }
    }
    f.push({ key: 'instrument', label: 'Instrument', kind: 'num', min: 0, max: 255, raw: true, hint: '127 = none' });
    f.push({ key: 'parameter', label: 'Parameter', kind: 'num', min: 0, max: 255, raw: true });
    f.push({ key: 'scriptId', label: 'Script-ID', kind: 'num', min: 0, max: 255 });

    // Unknown keys from newer firmware stay editable as raw values.
    const known = new Set([...f.map(x => x.key), ...hidden]);
    Object.keys(a).forEach(k => {
      if (!known.has(k)) f.push({ key: k, label: k, kind: typeof a[k] === 'number' ? 'num' : 'text', raw: true });
    });
    return f;
  }

  /* Short text for a grid cell line. */
  function actionSummary(role, a, page, settings) {
    if (!a) return '';
    if (a.type === 0) return '';
    const lbl = typeLabel(role, a.type);
    const ch = a.channel > 0 ? ' Ch' + a.channel : '';
    if (role === 'push') {
      if (a.type === 6) return 'Nav → P' + (a.nr2 + 1);
      if (a.type === 2) return 'CC ' + a.nr1 + ch + (a.mode === 2 ? ' T' : '');
      if (a.type === 1) return noteName(a.nr1) + ch;
      if (a.type === 3) return 'PC ' + a.nr1 + ch;
      return lbl + ch;
    }
    if ([1, 2, 3].includes(a.type)) return (a.type === 3 ? 'CC ' : lbl + ' ') + a.nr1 + ch;
    if (a.type === 4) return 'CC14 ' + a.nr1 + '/' + a.nr2 + ch;
    if (a.type === 9) return 'NRPN ' + a.nr2 + '/' + a.nr1 + ch;
    return lbl + ch;
  }

  /*
   * Collect CC usage over the whole scene.
   * Returns Map "ch:cc" -> [{ p, e, role, part }].
   */
  function collectCCUses(scene, settings, opts) {
    opts = Object.assign({ d1: true, d2: true, push: true, lsb: true }, opts || {});
    const uses = new Map();
    const add = (ch, cc, u) => {
      if (!Number.isInteger(cc) || cc < 0 || cc > 127) return;
      const k = ch + ':' + cc;
      if (!uses.has(k)) uses.set(k, []);
      uses.get(k).push(u);
    };
    scene.pages.forEach((page, p) => {
      page.encoders.forEach((enc, e) => {
        ROLES.forEach(role => {
          if (!opts[role]) return;
          const a = getAction(enc, role);
          if (!isCC(role, a)) return;
          const ch = effectiveChannel(page, a, settings);
          add(ch, a.nr1, { p, e, role, part: role !== 'push' && a.type === 4 ? 'MSB' : '' });
          if (role !== 'push' && a.type === 4 && opts.lsb) add(ch, a.nr2, { p, e, role, part: 'LSB' });
        });
      });
    });
    return uses;
  }

  /* Distinct encoders using one ch:cc (same encoder on d1 and push counts once). */
  function distinctOwners(list) {
    return new Set(list.map(u => u.p + '/' + u.e + '/' + u.role)).size;
  }

  function rangesText(nums) {
    const out = [];
    let i = 0;
    while (i < nums.length) {
      let j = i;
      while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
      out.push(i === j ? String(nums[i]) : nums[i] + '–' + nums[j]);
      i = j + 1;
    }
    return out.join(', ');
  }

  /* Order a list of encoder indices row-wise or column-wise on the 4x4 grid. */
  function orderIndices(indices, order) {
    const arr = indices.slice().sort((a, b) => a - b);
    if (order === 'col') arr.sort((a, b) => ((a % 4) * 4 + Math.floor(a / 4)) - ((b % 4) * 4 + Math.floor(b / 4)));
    return arr;
  }

  /*
   * Distribute CC numbers.
   * targets: [{p, e, role?}] in assignment order; a target without role uses o.role.
   * Counting runs per Page channel: every Page channel starts at o.start, Pages on the same channel continue
   * each other. An action with its own channel counts with the channel of its Page.
   * o: { role, start, step, skipUsed, setTypeIfOff, keepOther, remap, channel ('keep' | 0..16) }
   * remap: renumber the CC actions in use. Targets of type Off are left alone and use no CC number; a CC action
   * left without a CC is switched Off, so no old number stays behind as a duplicate.
   * A Push switched from Off to CC with P.Val and R.Val both 0 gets P.Val 127, so a press sends a value.
   * keepOther: leave actions alone that are neither Off nor a CC type (e.g. Page navigation,
   * Script, Note, PC); they don't consume a CC number.
   * Returns { assigned, last, overflow, kept, offSkipped, cleared, pages, firstOverflow }: cleared counts actions
   * switched Off by remap, pages maps a page index to the
   * [lowest, highest] CC given there, chans maps a page index to its Page channel, firstOverflow is the first target ({p, e, role}) left without a CC.
   */
  function distributeCC(scene, settings, targets, o) {
    const step = Math.max(1, o.step | 0);
    const roleOf = t => t.role || o.role;
    const targetKey = new Set(targets.map(t => t.p + '/' + t.e + '/' + roleOf(t)));
    let used = null;
    if (o.skipUsed) {
      used = new Set();
      collectCCUses(scene, settings).forEach((list, k) => {
        if (list.some(u => !targetKey.has(u.p + '/' + u.e + '/' + u.role))) used.add(k);
      });
    }
    const next = new Map();  // Page channel -> next CC
    let assigned = 0, last = null, overflow = 0, kept = 0, offSkipped = 0, cleared = 0, firstOverflow = null;
    const pages = {}, chans = {};
    for (const t of targets) {
      const role = roleOf(t);
      const page = scene.pages[t.p];
      const pch = pageChannel(page, settings);
      chans[t.p] = pch;
      let cc = next.has(pch) ? next.get(pch) : o.start | 0;
      const a = getAction(page.encoders[t.e], role);
      if (!a) continue;
      if (o.remap && a.type === 0) { offSkipped++; continue; }
      if (o.keepOther && a.type !== 0 && !isCC(role, a)) { kept++; continue; }
      // A target without a free CC stays exactly as it was (no type or channel change).
      const newChannel = o.channel !== 'keep' && o.channel !== undefined ? Number(o.channel) : a.channel;
      const ch = effectiveChannel(page, Object.assign({}, a, { channel: newChannel }), settings);
      if (used) while (cc <= 127 && used.has(ch + ':' + cc)) cc++;
      if (cc > 127) {
        next.set(pch, cc);
        overflow++;
        if (!firstOverflow) firstOverflow = { p: t.p, e: t.e, role };
        if (o.remap && isCC(role, a)) { a.type = 0; cleared++; }
        continue;
      }
      if (!o.remap && o.setTypeIfOff && a.type === 0) {
        a.type = role === 'push' ? 2 : 3;
        if (role === 'push' && !a.lower && !a.upper) a.lower = 127;
      }
      a.channel = newChannel;
      a.nr1 = cc;
      const r = pages[t.p] || (pages[t.p] = [cc, cc]);
      r[0] = Math.min(r[0], cc); r[1] = Math.max(r[1], cc);
      if (role !== 'push' && a.type === 4 && cc < 96) a.nr2 = cc + 32;
      if (used) used.add(ch + ':' + cc);
      assigned++;
      last = cc;
      next.set(pch, cc + step);
    }
    return { assigned, last, overflow, kept, offSkipped, cleared, pages, chans, firstOverflow };
  }

  /* E16 color index 0..99 -> CSS color from the app palette. */
  function colorCss(v) {
    if (!Number.isInteger(v) || v < 0) return '#888';
    if (v >= PALETTE.length) return '#f2f2f2';
    return PALETTE[v];
  }

  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

  /* Icon: 32 bytes, 16 rows of 2 bytes, MSB is the leftmost pixel. */
  function iconGet(icon, x, y) {
    const b = icon[y * 2 + (x >> 3)];
    return (b >> (7 - (x & 7))) & 1;
  }
  function iconSet(icon, x, y, on) {
    const i = y * 2 + (x >> 3), m = 1 << (7 - (x & 7));
    icon[i] = on ? (icon[i] | m) : (icon[i] & ~m);
  }

  /*
   * Navigation templates: Navigation pushes (type 6) stored relative to the page they sit on.
   * A template is { name, items: [{ enc, step, set }] }: encoder index 0..15, page offset
   * (wraps around all pages of the scene: P1 - 1 = P12) and the push fields written besides nr2 (the target page).
   * Pages form a grid of NAV_COLS columns like the E16 page selector, so ±NAV_COLS moves up/down.
   */
  const NAV_COLS = 4;
  const NAV_FIELDS = ['type', 'mode', 'channel', 'nr1', 'lower', 'upper', 'output'];
  const NAV_BASE = { type: 6, mode: 0, channel: 0, nr1: 0, lower: 0, upper: 0, output: 0 };
  const NAV_DEFAULT = {
    name: 'Row 1–4 (← ↑ ↓ →)', builtin: true,
    items: [
      { enc: 0, step: -1, set: Object.assign({}, NAV_BASE) },
      { enc: 1, step: -NAV_COLS, set: Object.assign({}, NAV_BASE) },
      { enc: 2, step: NAV_COLS, set: Object.assign({}, NAV_BASE) },
      { enc: 3, step: 1, set: Object.assign({}, NAV_BASE) },
    ],
  };
  const PUSH_EMPTY = { instrument: 127, parameter: 0, type: 0, display: 0, mode: 0, channel: 0, lower: 0, upper: 0, nr1: 0, nr2: 0, output: 0, scriptId: 0 };

  const mod = (a, n) => ((a % n) + n) % n;
  /* Offset from page p to target t, folded into -n/2 .. n/2. */
  function navStep(p, t, n) {
    let d = mod(t - p, n);
    if (d > n / 2) d -= n;
    return d;
  }
  /* Target page of a template item on page p (n pages). */
  function navTarget(p, it, n) { return mod(p + it.step, n); }
  /* Arrow for the grid moves, otherwise the signed offset. */
  function navStepLabel(it) {
    const arrows = { '-1': '←', '1': '→', [-NAV_COLS]: '↑', [NAV_COLS]: '↓' };
    return arrows[it.step] || (it.step > 0 ? '+' + it.step : String(it.step));
  }
  function navTemplateText(t) {
    return t.items.map(i => 'E' + (i.enc + 1) + ' ' + navStepLabel(i)).join(', ');
  }
  /* Template from the Page pushes of page p. Returns null when the page has none. */
  function navFromPage(scene, p, name) {
    const n = scene.pages.length;
    const items = [];
    scene.pages[p].encoders.forEach((enc, e) => {
      const a = enc.push_action;
      if (!a || a.type !== 6) return;
      const set = {};
      NAV_FIELDS.forEach(k => { if (k in a) set[k] = a[k]; });
      items.push({ enc: e, step: navStep(p, a.nr2, n), set });
    });
    return items.length ? { name: name, items } : null;
  }
  /*
   * Writes the template's pushes on the given pages. Other fields of the push are kept.
   * Returns { pushes, replaced }: replaced counts pushes that were neither Off nor Page before.
   */
  function applyNav(scene, pages, tpl) {
    const n = scene.pages.length;
    let pushes = 0, replaced = 0;
    pages.forEach(p => tpl.items.forEach(it => {
      const enc = scene.pages[p].encoders[it.enc];
      if (!enc) return;
      const old = enc.push_action || Object.assign({}, PUSH_EMPTY);
      if (old.type !== 0 && old.type !== 6) replaced++;
      enc.push_action = Object.assign({}, old, it.set, { nr2: navTarget(p, it, n) });
      pushes++;
    }));
    return { pushes, replaced };
  }
  /* Checks a parsed template list from storage; drops entries that do not fit. */
  function cleanNavTemplates(list) {
    if (!Array.isArray(list)) return [];
    return list.filter(t => t && typeof t.name === 'string' && Array.isArray(t.items) && t.items.length
      && t.items.every(i => Number.isInteger(i.enc) && i.enc >= 0 && i.enc < 16 && Number.isInteger(i.step) && i.set && typeof i.set === 'object'))
      .map(t => ({ name: t.name, items: t.items.map(i => ({ enc: i.enc, step: i.step, set: Object.assign({}, i.set) })) }));
  }

  /*
   * Page library entry: one or more consecutive pages with their settings, taken from a scene.
   * { format, version, device, name, scene, start, pages }: scene is the source scene's title, start the
   * 0-based index of the first page in the source scene; Navigation push targets are moved by (insert position - start) when inserted.
   */
  const PAGE_ENTRY_FORMAT = 'knobox-pages';
  function pagesToEntry(scene, from, count, name) {
    return { format: PAGE_ENTRY_FORMAT, version: 1, device: 'E16', name: name, scene: scene.title || '', start: from,
      pages: scene.pages.slice(from, from + count).map(p => deepClone(p)) };
  }
  /* Checks a parsed entry; returns an error text or null. */
  function checkPageEntry(x) {
    if (!x || x.format !== PAGE_ENTRY_FORMAT) return 'Not a knobOx page file.';
    if (typeof x.name !== 'string' || !Array.isArray(x.pages) || !x.pages.length) return 'No pages in the file.';
    if (!Number.isInteger(x.start) || x.start < 0) return 'Invalid start page.';
    for (const p of x.pages) {
      if (!Array.isArray(p.encoders) || p.encoders.length !== 16) return 'A page does not have 16 encoders.';
      for (const e of p.encoders) if (!e.push_action || !Array.isArray(e.turn_actions)) return 'Encoder without push_action/turn_actions.';
    }
    return null;
  }
  /*
   * Writes the entry's pages over the pages from index `at`. Navigation push targets move by the same
   * distance as the pages (wrapping around all pages). Returns { pages, navMoved, scripts } or null if
   * the entry does not fit. scripts counts Script actions, which refer to the scene's own script.
   */
  function insertPages(scene, entry, at) {
    const n = scene.pages.length;
    if (at < 0 || at + entry.pages.length > n) return null;
    const shift = at - entry.start;
    let navMoved = 0, scripts = 0;
    entry.pages.forEach((src, i) => {
      const p = deepClone(src);
      p.encoders.forEach(enc => {
        const pa = enc.push_action;
        if (pa.type === 6 && shift) { pa.nr2 = mod(pa.nr2 + shift, n); navMoved++; }
        if (pa.type === 12) scripts++;
        (enc.turn_actions || []).forEach(a => { if (a && a.type === 11) scripts++; });
      });
      scene.pages[at + i] = p;
    });
    return { pages: entry.pages.length, navMoved, scripts };
  }

  function validateScene(s) {
    if (!s || typeof s !== 'object') return 'Not a JSON object.';
    if (!Array.isArray(s.pages)) return 'Field "pages" is missing.';
    for (const p of s.pages) {
      if (!Array.isArray(p.encoders)) return 'Page without "encoders".';
      for (const e of p.encoders) {
        if (!e.push_action || !Array.isArray(e.turn_actions)) return 'Encoder without push_action/turn_actions.';
      }
    }
    return null;
  }

  const api = {
    TURN_TYPES, PUSH_TYPES, PUSH_MODES, ROLES, ROLE_LABEL,
    ACTION_OUTPUTS, PAGE_OUTPUTS, ACCEL_MODES, DISPLAYS, PALETTE, WHITE,
    noteName, getAction, typeTable, typeLabel, isCC,
    pageChannel, setPageChannel, effectiveChannel,
    actionFields, actionSummary, collectCCUses, distinctOwners, rangesText,
    orderIndices, distributeCC, colorCss, deepClone, iconGet, iconSet, validateScene,
    NAV_DEFAULT, NAV_COLS, navStep, navTarget, navStepLabel, navTemplateText, navFromPage, applyNav, cleanNavTemplates,
    pagesToEntry, checkPageEntry, insertPages,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.E16 = api;
})(typeof window !== 'undefined' ? window : globalThis);
