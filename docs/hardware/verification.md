# Verification Checklist

## Power Before ICs

- Confirm 9 V input polarity and protection output.
- Confirm 5 V and 3.3 V rails without ESP32 installed.
- Confirm virtual ground is stable near 4.5 V.
- Check no rail-to-ground short before powering codecs.

## Audio Bring-Up

- Feed 100 mVpp 1 kHz sine into input.
- Confirm TL072 preamp output is biased around 4.5 V and not clipping.
- Confirm PCM1808 receives BCLK/LRCLK.
- Confirm DAC output is present before output buffer.
- Confirm output jack has no DC offset after AC coupling.

## Firmware

- Flash firmware and confirm boot log.
- Send a manual preset from Web/PWA.
- Power cycle and confirm the preset remains active.
- Short press footswitch and confirm active preset event.
- Long press footswitch and confirm bypass toggles.

## End-to-End

- Guitar and bass both produce clean bypass sound.
- Effect values at 0, 50, and 100 are stable and do not hard clip under normal input.
- App receives telemetry level changes when instrument and mic signals change.
