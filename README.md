# マルチエフェクター製作プロジェクト

ESP32-S3を使った、ギター/ベース両対応のマルチエフェクター試作 v1 です。

## MEFX-S3 Desktopとは

MEFX-S3 Desktopは、Windowsで動く専用アプリです。実装済みの機能と、実機での確認が必要な項目を分けて開発しています。

このアプリでやりたいことは、かんたんに言うと次の6つです。

1. ESP32-S3のマルチエフェクターにつなぐ
2. ギター/ベース用の音色プリセットを作る
3. YouTubeの音を参考にして、近い音色を自動で考える
4. 作ったプリセットをアプリ内に保存する
5. PCに入れた音を、アプリ上でエフェクトをかけて試す
6. 音声ファイルをWAVへ変換したり、音声ファイルへエフェクトを書き出したりする

できるだけ外部の有料APIは使わず、PCの中で処理する方針です。

- OpenAI APIは使いません
- YouTube公式APIは使いません
- クラウド解析APIは使いません
- ffmpeg、Python、Demucsなどをアプリに同梱して、ローカルで解析します

YouTube音声の取得には通信が必要ですが、取得後の音源分離・解析はPC内で処理します。

## Windowsアプリ版の現在地

デスクトップアプリ版は `apps/desktop/` にあります。

今できている主な機能:

- Dashboard
- Manual Editor
- Tone Match
- Audio FX
- Audio Files
- Library
- Settings
- 日本語/英語の切り替え
- アプリ内プリセット保存
- シミュレーター
- ローカル解析サーバー内蔵
- ffmpeg/ffprobe同梱
- Python同梱
- yt-dlp/Demucs/PyTorch/Torchaudio同梱
- Demucsモデルキャッシュ同梱
- IR Library/WAV IR管理
- Audio FXでIRあり/なしの比較
- 音声ファイルのWAV変換
- 音声ファイルへのプリセットエフェクト書き出し
- 軽量トーン `deviceTone` の生成・PC側プレビュー（ESP32 v1には送信しない）
- Electron Web Bluetoothからの実機接続入口
- Windowsインストーラー生成

Audio FXでは、PCの入力音をアプリに入れて、プリセットの値で音を変えるモードを作っています。

Audio Filesでは、手元の音声ファイルを選んで、WAVへ変換したり、今のプリセットの音作りをファイルへ書き出したりできます。たとえば、録音済みのギター音やベース音にエフェクトをかけたWAVを作れます。

アプリ側の仕上げ確認は [Phase 40 仕上げ確認](docs/app/05_Phase40_仕上げ確認.md) にまとめています。

YouTube解析は仮サーバーだけの段階ではなく、yt-dlpで音声を取得し、Demucsで分離する処理を実装済みです。ギターは `other` ステム（ギター以外の楽器も含む）、ベースは `bass` ステムを解析します。Demucsが未準備・失敗の場合は、中高域/低域のフィルターによる簡易抽出へ切り替えます。完全なギター単独分離や原音色の再現を保証するものではありません。

ESP32 v1へ送る音作りの値は基本6エフェクトです。WAV IRや `deviceTone` はPC専用で、BLE送信には含めません。仕様は [BLE契約](shared/ble-contract.md) を参照してください。

基板と手はんだ用部品は到着済みです。現行の音声回路はCS4270構成で、PCM1808/PCM5102Aの別モジュール構成ではありません。まず1枚を部品面を上にして直配線で机上確認し、ケースへの組み込みは後回しにします。接続方法は [直配線接続表16](docs/hardware/16_直配線接続表.txt) と [R-78の向きと直配線図17](docs/hardware/17_R78向きと直配線図.txt) を優先し、4本足端子台は使いません。作業全体の流れは [初回実装手順14](docs/hardware/14_届いた部品_初回実装手順.txt) を参照してください。

ESP32開発ボード単体の書き込み・起動には [過去の確認記録](docs/firmware/01_ESP32-S3ファームウェア実機確認.txt) がありますが、CS4270とアナログ回路を含む音出し、BLE経由の一連の実機操作は未確認です。ローカルの自動検証とは区別します。

### 配布物と現在ソースの区別

既存の `output/desktop/01_別PC配布/MEFX-S3 Desktop Setup 0.1.0.exe` と [0.1.1](output/desktop/02_別PC配布/) は過去版です。現行0.1.2の個人試験用ZIPは [03_別PC配布](output/desktop/03_別PC配布/) にあります。NSIS生成に加えて、今回の展開版EXEの起動も、このPCのアプリケーション制御ポリシーで拒否されました。一般配布対応・別PC動作確認は未完了です。Windowsの保護設定を無効化せず、署名と全同梱物の確認を進める必要があります。

