# マルチエフェクター製作プロジェクト

ESP32-S3を使った、ギター/ベース両対応のマルチエフェクター試作 v1 です。

## まず見るファイル

1. [作業手順書](docs/作業手順書.md)
2. [必要なもの一覧](docs/必要なもの.md)
3. [配線図を見ながら作る](docs/hardware/配線図を見ながら作る.html)
4. [設計図 見取り図](docs/hardware/設計図_見取り図.html)
5. [実体配線図](docs/hardware/実体配線図.md)
6. [ESP32なしで確認する方法](docs/シミュレーター手順.md)
7. [PC Bluetooth接続](docs/PC_Bluetooth接続.md)
8. [部品購入チェックリスト](docs/checklists/procurement.md)
9. [Amazon購入候補リスト](docs/checklists/amazon-purchase-list.md)
10. [完成判定チェックリスト](docs/checklists/end-to-end.md)
11. [ESP-IDF導入メモ](docs/ESP-IDF導入.md)

## 今できること

- Webアプリを起動できる
- YouTube音色推定の仮サーバーを起動できる
- ESP32が無くても、WebアプリのSimulatorボタンで動作確認できる
- 手動プリセット作成、保存、送信の流れを確認できる

## すぐ使うコマンド

環境チェック:

```powershell
.\scripts\check-env.ps1
```

解析サーバー起動:

```powershell
.\scripts\run-server.ps1
```

Webアプリ起動:

```powershell
.\scripts\run-web.ps1
```

Webアプリのビルド確認:

```powershell
.\scripts\build-web.ps1
```

サーバーテスト:

```powershell
.\scripts\test-server.ps1
```

ESP32ファームウェアビルド:

```powershell
.\scripts\build-firmware.ps1
```

KiCadを開く:

```powershell
.\scripts\open-kicad.ps1
```

## 現在の注意点

- Node.js/npmはこのプロジェクト内の `tools/` にポータブル版をダウンロード済みです。
- ESP-IDFとKiCadはインストール/検出済みです。
- ESP32-S3向けファームウェアはビルド確認済みです。
- ESP32本体が未接続でも、WebアプリのSimulatorで先に画面とデータの流れを確認できます。
- YouTube音色解析は現段階では仮実装です。本物の音源分離は後の工程で追加します。
