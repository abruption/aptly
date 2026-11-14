# インストール・更新

[한국어](../ko/installation.md) · [English](../en/installation.md) · [简体中文](../zh-CN/installation.md) · [日本語](../ja/installation.md)

[ガイド目次](../ja.md)

## この文書の目次

- [インストール](#guide-installation)
- [npm インストールスクリプトの許可](#guide-npm-install-scripts)
- [パッケージの更新](#guide-package-updates)
- [新しいバージョンの通知](#guide-version-notifications)
- [コマンドヘルプ（0.1.8 以降）](#guide-command-help)
- [スキップ・削除](#guide-skip-and-remove)

<a id="guide-installation"></a>

## インストール

Node.js 24 以上、Claude Code または Codex、OpenAI API キーが必要です。

```sh
npm install -g aptly@latest --allow-scripts=aptly
aptly set default
aptly set env OPENAI_API_KEY
aptly --version
```

`set default` はホストを登録し、Decisions API に送る情報の範囲を尋ねます。キーは非表示入力で OS の資格情報ストアに保存します。ホストを再起動し、Codex の `/hooks` で新しい Hook を承認してください。

インストールスクリプトは既存のホストディレクトリに MCP・Hook を登録します。ディレクトリがない場合は `aptly setup --client all` で登録してください。`CODEX_HOME`・`CLAUDE_CONFIG_DIR` を使うアカウントでは、インストール・設定にも同じ環境を渡す必要があります。既存の設定と実行ラッパーは保持します。[アカウントホーム・キー設定](configuration.md)を参照してください。

<a id="guide-npm-install-scripts"></a>

## npm インストールスクリプトの許可

`--allow-scripts=aptly` はそのインストールの `postinstall` のみを許可し、npm 全体の設定は変更しません（npm 11.19.1 で確認）。オプションに対応していない場合や自動登録を望まない場合は、次を実行してください。

```sh
npm install -g aptly@latest --ignore-scripts
aptly setup --client all
```

インストールの成功や `npm warn install-scripts` だけで Hook の登録を判断しないでください。npm のバージョン・ポリシーによってスクリプトが省略される場合があります。[npm の案内](https://docs.npmjs.com/cli/v11/commands/npm-rebuild/#allow-scripts)

インストールスクリプトは送信の同意を取得しません。その後、対話形式の `aptly setup`、`aptly set default` または `aptly set transmission --review` で[送信範囲](transmission.md)を選んでください。

<a id="guide-package-updates"></a>

## パッケージの更新

関連するホスト・MCP・CLI を停止し、検証済みのグローバル npm インストールで実行してください。

```sh
aptly update
aptly setup --client all
aptly --version
```

`update` は同じ npm prefix に最新バージョンをインストールし、設定・キーを保持します。インストールスクリプトは実行しません。設定後にホストを再起動してください。npm エラーやローカル・ソースインストールでは、上記の手動インストールコマンドを使ってください。`dry-run=true` の npm 設定は拒否します。

stable ランチャーの保存コピーはグローバルパッケージとは別です。[明示的な移行](configuration.md#guide-stable-launcher)で更新してください。以前の Node パスが失われた場合は[起動パスの復旧](troubleshooting.md#guide-launcher-recovery)に従ってください。

<details>
<summary>0.1.2 より前の台帳からのアップグレード</summary>

同じ台帳を使う旧バージョンのホスト・MCP・CLI writer をすべて停止してください。新しい永続ロックは旧 writer と併用できません。以前の空のロックは[台帳ロックの移行](troubleshooting.md#guide-ledger-lock-recovery)に従ってオフラインで隔離し、JSON 台帳・unknown・費用・完了キャッシュは保持してください。

</details>

<a id="guide-version-notifications"></a>

## 新しいバージョンの通知

対話形式の CLI は最新バージョンを確認し、stderr に通知します。自動更新はしません。MCP・Hook・パイプ・CI では確認しません。公開 npm バージョン情報のみを取得し、タスク・キー・設定は送信しません。結果を 24 時間キャッシュし、エラーで元のコマンドが失敗することはありません。無効にするには実行環境に `APTLY_NO_UPDATE_NOTIFIER=1` を設定してください（`set env` の対象ではありません）。

<a id="guide-command-help"></a>

## コマンドヘルプ

```sh
aptly --help
aptly setup -h
aptly set env OPENAI_API_KEY --help
aptly help catalog refresh
```

`--help`・`-h`・`aptly help <コマンドパス>` は使い方のみを表示し、設定・キーの参照や API 呼び出しを行いません。不正なオプションや値の欠落はエラーです。

<a id="guide-skip-and-remove"></a>

## スキップ・削除

```sh
APTLY_SKIP_SETUP=1 npm install -g aptly@latest
aptly setup --client codex --mode defaults
aptly remove --client all
```

`CI`・`--ignore-scripts` でも自動登録をスキップします。`remove` は変更されていない Aptly 所有の項目のみを削除し、ユーザーの変更は保持します。`partial` の場合はホスト別のエラーを確認してください。モードを変更するには削除後、希望する `--mode` で登録してください。`advisory` も送信範囲が許可すればタスク情報を送信します。

[設定](configuration.md) · [トラブルシューティング](troubleshooting.md) · [ガイド目次](../ja.md)