0.1.1では設定画面にプリセット・IR WAV・設定のバックアップ/復元、破損時の前回正常データへの復旧を追加しました。Tone Matchは進行段階・中止・抽出方式（Demucs、簡易フィルター、音源未解析のデモ）を表示します。実装・検証と追加作業は [実機なし改善記録08](docs/app/08_実機なし改善と追加調査.txt) にまとめています。

0.1.2では本体JSON検証、BLE接続先の明示許可、音声ファイル処理の中止、Python全依存・モデルのハッシュ固定、署名監査を追加しました。[接続と配布の安定化09](docs/app/09_接続と配布安定化.txt) に成功したテストと未確認項目を記録しています。本体向けビルドは成功していますが、COMポートが見つからないため書込・実BLE通信・実際の音出しは未試験です。

## GitHubでWindowsインストーラーを作る方法

GitHub Actions用のworkflowはローカルに用意されています。ただし、このワークスペースでは `apps/desktop/` と `.github/workflows/build-desktop-installer.yml` などがGit未追跡で、今回のローカル変更はActionsへ未反映です。ローカルにファイルがあることを、GitHub上で実行・成功した証拠にはしません。

以下は、対象ソースとworkflowがGitHubへ反映された後の手順です。本作業ではcommit/push/ブランチ作成は行いません。

使うworkflow:

```text
.github/workflows/build-desktop-installer.yml
```

手動で作る手順:

1. GitHubでこのリポジトリを開く
2. 上のメニューから `Actions` を開く
3. `Build Desktop Installer` を選ぶ
4. `Run workflow` を押す
5. `skip_demucs_warmup` は普通は `false` のままでよい
6. ビルドが終わるまで待つ
7. できあがった `mefx-s3-desktop-windows-installer` をダウンロードする

このインストーラーには、YouTube解析と音声ファイル変換で使う `ffmpeg` も同梱する前提です。GitHub Actionsでは、インストーラーを作る前に、ffmpegで短いテスト音をWAV変換できるか確認します。

未署名のテスト用インストーラーは、署名用ツールを使わない `package:installer:unsigned` で作ります。正式にコード署名する場合だけ、通常の `package:installer` を使います。

`skip_demucs_warmup` の意味:

- `false`: 高精度解析用のDemucsモデルも準備する。時間はかかるが、本番に近い
- `true`: モデル準備を飛ばす。テストビルドは速いが、初回解析で追加準備が必要になる可能性がある

今のworkflowは手動実行だけです。

理由は、まだアプリ調整中で、毎回自動で配布物を作る段階ではないためです。

配布するときは、開発用リポジトリとは別に、ダウンロードできる人を制限した配布用リポジトリを作る予定です。

注意:

- 初回ビルドはPython、Demucs、PyTorch、モデルを準備するので時間がかかります
- 完成物は大きめです。今の全部入り方針では展開後に約2GB前後を想定しています
- まだ正式なコード署名はしていません。Windowsの設定によっては警告やブロックが出る場合があります
- 署名つきの正式配布は、後のPhaseで整える予定です
- インストーラーはインストール先を選べる形式です

## まず見るファイル

到着済み基板の組立・机上確認:

まず見る画像資料: [基板とESP32の画像配線ガイド18](docs/hardware/18_基板とESP32_画像配線ガイド.html)。実物写真の目印、穴とGPIOの対応、3Dのソケット取り付け図をオフラインで表示します。現物のはんだ・導通・電圧の確認とは区別します。

今回の外付け配線: [外付け端子の配線図19](docs/hardware/19_外付け端子の配線図.html)。ESP32のみソケットへ挿し、楽器INPUT・アンプOUTPUT・DC電源・R-78・押しボタン・任意のマイクを線で接続する全体図と拡大図です。外付け端子の現物配置は導通確認が必要です。

1. [JLCPCB START HERE](JLCPCB_START_HERE.html)
2. [製造データの現行案内](docs/pcb-assembly/README.txt)
3. [基板表向き・ケース後回し手順](docs/hardware/10_基板表向き_ケース後回し手順.txt)
4. [届いた部品からの初回実装手順](docs/hardware/14_届いた部品_初回実装手順.txt)
5. [直配線接続表](docs/hardware/16_直配線接続表.txt)
6. [R-78の向きと直配線図](docs/hardware/17_R78向きと直配線図.txt)

