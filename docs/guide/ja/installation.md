# インストールと更新

[한국어](../ko/installation.md) · [English](../en/installation.md) · [简体中文](../zh-CN/installation.md) · [日本語](../ja/installation.md)

[ガイド目次](../ja.md)

## このページの目次

- [インストール](#guide-installation)
- [npm インストールスクリプトの許可](#guide-npm-install-scripts)
- [パッケージの更新](#guide-package-updates)
- [新しいバージョンの通知](#guide-version-notifications)
- [コマンドヘルプ（0.1.8 以降）](#guide-command-help)
- [スキップ・削除](#guide-skip-and-remove)

<a id="guide-installation"></a>

## インストール

Node.js 24 以上と Claude Code または Codex が必要です。npm の最新安定版をグローバルにインストールするには、次のコマンドを実行してください:

**既存の永続台帳を 0.1.2 以降に更新する前に**、その台帳にアクセスする可能性があるすべてのホスト、MCP サーバー、単独 CLI、旧版プロセスを停止してください。新しい永続ロックは旧版の書き込み側と併用できません。新規インストールでは旧ロックの隔離は不要です。旧版の空のロックが残る場合は、[台帳の移行手順](troubleshooting.md#guide-ledger-lock-recovery)に従い、確認済みの旧ロックだけをオフラインで隔離し、JSON 台帳、`unknown` 記録、費用、完了済みキャッシュを保持してください。

```sh
npm install -g aptly@latest --allow-scripts=aptly
aptly set default
aptly --version
```

`aptly --version` でインストール済みのバージョンを確認してください。Node.js 環境を切り替えると再インストールが必要な場合があります。

`postinstall` は、現在のユーザーの既存のホスト設定ディレクトリに MCP と `PreToolUse` Hook を登録します。`CODEX_HOME`・`CLAUDE_CONFIG_DIR` を使う場合は、インストールプロセスにも同じ環境を渡してください。まだ存在しないホストディレクトリは自動登録ではスキップし、明示的な `setup` で作成できます。必要なホストだけを登録するには、`--client codex` または `--client claude` を使用してください。

新規登録では `ROUTER_PROVIDER=decisions`、Hook の `defaults` ポリシー、ホストごとの非公開台帳を指定します。他の既存設定・Hook と、既存の Aptly のコマンド・環境・provider・台帳パスは保持します。既存の fixture 設定を自動で有料モードに切り替えることはありません。

<a id="guide-npm-install-scripts"></a>

## npm インストールスクリプトの許可

上記の `--allow-scripts=aptly` は、そのインストールで Aptly の `postinstall` を明示的に許可します。npm 11.19.1 で対応を確認しており、ユーザー全体の npm 許可設定は変更しません。[npm 公式ガイド](https://docs.npmjs.com/cli/v11/commands/npm-rebuild/#allow-scripts)を参照してください。

`npm warn install-scripts ... not yet covered by allowScripts` は、許可ポリシーに未登録であることを示します。npm 11.19.1 では、この警告だけでスクリプトがブロックされたとは判断できません。npm のバージョン・厳格なポリシー・`ignore-scripts` によって挙動が異なり、インストール成功だけでは MCP・Hook の登録成功を確認できません。postinstall の出力は npm によって非表示になる場合があります。

このオプションに未対応の npm を使う場合や、自動登録の代わりに手動設定する場合は、次を実行してください。

```sh
npm install -g aptly@latest --ignore-scripts
aptly setup --client all
```

スクリプトの実行にかかわらず、明示的な `setup` を利用できます。既存の起動パスは保持するため、旧パスのエラーは[実行パスの復旧手順](troubleshooting.md#guide-launcher-recovery)に従ってください。キー設定・MCP の再起動と Codex の `/hooks` 信頼確認は別途必要です。

<a id="guide-package-updates"></a>

## パッケージの更新

`aptly update` は **Aptly 0.1.3 以降で利用できます**。確認済みの npm グローバルインストールが必要で、実行中のパッケージと一致する確認済み prefix に `aptly@latest` をインストールします。ローカルインストール・ソースチェックアウト・確認できないパスは拒否します。 npm の有効な設定が `dry-run=true` の場合は、インストール前に `update_dry_run_enabled` で拒否します。設定を確認できない場合は `update_configuration_unverified` で停止し、試行のみの実行を更新成功とは報告しません。

更新前に、上記の台帳移行手順に従い、台帳を使用する他のホスト・MCP・CLI プロセスを停止してください。インストールスクリプトは実行しないため、更新後に明示的に設定し、ホストを再起動してください。

```sh
aptly update
aptly setup --client all
aptly --version
```

既存の MCP 起動パスやユーザーラッパーは自動移行しません。旧パスが残る場合は[実行パスの復旧手順](troubleshooting.md#guide-launcher-recovery)に従ってください。キー設定と Codex の `/hooks` 信頼確認は別途必要です。npm の認証・ネットワーク・権限エラーが発生した場合は手動インストールの案内を使用してください。更新の自動インストールは行いません。

<a id="guide-version-notifications"></a>

## 新しいバージョンの通知

**Aptly 0.1.3 以降では**、対話形式の通常 CLI コマンドで最新の安定版を確認し、新版があれば stderr に `aptly update` を案内します。 標準入出力と標準エラー出力がすべてターミナルの場合のみ動作し、MCP サーバー・自動 setup・推薦や分類の経路・パイプ・CI では確認しません。JSON stdout と MCP・Hook の応答は変更しません。

公開 npm レジストリから Aptly のバージョン情報のみを取得し、キー・タスク要約・ホスト設定は送信しません。ネットワークと応答読み取りは 800ms・16KiB に制限し、結果を `~/.cache/aptly/update-check.json` に 24 時間キャッシュします。失敗後は 1 時間待機し、通信・キャッシュエラーで元のコマンドを失敗させません。CLI の環境に `APTLY_NO_UPDATE_NOTIFIER=1` を設定すると確認を停止できます。この変数は `aptly set env` の対象ではありません。通知による自動更新は行いません。

<a id="guide-command-help"></a>

## コマンドヘルプ（0.1.8 以降）

コマンド・サブコマンドごとの統一されたヘルプは Aptly 0.1.8 以降で利用できます。次の形式を使えます。

```sh
aptly --help
aptly setup -h
aptly set default --help
aptly set env OPENAI_API_KEY --help
aptly budget status --help
aptly help catalog refresh
```

`--help`・`-h`・`aptly help <コマンド経路>` は使用法だけを表示します。設定・指定ファイル・stdin・資格情報ストアの読み取り、質問、設定変更、API・モデル情報取得、インストール・更新、更新通知は実行しません。有効なオプションの後にもヘルプを付けられますが、不明な経路・オプション、不正な指定値、矛盾する組み合わせはエラーです。必須の位置引数を省略して使用法を調べられます。`--output --help` のようにヘルプをオプション値の位置に置くと、値の欠落として扱います。

<a id="guide-skip-and-remove"></a>

## スキップ・削除

```sh
APTLY_SKIP_SETUP=1 npm install -g aptly@latest
aptly setup --client codex --mode defaults
aptly remove --client all
```

`CI` や npm `--ignore-scripts` でも登録をスキップします。後から `setup` で登録できます。モード変更時は登録を削除して希望の `--mode` で再設定します。`advisory` は推薦のみを返します。`partial` ではホスト別のエラーコードを確認してください。削除時はユーザー変更済みの項目を保持し、競合を報告します。

## 関連文書

[初期設定と候補モデル](configuration.md) · [トラブルシューティング](troubleshooting.md)

[ガイド目次](../ja.md)
