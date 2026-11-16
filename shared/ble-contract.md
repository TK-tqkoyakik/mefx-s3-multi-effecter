# BLE Contract

Device name: `MEFX-S3`

Primary service UUID: `7d8f0000-8b7d-4c2a-9a61-7e39f5d20100`

| Characteristic | UUID | Direction | Format |
| --- | --- | --- | --- |
| PresetWrite | `7d8f0001-8b7d-4c2a-9a61-7e39f5d20100` | App -> device | UTF-8 JSON preset |
| PresetList | `7d8f0002-8b7d-4c2a-9a61-7e39f5d20100` | Device -> app | Compatibility read: first 4 summaries |
| PresetReadDelete | `7d8f0003-8b7d-4c2a-9a61-7e39f5d20100` | Bidirectional | Command JSON |
| DeviceStatus | `7d8f0004-8b7d-4c2a-9a61-7e39f5d20100` | Device -> app notify | Status JSON |
| AudioTelemetry | `7d8f0005-8b7d-4c2a-9a61-7e39f5d20100` | Device -> app notify | Telemetry JSON |

## Preset Command

`PresetWrite` sends UTF-8 JSON of at most 480 bytes. The app keeps `ir`, WAV paths, YouTube URLs, notes, and `deviceTone` only on the PC; none of them are sent to firmware v1.

```json
{
  "instrument": "guitar",
  "name": "Crunch 01",
  "effects": {
    "gain": 55,
    "tone_eq": 60,
    "compressor": 30,
    "drive": 45,
    "modulation": 10,
    "delay_reverb": 20
  },
  "bypass": false,
  "createdAt": "2026-06-14T00:00:00.000Z",
  "source": "manual"
}
```

## Device Tone (future extension)

`deviceTone` remains a PC-side preview and a future firmware extension. Firmware v1 does not parse it, so the desktop app does not include it in `PresetWrite`.

| Field | Range | Meaning |
| --- | --- | --- |
| `cabinet` | 0-100 | Cabinet/filter strength derived from the PC IR mix and saturation |
| `presence` | 0-100 | Upper-mid/high emphasis |
| `resonance` | 0-100 | Low-mid body and cabinet resonance |
| `air` | 0-100 | High-frequency openness and short ambience |
| `irMix` | 0-100 | How strongly the app intended the IR contribution |

Firmware v1 changes the sound only from the six fields under `effects`. BLE telemetry remains low-rate status/level data only; no audio streaming is part of this contract.

## Read/Delete Commands

The app obtains the list in pages of at most four entries. `nextOffset` is `null` on the final page.
An escaped legacy name may reduce a page below four entries to keep its JSON response in the 512-byte buffer. Always follow `nextOffset`, not the number of returned items.

Firmware validates JSON structurally with pinned cJSON. It rejects duplicate/unknown keys, missing fields,
wrong types, non-integer/out-of-range effects and slots, trailing content, embedded NUL and excessive nesting.
Preset names are at most 32 UTF-8 bytes; `createdAt` may be empty when the desktop sanitized an invalid date.
Invalid requests never save/delete a preset. Responses escape JSON strings.

The Electron chooser allows only MEFX-S3-named candidates from the trusted local app screen and requires an
explicit user selection, including for a single candidate. Cancel, navigation and scan timeout deny access.
This is PC-side permission, not cryptographic device authentication. Firmware v1 still has no bonded-peer
allowlist, authenticated pairing or MITM protection; do not use it as a secure remote-control channel.

```json
{ "action": "list", "offset": 0 }
```

```json
{
  "items": [
    { "slot": 0, "name": "Crunch 01", "instrument": "guitar", "source": "manual" }
  ],
  "nextOffset": 4
}
```

```json
{ "action": "read", "slot": 0 }
```

```json
{ "action": "delete", "slot": 0 }
```

## Device Status

```json
{
  "connected": true,
  "instrument": "guitar",
  "activeSlot": 0,
  "bypass": false,
  "supplyMv": 9000
}
```

## Audio Telemetry

Telemetry is intentionally low-rate and level/feature based. The app must not expect full-rate audio
streaming over BLE.

```json
{
  "inputLevel": 0.21,
  "preOutputLevel": 0.18,
  "micLevel": 0.16,
  "clip": false
}
```