最新製造データ07（再確認用。旧04/05/06は発注不可）:

- [07の注文設定・向き確認](docs/pcb-assembly/07_order_package/これをJLCPCBに送る.txt)
- [Gerber ZIP 07](docs/pcb-assembly/07_order_package/UPLOAD_THIS_GERBER_07.zip)
- [BOM CSV 07](docs/pcb-assembly/07_order_package/UPLOAD_THIS_BOM_07.csv)
- [CPL CSV 07](docs/pcb-assembly/07_order_package/UPLOAD_THIS_CPL_07.csv)
- [旧04版の履歴（発注不可）](docs/pcb-assembly/04_README.txt)

設計/実装資料:

- [作業手順書](docs/作業手順書.md)
- [必要なもの一覧](docs/必要なもの.md)
- [本体設計 最小構成](docs/hardware/本体設計_最小構成.txt)
- [本体回路図](docs/hardware/本体回路図.html)
- [必要パーツ 最小構成](docs/hardware/必要パーツ_最小構成.txt)
- [回路・基板の最終監査](docs/hardware/04_最終回路監査.txt)
- [KiCad正式プロジェクト](docs/kicad/mefx_s3.kicad_pro)
- [シミュレーションファイル](sim/README.md)
- [ESP32なしで確認する方法](docs/シミュレーター手順.md)
- [PC Bluetooth接続](docs/PC_Bluetooth接続.md)
- [ローカル解析ランチャー](docs/ローカル解析ランチャー.md)
- [セキュリティメモ](docs/セキュリティメモ.md)
- [完成判定チェックリスト](docs/checklists/end-to-end.md)
- [ESP-IDF導入メモ](docs/ESP-IDF導入.md)
- [Phase 40 仕上げ確認](docs/app/05_Phase40_仕上げ確認.md)

## 今できること

- Webアプリを起動できる
- YouTube音声の取得・Demucs分離・特徴量解析を行うローカルサーバーを起動できる
- ESP32が無くても、WebアプリのSimulatorボタンで動作確認できる
- 手動プリセット作成、保存、送信の流れを確認できる
- デスクトップアプリでは、手元の音声ファイルをWAV変換し、現在のプリセットをかけたWAVを書き出せる
- 到着済み部品を使い、基板表向き・直配線の手順で初回実装を進められる
- ケースSTLは参考資料として確認できる（組み込み・追加発注は机上確認後）

## JLCPCBの現在地

- 資料上の最新製造データは `07_order_package` です。基板・部品は到着済みで、現在は初回実装・机上確認の段階です。
- 保存済みの [07 DRC記録](docs/pcb-assembly/07_order_package/DRC_full_connection_recheck_07.txt) は違反0・未配線0、[07 ERC記録](docs/pcb-assembly/07_order_package/ERC_full_connection_recheck_07.txt) はエラー0・警告0です（2026-06-26時点。実機動作の保証ではありません）。
- [07全接続監査サマリー](docs/pcb-assembly/07_order_package/全接続監査サマリー_07.txt) は40ネット・206パッド・BOM内SMT 59点を記録しています。
- 再発注時も07のGerber/BOM/CPLを同一版で使用し、JLCPCBプレビューでU1/U2/U4のPin 1とD1の向きを再確認します。旧04/05/06は使用しません。
- ケースは後回しです。寸法データの検査と、現物の干渉・踏み込み強度の確認は別に扱います。

## すぐ使うコマンド

JLCPCB開始ページを開く:

```powershell
.\scripts\open-jlcpcb-start.ps1
```

環境チェック:

```powershell
.\scripts\check-env.ps1
```

解析サーバー起動:

```powershell
.\scripts\run-server.ps1
```

GitHub Pagesから使うローカル解析サーバーを手動起動:

```powershell
.\scripts\start-local-analyzer.cmd
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
- ESP32-S3向けファームウェアには過去のビルド・書き込み記録があります。今回の現在ソースのビルド結果とは別に扱います。
- ESP32本体が未接続でも、WebアプリのSimulatorで先に画面とデータの流れを確認できます。
- YouTube音色解析の実装と、実音源での分離品質・実機での音色再現の検証は別です。ローカルテストの成功だけで実機完成とは判定しません。
- 配布0.1.0は過去版です。現行0.1.1は02_別PC配布のZIPです。GitHub Actionsへの反映と別PC・実ESP32検証は未完了です。
