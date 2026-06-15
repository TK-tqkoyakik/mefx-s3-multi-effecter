# 完成判定チェックリスト

以下がすべてできたら、試作v1完成です。

## ソフトウェア

- [ ] `.\scripts\check-env.ps1` でNode.js/npmがOKになる
- [ ] `.\scripts\run-server.ps1` で解析サーバーが起動する
- [ ] `http://localhost:8787/health` がOKを返す
- [ ] `.\scripts\run-web.ps1` でWebアプリが起動する
- [ ] Manual Editorでプリセットを作れる
- [ ] YouTube Tone Matchで仮プリセットを作れる
- [ ] SimulatorでESP32なしの送信確認ができる

## ESP32

- [ ] ESP-IDFがインストールされている
- [ ] `.\scripts\build-firmware.ps1` が成功する
- [ ] `.\scripts\flash-firmware.ps1` でESP32-S3へ書き込める
- [ ] ESP32が `MEFX-S3` としてBluetooth広告する
- [ ] Android ChromeからWeb Bluetoothで接続できる
- [ ] `PresetWrite` でプリセットを保存できる
- [ ] 電源を入れ直しても最後のプリセットが残る
- [ ] `DeviceStatus` が通知される
- [ ] `AudioTelemetry` が通知される

## ハードウェア

- [ ] `docs/hardware/配線図を見ながら作る.html` を見ながら配線できる
- [ ] `docs/hardware/実体配線図.md` の各配線番号を追える
- [ ] 9Vが安定している
- [ ] 5Vが安定している
- [ ] 3.3Vが安定している
- [ ] 4.5V仮想GNDが安定している
- [ ] ギター/ベース入力がTL072とPCM1808へ届く
- [ ] マイク入力が楽器入力とは別に反応する
- [ ] PCM5102Aから音声出力が出る
- [ ] フットスイッチ短押し/長押しが動く

## 音の確認

- [ ] ギターで音が出る
- [ ] ベースで音が出る
- [ ] エフェクト値0/50/100で音が破綻しない
- [ ] バイパス音が入力音に近い
- [ ] スマホ未接続でも保存済みプリセットで音が変わる
