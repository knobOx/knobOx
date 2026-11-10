/*
 * OXI E16 scene transfer over USB-MIDI SysEx (see docs/PROTOCOL.md).
 *
 *   encodeScene(scene, slot)     -> SysEx messages for an upload (what the OXI App sends)
 *   sendScene(msgs, ports, ...)  -> upload, waiting for the device ACK after every message
 *   readScene(ports, slot)       -> download a scene from the device as an .oxie16 object
 *   listScenes(ports)            -> names/colors of all 16 slots
 *
 * Slots are numbered 1..16 as in the OXI App; on the wire they are 0-based.
 * Works in the browser (window.E16Sysex) and in Node (module.exports).
 */
(function (root) {
  'use strict';

  const OXI = [0xF0, 0x00, 0x21, 0x5B, 0x02, 0x01];
  const DEV_E16 = 0x08;      // data / ACK
  const DEV_REQUEST = 0x07;  // host request
  const ACK = [...OXI, DEV_E16, 0x53, 0xF7];
  const CMD_HEADER = 0x00, CMD_PAGE = 0x01, CMD_SCRIPT = 0x04;
  const HEADER_SIZE = 80, PAGE_SIZE = 976, SCRIPT_SIZE = 8192;
  const SLOTS = 16, PAGES = 12, ENCODERS = 16;

  // ---------- low level ----------

  /* STM32 hardware CRC: poly 0x04C11DB7, init 0xFFFFFFFF, over little-endian 32-bit words. */
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i << 24;
      for (let k = 0; k < 8; k++) c = (c & 0x80000000) ? ((c << 1) ^ 0x04C11DB7) : (c << 1);
      t[i] = c >>> 0;
    }
    return t;
  })();
  function stm32Crc(bytes) {
    const n = Math.ceil(bytes.length / 4) * 4;
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < n; i += 4) {
      // Each word is read little-endian and shifted in MSB first: feed bytes 3, 2, 1, 0.
      for (let k = 3; k >= 0; k--) {
        const b = i + k < bytes.length ? bytes[i + k] : 0;
        crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ b) & 0xFF]) >>> 0;
      }
    }
    return crc >>> 0;
  }

  /* 8-to-7 bit packing: each group of 7 bytes is preceded by a byte holding their top bits (bit j = byte j). */
  function pack7(bytes) {
    const out = [];
    for (let i = 0; i < bytes.length; i += 7) {
      const g = Array.from(bytes.slice(i, i + 7));
      let hi = 0;
      g.forEach((b, j) => { if (b & 0x80) hi |= 1 << j; });
      out.push(hi, ...g.map(b => b & 0x7F));
    }
    return out;
  }
  function unpack7(bytes) {
    const out = [];
    for (let i = 0; i < bytes.length; i += 8) {
      const hi = bytes[i];
      for (let j = 1; j < 8 && i + j < bytes.length; j++) out.push(bytes[i + j] | (((hi >> (j - 1)) & 1) << 7));
    }
    return out;
  }

  // ---------- binary layout ----------

  class Writer {
    constructor() { this.b = []; }
    u8(v) { this.b.push((Number(v) || 0) & 0xFF); return this; }
    u16(v) { v = (Number(v) || 0) & 0xFFFF; this.b.push(v >> 8, v & 0xFF); return this; }
    str(s, n) {
      const t = String(s || '');
      for (let i = 0; i < n; i++) this.b.push(i < t.length ? (t.charCodeAt(i) & 0xFF) : 0);
      return this;
    }
    bytes(arr, n) { for (let i = 0; i < n; i++) this.b.push((arr && arr[i]) & 0xFF); return this; }
    pad(n) { while (this.b.length < n) this.b.push(0); return this; }
  }

  class Reader {
    constructor(b) { this.b = b; this.o = 0; }
    u8() { return this.b[this.o++]; }
    u16() { const v = (this.b[this.o] << 8) | this.b[this.o + 1]; this.o += 2; return v; }
    str(n) {
      let s = '';
      for (let i = 0; i < n; i++) { const c = this.b[this.o + i]; if (!c) break; s += String.fromCharCode(c); }
      this.o += n; return s;
    }
    bytes(n) { const a = Array.from(this.b.slice(this.o, this.o + n)); this.o += n; return a; }
  }

  // Scene header fields after title (16) and icon (32), in wire order.
  const HEADER_FIELDS = [
    ['color', 1], ['transmitMode', 1], ['pcOnEntry', 1], ['bankOnEntry', 2], ['recentPage', 1],
    ['recentPreset', 1], ['transmitOnSceneEntry', 1], ['transmitOnPageSwitch', 1], ['transmitOnPresetLoad', 1],
    ['smartTransmit', 1], ['outputOnEntry', 1], ['holdMode', 1], ['acceleration', 1],
  ];
  const SCRIPT_NAME_OFFSET = 62, SCRIPT_NAME_LEN = HEADER_SIZE - 62;

  function headerBody(s) {
    const w = new Writer();
    w.str(s.title, 16).bytes(s.icon, 32);
    HEADER_FIELDS.forEach(([k, n]) => (n === 2 ? w.u16(s[k]) : w.u8(s[k])));
    w.str(s.code && s.code.scriptName, SCRIPT_NAME_LEN);
    return w.pad(HEADER_SIZE).b;
  }
  function decodeHeader(b) {
    const r = new Reader(b);
    const s = { title: r.str(16), icon: r.bytes(32), selectedPreset: 0 };
    HEADER_FIELDS.forEach(([k, n]) => { s[k] = n === 2 ? r.u16() : r.u8(); });
    r.o = SCRIPT_NAME_OFFSET;
    s.code = { code: '', fullScript: '', scriptName: r.str(SCRIPT_NAME_LEN) };
    return s;
  }

  // Action: push has no defaultValue (14 bytes), turn has it (16 bytes).
  function writeAction(w, a, turn) {
    a = a || {};
    w.u8(a.instrument).u8(a.parameter).u8(a.type).u8(a.display).u8(a.mode).u8(a.channel);
    w.u16(a.lower).u16(a.upper);
    if (turn) w.u16(a.defaultValue);
    w.u8(a.nr1).u8(a.nr2).u8(a.output).u8(a.scriptId);
  }
  function readAction(r, turn) {
    const a = { instrument: r.u8(), parameter: r.u8(), type: r.u8(), display: r.u8(), mode: r.u8(), channel: r.u8(),
      lower: r.u16(), upper: r.u16() };
    if (turn) a.defaultValue = r.u16();
    a.nr1 = r.u8(); a.nr2 = r.u8(); a.output = r.u8(); a.scriptId = r.u8();
    return a;
  }

  function pageBody(p) {
    const w = new Writer();
    w.str(p.title, 12).u8(p.output).u8(p.channel).u8(0).u8(0);
    for (let e = 0; e < ENCODERS; e++) {
      const enc = p.encoders[e] || {};
      w.str(enc.name, 8).str(enc.abbr, 4).u8(enc.color);
      writeAction(w, enc.push_action, false);
      writeAction(w, (enc.turn_actions || [])[0], true);
      writeAction(w, (enc.turn_actions || [])[1], true);
      w.u8(enc.color2);
    }
    return w.b;
  }
  function decodePage(b) {
    const r = new Reader(b);
    const p = { title: r.str(12), output: r.u8(), channel: r.u8(), encoders: [] };
    r.o += 2;
    for (let e = 0; e < ENCODERS; e++) {
      const enc = { name: r.str(8), abbr: r.str(4), color: r.u8() };
      enc.push_action = readAction(r, false);
      enc.turn_actions = [readAction(r, true), readAction(r, true)];
      enc.color2 = r.u8();
      p.encoders.push(enc);
    }
    return p;
  }

  function utf8(s) { return Array.from(new TextEncoder().encode(String(s || ''))); }
  function scriptBody(s) {
    const b = utf8(s.code && s.code.code);
    while (b.length < SCRIPT_SIZE) b.push(0);
    return b;
  }
  function decodeScript(b) {
    const end = b.indexOf(0);
    return new TextDecoder().decode(Uint8Array.from(end < 0 ? b : b.slice(0, end)));
  }

  // ---------- framing ----------

  /* Upload frame: u32 len | 0x14 | u16 bodyLen | 0x00 | body | u32 crc, 7-bit packed. */
  function frame(cmd, wireSlot, idx, body) {
    const crc = stm32Crc(body);
    const len = body.length + 8;
    const inner = [len >>> 24, (len >> 16) & 0xFF, (len >> 8) & 0xFF, len & 0xFF,
      0x14, body.length >> 8, body.length & 0xFF, 0x00, ...body,
      crc >>> 24, (crc >> 16) & 0xFF, (crc >> 8) & 0xFF, crc & 0xFF];
    return Uint8Array.from([...OXI, DEV_E16, cmd, wireSlot & 0x7F, idx & 0x7F, ...pack7(inner), 0xF7]);
  }

  /* Read request: the payload is a packed 32-bit zero. */
  function request(cmd, wireSlot, idx) {
    return Uint8Array.from([...OXI, DEV_REQUEST, cmd, wireSlot & 0x7F, idx & 0x7F, ...pack7([0, 0, 0, 0]), 0xF7]);
  }

  /* Device response: 0x14 | u16 bodyLen | 0x00 | body | u32 crc, 7-bit packed. Returns {cmd, slot, idx, body}. */
  function parseResponse(msg) {
    const d = Array.from(msg);
    if (d.length < 12 || !OXI.every((v, i) => d[i] === v) || d[6] !== DEV_E16 || d[d.length - 1] !== 0xF7) {
      throw new Error('Not an E16 data message.');
    }
    const u = unpack7(d.slice(10, -1));
    if (u[0] !== 0x14) throw new Error('Unexpected payload marker 0x' + (u[0] || 0).toString(16) + '.');
    const n = (u[1] << 8) | u[2];
    const body = u.slice(4, 4 + n);
    const crc = ((u[4 + n] << 24) | (u[5 + n] << 16) | (u[6 + n] << 8) | u[7 + n]) >>> 0;
    if (body.length !== n || stm32Crc(body) !== crc) throw new Error('CRC mismatch in device response.');
    return { cmd: d[7], slot: d[8], idx: d[9], body };
  }

  // ---------- scene level ----------

  /* Problems that prevent a faithful upload. Empty array = ok. */
  function checkScene(s) {
    const p = [];
    if (!s || !Array.isArray(s.pages) || s.pages.length !== PAGES) p.push('The scene needs exactly 12 pages.');
    (s && s.pages || []).forEach((pg, i) => {
      if (!Array.isArray(pg.encoders) || pg.encoders.length !== ENCODERS) p.push('Page ' + (i + 1) + ' does not have 16 encoders.');
    });
    const code = s && s.code && s.code.code;
    if (code && utf8(code).length >= SCRIPT_SIZE) p.push('The script is too large (max. ' + (SCRIPT_SIZE - 1) + ' bytes).');
    if (s && s.code && s.code.scriptName && !code) {
      p.push('The scene refers to the script "' + s.code.scriptName + '" but contains no script code. Sending it would erase the script on the E16. Open the original file with the script instead.');
    }
    return p;
  }

  function encodeScene(s, slot) {
    const w = slot - 1;
    const msgs = [frame(CMD_HEADER, w, 0, headerBody(s))];
    s.pages.forEach((p, i) => msgs.push(frame(CMD_PAGE, w, i, pageBody(p))));
    msgs.push(frame(CMD_SCRIPT, w, 0, scriptBody(s)));
    return msgs;
  }

  /* Build an .oxie16 object (same key order as files written by the OXI App). */
  function decodeScene(headerB, pageBs, scriptB) {
    const h = decodeHeader(headerB);
    const s = {};
    ['title', 'icon', 'selectedPreset', ...HEADER_FIELDS.map(f => f[0])].forEach(k => { s[k] = h[k]; });
    s.code = h.code;
    if (scriptB) s.code.code = decodeScript(scriptB);
    s.pages = pageBs.map(decodePage);
    return s;
  }

  // ---------- empty slot ----------

  /*
   * What the E16 holds in a factory-empty slot, read from a device (slot 6, firmware of 2026-11).
   * All empty slots are identical except the scene title "S. <slot>", the page titles ("P. 1" … "P.12")
   * and the page MIDI channel n. There is no known delete command, so "delete" writes this scene.
   */
  const EMPTY_HEADER =
    '532e2036000000000000000000000000381c54229245924982414422381c00000000381c4422a241924982454422381c' +
    '220000ffff0000000000000f0003000000000000000000000000000000000000';
  const EMPTY_PAGE =
    '502e2031000000000000000000010000434331000000000043433100007f0002000000007f000011000c007f00030a0e' +
    '000000007f000001000c007f00000a03000000007f000001000c0000434332000000000043433200067f000200000000' +
    '7f000012000c007f00030a0e000000007f000002000c007f00000a03000000007f000002000c00064343330000000000' +
    '434333000c7f0002000000007f000013000c007f00030a0e000000007f000003000c007f00000a03000000007f000003' +
    '000c000c434334000000000043433400127f0002000000007f000014000c007f00030a0e000000007f000004000c007f' +
    '00000a03000000007f000004000c0012434335000000000043433500187f0002000000007f000015000c007f00030a0e' +
    '000000007f000005000c007f00000a03000000007f000005000c00184343360000000000434336001e7f000200000000' +
    '7f000016000c007f00030a0e000000007f000006000c007f00000a03000000007f000006000c001e4343370000000000' +
    '43433700247f0002000000007f000017000c007f00030a0e000000007f000007000c007f00000a03000000007f000007' +
    '000c00244343380000000000434338002a7f0002000000007f000018000c007f00030a0e000000007f000008000c007f' +
    '00000a03000000007f000008000c002a434339000000000043433900307f0002000000007f000019000c007f00030a0e' +
    '000000007f000009000c007f00000a03000000007f000009000c0030434331300000000043433130367f000200000000' +
    '7f00001a000c007f00030a0e000000007f00000a000c007f00000a03000000007f00000a000c00364343313100000000' +
    '434331313c7f0002000000007f00001b000c007f00030a0e000000007f00000b000c007f00000a03000000007f00000b' +
    '000c003c434331320000000043433132427f0002000000007f00001c000c007f00030a0e000000007f00000c000c007f' +
    '00000a03000000007f00000c000c0042434331330000000043433133487f0002000000007f00001d000c007f00030a0e' +
    '000000007f00000d000c007f00000a03000000007f00000d000c00484343313400000000434331344e7f000200000000' +
    '7f00001e000c007f00030a0e000000007f00000e000c007f00000a03000000007f00000e000c004e4343313500000000' +
    '43433135547f0002000000007f00001f000c007f00030a0e000000007f00000f000c007f00000a03000000007f00000f' +
    '000c00544343313600000000434331365a7f0002000000007f000020000c007f00030a0e000000007f000010000c007f' +
    '00000a03000000007f000010000c005a';
  const fromHex = h => Uint8Array.from(h.match(/../g).map(x => parseInt(x, 16)));

  function emptyScene(slot) {
    const s = decodeScene(fromHex(EMPTY_HEADER), Array.from({ length: PAGES }, () => fromHex(EMPTY_PAGE)), null);
    s.title = 'S. ' + slot;
    s.pages.forEach((p, i) => { p.title = (i < 9 ? 'P. ' : 'P.') + (i + 1); p.channel = i + 1; }); // "P. 9", "P.10" as on the device
    return s;
  }

  /* Concatenate messages into one .syx file (for amidi etc.). */
  function toSyx(msgs) {
    const total = msgs.reduce((n, m) => n + m.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    msgs.forEach(m => { out.set(m, o); o += m.length; });
    return out;
  }
  /* Split a .syx byte stream into messages. */
  function splitSyx(bytes) {
    const out = [];
    let start = -1;
    bytes.forEach((b, i) => {
      if (b === 0xF0) start = i;
      else if (b === 0xF7 && start >= 0) { out.push(bytes.slice(start, i + 1)); start = -1; }
    });
    return out;
  }

  // ---------- Web MIDI ----------

  async function midiAccess() {
    if (!root.navigator || !navigator.requestMIDIAccess) throw new Error('This browser has no Web MIDI support (use Chrome, Chromium or Edge).');
    return navigator.requestMIDIAccess({ sysex: true });
  }

  /* Pick the E16's first port pair ("OXI E16", not MIDIIN2/MIDIOUT2 or port 2/3 on Linux). */
  function findPorts(access) {
    const pick = map => {
      const list = [...map.values()].filter(p => /OXI E16/i.test(p.name || ''));
      return list.find(p => !/MIDI(IN|OUT)\s*\d/i.test(p.name) && !/MIDI [23]\b/.test(p.name)) || list[0] || null;
    };
    return { input: pick(access.inputs), output: pick(access.outputs) };
  }

  function isAck(d) { return d.length === ACK.length && ACK.every((v, i) => d[i] === v); }

  /*
   * One SysEx exchange: send msg, resolve with the first SysEx reply that `accept` returns truthy for.
   * Replies are reassembled in case the platform delivers them in pieces.
   */
  function makeSession(ports, timeoutMs) {
    const { input, output } = ports;
    if (!output) throw new Error('E16 not found. Is it connected via USB and the OXI App closed?');
    if (!input) throw new Error('E16 input not found (needed for replies).');
    let waiter = null, buf = null;
    const onMsg = ev => {
      for (const b of ev.data) {
        if (b === 0xF0) buf = [b];
        else if (buf) {
          buf.push(b);
          if (b === 0xF7) {
            const m = Uint8Array.from(buf); buf = null;
            if (waiter) { const w = waiter; waiter = null; clearTimeout(w.timer); w.resolve(m); }
          }
        }
      }
    };
    input.addEventListener('midimessage', onMsg);
    return {
      async open() { await input.open(); await output.open(); },
      exchange(msg, label) {
        return new Promise((resolve, reject) => {
          waiter = { resolve, timer: setTimeout(() => { waiter = null; reject(new Error('No reply from the E16 (' + label + ').')); }, timeoutMs || 3000) };
          output.send(msg);
        });
      },
      close() { input.removeEventListener('midimessage', onMsg); },
    };
  }

  async function sendScene(msgs, ports, onProgress, timeoutMs) {
    const sess = makeSession(ports, timeoutMs);
    try {
      await sess.open();
      for (let i = 0; i < msgs.length; i++) {
        const reply = await sess.exchange(msgs[i], 'message ' + (i + 1) + ' of ' + msgs.length);
        if (!isAck(reply)) throw new Error('Unexpected reply: ' + hex(reply));
        if (onProgress) onProgress(i + 1, msgs.length);
      }
    } finally { sess.close(); }
  }

  async function fetchBlock(sess, cmd, wireSlot, idx, label) {
    const res = parseResponse(await sess.exchange(request(cmd, wireSlot, idx), label));
    if (res.cmd !== cmd || res.slot !== wireSlot || res.idx !== idx) throw new Error('Reply for the wrong block (' + label + ').');
    return res.body;
  }

  /* Download a whole scene. The script block is only requested when the header names a script. */
  async function readScene(ports, slot, onProgress, timeoutMs) {
    const w = slot - 1, total = 1 + PAGES;
    const sess = makeSession(ports, timeoutMs);
    try {
      await sess.open();
      const header = await fetchBlock(sess, CMD_HEADER, w, 0, 'header');
      if (onProgress) onProgress(1, total);
      const pages = [];
      for (let i = 0; i < PAGES; i++) {
        pages.push(await fetchBlock(sess, CMD_PAGE, w, i, 'page ' + (i + 1)));
        if (onProgress) onProgress(i + 2, total);
      }
      // How the OXI App reads scripts back is not known yet; the E16 does not answer this guessed
      // request. If it fails, the scene comes back without code and is flagged so that it cannot be
      // sent back by accident (that would erase the script on the device).
      let script = null, scriptMissing = false;
      if (decodeHeader(header).code.scriptName) {
        try { script = await fetchBlock(sess, CMD_SCRIPT, w, 0, 'script'); }
        catch (e) { scriptMissing = true; }
      }
      const scene = decodeScene(header, pages, script);
      if (scriptMissing) Object.defineProperty(scene, 'scriptMissing', { value: true, enumerable: false });
      return scene;
    } finally { sess.close(); }
  }

  /* Titles and colors of all slots (the OXI App reads only the headers for its device list). */
  async function listScenes(ports, timeoutMs) {
    const sess = makeSession(ports, timeoutMs);
    const out = [];
    try {
      await sess.open();
      for (let w = 0; w < SLOTS; w++) {
        const h = decodeHeader(await fetchBlock(sess, CMD_HEADER, w, 0, 'slot ' + (w + 1)));
        out.push({ slot: w + 1, title: h.title, color: h.color, scriptName: h.code.scriptName });
      }
    } finally { sess.close(); }
    return out;
  }

  function hex(b) { return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join(' '); }

  const api = {
    SLOTS, stm32Crc, pack7, unpack7, encodeScene, decodeScene, checkScene, parseResponse, request,
    toSyx, splitSyx, emptyScene, midiAccess, findPorts, sendScene, readScene, listScenes, isAck, ACK,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.E16Sysex = api;
})(typeof window !== 'undefined' ? window : globalThis);
