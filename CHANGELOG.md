# Changelog

All notable changes to knobOx are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Update check: on start (and when returning to the tab), knobOx compares its cached files with the server's and offers a reload when a newer version is available. Format info and README explain the browser cache and Ctrl+Shift+R.
- Delete a scene file from the scene folder (✕ in the "On computer" list). If the scene is open in the editor, it stays open as unsaved.

### Changed

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

[Unreleased]: https://github.com/knobOx/knobOx/compare/v1.0...HEAD
[1.0]: https://github.com/knobOx/knobOx/releases/tag/v1.0
