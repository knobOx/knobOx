# .oxie16 file format

Unofficial description of the JSON scene files of the OXI App and the E16, as used by knobOx. Unknown fields and values are kept unchanged when knobOx saves a file. The byte layout on the device is described in [PROTOCOL.md](PROTOCOL.md).

JSON: scene → `pages[12]` → `encoders[16]` → `turn_actions[2]` (Dest 1, Dest 2) and `push_action`.

| Field | Meaning | Source |
|---|---|---|
| `turn_actions[].type` | 0 Off, 1 CC Rel1, 2 CC Rel2, 3 CC Abs, 4 CC14, 5 PC, 6 PB, 7 AT, 8 Note, 9 NRPN, 10 Snapshot, 11 Script | 0/3 verified in the app, 1–10 community docs, 11 used with `scriptId` in script scenes |
| `push_action.type` | 0 Off, 1 Note, 2 CC, 3 PC, 4 Set to Default, 5 AT, 6 Navigation, 7 Record, 8 Play/Pause Rec, 12 Script | 0/2/6 verified, 1–8 community docs, 12 used with `scriptId` in script scenes |
| `push_action.mode` | 0 Press only, 1 Press + Release, 2 Toggle | 0 and 2 verified, 1 assumed |
| `nr1` | CC number / note / PC number; LSB for NRPN | community docs |
| `nr2` | MSB for NRPN, LSB for CC14, target page (0-based) for Page; unused for CC, PC, PB and AT (the OXI App leaves old values there, the editor hides the field and keeps the value) | target page verified on the device, rest community docs and own scenes |
| `lower` / `upper` | Min/Max (turn), press/release value (push), navigation options (Page) | |
| `defaultValue` | Default (anchor) value, turn actions only | |
| `channel` (action) | 0 = page channel, 1–16 = MIDI channel | verified |
| `channel` (page) | MIDI channel 1–16 | verified |
| `output` (page) | 0 ALL, 1 TRS1, 2 TRS2, 3 USB1, 4 USB2, 5 USB3, 6 BLE, 13 ALL −BLE, 14 ALL −USB | 0–6 verified, 13/14 community docs |
| `output` (action) | as page, plus 12 and 15 = Page; 7 and 8 are rejected by the app | verified except 13/14 |
| `mode` (turn) | Accel mode: 0 Div8, 1 Div4, 2 Div2, 3–7 Acc0–Acc4, 8 LSp2, 9 LSp4, 10 LSp6, 14 Scene | 3/14 verified, rest community docs |
| `display` (turn) | 0 Off, 1 127, 2 100, 3 1000, 4 Bipolar, 8 9999, 10 Standard, 11 High Res, 12 Always On | verified on the device |
| `acceleration` (scene) | same numbering as accel mode (5 = Acc2) | verified |
| `instrument`, `parameter` | raw values | unknown encoding |
| `color` | palette 0–99, 10×10 row by row as in the app's color picker | sampled from the app |
| `icon` | 32 bytes, 16 rows of 2 bytes, MSB = leftmost pixel | verified |
| `code.code` | minified Lua script that is sent to the device (max. 8191 bytes) | verified |
