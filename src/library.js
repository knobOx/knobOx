/*
 * Local scene folder (File System Access API), like the "On Computer" list of the OXI App.
 * The chosen directory handle is kept in IndexedDB so it survives reloads; the browser asks
 * for permission again after a restart. If the folder has a "Scenes" subfolder (the OXI App's
 * storage layout), scenes are read from and written to that subfolder.
 * Browser: window.E16Library. Chrome/Chromium/Edge only.
 */
(function (root) {
  'use strict';

  const DB = 'e16ed', STORE = 'handles', KEY = 'sceneFolder';
  const EXT = /\.oxie16$/i;

  const supported = () => typeof root.showDirectoryPicker === 'function';

  function idb(mode, fn) {
    return new Promise((resolve, reject) => {
      const open = indexedDB.open(DB, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(STORE);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const tx = open.result.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req && req.result);
        tx.onerror = () => reject(tx.error);
      };
    });
  }

  /* Returns the folder that actually holds the scenes (root or its "Scenes" subfolder). */
  async function sceneDir(dir) {
    try { return await dir.getDirectoryHandle('Scenes'); } catch (e) { return dir; }
  }

  async function pickFolder() {
    const dir = await root.showDirectoryPicker({ id: 'e16-scenes', mode: 'readwrite' });
    await idb('readwrite', s => s.put(dir, KEY));
    return dir;
  }

  /* Stored folder, or null. `interactive` may prompt for permission (needs a user gesture). */
  async function storedFolder(interactive) {
    if (!supported()) return null;
    const dir = await idb('readonly', s => s.get(KEY)).catch(() => null);
    if (!dir) return null;
    const opts = { mode: 'readwrite' };
    if (await dir.queryPermission(opts) === 'granted') return dir;
    if (interactive && await dir.requestPermission(opts) === 'granted') return dir;
    return { pending: true, name: dir.name };
  }

  async function forget() { await idb('readwrite', s => s.delete(KEY)); }

  async function list(dir) {
    const d = await sceneDir(dir);
    const out = [];
    for await (const [name, h] of d.entries()) {
      if (h.kind !== 'file' || !EXT.test(name)) continue;
      let title = '', color = null;
      try {
        const s = JSON.parse(await (await h.getFile()).text());
        title = s.title || ''; color = s.color;
      } catch (e) { /* unreadable file: still listed */ }
      out.push({ name, handle: h, title, color });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }

  async function read(handle) { return (await handle.getFile()).text(); }

  async function write(handle, text) {
    const w = await handle.createWritable();
    await w.write(text);
    await w.close();
  }

  async function exists(dir, name) {
    try { await (await sceneDir(dir)).getFileHandle(name); return true; } catch (e) { return false; }
  }

  /* Create or overwrite <name> in the scene folder and return its handle. */
  async function save(dir, name, text) {
    const h = await (await sceneDir(dir)).getFileHandle(name, { create: true });
    await write(h, text);
    return h;
  }

  /* Delete <name> from the scene folder. Permanent: the API has no trash. */
  async function remove(dir, name) {
    await (await sceneDir(dir)).removeEntry(name);
  }

  /* File name for a scene title, keeping it safe on all platforms. */
  function fileNameFor(title) {
    const base = String(title || 'scene').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'scene';
    return base + '.oxie16';
  }

  /*
   * Which browser lacks folder access, and how to enable it. Returns { browser, steps[] } or null
   * when there is no known fix (then a Chromium-based browser is recommended).
   */
  function enableHint() {
    const nav = root.navigator || {};
    const ua = nav.userAgent || '';
    if (!root.isSecureContext) {
      return { browser: 'this page', steps: ['Open the editor via http://localhost (e.g. "python3 -m http.server 8716"), not as a file:// URL.'] };
    }
    if (nav.brave && typeof nav.brave.isBrave === 'function') {
      return { browser: 'Brave', steps: [
        'Open brave://flags/#file-system-access-api in a new tab (copy the address, links to it are blocked).',
        'Set "File System Access API" to Enabled.',
        'Click "Relaunch" and reload the editor.',
      ] };
    }
    if (/Firefox\//.test(ua)) return { browser: 'Firefox', steps: null };
    if (/Version\/[\d.]+.*Safari\//.test(ua) && !/Chrome\//.test(ua)) return { browser: 'Safari', steps: null };
    return { browser: 'this browser', steps: null };
  }

  root.E16Library = { supported, pickFolder, storedFolder, forget, list, read, write, exists, save, remove, fileNameFor, enableHint };
})(window);
