MEFX-S3 JLCPCB/JLC3DP 注文データ 04
======================================

JLCPCBへアップロード
1. UPLOAD_THIS_GERBER_04.zip をPCB見積ページへアップロードする。
2. PCB Assemblyを有効にし、UPLOAD_THIS_BOM_04.csv とUPLOAD_THIS_CPL_04.csvを指定する。
3. 部品照合画面で全SMT部品が一致することを確認する。

JLC3DPへアップロード
- case_3d_print/mefx_case_bottom_jlc3dp.stl
- case_3d_print/mefx_case_lid_jlc3dp.stl
上下を別部品として各1個注文する。

推奨の安価設定
- PCB: 2層、FR-4、1.6mm、1oz銅、HASL lead free、緑、5枚
- PCBA: Top side、Economic、5枚すべて実装、JLCPCB parts、Tooling holesはJLC側追加可
- ケース: 初回寸法確認はSLA Standard Resin。踏み込み試験後はMJF PA12を推奨。

注文画面で確定した主要部品
- 10uF: C9807 / Samsung CL31A106KAHNNNE / 25V X5R 1206
- 100nF: C49678 / YAGEO CC0805KRX7R9BB104 / 50V X7R 0805
- PCBA数量を変更した直後は、2を選んでから目的の数量へ戻し、部品数量が0でないことを確認する。

発注前条件
- drc_report_04.txt が違反0、未配線0であること。
- 注文画面の部品向きプレビューでU1/U_CODEC/U_LDO/D1を目視確認する。
- 初回はケースと基板を各最小数量にし、実物合わせ後に量産する。
