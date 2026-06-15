# MEFX-S3 Hardware System Design

## Audio Topology

```text
6.35 mm INPUT
  -> TL072 high impedance preamp / 4.5 V biased buffer
  -> PCM1808 ADC left channel
  -> ESP32-S3 I2S DSP
  -> PCM5102A DAC
  -> TL072 output buffer
  -> 6.35 mm OUTPUT
```

PCM1808 right channel is reserved for the internal monitoring microphone. The microphone path is not
used as the main instrument signal; it is used for low-rate app telemetry and calibration checks.

## Power

- Input: 9 V center-negative pedal supply.
- Protection: series Schottky or ideal-diode reverse protection, fuse/polyfuse, TVS diode.
- Analog rail: filtered 9 V for TL072.
- Digital rails: buck or low-noise regulator to 5 V, then 3.3 V for ESP32-S3, PCM1808 logic, and control.
- Virtual ground: 4.5 V rail for TL072 single-supply bias. Buffer the divider with one TL072 channel or
  a rail-splitter IC. Decouple heavily near the op amp.

## Clocking and Digital Audio

- v1 sample rate target: 48 kHz.
- PCM1808 provides ADC data to ESP32-S3 over I2S.
- ESP32-S3 outputs processed mono data to PCM5102A over I2S.
- Keep BCLK/LRCLK traces short and away from the guitar input node.

## Controls

- Central footswitch on GPIO0 with internal pull-up.
- Short press: reapply/cycle active preset behavior.
- Long press > 800 ms: toggle bypass and store state.

## Mechanical Notes

- Put analog input, TL072 preamp, and virtual ground away from ESP32 antenna and switching regulators.
- Use star grounding between input jack sleeve, output jack sleeve, analog ground, and digital return.
- Keep enclosure tied to sleeve/chassis ground at one point.
