# BLE Contract

Device name: `MEFX-S3`

Primary service UUID: `7d8f0000-8b7d-4c2a-9a61-7e39f5d20100`

| Characteristic | UUID | Direction | Format |
| --- | --- | --- | --- |
| PresetWrite | `7d8f0001-8b7d-4c2a-9a61-7e39f5d20100` | App -> device | UTF-8 JSON preset |
| PresetList | `7d8f0002-8b7d-4c2a-9a61-7e39f5d20100` | Device -> app | UTF-8 JSON array summary |
| PresetReadDelete | `7d8f0003-8b7d-4c2a-9a61-7e39f5d20100` | Bidirectional | Command JSON |
| DeviceStatus | `7d8f0004-8b7d-4c2a-9a61-7e39f5d20100` | Device -> app notify | Status JSON |
| AudioTelemetry | `7d8f0005-8b7d-4c2a-9a61-7e39f5d20100` | Device -> app notify | Telemetry JSON |

## Preset Command

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

## Read/Delete Commands

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
