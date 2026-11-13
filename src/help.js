/*
 * knobOx - built-in help, shown in the help overlay (index left, text right).
 * Each section: { id, title, html }. The HTML is static text written for this file.
 * Browser: window.E16Help.
 */
(function (root) {
  'use strict';

  const sections = [
    {
      id: 'start', title: 'Getting started',
      html: `
<p><b>knobOx</b> is an unofficial editor for <b>OXI E16</b> scenes. It runs in your browser: nothing to install, and your files never leave your computer.</p>
<h3>What you need</h3>
<ul>
  <li><b>Chrome, Chromium, Edge or Brave.</b> Firefox and Safari can open and save files, but cannot talk to the E16 and cannot use a scene folder.</li>
  <li>The E16 connected over <b>USB</b>.</li>
  <li><b>Close the OXI App</b> while knobOx talks to the E16. Only one program can use the MIDI port at a time.</li>
</ul>
<h3>The usual workflow</h3>
<ol>
  <li>In the <b>Library</b>, choose your scene folder once (on the left) and click <b>Connect E16</b> (on the right).</li>
  <li>Open a scene with the pencil icon: from the folder or straight from a slot of the E16.</li>
  <li>Edit it: encoders, whole pages with Bulk edit, page layouts in the Pages tab.</li>
  <li>Save it to your computer (<kbd>Ctrl</kbd>+<kbd>S</kbd>) and send it to the E16 with <b>Save to E16</b>.</li>
</ol>
<p class="note">Sending a scene overwrites the chosen slot on the E16. Keep a backup of your scenes, e.g. by saving each slot to your folder first.</p>`,
    },
    {
      id: 'topbar', title: 'Top bar',
      html: `
<table>
  <tr><td>Library</td><td>Back to the scene list (computer and E16).</td></tr>
  <tr><td>Open</td><td>Open a <code>.oxie16</code> file from anywhere. You can also drop a file onto the window.</td></tr>
  <tr><td>Save to computer</td><td><kbd>Ctrl</kbd>+<kbd>S</kbd>. Writes back to the file the scene came from, or into the scene folder. Without a folder it downloads the file.</td></tr>
  <tr><td>Save as …</td><td><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>. Saves under a new file name.</td></tr>
  <tr><td>Save to E16 …</td><td>Sends the scene to a slot you choose. A scene read from the E16 starts on its own slot.</td></tr>
  <tr><td>Close</td><td>Closes the scene and goes back to the Library.</td></tr>
  <tr><td>Undo / Redo</td><td><kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd>. Every change can be undone.</td></tr>
  <tr><td>Theme</td><td>Follow the system, dark or light.</td></tr>
  <tr><td>Help</td><td>This page.</td></tr>
</table>
<p>The bar above the editor always shows which scene you are editing and where it comes from: a file, the scene folder or an E16 slot. Nothing is overwritten without asking first.</p>`,
    },
    {
      id: 'library', title: 'Library',
      html: `
<h3>On computer</h3>
<ul>
  <li><b>Choose folder</b> once. The browser remembers it. After a browser restart it asks once for access again (one click). If it offers "Allow on every visit", choose that.</li>
  <li>If the folder has a <code>Scenes</code> subfolder (like the OXI App's storage folder), that subfolder is used. So you can point knobOx at the same folder as the OXI App.</li>
  <li>Each file has three buttons: <b>open</b> (pencil), <b>clone</b> (copies the file under a new name, <code>&lt;name&gt;_clone</code> by default) and <b>delete</b> (trash). Deleting is permanent, there is no trash bin.</li>
</ul>
<h3>On device</h3>
<ul>
  <li><b>Connect E16</b> lists all 16 slots with name, color and script.</li>
  <li>Per slot: <b>open</b> in the editor, <b>save</b> to the folder (or download), <b>send</b> the scene that is open in the editor, <b>delete</b>.</li>
  <li><b>Drag and drop:</b> drag a file onto a slot to send it, or a slot onto the file list to save it.</li>
  <li><b>Delete</b> asks first and can save the slot before deleting it. The slot then holds an empty scene ("S. 6" etc.), exactly like a new E16.</li>
</ul>`,
    },
    {
      id: 'editor', title: 'Pages and encoders',
      html: `
<h3>Page selector</h3>
<ul>
  <li>The 12 Pages are laid out like on the E16: three rows of four. Click a Page to edit it.</li>
  <li>Under the selector: <b>Page name</b>, <b>Channel</b> (the MIDI channel of the Page) and <b>Output</b> (ALL, TRS, USB, BLE).</li>
  <li><b>Drag a Page</b> onto another to swap them, with <kbd>Alt</kbd> or <kbd>Ctrl</kbd> to copy. What happens to Navigation pushes is set with <b>Nav on swap</b> (see <a href="#help-pages">Pages tab</a>).</li>
</ul>
<h3>Encoder grid</h3>
<ul>
  <li>Each encoder shows its name, color and three lines: <b>1</b> = Dest 1 (turn), <b>2</b> = Dest 2 (turn), <b>P</b> = Push. "–" means Off.</li>
  <li>An orange dot marks encoders changed since loading.</li>
  <li><b>Select:</b> click. <kbd>Ctrl</kbd>+click adds or removes one, <kbd>Shift</kbd>+click selects a range. <b>All</b> / <b>None</b> under the grid, or <kbd>Ctrl</kbd>+<kbd>A</kbd>.</li>
  <li><b>Copy / Paste:</b> <kbd>Ctrl</kbd>+<kbd>C</kbd> / <kbd>Ctrl</kbd>+<kbd>V</kbd>. The checkboxes next to "Paste" choose what is pasted (Name, Abbr, Color, Dest 1, Dest 2, Push), e.g. only the colors.</li>
  <li><b>Drag an encoder</b> onto another to swap them, with <kbd>Alt</kbd> to copy.</li>
</ul>
<p>The panel next to the grid has three tabs: <b>Encoder</b> (one encoder), <b>Bulk edit</b> (many encoders) and <b>Pages</b> (whole Pages).</p>`,
    },
    {
      id: 'encoder', title: 'Encoder tab',
      html: `
<p>Edits the selected encoder: abbreviation (4 characters, shown on the E16), name (the parameter name), color, and the sections <b>Dest 1</b>, <b>Dest 2</b> and <b>Push</b>. Click a section title to open it. With <b>Same as Abbr</b> ticked (the default), the name follows the abbreviation; untick it to give the name its own text.</p>
<ul>
  <li><b>Type</b> decides what is sent: CC Abs, CC Rel, CC14, NRPN, Note, PC, Pitch Bend and more. The fields below change with the type.</li>
  <li><b>Channel</b> "Page" means the encoder uses the Page channel. Pick 1–16 to override it.</li>
  <li><b>CC #</b> shows on which channel the CC goes out and whether it is unique. If the same CC is used elsewhere on that channel, it says so and lists where.</li>
  <li><b>Min / Max</b> limit the values that are sent. <b>Default</b> is the value "Set to Default" jumps to.</li>
  <li><b>Display</b> sets how the E16 shows the value: Off, Standard, 127, 100, 1000, Bipolar, 9999, High Res, Always On.</li>
  <li><b>Push</b> can send a CC, Note or PC, jump to another Page (<b>Navigation</b>), reset the encoder (<b>Set to Default</b>) and more.</li>
</ul>
<p class="note">Fields marked with * are raw values whose meaning is not fully known. knobOx keeps them unchanged unless you edit them.</p>`,
    },
    {
      id: 'bulk', title: 'Bulk edit',
      html: `
<h3>Scope: which encoders</h3>
<ul>
  <li><b>Selection:</b> the encoders selected in the grid (without a selection: the whole Page).</li>
  <li><b>Current Page:</b> all 16 encoders of the Page.</li>
  <li><b>Page range:</b> several Pages. Under <b>Encoders</b> choose "All 16" or "Chosen positions": tick positions in the 4×4 matrix, and they apply on every Page of the range (e.g. encoders 5–16 while 1–4 hold the navigation).</li>
  <li><b>Order:</b> by row (1-2-3-4) or by column (1-5-9-13). It decides the order in which numbers, names and colors are given.</li>
</ul>
<h3>Distribute CCs</h3>
<p>Gives CC numbers to many encoders in one go.</p>
<ul>
  <li><b>Targets:</b> Dest 1, Dest 2 and/or Push.</li>
  <li><b>Sequence</b> (with more than one target): <i>Page by page</i> (on each Page Dest 1, then Dest 2, then Push), <i>Target by target</i> (Dest 1 on all Pages first) or <i>Encoder by encoder</i> (E1 Dest 1, Dest 2, Push, then E2).</li>
  <li><b>Start / step:</b> the first CC and the distance between two CCs.</li>
  <li><b>Counted per Page channel:</b> every Page channel starts at the start CC, Pages on the same channel continue each other. Pages on different channels each get the full range 0–127.</li>
  <li><b>Set channel:</b> "Page" (default) makes the encoders follow the Page channel.</li>
  <li><b>Remap used:</b> renumbers everything that is in use (Dest 1, Dest 2, Push) from the start CC, without gaps. Old numbers are dropped. Off and Navigation stay as they are. Whatever no longer fits into 0–127 is switched Off, so no duplicate is left behind.</li>
  <li><b>Skip used</b> (on by default): never gives a CC that another action on the same channel already has.</li>
  <li><b>Activate Off:</b> switches Off targets on (CC Abs / CC).</li>
  <li><b>Keep navigation:</b> Navigation, Script, Note, PC etc. keep their function and use no CC number.</li>
</ul>
<p>The <b>preview</b> shows the result before you click: how many CCs, the CCs of each Page (laid out like the Page selector, with its channel), where the CCs run out and whether a CC would end up twice on one channel.</p>
<p class="note">CC 0 is Bank Select in the MIDI standard. Devices that react to it may switch banks. Start at 1 if you are not sure.</p>
<h3>Set up Push as CC</h3>
<p>Turns the pushes into CC buttons: CC number from Dest 1 plus an offset, or sequential from a start CC (default: the first free CC). Behavior (press, toggle), P.Val and R.Val (values on press and release) and the channel of Dest 1 can be set too.</p>
<h3>Set field</h3>
<p>Sets one field to the same value on all encoders in scope, e.g. Display = Bipolar or Min = 20 on Dest 1.</p>
<h3>Assign names</h3>
<p>Names by pattern, 4 characters: <code>{n}</code> running number, <code>{cc}</code> CC of Dest 1, <code>{e}</code> encoder number, <code>{p}</code> Page number. With a Page range, "{n} per Page" restarts the number on every Page.</p>
<h3>Color</h3>
<p>One color, or a gradient from one color to another. With a Page range, "Gradient per Page" runs the whole gradient on every Page.</p>`,
    },
    {
      id: 'pages', title: 'Pages tab',
      html: `
<p>Actions for whole Pages. <b>Scope</b> at the top: the current Page or a Page range.</p>
<h3>Page library: copy Pages between scenes</h3>
<ol>
  <li>Open the scene with the Pages you want to keep.</li>
  <li><b>Save … to library</b> and give it a name. A range of Pages is stored as one entry, with names, channels and outputs.</li>
  <li>Open the other scene, choose the entry and <b>Insert at Page</b>, then <b>Insert</b>. The Pages there are overwritten (Undo brings them back).</li>
</ol>
<p>The two small buttons next to the entry <b>clone</b> it under a new name or <b>delete</b> it from the library.</p>
<p>Navigation pushes move with the Pages: if you insert P1–P4 at P5, "P1 → P2" becomes "P5 → P6". Script actions refer to the script of the scene they end up in.</p>
<h3>Navigation</h3>
<p>Writes Navigation pushes from a template onto the Pages in scope. The built-in template <b>Row 1–4</b> matches the Page selector:</p>
<table>
  <tr><td>Encoder 1 ←</td><td>previous Page</td></tr>
  <tr><td>Encoder 2 ↑</td><td>four Pages back (one row up)</td></tr>
  <tr><td>Encoder 3 ↓</td><td>four Pages ahead (one row down)</td></tr>
  <tr><td>Encoder 4 →</td><td>next Page</td></tr>
</table>
<p>The targets wrap around the 12 Pages: from P1, ← goes to P12 and ↑ to P9. <b>Save Page … as template</b> stores the Navigation pushes of the current Page as your own template. Own templates can be deleted with the trash button next to the template.</p>
<h3>Copy / swap Page</h3>
<p>Copies the current Page onto a target Page or swaps them. "With settings" includes name, channel and output. <b>Nav on swap</b>: "Move with page" keeps Navigation pushes working after a swap; "Stay in place" keeps them at their position, e.g. for a navigation layout that is the same on every Page.</p>`,
    },
    {
      id: 'overview', title: 'CC overview',
      html: `
<p>The tab <b>CC overview</b> shows all 16 MIDI channels × 128 CCs of the whole scene at once.</p>
<ul>
  <li>Blue: CC in use. Orange: CC used more than once on that channel (a duplicate).</li>
  <li>Hover a cell to see who uses it. Click a channel for a detail view with all CCs, a jump to each encoder and a list of free CCs to copy.</li>
  <li>The checkboxes choose what counts: Dest 1, Dest 2, Push and the LSB of CC14.</li>
</ul>`,
    },
    {
      id: 'scene', title: 'Scene tab',
      html: `
<ul>
  <li><b>Name</b> (up to 7 characters, as shown on the E16) and <b>color</b> of the scene.</li>
  <li><b>Icon:</b> draw the 16×16 scene icon with the mouse. Clear and Invert help. The icon goes to the E16 with the scene.</li>
  <li><b>Other scene fields:</b> all other settings as raw values, e.g. what is sent when the scene is loaded.</li>
  <li><b>Script:</b> Lua scripts are kept and sent unchanged, but not edited.</li>
</ul>`,
    },
    {
      id: 'files', title: 'Files and folders',
      html: `
<p>In your scene folder knobOx keeps its own files in a folder <code>knobOx</code>, one subfolder per device:</p>
<pre>your scene folder/
  Scenes/                  your .oxie16 scenes (like the OXI App)
  knobOx/
    E16/
      navigation.json      your navigation templates
      pages/               the Page library, one file per entry</pre>
<p>These are plain files: you can back them up, sync them between computers or share them with friends. Without a scene folder, templates and Page library entries are kept in the browser and move into the folder once you open one.</p>`,
    },
    {
      id: 'tips', title: 'Tips for the E16',
      html: `
<h3>Bipolar knobs (pan, filter)</h3>
<p>With Display "Bipolar" the E16 shows 0 in the middle between Min and Max. For a parameter that is centered at CC 64, keep <b>Min + Max = 128</b>, e.g. 20 and 108. Then the display shows 0, the knob is in the middle of its travel and the parameter is centered. Set <b>Default 64</b> and a Push "Set to Default" to jump back to the center.</p>
<h3>Values sent when a scene is loaded</h3>
<p>If the scene sends its values on load ("Transmit on scene entry" on the E16), it sends every active encoder of every Page, also unused ones. Set encoders you do not need to Off, then they send nothing. The values sent are the ones stored in the preset, so store the start values you want there.</p>
<h3>Duplicates</h3>
<p>Two encoders on the same CC and channel control the same parameter. The CC overview shows them in orange, and Distribute CCs with "Remap used" renumbers a whole range cleanly.</p>`,
    },
    {
      id: 'trouble', title: 'Troubleshooting',
      html: `
<h3>Old version after an update</h3>
<p>The browser caches knobOx. It checks for a newer version on start and offers a reload. If something still looks old: <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd> (Mac: <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd>).</p>
<h3>"No E16 found"</h3>
<ul>
  <li>Use Chrome, Chromium, Edge or Brave, and allow MIDI access when the browser asks.</li>
  <li>Close the OXI App and other music software that may hold the E16's MIDI port, then try again.</li>
  <li>Linux with a Flatpak browser: the sandbox hides USB-MIDI devices. knobOx shows the command that fixes this.</li>
</ul>
<h3>Scene folder missing or empty</h3>
<ul>
  <li>Firefox and Safari cannot open folders. In Brave the feature has to be enabled first; knobOx shows how.</li>
  <li>Linux with a Flatpak browser: give the browser access to the folder; knobOx shows the command.</li>
</ul>
<h3>Sending to the E16 fails on Linux</h3>
<p>The default MIDI buffer on Linux is too small for the last part of a scene (the script block). Scenes without a script still arrive; knobOx checks this and reports it. For scenes with a script, enlarge the buffer in a terminal and reload knobOx:</p>
<pre>sudo sh -c 'echo 32768 > /sys/module/snd_seq_midi/parameters/output_buffer_size'</pre>
<p>To keep the setting after a reboot:</p>
<pre>echo 'options snd-seq-midi output_buffer_size=32768' | sudo tee /etc/modprobe.d/snd-seq-midi.conf</pre>`,
    },
    {
      id: 'format', title: 'About and file format',
      html: `
<p>knobOx is an unofficial hobby project, not affiliated with OXI Instruments. The file format and the USB protocol were worked out by comparing files and recording the OXI App's USB traffic. Use it at your own risk and keep backups of your scenes.</p>
<ul>
  <li><b>Structure:</b> scene → 12 Pages → 16 encoders → Dest 1, Dest 2 and Push.</li>
  <li><b>Verified:</b> types, outputs, channels (Page channel 1–16, encoder channel 0 = Page), accel mode, display, colors 0–99.</li>
  <li><b>Not verified:</b> Push behavior "Press + Release", the raw navigation options, instrument and parameter.</li>
  <li>Unknown fields and values are always saved unchanged. An untouched file is saved byte for byte as it was.</li>
</ul>
<p>Source code, protocol description and bug reports: <a href="https://github.com/knobOx/knobOx" target="_blank" rel="noopener">github.com/knobOx/knobOx</a>.</p>`,
    },
  ];

  root.E16Help = { sections };
})(window);
