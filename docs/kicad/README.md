# KiCad 正式設計 04

KiCad 10以降で `mefx_s3.kicad_pro` を開いてください。

- `mefx_s3.kicad_sch`: 正式回路図。ERCエラー0、警告0。
- `mefx_s3.kicad_pcb`: 正式2層基板。DRC違反0、未配線0。
- `MEFX.pretty`: この設計で使うローカルフットプリント。
- `fp-lib-table`: ローカルフットプリントライブラリ設定。

JLCPCBへ送るデータはKiCadフォルダから直接選ばず、
`docs/pcb-assembly/04_order_package` の `UPLOAD_THIS_..._04` 3ファイルを使用します。
