# GitHub公開手順

このプロジェクトはGitHub PagesでWebアプリを公開できます。

## 公開されるもの

- Webアプリ
- 手順書
- 回路/配線資料
- ESP32ファームウェアコード
- 解析サーバーコード

## GitHub Pagesで動くもの

- Manual Editor
- YouTube Tone Match画面
- PC Chrome/EdgeからのWeb Bluetooth接続
- ESP32-S3へのプリセット送信

## PCローカルで起動が必要なもの

YouTube音色コピーの解析サーバーはGitHub Pages上では動きません。
PCで以下を起動して使います。

```powershell
.\scripts\run-server.ps1
```

WebアプリはGitHub Pagesから開き、解析だけPCの `http://localhost:8787` を使う構成です。

## GitHub Actions

`.github/workflows/deploy-web.yml` を追加済みです。
`main` または `master` にpushすると、`web/` をビルドしてGitHub Pagesへ公開します。
