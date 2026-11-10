# knobOx

**knobOx** is an unofficial, browser-based editor for **OXI E16** scene files (`.oxie16`) that can also transfer scenes to and from the device over USB-MIDI. It runs entirely in the browser: no build step, no server-side code, nothing is uploaded anywhere.

## Why this exists

Hi! I own an OXI E16 and an OXI One MK2, and right now the E16 is the one that matters for this. Here's what bugged me:

1. **There's no OXI App for Linux.** I run Linux at home, and honestly I avoid Windows like the plague, at least in my private setup. 😄 knobOx runs in the browser and talks to the E16 directly over USB.
2. **It's hard to see what's assigned and what isn't.** In the OXI App you can easily assign the same CC twice by accident without noticing.
3. **Endless clicking.** By default, push encoders have no CCs assigned at all, so you end up setting everything by hand, one click at a time.

So knobOx focuses on overview and speed:

- **Duplicate detection** is my favorite part: a CC overview for all 16 channels, duplicate assignments highlighted, a list of free CCs per channel, and one click to jump to the encoder in question.
- **Bulk editing:** distribute CCs across a selection, a page or a page range in one go (optionally skipping CCs that are already taken), set up all push encoders as CCs at once, name encoders by pattern, apply colors and gradients.
- Workflow-wise I took some inspiration from the Faderfox EC4 web editor.

It's a hobby project, shared in a community spirit. It works for me, but it isn't polished software, so take it as it is. Ideas, bug reports and pull requests are very welcome.

**Made with AI assistance:** knobOx was built together with Claude (Anthropic) as a coding assistant, from the reverse engineering of the USB protocol to the code and these docs. Claude is credited as co-author in the commits. The transfer code is checked against USB captures from my own E16 (see the tests), but keep the AI part in mind when you read the code.

**Scripts:** I haven't really looked into the E16's Lua scripting yet. Scenes with scripts are transferred as they are, but there is no script editing. That might come later, or feel free to code it in yourself!

> [!WARNING]
> **Use at your own risk.** This project is not affiliated with, endorsed by or supported by OXI Instruments. The device protocol was reverse-engineered (see below) and may change with any firmware or app update. Sending data to your E16 overwrites the selected scene slot. Back up your scenes with the official OXI App first. The software is provided "as is", without warranty of any kind; the authors cannot be held responsible for lost data, damaged devices or any other consequences of using it.

## Getting started

**Online:** just open **<https://gabrielkoehl.github.io/knobOx/>** in **Chrome, Chromium, Edge or Brave**. Nothing to install, and your files never leave your computer.

**Locally:** Web MIDI and folder access need a secure context, so serve the repository over `http://localhost` instead of opening `index.html` as a file:

```bash
python3 -m http.server 8716
```

Then open <http://localhost:8716>.

Notes:

- Firefox and Safari can't open local folders (no File System Access API). In Brave, enable it under `brave://flags/#file-system-access-api`. The editor shows these hints itself.
- Close the OXI App while the editor talks to the E16. On Windows, only one program can use the MIDI port at a time.
- On Linux the E16 works as a class-compliant USB-MIDI device via ALSA, no drivers or udev rules needed.

## Features

### Library (like the OXI App's scene manager)

