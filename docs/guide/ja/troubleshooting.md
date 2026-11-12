# トラブルシューティング

[한국어](../ko/troubleshooting.md) · [English](../en/troubleshooting.md) · [简体中文](../zh-CN/troubleshooting.md) · [日本語](../ja/troubleshooting.md)

[ガイド目次](../ja.md)

## このページの目次

- [アカウントのホームと Hook 登録の確認](#guide-account-home-recovery)
- [起動パスのエラーからの復旧](#guide-launcher-recovery)
- [プロセス中断と台帳ロック](#guide-ledger-lock-recovery)

<a id="guide-account-home-recovery"></a>

## アカウントのホームと Hook 登録の確認

まず、Codex を起動する環境の `CODEX_HOME` と CLI が選択するホームを照合してください。`config.toml` のポリシーパスを変更するだけでは、対象のポリシーファイルや所有権記録は作成されません。以下の照会でキーや状態は初期化されません。

```sh
aptly setup --check --client codex
aptly stats --client codex
```

| 結果 | 確認する項目 |
|---|---|
| `hook_policy_path_conflict` / `statistics_policy_conflict` | 選択したアカウントのホーム、MCP のポリシー参照、実際のファイル位置を照合してください。ホーム間で状態をコピーしたり、既存の参照を無条件に上書きしたりしないでください。 |
| `statistics_requires_setup` | 選択したホームの MCP 登録・ポリシーファイル・setup 記録を確認してください。まず、そのホームで通常の setup が可能か検査します。 |
| `existing_hook_not_owned` | Aptly Hook はありますが、有効なインストール所有権記録がありません。定義をバックアップして確認した後、明示的に復旧してください。記録の編集やコピーで検査を回避しないでください。 |

設定検査が成功した後、[統計の有効化](statistics.md)に進んでください。`collection.codex: true` は収集設定を表し、実行中のホストが Hook を読み込み、信頼した証明ではありません。対象アカウントの Codex を再起動し、`/hooks` で実際の項目を確認してください。

### 管理対象アカウントでポリシーパスが戻る場合

0.1.11 以降で提供されるポリシー参照の移行機能です。Orca などの管理ツールが既定ホームの同名 MCP 登録をアカウントホームに同期すると、アカウントだけで修正した絶対ポリシーパスが上書きされる場合があります。Hook が残っていても MCP と統計が異なるポリシーを参照することがあります。

登録済みの Aptly サーバーをすべて更新し、対象ホストと MCP プロセスを停止してください。所有権記録が正常な既存 Codex 設定で、まず既定/正本の登録があるホームを明示的に移行し、その後、対象アカウントの `CODEX_HOME` を選択した各環境で繰り返してください。アカウントファイルだけの変更は同期で戻る可能性があります。

```sh
CODEX_HOME="$HOME/.codex" aptly setup --client codex --policy-source codex-home --dry-run
CODEX_HOME="$HOME/.codex" aptly setup --client codex --policy-source codex-home
CODEX_HOME="$HOME/.codex" aptly setup --check --client codex
CODEX_HOME="$HOME/.codex" aptly stats --client codex
```

移行では `APTLY_HOOK_POLICY_PATH = "@codex-home"` と `env_vars` による `CODEX_HOME` の転送を登録します。起動時にそのホームの `aptly/auto-policy.json` を選びます。変数の欠落、空値、相対パスは別のホームに置き換えず拒否します。MCP 起動時には既定ホームでも `CODEX_HOME="$HOME/.codex"` を明示的に転送する必要があります。変数のない通常の端末で 0.1.11 CLI が `policy_source_home_invalid` を返す場合は、上の例のように既定ホームを明示してください。0.1.12 以降、CLI は変数がない場合、すでに選択した標準の `~/.codex` を検証に使用します。CLI の既定ホームの選択と MCP 起動時の環境転送は別です。明示的なアカウント選択と無効値の拒否は維持します。例は既定ホーム用です。各アカウントでは対象の絶対ホームパスに置き換えてください。これは運用者が指定した参照元の選択であり、ホスト全体の設定を証明するものではありません。[Codex MCP の環境変数転送](https://learn.chatgpt.com/docs/extend/mcp#stdio-servers)を参照してください。

移行はポリシー内容、送信同意、台帳パス、統計履歴、Hook の信頼を移動または初期化しません。既存の固定/共有ポリシーは明示的に移行しなければ維持されます。カスタムランチャー、無関係な登録変更、所有権の不一致はローカルで確認してください。エラーを回避するために記録を編集・コピーしないでください。サーバーを再起動して対象アカウントで再確認してください。プレビューやファイル検査の成功は、稼働中 MCP の更新やモデルの観測を証明しません。

<a id="guide-launcher-recovery"></a>

## 起動パスのエラーからの復旧

以下のオプションは Aptly 0.1.2 以降で利用でき、npm 0.1.1 には含まれません。ソースから試す場合は `npm ci --ignore-scripts` と `npm run build` を実行し、以下の `aptly` を `node bin/aptly.ts` に置き換えます。

キー設定は入力・保存前に対象ホストを診断します。いずれかが失敗すると入力を求めず、全ホストを変更しません。`--check` はキーや資格情報ストアにアクセスしません。

Aptly 0.1.9 以降、Linux の `--check` は実行可能な `secret-tool` も確認し、安全な明示的セッションバスアドレスと `gdbus` がある場合、資格情報サービスを起動・アクセスせずにバスメタデータを読み取ります。確実な失敗は入力前に `secure_store_unavailable` と `secure_store_secret_tool_missing`、`secure_store_bus_missing`、`secure_store_service_missing` のいずれかで通知します。`secure_store_bus_unverified`、`secure_store_probe_unavailable`、サービスの存在・起動可能を示す未確認コードは準備状態が不明であることを意味します。サービスの存在や起動可能性はロック解除や書き込み可能を保証しません。必要に応じて `secret-tool` と Secret Service プロバイダーをインストールし、使用するデスクトップセッションで実行してください。実際の保存は失敗する場合があります。SSH やヘッドレスセッションでは、`APTLY_SECRET_BACKEND` がない場合に `OPENAI_API_KEY` をホスト MCP プロセスへ安全に渡してください。既存の認証ラッパーや環境は保持してください。`credential_node_mismatch`、`credential_server_mismatch`、`credential_runtime_unsupported` はそれぞれ Node パス、サーバーパス、OS ストア対応の不一致を示します。

Claude だけが失敗した場合は次の順序で診断し、`launcher_migration_available` の場合にのみ移行を検討してください。

```sh
aptly set env OPENAI_API_KEY --client claude --check
aptly setup --client claude --migrate-launcher --dry-run
aptly setup --client claude --migrate-launcher
aptly set env OPENAI_API_KEY --client claude
```

`--dry-run` は変更しません。移行は所有記録と一致する Aptly の標準登録に限り、Node・サーバーパスを現在のビルドへ更新します。環境設定・Hook・ポリシー・他のホストを保持し、資格情報へのアクセスや古い起動プログラムの実行は行いません。独自ラッパー、所有記録のない登録、変更済みの登録は拒否します。その場合は登録をローカルで確認し、ラッパーの安全な環境変数受け渡しを使うか、別途確認した標準登録へ切り替えてください。検証を回避するために所有記録を編集・削除しないでください。

Aptly 0.1.9 以降、`aptly setup --check --client codex|claude|all` は通常の設定計画を読み取るだけで、ファイルやディレクトリを作成しません。実行中のホストを検証するものではなく、確認時点の状態を示します。`--check` と組み合わせられるのは `--client` のみです。`hook_policy_path_conflict` が表示された場合は、選択したホスト設定ディレクトリと既存のポリシー参照をローカルで確認し、意図したホストディレクトリを選択してから再試行してください。設定は既存の構成を保持し、ポリシーを移動またはコピーしません。ランチャーの移行ではこの不一致を解決できません。

`launcher_migration_not_owned` が既存の登録を保持した状態（`mcp_created: false`）を指す場合、**Aptly 0.1.3 以降では** `--include-existing` を明示して移行できます。0.1.3 以降をインストールし、次を実行してください。

```sh
aptly setup --client claude --migrate-launcher --include-existing --dry-run
aptly setup --client claude --migrate-launcher --include-existing
```

実行前にローカルの登録を確認してください。有効な既存の Aptly 所有記録と、記録に一致する管理対象の環境変数・Hook・ポリシーが必要です。絶対 Node パスと単一の標準サーバーパスのみを許可し、ラッパーや記録のない登録は拒否します。MCP 登録全体を Aptly 所有には変更しないため、その後の削除でも移行後の起動パスと元のユーザー設定を保持します。明示的な単一ホストの移行専用で、自動インストールには適用されません。

成功した Codex の再設定は不要です。失敗したホストだけを指定して再試行し、MCP を再起動してください。Codex では引き続き `/hooks` の信頼確認が必要です。診断後の設定変更は `concurrent_configuration_change` で中断します。復旧時に別のキーを検出した場合や現在値を読めない場合は上書きせず、`credential_rollback_failed` を返します。ファイルと OS ストアは原子的なトランザクションではないため、設定操作を同時に実行しないでください。

<a id="guide-ledger-lock-recovery"></a>

## プロセス中断と台帳ロック

このロック方式は Aptly `0.1.2` 以降で利用でき、npm `0.1.1` には含まれません。JSON 台帳のリクエスト ID・`unknown`・完了済みキャッシュ・呼び出し数・予約費用の形式は維持します。永続台帳だけが Node.js 24 内蔵の SQLite を使用します。隣接する `ledger.json.lock` は正常終了後も残るため、ファイルの存在だけではロックが使用中かどうかを判断できません。新方式ではプロセス終了時に OS のロックが解放され、後続のリクエストが同じ台帳を使用できます。結果が不明な既存 ID の再試行や予約費用の返却は行いません。

台帳とロックは、ハードリンクに対応したローカルファイルシステムの非公開ディレクトリに置き、各台帳に同一の正規パスを使用してください。ネットワーク共有・クラウド同期ディレクトリ・パスの別名はサポート範囲外です。新しいロックや SQLite journal を削除・置換したり、使用中に他の DB ツールで開いたりしないでください。ファイルの古さや PID だけでは所有プロセスの終了を確認できません。

旧版の空の `.lock` ファイルでは所有プロセスが生存しているかを確認できないため、自動で初期化・削除しません。旧版を含む関連ホスト・MCP・台帳にアクセスするすべてのプロセスを停止し、書き込み側をすべて新しい版に更新してください。旧方式のロックであると確認できた場合だけ、そのファイルを別途隔離し、同じ JSON 台帳パスで再開します。台帳・`unknown`・費用・完了結果を初期化・削除しないでください。所有者や形式を確認できない場合は、遮断状態を保って調査してください。

診断レポートは[診断と開発](advanced.md#guide-diagnostics-and-development)を参照してください。

## 関連文書

[初期設定と候補モデル](configuration.md) · [インストールと更新](installation.md) · [高度な MCP 連携と開発参考](advanced.md)

[ガイド目次](../ja.md)
