# KiCad Project Notes

Open `mefx_s3.kicad_pro` in KiCad 8 or newer and create the schematic around these sheets:

- `power`: 9 V protection, 5 V, 3.3 V, virtual ground.
- `analog_input`: jack, TL072 preamp, ADC input filter.
- `codec_digital`: PCM1808, PCM5102A, ESP32-S3 I2S wiring.
- `analog_output`: DAC output filter, TL072 buffer, output jack.
- `controls`: footswitch and optional LEDs.

The Markdown hardware documents are the source of truth until the KiCad schematic symbols are fully
placed and checked.
