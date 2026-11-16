【旧版04の履歴 / 新規・再発注には使用不可】
==========================================

資料上の最新製造データは07です。最初に同じフォルダの README.txt を確認してください。
最新ファイルは 07_order_package/ の以下3点です（このファイルからの相対パス）。
- 07_order_package/UPLOAD_THIS_GERBER_07.zip
- 07_order_package/UPLOAD_THIS_BOM_07.csv
- 07_order_package/UPLOAD_THIS_CPL_07.csv
- 07_order_package/これをJLCPCBに送る.txt: 注文設定・向きの確認事項

基板と部品は到着済みです。今は表向き・直配線で1枚を机上確認し、ケースは後回しにします。
旧04/05/06を発注に使わないでください。07も実装プレビューで向きの確認が必要です。

以下は2026-06-19時点の04版記録を変更せず保存したものです。
以下の「正式」「発注に使う」「だけを使用」等は旧版当時の説明で、現在の指示ではありません。
旧04の検証値やケース寸法を、現行07や実機の確認結果として扱わないでください。

----- ここから旧04版の履歴 -----

MEFX-S3 rev04 正式データ
========================

発注に使うファイル
------------------
docs/pcb-assembly/04_order_package/UPLOAD_THIS_GERBER_04.zip
docs/pcb-assembly/04_order_package/UPLOAD_THIS_BOM_04.csv
docs/pcb-assembly/04_order_package/UPLOAD_THIS_CPL_04.csv

ケース
------
docs/pcb-assembly/04_order_package/case_3d_print/mefx_case_bottom_jlc3dp.stl
docs/pcb-assembly/04_order_package/case_3d_print/mefx_case_lid_jlc3dp.stl

設計元
------
docs/kicad/mefx_s3.kicad_pro
docs/kicad/mefx_s3.kicad_sch
docs/kicad/mefx_s3.kicad_pcb

検証結果（2026-06-19）
----------------------
- PCB DRC: 0 violations / 0 unconnected pads
- Schematic ERC: 0 errors / 0 warnings
- PCBと回路図: 39ネット、167接続が完全一致
- SMT: PCB 59点 = BOM 59点 = CPL 59点
- LCSC: 22品種を詳細APIで照合
- 基板外形: 150 x 90 mm、2層、1.6 mm、最小配線0.25 mm、最小穴0.30 mm
- ケース固定穴: 4点一致

重要
----
- rev02、rev03、draftのデータは発注に使用しない。
- JLCPCBへは上記3つのUPLOAD_THISファイルだけを使用する。
- PCBA部品配置画面でU1、U2、U4、D1の向きを最終目視確認する。
- ケースは踏み込み強度を実物で確認するまで寸法確認用試作として扱う。
