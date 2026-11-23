# インストール・更新

[한국어](../ko/installation.md) · [English](../en/installation.md) · [简体中文](../zh-CN/installation.md) · **日本語**

[ガイド目次](../ja.md)

## この文書の目次

- [インストール](#guide-installation)
- [設定の確認](#guide-verify-setup)
- [Windows PowerShell](#guide-windows-powershell)
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

`set default` を実行するとホストが登録され、Decisions API に送る情報の範囲を選べます。API キーは入力中に表示されず、OS の資格情報ストアに保存されます。設定後にホストを再起動してください。Codex では `/hooks` を開き、新しい Hook を承認してください。

インストールスクリプトは、すでにあるホストディレクトリに MCP と Hook を登録します。ディレクトリがない場合は、`aptly setup --client all` で登録してください。

`CODEX_HOME` や `CLAUDE_CONFIG_DIR` を使う場合は、インストールと設定の両方で同じ値を指定してください。Aptly は既存の設定と実行ラッパーを維持します。詳しくは[アカウントホーム・キー設定](configuration.md)を参照してください。

<a id="guide-verify-setup"></a>

## 設定の確認

次のコマンドで、選択したホストの設定計画とキー登録の準備状態を確認してください。Claude Code の場合は `codex` を `claude` に変更してください。Windows PowerShell では `aptly.cmd` を使用してください。

```sh
aptly setup --check --client codex
aptly set env OPENAI_API_KEY --client codex --check
```

どちらのコマンドもファイルを変更しません。`setup --check` は通常の設定計画をその時点で確認するもので、実行中のホストは検証しません。キーの `--check` は登録と Linux の保存先の準備状態を確認しますが、キーの読み取り・保存や API 認証の検証は行いません。終了コード `0` は確認でエラーがなかったことを示し、`1` は部分的な失敗またはコマンドエラーを示します。JSON 出力のホストごとの `status` と `codes` を確認してください。

設定後はホストと MCP を再起動し、Codex では `/hooks` で Hook を確認・信頼してください。[推薦と Hook の引数変更](routing.md#guide-automatic-routing)は別の観測であり、どちらも子エージェントの実行や完了を証明しません。実行と完了はホストで別途確認してください。[トラブルシューティング](troubleshooting.md)も参照してください。

<a id="guide-windows-powershell"></a>

## Windows PowerShell

サインイン済みの Windows デスクトップで PowerShell を開き、次のコマンドを実行してください。この例では `npm.cmd` と `aptly.cmd` を直接実行します。`--ignore-scripts` でインストール中の自動登録を省くため、`set default` で登録してください。

```powershell
npm.cmd install -g aptly@latest --ignore-scripts
aptly.cmd --version
aptly.cmd set default --client codex
aptly.cmd set env OPENAI_API_KEY --client codex
```

Claude Code を設定する場合は、二つの設定コマンドの `codex` を `claude` に置き換えてください。ホストを再起動してください。Codex では `/hooks` を開き、新しい Aptly Hook を承認してください。

`--prefix` でインストール先を指定した場合は、更新時も同じ場所を指定してください。PowerShell で `aptly.cmd` が見つからない場合は、その場所にある `aptly.cmd` をフルパスで実行してください。

API キーは Windows の資格情報マネージャーに保存されます。SSH で資格情報ストアを利用できない場合は、サインイン済みのデスクトップでキーを登録してください。ホストに MCP が表示されても、キーを読み込めたことや Decisions API が応答したことを意味するわけではありません。キーの登録に失敗した場合は[資格情報のトラブルシューティング](troubleshooting.md#guide-launcher-recovery)を参照してください。

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
