# Wiring Map v1

実際に作る時は、先に以下を見てください。

- `docs/hardware/配線図を見ながら作る.html`
- `docs/hardware/実体配線図.md`
- `docs/hardware/配線表.csv`

| Signal | Source | Destination | Notes |
| --- | --- | --- | --- |
| 9V_IN | DC jack | power protection | Center-negative pedal adapter assumed |
| +9VA | protected 9 V | TL072 VCC | Filter with ferrite/RC before op amp |
| +5V | buck regulator | PCM5102A analog/module rail | Depends on selected breakout/module |
| +3V3 | regulator | ESP32-S3, PCM1808 logic | Keep local 100 nF decoupling |
| VGND_4V5 | buffered divider | TL072 bias network | AC-couple input/output around this node |
| INST_IN | input jack tip | TL072 preamp input | 1 MOhm input impedance target |
| ADC_L | TL072 preamp output | PCM1808 LIN | Instrument channel |
| MIC_IN | electret/MEMS preamp | PCM1808 RIN | Monitoring microphone channel |
| I2S_ADC_BCLK | ESP32 GPIO4 | PCM1808 BCK | Confirm with board pin mux |
| I2S_ADC_WS | ESP32 GPIO5 | PCM1808 LRCK | 48 kHz |
| I2S_ADC_DIN | PCM1808 DOUT | ESP32 GPIO6 | Stereo input |
| I2S_DAC_BCLK | ESP32 GPIO7 | PCM5102A BCK | Confirm with board pin mux |
| I2S_DAC_WS | ESP32 GPIO15 | PCM5102A LRCK | 48 kHz |
| I2S_DAC_DOUT | ESP32 GPIO16 | PCM5102A DIN | Mono duplicated to L/R if needed |
| FOOTSW | momentary switch | ESP32 GPIO0 | Pull-up, switch to GND |
| OUT_BUF | PCM5102A output | TL072 output buffer | AC-couple before output jack |
| INST_OUT | output buffer | output jack tip | Add pulldown to reduce pops |

Pin assignments are firmware defaults and may be moved after ESP32-S3 board selection.
