# Changelog

All notable changes to knobOx are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [1.3.0] - 2026-11-12

### Added

- The version number is shown in the top bar after "E16 scene editor".
- Built-in help: the ? button in the top bar opens an overlay with an index on the left and the text on the right. It explains the whole app for musicians without GitHub: getting started, Library, editor, Encoder / Bulk edit / Pages tabs, CC overview, Scene tab, files and folders, tips for the E16 (bipolar knobs, values sent on scene load), troubleshooting and the file format. Esc or a click outside closes it. On phones the index becomes a bar above the text.
- Library "On computer": a clone button next to each file copies it under a new name in the scene folder. The name suggested is `<name>_clone` and can be changed; an existing file is never overwritten. The scene inside, including its title, stays unchanged.
- "Page library" (Pages tab): saves the current Page or a Page range under a name and inserts it into any scene from a chosen Page, to copy Pages between scenes. Navigation push targets move by the same distance as the Pages. With a scene folder open, each entry is a file in `knobOx/E16/pages/` (file name without spaces); without a folder, entries are kept in the browser and moved to the folder once one is opened.

### Changed

- The "Format info" button is replaced by the help button (?); its content is the help section "About and file format".
- README shortened to the basics; the details are in the built-in help. The outdated screenshots are removed, the field table of the file format moved to `docs/FORMAT.md`.
- Bulk edit scope "Page range" → "Encoders: Chosen positions" shows a 4×4 checkbox matrix laid out like the encoder grid, with All, None and "From grid selection". The positions no longer depend on the selection in the grid; switching to "Chosen positions" starts from it once.
- Bulk edit "Distribute CCs" fills several targets in one go: Dest 1, Dest 2 and Push are checkboxes. "Sequence" sets the order: Page by page (on each Page Dest 1, then Dest 2, then Push), target by target (Dest 1 on all Pages first) or encoder by encoder (E1 Dest 1, Dest 2, Push, then E2). "Set channel" is "Page" by default, so the CCs follow the Page channel. Navigation and other push functions keep their function and use no CC number. A Push switched from Off to CC with P.Val and R.Val 0 gets P.Val 127. Start CC 0 shows a note that CC 0 is Bank Select.
- "Distribute CCs" counts per Page channel: every Page channel starts at the start CC, Pages on the same channel continue each other. Pages on different channels therefore each get the full CC range. Actions with their own channel count with the channel of their Page. The preview shows the channel of every Page.
- "Distribute CCs" option "Remap used": renumbers every CC action in use in the scope (Dest 1, Dest 2 and Push) from the start CC in the chosen sequence, without gaps. Their old numbers are dropped and do not block anything. Off and Navigation stay as they are. CC actions left without a CC because the CCs ran out are switched Off, so no old number stays behind as a duplicate; the preview shows how many. While it is on, the targets and "Activate Off" are greyed out.
- "Distribute CCs": "Skip used" is on by default, so a run never reuses a CC that another action on the same channel already has (e.g. Dest 1 CC 31 and Push CC 31 after two runs with the same start). The preview warns when a CC would end up on two actions of the same channel.
- "Distribute CCs" shows a preview of the current settings before applying them: a summary (number of CCs, targets, encoders per Page) and one cell per Page, laid out like the E16 Page selector, with the CCs that Page gets. If the CCs run out, it names the first Page, encoder and target without a CC.
- New side panel tab "Pages" next to Encoder and Bulk edit, with its own scope (current Page or Page range). It holds the page-level actions Page library, Navigation and Copy / swap Page, which moved there from Bulk edit.
- Own navigation templates are stored in `knobOx/E16/navigation.json` in the scene folder. A `knobox-navigation.json` in the folder root (v1.2.0) is taken over when the new file does not exist yet.

### Fixed

- "Distribute CCs": a target that gets no CC because the CCs ran out stays exactly as it was. Before, "Activate Off" and "Set channel" still changed it, so Off targets turned into CC 0.

## [1.2.0] - 2026-11-11

### Added

- Bulk edit "Navigation": writes Navigation pushes from a template to the current Page or a Page range, with targets relative to each Page. Built-in template "Row 1–4": encoder 1 ← previous Page, 2 ↑ four Pages back, 3 ↓ four Pages ahead, 4 → next Page, matching the 4×3 Page selector and wrapping around the scene's 12 Pages (P1 ← = P12). "Save Page as template" stores the Navigation pushes of the current Page under a name; own templates are kept in the browser and in `knobox-navigation.json` in the scene folder.
- Bulk edit scope "Page range": "Encoders" chooses all 16 or only the positions selected in the grid, applied to the same positions on every Page of the range (e.g. encoders 5–16 while 1–4 hold the navigation).
- Bulk edit "Color" with a Page range: "Gradient per Page" (on by default) runs the gradient from start to end on every Page; off, one gradient spans all Pages.
- Bulk edit "Assign names" with a Page range: "{n} per Page" restarts the running number on every Page.

