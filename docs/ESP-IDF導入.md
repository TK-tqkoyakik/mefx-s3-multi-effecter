# ESP-IDF導入メモ

ESP32-S3へファームウェアを書き込むにはESP-IDFが必要です。

## 現在の状態

- ESP-IDF v6.0.1を `C:\Espressif\frameworks\esp-idf-v6.0.1` に導入済みです。
- ESP-IDF用Python環境も `C:\Espressif\python_env\idf6.0_py3.14_env` に作成済みです。
- `.\scripts\check-env.ps1` で `idf.py` を確認済みです。
- `.\scripts\build-firmware.ps1` でESP32-S3向けファームウェアのビルド成功を確認済みです。

## 公式推奨

Espressif公式ドキュメントでは、WindowsではEspressif Installation Manager、略してEIMを使う方法が案内されています。

公式ページ:

```text
https://docs.espressif.com/projects/esp-idf/en/latest/esp32/get-started/windows-setup.html
```

## もう一度GUIで入れ直す場合

1. ESP-IDF Installation Managerを開く
2. `New Installation` を選ぶ
3. `Start Installation` を押す
4. `Easy Installation` を選ぶ
5. `Start Easy Installation` を押す
6. `Ready to Install` が出たら `Start Installation`
7. 完了画面が出るまで待つ

## もう一度CLIで入れ直す場合

EIM CLIが使える場合は以下です。

```powershell
eim install
```

対話式で選ぶ場合:

```powershell
eim wizard
```

## 確認コマンド

PowerShellで以下を実行します。

```powershell
.\scripts\check-env.ps1
```

期待する結果:

```text
[OK] idf.py
```

またはESP-IDFのexport scriptが見つかること。

## その後に実行すること

```powershell
.\scripts\build-firmware.ps1
```

このプロジェクトのフォルダ名には日本語が含まれるため、ESP-IDF/CMakeが文字化けする場合があります。
その対策として、`build-firmware.ps1` は内部で `C:\Espressif\mefx_firmware_build_src` にファームウェアをコピーしてからビルドします。

ESP32を接続したら:

```powershell
.\scripts\flash-firmware.ps1
```

ESP32がまだ接続されていない場合、この書き込みコマンドは実行しなくて大丈夫です。
