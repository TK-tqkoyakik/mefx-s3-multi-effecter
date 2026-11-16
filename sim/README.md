# MEFX-S3 SPICE simulation files

このフォルダは、本体回路v2のアナログ部分を確認するためのSPICEファイルです。

## ファイル

| ファイル | 内容 |
| --- | --- |
| `mefx_input_preamp_v2.cir` | 入力ジャック、AC結合、TL072 A側ゲイン2、ADC前RC |
| `mefx_output_direct_v2.cir` | PCM5102A直接出力、出力100Ω、出力プルダウン、アンプ入力負荷 |
| `mefx_vbias_v2.cir` | TLE2426がない場合の10k/10k仮想GNDの簡易確認 |

## 開き方

### ngspice

```powershell
ngspice sim\mefx_input_preamp_v2.cir
ngspice sim\mefx_output_direct_v2.cir
ngspice sim\mefx_vbias_v2.cir
```

### LTspice

1. LTspiceを起動します。
2. `File > Open` で `.cir` ファイルを開きます。
3. `.ac` または `.tran` を実行します。

## 注意

- TL072は理想オペアンプ相当の簡易モデルです。実機の入力/出力スイング限界やノイズまでは正確に出ません。
- ADC/DAC/I2Sのデジタル動作はこのSPICEでは確認しません。
- 目的は、音声経路の低域カット、ゲイン、RCフィルタのだいたいの挙動確認です。
