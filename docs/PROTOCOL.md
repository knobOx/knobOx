# OXI E16 scene transfer over USB-MIDI SysEx

Unofficial description, reverse-engineered from passive USB captures (Wireshark + USBPcap) of OXI App 2.1.0 on Windows talking to an E16. It may be incomplete and may change with firmware or app updates. Use at your own risk.

The reference implementation is [src/sysex.js](../src/sysex.js). It reproduces the captured uploads and decodes the captured downloads byte for byte; [test/index.html](../test/index.html) checks this against the fixtures in [test/fixtures/](../test/fixtures/).

## Transport

- The E16 enumerates as a USB-MIDI device with three port pairs. Scene transfer uses the first one ("OXI E16", not "MIDIIN2/MIDIOUT2 (OXI E16)"), cable 0.
- Everything is SysEx. The host sends one message and waits for the reply before sending the next one.

## Message frame

```
F0 00 21 5B 02 01 <dir> <cmd> <slot> <idx> <7-bit packed payload> F7
```

| Byte(s) | Meaning |
|---|---|
| `00 21 5B` | OXI manufacturer ID |
| `02 01` | constant (product / protocol) |
| `dir` | `08` = data from host or device, ACK from device; `07` = request from host |
| `cmd` | `00` scene header, `01` page, `04` script |
| `slot` | scene slot **0–15** (the OXI App shows 1–16) |
| `idx` | page index 0–11 for `cmd 01`, otherwise 0 |

### 7-bit packing

Each group of up to 7 data bytes is preceded by one byte that holds their top bits: bit *j* of that byte is bit 7 of data byte *j*. The data bytes are sent with bit 7 cleared. The last group may be shorter.

### Checksum

STM32 hardware CRC: polynomial `0x04C11DB7`, initial value `0xFFFFFFFF`, no reflection, no final XOR, computed over the body read as **little-endian 32-bit words** (zero-padded to a multiple of 4). The result is stored big-endian. The OXI App calls this `HalCRC`.

## Upload (host → device)

For every block the host sends a `dir 08` message. The unpacked payload is:

```
u32 BE   8 + bodyLen
u8       0x14
u16 BE   bodyLen
u8       0x00
...      body
u32 BE   CRC of body
```

The device answers every message with the ACK `F0 00 21 5B 02 01 08 53 F7`. A full upload is: header (`cmd 00`), 12 pages (`cmd 01`, `idx` 0–11), script (`cmd 04`). It takes about 0.6 s.

| cmd | Body size | Wire size |
|---|---|---|
| `00` header | 80 bytes | 117 bytes |
| `01` page | 976 bytes | 1141 bytes |
| `04` script | 8192 bytes | 9387 bytes |

## Download (device → host)

The host sends a request with `dir 07`; its payload is a packed 32-bit zero (`00 00 00 00 00`):

```
F0 00 21 5B 02 01 07 <cmd> <slot> <idx> 00 00 00 00 00 F7
```

The device replies with a `dir 08` message for the same `cmd/slot/idx`. Its unpacked payload is the upload payload **without** the leading u32 length:

```
u8 0x14 | u16 BE bodyLen | u8 0x00 | body | u32 BE CRC
```

- **Slot list:** the OXI App requests the header (`cmd 00`) of slots 0–15 and shows their titles. Empty slots report default titles such as "S. 4".
- **Download:** header, then pages 0–11. The OXI App did not request the script block for a scene without a script; the editor requests it only when the header contains a script name.
- After a download the OXI App also sent `F0 00 21 5B 02 01 07 52 F7`. Its meaning is unknown; the editor does not send it.

## Body layouts

Multi-byte values are **big-endian**. Strings are Latin-1, zero-padded, not necessarily zero-terminated.

### Scene header (80 bytes)

| Offset | Size | Field |
|---|---|---|
| 0 | 16 | `title` |
| 16 | 32 | `icon` |
| 48 | 1 | `color` |
| 49 | 1 | `transmitMode` |
| 50 | 1 | `pcOnEntry` |
| 51 | 2 | `bankOnEntry` |
| 53 | 1 | `recentPage` |
| 54 | 1 | `recentPreset` |
| 55 | 1 | `transmitOnSceneEntry` |
| 56 | 1 | `transmitOnPageSwitch` |
| 57 | 1 | `transmitOnPresetLoad` |
| 58 | 1 | `smartTransmit` |
| 59 | 1 | `outputOnEntry` |
| 60 | 1 | `holdMode` |
| 61 | 1 | `acceleration` |
| 62 | 18 | `code.scriptName` |

`selectedPreset` is not transferred (the OXI App writes 0 after a download).

### Page (976 bytes)

| Offset | Size | Field |
|---|---|---|
| 0 | 12 | `title` |
| 12 | 1 | `output` |
| 13 | 1 | `channel` |
| 14 | 2 | 0 |
| 16 | 16 × 60 | encoders |

### Encoder (60 bytes)

| Offset | Size | Field |
|---|---|---|
| 0 | 8 | `name` |
| 8 | 4 | `abbr` |
| 12 | 1 | `color` |
| 13 | 14 | `push_action` |
| 27 | 16 | `turn_actions[0]` |
| 43 | 16 | `turn_actions[1]` |
| 59 | 1 | `color2` |

Older files (e.g. from the community project) have a `bipolar` field instead of `color2`; how it maps to this byte is unknown, and the editor sends 0.

### Action

`instrument`, `parameter`, `type`, `display`, `mode`, `channel` (1 byte each), `lower` (2), `upper` (2), **turn actions only:** `defaultValue` (2), then `nr1`, `nr2`, `output`, `scriptId` (1 byte each). Push actions are 14 bytes, turn actions 16 bytes.

### Script (8192 bytes)

The `code.code` field of the scene file (the minified Lua script, UTF-8), zero-padded. Scenes without a script send 8192 zero bytes. `code.fullScript` (the unminified source) stays on the computer and is not transferred.

## Open questions

- Meaning of `07 52`, error replies of the device (e.g. on CRC mismatch), behaviour with other firmware versions.
- Mapping of the legacy `bipolar` field.
- Other transfer types of the OXI App (instruments, scripts library, firmware) were not examined. Firmware updates are deliberately out of scope.