- **On computer:** choose a scene folder once; the browser remembers it. If the folder has a `Scenes` subfolder (the OXI App's storage layout), that subfolder is used, so you can point the editor at the same folder as the OXI App.
- **On device:** connect the E16 and list all 16 slots with name, color and script.
- Drag a file onto a slot to send it, or a slot onto the file list to save it. Each row also has buttons for **Edit**, **Save** and **Send current**.
- Scenes opened from the folder are saved back to the same file (**Save**, Ctrl+S); other scenes are downloaded.

### Editor

- 4×4 grid per page with name, color, Dest 1, Dest 2 and Push; changed encoders are highlighted.
- Encoder editor with all fields, type-dependent labels and CC usage per channel.
- Bulk editing for a selection, a page or a page range, row- or column-wise: distribute CCs (optionally skipping used ones), set up Push as CC, set any field, name by pattern (`{n}`, `{cc}`, `{e}`, `{p}`), fixed colors or gradients, copy and swap pages.
- Copy/paste encoders (Ctrl+C/V), drag to swap, Alt+drag to copy.
- CC overview: 16 channels × 128 CCs, duplicates highlighted, detail view with jump to encoder and a list of free CCs.
- Scene settings, 16×16 icon editor, raw values of all other fields.
- Undo/redo (Ctrl+Z/Y); the session is kept in the browser.
- Unknown fields are shown and written back unchanged; untouched files are saved byte-identically.

### Device transfer

- Upload and download produce exactly the same bytes as the OXI App, including scenes with Lua scripts.
- **Send to E16** dialog with slot selection, or **Save as .syx** for sending without a browser, e.g. on Linux:

  ```bash
  amidi -l
  amidi -p hw:1,0,0 -s scene_slot1.syx -i 100
  ```

  `amidi` does not wait for the device's acknowledgements; the interval (`-i`, in ms) gives the E16 time to process each message.

## How the data was obtained

Nothing in this repository is taken from OXI's source code or firmware.

- **File format:** comparing `.oxie16` files exported by the OXI App, a calibration scene with a distinct value in every field, and screenshots of how the OXI App displays those values. Further field meanings come from the community project [brentvatne/oxi-e16-config](https://github.com/brentvatne/oxi-e16-config).
- **USB protocol:** passive USB captures (Wireshark + USBPcap on Windows) while the OXI App uploaded, listed and downloaded scenes on the user's own device. The checksum algorithm was identified by testing common CRC variants against the captures; a symbol name visible in the app binary (`HalCRC`) pointed to the STM32 hardware CRC.
- **Verification:** the encoder reproduces the captured uploads and decodes the captured downloads byte for byte. `test/index.html` runs these checks in the browser (serve the repository and open `/test/`).

The full protocol description is in [docs/PROTOCOL.md](docs/PROTOCOL.md).

## File format

JSON: scene → `pages[12]` → `encoders[16]` → `turn_actions[2]` (Dest 1, Dest 2) and `push_action`.

| Field | Meaning | Source |
|---|---|---|
| `turn_actions[].type` | 0 Off, 1 CC Rel1, 2 CC Rel2, 3 CC Abs, 4 CC14, 5 PC, 6 PB, 7 AT, 8 Note, 9 NRPN, 10 Snapshot, 11 Script | 0/3 verified in the app, 1–10 community docs, 11 seen in community scenes |
| `push_action.type` | 0 Off, 1 Note, 2 CC, 3 PC, 4 Set to Default, 5 AT, 6 Page, 7 Record, 8 Play/Pause Rec, 12 Script | 0/2/6 verified, 1–8 community docs, 12 seen in community scenes |
| `push_action.mode` | 0 Press only, 1 Press + Release, 2 Toggle | 0 and 2 verified, 1 assumed |
| `nr1` | CC number / note / PC number; LSB for NRPN | community docs |
| `nr2` | MSB for NRPN, LSB for CC14, target page (0-based) for Page, 0 for CC | community docs |
| `lower` / `upper` | Min/Max (turn), press/release value (push), navigation options (Page) | |
| `defaultValue` | Default (anchor) value, turn actions only | |
| `channel` (action) | 0 = page channel, 1–16 = MIDI channel | verified |
| `channel` (page) | MIDI channel 1–16 | verified |
| `output` (page) | 0 ALL, 1 TRS1, 2 TRS2, 3 USB1, 4 USB2, 5 USB3, 6 BLE, 13 ALL −BLE, 14 ALL −USB | 0–6 verified, 13/14 community docs |
| `output` (action) | as page, plus 12 and 15 = Page; 7 and 8 are rejected by the app | verified except 13/14 |
| `mode` (turn) | Accel mode: 0 Div8, 1 Div4, 2 Div2, 3–7 Acc0–Acc4, 8 LSp2, 9 LSp4, 10 LSp6, 14 Scene | 3/14 verified, rest community docs |
| `display` (turn) | 0 Off, 1 127, 2 100, 3 1000, 4 B63, 5 B50, 6 B500, 7 On/Off, 8 9999, 10 Standard, 11 High Res | 10 verified, rest community docs |
| `acceleration` (scene) | same numbering as accel mode (5 = Acc2) | verified |
| `instrument`, `parameter` | raw values | unknown encoding |
| `color` | palette 0–99, 10×10 row by row as in the app's color picker | sampled from the app |
| `icon` | 32 bytes, 16 rows of 2 bytes, MSB = leftmost pixel | verified |
| `code.code` | minified Lua script that is sent to the device (max. 8191 bytes) | verified |

## Repository layout

```
index.html          app shell
src/model.js        enums, field descriptors, editing operations
src/app.js          UI
src/sysex.js        SysEx encoder/decoder and Web MIDI transfer
src/library.js      local scene folder (File System Access API)
docs/PROTOCOL.md    USB-MIDI protocol description
test/               browser test page and capture fixtures
```

## License

[MIT](LICENSE): do whatever you like with it. It comes without any warranty, and nobody involved is liable for anything that happens when you use it.

## Authors

- Gabriel Köhl ([@gabrielkoehl](https://github.com/gabrielkoehl))
- Claude (Anthropic), AI coding assistant, co-author

## Thanks

Big kudos to **Brent Vatne** and [brentvatne/oxi-e16-config](https://github.com/brentvatne/oxi-e16-config) (MIT). The types, accel modes, display values, outputs and NRPN byte order documented there resolved most of the open questions in this editor.

OXI, OXI E16 and OXI App are trademarks of OXI Instruments. They are used here only to describe compatibility.