### Changed

- Push type 6 is called "Navigation", as in the OXI App (was "Page").

### Fixed

- Display (encoder editor and bulk edit "Set field") offers the values of the E16 menu: Off, Standard, 127, 100, 1000, Bipolar, 9999, High Res, Always On. Bipolar is value 4, Always On is value 12. The values B50, B500 and On/Off (5, 6, 7) are not offered by the device and were removed; a scene that still contains one of them shows it as "(unknown)" and keeps it.
- Bulk edit "Set field" no longer offers `nr2` (Dest 1, Dest 2 and Push).

## [1.1.2] - 2026-11-11

### Added

- Theme switch in the top bar: Auto (follows the system setting), Dark or Light. The choice is remembered in the browser.

### Changed

- New look modeled on the OXI App's scene editor: neutral gray surfaces without borders, centered values in input fields, the active Page and the selected encoder are shown inverted, tabs with a short underline, encoders as knobs with a colored LED ring and a matching color stripe on a device-style panel.
- Pages view layout: the Page selector, page settings and encoder grid share one column of limited width; the Encoder / Bulk edit panel sits next to it from the top of the Page selector down. Below a window width of about 1140 px the panel moves under the encoders. "Nav on swap" moved into the line under the Page selector, next to the drag hint. All / None sit under the encoder grid next to Copy / Paste. The editor content is centered on wide screens.
- Top bar: Library, Open, Save to computer, Save as, Save to E16, Close, Undo, Redo and Format info are icon buttons with their label as tooltip; the theme switch shows Auto / Dark / Light as icons. The bar uses the same centered width as the editor: brand left, actions in the middle, theme switch, Format info and GitHub link on the right. The Library button is highlighted while the library is shown.
- Bulk edit "Set up Push as CC": "Sequential" is the default source. Start CC is the lowest CC free on the channels in scope ("First free" restores this after typing a number). "Skip used CCs" (on by default) skips CCs already used outside the scope on the channel the Push sends on. "Activate Off targets" is off by default.
- Library: the row buttons Edit, Save, Send current and Delete are icons (pencil, download, upload, trash); the text is shown as a tooltip.
- "Connect E16" on a page without a secure context (e.g. opened via http://0.0.0.0 or a LAN address) shows a message explaining that Web MIDI needs http://localhost, http://127.0.0.1 or https.

### Removed

- The "Settings" button and dialog. Its only content, the note on Page and destination channels, is part of Format info.

## [1.1.1] - 2026-11-10

### Added

- Paste with a filter: checkboxes next to Paste choose which parts are pasted (Name, Abbr, Color, Dest 1, Dest 2, Push). The other parts of the target encoders stay as they are, e.g. to give cutoff encoders for different devices the same color. All checked pastes the whole encoder as before.
- "Save as …" (Ctrl+Shift+S): save the scene under a new file name, into the scene folder or through the browser's save dialog.
- Drag and drop for Pages: drag a Page onto another to swap them, Alt+drag (or Ctrl+drag) to copy it including name, channel and output.

### Changed

- Overwriting always asks first: "Save to computer" asks before writing back to the open file, and the send dialog asks before overwriting the chosen E16 slot. "Save to E16 …" always opens the send dialog; for a scene read from the E16 its own slot is preselected. After connecting, the send dialog reads the slot names from the E16 and shows them in the slot list, and its "Scene name" field renames the scene before sending (undoable).
- Color input (encoder, bulk edit, scene): enter the palette number (0–99) directly or pick it from a 10×10 palette that opens from the swatch. Replaces the slider.
- Encoder / Bulk edit panel: it starts level with the encoder grid, and the Encoder and Bulk edit tabs stay at the top of the panel while it scrolls. Its sections work as an accordion: clicking a section title opens it and closes the one open before, with a short transition. General and Scope stay open. The open section is remembered in the browser.
- Bulk edit "Set up Push as CC": "Activate Off targets" as in Distribute CCs (on by default). Unchecked, Off pushes get their CC number and values but stay Off.
- Bulk edit "Set up Push as CC": a hint under Offset / Start CC explains the result with an example (e.g. "Push CC = Dest 1 CC + 16, e.g. Dest 1 CC 3 → Push CC 19") and updates while typing.
- Bulk edit "Set field": fields show the same names as the encoder editor (Accel Mode, Behavior, P.Val, …), and fields with known values (Type, Channel, Output, Accel Mode, Display, Behavior) are chosen from a dropdown instead of a number. Color uses the color input.
- Swapping Pages (drag and drop or bulk edit): "Nav on swap" (next to the page settings and in bulk edit) sets what happens to Page navigation pushes. "Move with page" (default) swaps them with the rest of the page; pushes that lead to one of the two swapped pages get its new number. "Stay in place" pins them with their target to their page position: a push arriving at a pinned position is overwritten, a Nav push arriving at a free position is turned off. The message after the swap lists what was kept, overwritten, turned off or renumbered. The editor stays on the page that was moved.

### Removed

- "Reset names" and "All white" next to the page settings. Both remain in bulk edit (scope "Current Page" covers the whole page).
- The `color2` field in the encoder editor and in bulk edit. The byte is still read from and written back to the device unchanged.

## [1.0.1] - 2026-11-10

### Added

- "Reset names" (back to E1 … E16 by position) and "All white" (palette color 34) for the whole page (next to the page settings) and in bulk edit for the chosen scope.
- Update check: on start (and when returning to the tab), knobOx compares its cached files with the server's and offers a reload when a newer version is available. Format info and README explain the browser cache and Ctrl+Shift+R.
- Delete a scene file from the scene folder (✕ in the "On computer" list). If the scene is open in the editor, it stays open as unsaved.

### Fixed

- Sending to the E16 on Linux: the 9 KB script block never got a reply because the ALSA sequencer's 4 KB MIDI output buffer drops the rest of it. The error now explains how to enlarge the buffer (README has the commands).
- After such a failed block the E16 kept waiting for its end and swallowed the first message of the next transfer, so a following upload could look successful but store broken data. knobOx now ends the broken block right after the timeout.
- Sending to the E16: the wait for the device's reply grows with the message size (about 5 s for the 8 KB script block instead of 3 s), and the error names the block size and wait time.
- If only the script block gets no reply, knobOx reads the scene back from the slot. When settings and pages match and the scene has no script, the upload counts as done with a note instead of an error. The header's last-page and last-preset fields are left out of the comparison, since the device may update them itself. Checked on a real E16.
- Paste no longer lands on encoder 1 when nothing is selected (e.g. after switching pages); it asks for a target instead. With several encoders selected, a single copied encoder fills all of them, and a different count is pasted starting at the encoder clicked last instead of the lowest one.

### Changed

- Push "Page": the target page (`nr2`) is verified on the device, the list no longer marks it with "(?)".
- The encoder editor hides `nr2` for types that don't use it (CC, PC, PB, AT and Off); the stored value is kept.
- After a browser restart, the library shows the remembered scene folder with a button to open it again, and explains the browser's one-time access prompt.

## [1.0] - 2026-11-10

First public release.

### Editor

- Open, edit and save OXI E16 scene files (`.oxie16`). Untouched files are saved byte-identically; unknown fields are kept.
- 4×4 grid per page with name, color, Dest 1, Dest 2 and Push; changed encoders are highlighted.
- Encoder editor with all fields, type-dependent labels and CC usage per channel.
- Bulk editing for a selection, a page or a page range: distribute CCs (optionally skipping used ones), set up Push as CC, set any field, name by pattern, fixed colors or gradients, copy and swap pages. Page navigation and other push functions are kept by default.
- Copy/paste encoders, drag to swap, Alt+drag to copy.
- CC overview for 16 channels × 128 CCs with duplicates highlighted, channel detail with jump to the encoder and a list of free CCs.
- Scene settings, 16×16 icon editor, raw values of all other fields.
- Undo/redo; the session is kept in the browser.

### Library and device transfer

- Scene folder via the File System Access API, compatible with the OXI App's storage layout.
- List, read and write the 16 slots of a connected E16 over USB-MIDI (Web MIDI SysEx); uploads are byte-identical to the OXI App.
- Drag and drop between scene folder and device slots; Save to computer, Save to E16 and Close, with a bar that shows where the open scene comes from.
- Delete a scene from the E16 (the slot is overwritten with the factory-empty scene), optionally saving it first.
- Scenes whose Lua script cannot be read back from the E16 are loaded without the script and cannot be sent back, so the script on the device is never erased by accident.
- Export as `.syx` for sending without a browser (e.g. with `amidi`).

### Documentation

- README with motivation, getting started, Linux/Flatpak hints, file format table and screenshots.
- USB-MIDI protocol description in `docs/PROTOCOL.md`, browser test page with capture fixtures.
- GitHub link in the app header.

[Unreleased]: https://github.com/knobOx/knobOx/compare/v1.3.0...HEAD
[1.3.0]: https://github.com/knobOx/knobOx/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/knobOx/knobOx/compare/v1.1.2...v1.2.0
[1.1.2]: https://github.com/knobOx/knobOx/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/knobOx/knobOx/compare/v1.0.1...v1.1.1
[1.0.1]: https://github.com/knobOx/knobOx/compare/v1.0...v1.0.1
[1.0]: https://github.com/knobOx/knobOx/releases/tag/v1.0
