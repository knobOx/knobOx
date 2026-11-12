# <img src="assets/icon.svg" alt="" width="40" align="top"> knobOx

**knobOx** is an unofficial, browser-based editor for **OXI E16** scenes (`.oxie16`). It also sends scenes to the E16 and reads them back over USB. Everything runs in your browser: nothing to install, nothing is uploaded anywhere.

**Open it here: <https://knobox.github.io/knobOx/>** (Chrome, Chromium, Edge or Brave)

The built-in help (**?** button in the top bar) explains the whole app.

## Why

- There is no OXI App for Linux. knobOx runs in any Chromium-based browser and talks to the E16 directly.
- In the OXI App it is easy to assign the same CC twice without noticing. knobOx shows every CC of every channel and highlights duplicates.
- Lots of clicking. knobOx edits many encoders, pages and scenes at once.

## What it does

- **Library:** your scene folder and the 16 slots of the E16 side by side. Open, save, send, clone and delete scenes, also by drag and drop.
- **Editor:** all encoder settings (Dest 1, Dest 2, Push), page names, channels and outputs, scene name, color and icon.
- **Bulk edit:** distribute CCs over encoders and pages in one go (with a preview, counted per page channel, duplicates avoided), set up pushes as CC buttons, set any field, name and color many encoders at once.
- **Pages:** copy pages between scenes with the page library, write navigation pushes from templates, copy and swap pages.
- **CC overview:** 16 channels × 128 CCs, duplicates highlighted, free CCs listed.
- **Device transfer:** byte-identical to the OXI App. Scenes with Lua scripts are sent unchanged.
- Undo/redo, and unknown fields are always saved unchanged.

> [!WARNING]
> **Use at your own risk.** knobOx is not affiliated with OXI Instruments. The protocol was reverse-engineered and may change with a firmware or app update. Sending a scene overwrites the chosen slot on the E16, so keep backups of your scenes. knobOx only writes scene data, never firmware. If your E16 ever gets stuck: switch it off, hold encoders 15 and 16, press Shift to enter bootloader mode and reinstall the firmware with the OXI App (see OXI's [E16 SDK](https://github.com/OXI-Instruments/E16-SDK)).

## Running it locally

Web MIDI and folder access need `http://localhost`, not a `file://` URL:

```bash
python3 -m http.server 8716
```

Then open <http://localhost:8716>.

## Linux notes

- **Sending scenes:** the default ALSA MIDI buffer (4 KB) is too small for the script block at the end of every upload. Scenes without a script still arrive (knobOx reads them back to check). For scenes with a script, enlarge the buffer and reload knobOx:

  ```bash
  sudo sh -c 'echo 32768 > /sys/module/snd_seq_midi/parameters/output_buffer_size'
  echo 'options snd-seq-midi output_buffer_size=32768' | sudo tee /etc/modprobe.d/snd-seq-midi.conf
  ```

  The second line keeps the setting after a reboot.
- **Flatpak browsers** (Brave or Chromium from Flathub) don't see the E16 and only a few folders. Allow both, then restart the browser:

  ```bash
  flatpak override --user --filesystem=/run/udev:ro com.brave.Browser
  flatpak override --user --filesystem=~/path/to/scenes com.brave.Browser
  ```

knobOx shows these hints itself when it detects the problem.

## How it was made

Nothing here is taken from OXI's code or firmware. The file format was worked out by comparing files from the OXI App, the USB protocol from recordings of the OXI App talking to the E16. The checks in `test/` reproduce those recordings byte for byte. Details: [docs/PROTOCOL.md](docs/PROTOCOL.md) and [docs/FORMAT.md](docs/FORMAT.md).

knobOx was built together with Claude (Anthropic) as a coding assistant, credited as co-author in the commits.

It's a hobby project. Ideas, bug reports and pull requests are welcome, for example reading Lua scripts back from the E16, script editing or support for more OXI devices.

## Repository layout

```
index.html          app shell
src/app.js          UI
src/model.js        scene model and editing operations
src/sysex.js        SysEx transfer over Web MIDI
src/library.js      scene folder (File System Access API)
src/help.js         built-in help
docs/               protocol and file format
test/               browser tests with USB capture fixtures
CHANGELOG.md        release notes
```

## License

[MIT](LICENSE), without any warranty.

## Authors

- Gabriel Köhl ([@gabrielkoehl](https://github.com/gabrielkoehl))
- Claude (Anthropic), AI coding assistant, co-author

## Thanks

Big kudos to **Brent Vatne** and [brentvatne/oxi-e16-config](https://github.com/brentvatne/oxi-e16-config) (MIT), whose documentation of types, accel modes, display values and outputs answered most of the open questions.

OXI, OXI E16 and OXI App are trademarks of OXI Instruments, used here only to describe compatibility.
