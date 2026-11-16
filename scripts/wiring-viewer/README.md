# ESP32 Wiring Guide

This is a separate, offline assembly guide. It does not change the PCB or firmware.

1. Run `npm ci --ignore-scripts` in this directory (Node.js and npm required).
2. Run `node build.mjs`.
3. From the repository root, run KiCad 10's Python with
   `scripts/build-esp32-wiring-guide.py --photo <user-board-photo.png>`.
4. Open `docs/hardware/18_基板とESP32_画像配線ガイド.html`.
5. Run `node scripts/wiring-viewer/verify.cjs` from the repository root.

The checker uses the bundled Codex runtime's Playwright and Sharp by default.
Override `PLAYWRIGHT_MODULE` and `SHARP_MODULE` with absolute module paths on other systems.
The builder checks the PCB, the 07 pad audit, and current firmware GPIO definitions.
It also verifies that the ESP32's 3V3 header is unconnected on the carrier board.

The photo remains unchanged. Labels are SVG overlays. The simplified Three.js model
uses actual PCB pad coordinates, but is not a measured mechanical/collision model.
Generated screenshots are documentation, not evidence of working physical hardware.

## External wired connections (guide 19)

Only the ESP32 plugs into the PCB. External parts use wires, including the R-78.
After regenerating the geometry above, run from the repository root:

```
node scripts/wiring-viewer/external-guide.cjs
node scripts/wiring-viewer/verify-external.cjs
```

This validates connector nets, measurement points and PCB hash, generates eleven
SVG/PNG diagrams, and checks that each wire's two ends remain readable at desktop
and mobile sizes. Guide 19 includes pre-power short checks and DC measurement guidance.
R-78 orientation follows the RECOM datasheet's page 4. Physical jack lug
positions and electrical operation still require continuity/bench checks.
