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
    6: { label: 'Page', sure: true },
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
  const DISPLAYS = {
    0: { label: 'Off', sure: true }, 1: { label: '127', sure: true }, 2: { label: '100', sure: true },
    3: { label: '1000', sure: true }, 4: { label: 'B63', sure: true }, 5: { label: 'B50', sure: true },
    6: { label: 'B500', sure: true }, 7: { label: 'On/Off', sure: true }, 8: { label: '9999', sure: true },
    10: { label: 'Standard', sure: true }, 11: { label: 'High Res', sure: true },
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
  function actionFields(role, a, pages) {
    const f = [];
    const t = a.type;
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
      f.push({ key: 'nr2', label: n2, kind: 'num', min: 0, max: 127, raw: ![4, 9].includes(t) });
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
        (pages || []).forEach((p, i) => { opts[i] = { label: 'P' + (i + 1) + ' ' + p.title }; });
        f.push({ key: 'nr2', label: 'Target page', kind: 'select', options: opts });
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
    const known = new Set(f.map(x => x.key));
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
   * targets: [{p, e}] in assignment order.
   * o: { role, start, step, skipUsed, setTypeIfOff, keepOther, channel ('keep' | 0..16) }
   * keepOther: leave actions alone that are neither Off nor a CC type (e.g. Page navigation,
   * Script, Note, PC); they don't consume a CC number.
   * Returns { assigned, last, overflow, kept }.
   */
  function distributeCC(scene, settings, targets, o) {
    const role = o.role;
    const step = Math.max(1, o.step | 0);
    const targetKey = new Set(targets.map(t => t.p + '/' + t.e + '/' + role));
    let used = null;
    if (o.skipUsed) {
      used = new Set();
      collectCCUses(scene, settings).forEach((list, k) => {
        if (list.some(u => !targetKey.has(u.p + '/' + u.e + '/' + u.role))) used.add(k);
      });
    }
    let cc = o.start | 0;
    let assigned = 0, last = null, overflow = 0, kept = 0;
    for (const t of targets) {
      const page = scene.pages[t.p];
      const a = getAction(page.encoders[t.e], role);
      if (!a) continue;
      if (o.keepOther && a.type !== 0 && !isCC(role, a)) { kept++; continue; }
      if (o.setTypeIfOff && a.type === 0) a.type = role === 'push' ? 2 : 3;
      if (o.channel !== 'keep' && o.channel !== undefined) a.channel = Number(o.channel);
      const ch = effectiveChannel(page, a, settings);
      if (used) while (cc <= 127 && used.has(ch + ':' + cc)) cc++;
      if (cc > 127) { overflow++; continue; }
      a.nr1 = cc;
      if (role !== 'push' && a.type === 4 && cc < 96) a.nr2 = cc + 32;
      if (used) used.add(ch + ':' + cc);
      assigned++;
      last = cc;
      cc += step;
    }
    return { assigned, last, overflow, kept };
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
    ACTION_OUTPUTS, PAGE_OUTPUTS, ACCEL_MODES, DISPLAYS, PALETTE,
    noteName, getAction, typeTable, typeLabel, isCC,
    pageChannel, setPageChannel, effectiveChannel,
    actionFields, actionSummary, collectCCUses, distinctOwners, rangesText,
    orderIndices, distributeCC, colorCss, deepClone, iconGet, iconSet, validateScene,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.E16 = api;
})(typeof window !== 'undefined' ? window : globalThis);
