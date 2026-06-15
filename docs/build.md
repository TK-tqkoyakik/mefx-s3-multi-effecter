# Build and Run

## Web/PWA

```powershell
.\scripts\run-web.ps1
```

Open `http://localhost:5173` on Android Chrome for Web Bluetooth testing.

## Local Analysis Server

```powershell
.\scripts\run-server.ps1
```

Health check:

```powershell
curl http://localhost:8787/health
```

Tone analysis endpoint:

```powershell
curl -X POST http://localhost:8787/analyze -H "Content-Type: application/json" -d "{\"url\":\"https://youtu.be/example\",\"instrument\":\"guitar\"}"
```

## Firmware

```powershell
.\scripts\build-firmware.ps1
.\scripts\flash-firmware.ps1
```

The firmware now registers the MEFX-S3 NimBLE GATT service for preset write, preset list,
read/delete command response, device status, and audio telemetry.
