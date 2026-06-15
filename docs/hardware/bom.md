# Bill of Materials v1

| Qty | Part | Purpose | Notes |
| ---: | --- | --- | --- |
| 1 | ESP32-S3 module/dev board | Control, BLE, DSP | Prefer PSRAM board for future features |
| 1 | PCM1808 ADC | 24-bit stereo audio input | Left instrument, right mic |
| 1 | PCM5102A DAC | Audio output | Common I2S DAC module acceptable for v1 |
| 1 | TL072 | Input preamp/output buffer | Use socket for prototype if through-hole |
| 2 | 6.35 mm mono jack | Instrument input/output | Isolated jacks recommended |
| 1 | 9 V DC jack | Pedal power input | Center-negative wiring |
| 1 | Momentary footswitch | Preset/bypass control | Normally open |
| 1 | Small electret or MEMS mic module | Output monitoring | Needs preamp or module output level |
| 1 | 5 V regulator | Digital/codec rail | Low-noise buck or LDO after protection |
| 1 | 3.3 V regulator | ESP32 and logic | 500 mA or higher recommended |
| 1 | Schottky diode or ideal diode | Reverse polarity protection | Size for full current |
| 1 | TVS diode | Surge protection | 9 V rail clamp |
| 2 | 1 MOhm resistor | Input impedance/bias | Metal film |
| 10+ | 100 nF capacitor | Local decoupling | One near each IC power pin |
| 6+ | 10 uF capacitor | Rail bulk decoupling | Low ESR where appropriate |
| assorted | resistors/capacitors | Filters, gain, AC coupling | Final values set in KiCad schematic |
