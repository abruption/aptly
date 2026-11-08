# Aptly 使用ガイド

[한국어](ko.md) · [English](en.md) · [简体中文](zh-CN.md) · **日本語**

[README に戻る](../../README.ja.md)

韓国語版が正本です。このガイドでは Aptly の基本的なインストール方法と使い方を説明します。パッケージをインストールできることは、すべてのアカウントでモデルにアクセスできることを意味しません。子エージェントの実行・承認・サンドボックス・MCP 権限は、Claude Code または Codex が管理します。

## インストール

Node.js 24 以上と Claude Code または Codex が必要です。npm の最新安定版をグローバルにインストールするには、次のコマンドを実行してください:

**既存の永続台帳を 0.1.2 以降に更新する前に**、その台帳にアクセスする可能性があるすべてのホスト、MCP サーバー、単独 CLI、旧版プロセスを停止してください。新しい永続ロックは旧版の書き込み側と併用できません。新規インストールでは旧ロックの隔離は不要です。旧版の空のロックが残る場合は、[台帳の移行手順](#プロセス中断と台帳ロック)に従い、確認済みの旧ロックだけをオフラインで隔離し、JSON 台帳、`unknown` 記録、費用、完了済みキャッシュを保持してください。

```sh
npm install -g aptly@latest --allow-scripts=aptly
aptly setup --client all --mode defaults
aptly --version
```

`aptly --version` でインストール済みのバージョンを確認してください。Node.js 環境を切り替えると再インストールが必要な場合があります。

`postinstall` は、現在のユーザーの既存のホスト設定ディレクトリに MCP と `PreToolUse` Hook を登録します。`CODEX_HOME`・`CLAUDE_CONFIG_DIR` を使う場合は、インストールプロセスにも同じ環境を渡してください。まだ存在しないホストディレクトリは自動登録ではスキップし、明示的な `setup` で作成できます。必要なホストだけを登録するには、`--client codex` または `--client claude` を使用してください。

新規登録では `ROUTER_PROVIDER=decisions`、Hook の `defaults` ポリシー、ホストごとの非公開台帳を指定します。他の既存設定・Hook と、既存の Aptly のコマンド・環境・provider・台帳パスは保持します。既存の fixture 設定を自動で有料モードに切り替えることはありません。

### npm インストールスクリプトの許可

上記の `--allow-scripts=aptly` は、そのインストールで Aptly の `postinstall` を明示的に許可します。npm 11.19.1 で対応を確認しており、ユーザー全体の npm 許可設定は変更しません。[npm 公式ガイド](https://docs.npmjs.com/cli/v11/commands/npm-rebuild/#allow-scripts)を参照してください。

`npm warn install-scripts ... not yet covered by allowScripts` は、許可ポリシーに未登録であることを示します。npm 11.19.1 では、この警告だけでスクリプトがブロックされたとは判断できません。npm のバージョン・厳格なポリシー・`ignore-scripts` によって挙動が異なり、インストール成功だけでは MCP・Hook の登録成功を確認できません。postinstall の出力は npm によって非表示になる場合があります。

このオプションに未対応の npm を使う場合や、自動登録の代わりに手動設定する場合は、次を実行してください。

```sh
npm install -g aptly@latest --ignore-scripts
aptly setup --client all --mode defaults
```

スクリプトの実行にかかわらず、明示的な `setup` を利用できます。既存の起動パスは保持するため、旧パスのエラーは以下の復旧手順に従ってください。キー設定・MCP の再起動と Codex の `/hooks` 信頼確認は別途必要です。

### パッケージの更新

`aptly update` は **Aptly 0.1.3 以降で利用できます**。確認済みの npm グローバルインストールが必要で、実行中のパッケージと一致する確認済み prefix に `aptly@latest` をインストールします。ローカルインストール・ソースチェックアウト・確認できないパスは拒否します。 npm の有効な設定が `dry-run=true` の場合は、インストール前に `update_dry_run_enabled` で拒否します。設定を確認できない場合は `update_configuration_unverified` で停止し、試行のみの実行を更新成功とは報告しません。

更新前に、上記の台帳移行手順に従い、台帳を使用する他のホスト・MCP・CLI プロセスを停止してください。インストールスクリプトは実行しないため、更新後に明示的に設定し、ホストを再起動してください。

```sh
aptly update
aptly setup --client all --mode defaults
aptly --version
```

既存の MCP 起動パスやユーザーラッパーは自動移行しません。旧パスが残る場合は以下の復旧手順に従ってください。キー設定と Codex の `/hooks` 信頼確認は別途必要です。npm の認証・ネットワーク・権限エラーが発生した場合は手動インストールの案内を使用してください。更新の自動インストールは行いません。

### 新しいバージョンの通知

**Aptly 0.1.3 以降では**、対話形式の通常 CLI コマンドで最新の安定版を確認し、新版があれば stderr に `aptly update` を案内します。 標準入出力と標準エラー出力がすべてターミナルの場合のみ動作し、MCP サーバー・自動 setup・推薦や分類の経路・パイプ・CI では確認しません。JSON stdout と MCP・Hook の応答は変更しません。

公開 npm レジストリから Aptly のバージョン情報のみを取得し、キー・タスク要約・ホスト設定は送信しません。ネットワークと応答読み取りは 800ms・16KiB に制限し、結果を `~/.cache/aptly/update-check.json` に 24 時間キャッシュします。失敗後は 1 時間待機し、通信・キャッシュエラーで元のコマンドを失敗させません。CLI の環境に `APTLY_NO_UPDATE_NOTIFIER=1` を設定すると確認を停止できます。この変数は `aptly set env` の対象ではありません。通知による自動更新は行いません。

### CLI による設定

`set` コマンドは 0.1.1 以降で利用できます。既存の起動パスは自動で切り替えません。API キー設定は、現在のパッケージの標準 Node/サーバー登録で、OS 資格情報の参照に対応する実行環境だと確認できた場合にのみ使用できます。独自ラッパー、旧バージョン、別のインストール先は `credential_launcher_unverified` で拒否します。登録を明示的に切り替えるかアップグレードしてから、再度実行してください。

```sh
aptly set default
aptly set env APTLY_CODEX_MODELS
aptly set env OPENAI_API_KEY
```

最初のコマンドは Claude Code と Codex を登録し、未設定のデフォルト環境設定を追加します。既存の起動コマンド、環境変数の許可リスト、分類方式、独自の候補、advisory ポリシーは保持します。次のコマンドは入力を表示せずに値を尋ね、指定した変数だけを変更します。最後のコマンドは API キーを OS の資格情報ストアに保存し、選択したホストの起動時に読み込むよう設定します。値をコマンド引数に渡さないでください。

既定では両ホストを選択します。`--client codex`、`--client claude`、`--client all` で対象を指定できます。Claude 候補には `["haiku","sonnet","opus"]` のような JSON 文字列を入力してください。

```sh
aptly set env APTLY_CLAUDE_MODELS --client claude
```

自動化では `--stdin` を明示してください。以下は公開変数の例です。実際のキーを `printf` コマンドやシェル履歴に含めないでください。

```sh
printf '%s\n' '["gpt-6.1-terra"]' | aptly set env APTLY_CODEX_MODELS --stdin
```

設定できる公開キーは `ROUTER_PROVIDER`（`fixture` または `decisions`）、`APTLY_CLAUDE_MODELS`、`APTLY_CODEX_MODELS`、`CLAUDE_MODELS`、`CODEX_MODELS`、`APTLY_MODEL_INFO_PATH` です。候補は対応モデルの JSON 配列文字列で、無効な値、重複、正式名と別名の競合は拒否します。`[]` は該当ホストの推薦を無効にします。モデルキャッシュには非公開ディレクトリ内の絶対パスが必要です。台帳や Hook ポリシーの管理パスはこのコマンドで変更できません。

API キーは macOS Keychain、インストール済みの Linux `secret-tool`、または Windows Credential Manager に保存します。Windows バックエンドは PowerShell と、現在のユーザー範囲の Win32 Generic 資格情報を使用し、UTF-8 データの上限は 2,560 バイトです。Windows CI では、合成キーの保存・読み取り・更新・削除、Unicode パス、分離したホスト設定、キー参照、ACL の保持を確認しました。Windows 上の実際の Claude Code・Codex セッションを実行して検証したものではありません。ストアを利用できない場合はエラーとなり、平文ファイルには切り替えません。キーはホスト別アカウントに分け、MCP ファイルには `APTLY_SECRET_BACKEND=os` と `APTLY_SECRET_CLIENT` の参照だけを保存します。OS ストアを選択した後、キーがない場合や読み取りに失敗した場合も、別の環境変数キーに黙って切り替えません。`set default` は既存のラッパーや環境による認証を保持し、`set env OPENAI_API_KEY` が OS ストア認証を明示的に選択します。

結果にはホストごとの状態と固定エラーコードだけを返し、キーの値は表示しません。`partial` の場合は各ホストを確認してください。`credential_store_failed` ではストアへのアクセスや対応状況を、`credential_rollback_failed` では以前のキーを復元できたかを確認します。失敗したホストの旧キーは可能な場合に復元します。他のホストの成功を、全ホストでの原子的な成功とみなさないでください。

保存のタイムアウトや応答解析の失敗は、OS が新しい値を書き込んだ後にも起こり得ます。失敗時は以前の値を復元し、以前の値がなければ新しい項目を削除して、再読み込みで確認します。復旧を確認できない場合は、元のエラーコードに `credential_rollback_failed` を追加します。どちらのキーが有効かを断定せず、再試行前に OS の資格情報ストアを確認してください。これは可能な範囲での復旧であり、プロセスやホストをまたぐ原子的なトランザクションではありません。

変更後は MCP を再起動し、`get_routing_capabilities` の `provider`、候補、`credential_status` を確認してください。`os_store` はキーを読み込めたことを示し、API 認証の成功を示すものではありません。デフォルト設定と公開変数の設定では、引き続き独自ラッパーを保持します。API キー設定は未確認の起動パスのホスト設定を変更せず、保存を試みていた場合は可能な限りそのホストの旧キーを復元します。既存のラッパーにも新しいキーが自動で適用されるとは想定しないでください。Codex の `/hooks` 信頼承認やホスト権限は迂回しません。

### 起動パスのエラーからの復旧

以下のオプションは Aptly 0.1.2 以降で利用でき、npm 0.1.1 には含まれません。ソースから試す場合は `npm ci --ignore-scripts` と `npm run build` を実行し、以下の `aptly` を `node bin/aptly.ts` に置き換えます。

キー設定は入力・保存前に対象ホストを診断します。いずれかが失敗すると入力を求めず、全ホストを変更しません。`--check` はキーや資格情報ストアにアクセスしません。`credential_node_mismatch`、`credential_server_mismatch`、`credential_runtime_unsupported` はそれぞれ Node パス、サーバーパス、OS ストア対応の不一致を示します。

Claude だけが失敗した場合は次の順序で診断し、`launcher_migration_available` の場合にのみ移行を検討してください。

```sh
aptly set env OPENAI_API_KEY --client claude --check
aptly setup --client claude --migrate-launcher --dry-run
aptly setup --client claude --migrate-launcher
aptly set env OPENAI_API_KEY --client claude
```

`--dry-run` は変更しません。移行は所有記録と一致する Aptly の標準登録に限り、Node・サーバーパスを現在のビルドへ更新します。環境設定・Hook・ポリシー・他のホストを保持し、資格情報へのアクセスや古い起動プログラムの実行は行いません。独自ラッパー、所有記録のない登録、変更済みの登録は拒否します。その場合は登録をローカルで確認し、ラッパーの安全な環境変数受け渡しを使うか、別途確認した標準登録へ切り替えてください。検証を回避するために所有記録を編集・削除しないでください。

`launcher_migration_not_owned` が既存の登録を保持した状態（`mcp_created: false`）を指す場合、**Aptly 0.1.3 以降では** `--include-existing` を明示して移行できます。0.1.3 以降をインストールし、次を実行してください。

```sh
aptly setup --client claude --migrate-launcher --include-existing --dry-run
aptly setup --client claude --migrate-launcher --include-existing
```

実行前にローカルの登録を確認してください。有効な既存の Aptly 所有記録と、記録に一致する管理対象の環境変数・Hook・ポリシーが必要です。絶対 Node パスと単一の標準サーバーパスのみを許可し、ラッパーや記録のない登録は拒否します。MCP 登録全体を Aptly 所有には変更しないため、その後の削除でも移行後の起動パスと元のユーザー設定を保持します。明示的な単一ホストの移行専用で、自動インストールには適用されません。

成功した Codex の再設定は不要です。失敗したホストだけを指定して再試行し、MCP を再起動してください。Codex では引き続き `/hooks` の信頼確認が必要です。診断後の設定変更は `concurrent_configuration_change` で中断します。復旧時に別のキーを検出した場合や現在値を読めない場合は上書きせず、`credential_rollback_failed` を返します。ファイルと OS ストアは原子的なトランザクションではないため、設定操作を同時に実行しないでください。

### キーと再起動

分類用の `OPENAI_API_KEY` は、安全な環境や資格情報ランチャーを通して MCP プロセスに渡してください。ホストのサブスクリプション認証とは別です。キーの値をコマンド引数・リクエスト・設定ファイル・ソース・ログ・一時ファイルに記録しないでください。

### MCP 環境変数の設定手順

`setup` 後、以下の例を既存の `aptly` 登録に統合してください。`command`、`args`、資格情報ランチャー、`ROUTER_LEDGER_PATH`、`APTLY_HOOK_POLICY_PATH` は保持します。Setup は非公開の台帳・ポリシーディレクトリを作成します。台帳を手動指定する場合は、ユーザー所有で権限 700 のディレクトリ内の絶対パスを使ってください。

#### 設定ファイルの場所

| ホスト | Aptly が使用するユーザー登録の場所 |
|---|---|
| Codex | `$CODEX_HOME/config.toml`。`CODEX_HOME` 未指定の場合は `~/.codex/config.toml` |
| Claude Code | `~/.claude.json` の `mcpServers.aptly`。`CLAUDE_CONFIG_DIR` 指定時は、そのディレクトリの `.claude.json` |

Claude Code の Hook ファイルは通常 `~/.claude/settings.json` ですが、`CLAUDE_CONFIG_DIR` を指定すると `$CLAUDE_CONFIG_DIR/settings.json` になります。MCP 登録とは別です。プロジェクトの `.mcp.json`、管理設定、アカウント別ディレクトリを使う場合は、編集・追加前に `/mcp` で有効な登録を確認してください。

#### API キーの渡し方

直接起動する場合は、**Bash** でキーを画面やコマンド履歴に残さず入力し、同じシェルからホストを起動します。zsh では先に `bash` を実行してください:

```sh
read -rsp 'OpenAI API key: ' OPENAI_API_KEY
printf '\n'
export OPENAI_API_KEY
codex
```

Claude Code では `codex` を `claude` に置き換えます。キーは永続保存されません。起動済み GUI は別のターミナルの環境を継承しないため、アプリの安全な環境受け渡し機能か既存の資格情報ランチャーを使ってください。

#### Codex の例

既存の `[mcp_servers.aptly]` テーブルを編集し、同じテーブルを重複追加しないでください。`env_vars` の既存項目を保持して `OPENAI_API_KEY` を追加します。`env_vars` はホストの環境変数を名前で転送し、`.env` は MCP に固定値を渡します。

```toml
[mcp_servers.aptly]
env_vars = ["OPENAI_API_KEY"]

[mcp_servers.aptly.env]
ROUTER_PROVIDER = "decisions"
APTLY_CLAUDE_MODELS = '["haiku","sonnet","opus"]'
APTLY_CODEX_MODELS = '["gpt-6-luna","gpt-6.1-terra","gpt-6.1-sol"]'
```

#### Claude Code の例

既存の `mcpServers.aptly.env` オブジェクトに以下を統合してください:

```json
{
  "ROUTER_PROVIDER": "decisions",
  "APTLY_CLAUDE_MODELS": "[\"haiku\",\"sonnet\",\"opus\"]",
  "APTLY_CODEX_MODELS": "[\"gpt-6-luna\",\"gpt-6.1-terra\",\"gpt-6.1-sol\"]"
}
```

直接起動では、次の任意の参照で Claude Code の環境にあるキーを渡せます。資格情報ランチャーを使う設定には追加しないでください。変数がない場合はキーが渡らず、参照文字列が未展開のまま残ることがあります:

```json
{
  "OPENAI_API_KEY": "${OPENAI_API_KEY}"
}
```

モデル候補は **JSON 文字列**です。未設定ならデフォルトを使い、`[]` はそのホストの推薦を無効にします。Aptly は MCP 起動時の環境を読み、プロジェクトの `.env` ファイルは自動で読み込みません。

変更後はホストまたは MCP を再起動してください。**Codex では `/hooks` で新しい Hook を確認して信頼を承認します。** `/mcp` と `get_routing_capabilities` で `provider`、候補、`automatic_hook.mode` を確認してください。この無料照会はキーの認証を検証せず、`recommend_agent` には料金が発生する場合があります。`unauthorized` ではキーの受け渡し、`needs_context` ではタスク要約を確認してください。

設定場所と受け渡し方式の公式説明は、[Codex 構成リファレンス](https://learn.chatgpt.com/docs/config-file/config-reference)と [Claude Code MCP ガイド](https://code.claude.com/docs/en/mcp)を参照してください。

### スキップ・削除

```sh
APTLY_SKIP_SETUP=1 npm install -g aptly@latest
aptly setup --client codex --mode defaults
aptly remove --client all
```

`CI` や npm `--ignore-scripts` でも登録をスキップします。後から `setup` で登録できます。モード変更時は登録を削除して希望の `--mode` で再設定します。`advisory` は推薦のみを返します。`partial` ではホスト別のエラーコードを確認してください。削除時はユーザー変更済みの項目を保持し、競合を報告します。

## 自動 Hook

**以下の事前確認・推薦・観測の動作は Aptly 0.1.4 以降で利用できます。** インストールした `PreToolUse` matcher は Codex の `spawn_agent` / `collaborationspawn_agent` / `Agent` と Claude Code の `Agent` を、native 実行前にローカルの `route_spawn_hook` へ渡します。ホストによる Hook の読み込み・信頼承認と MCP 接続が必要です。未設定・未対応のホストや MCP 接続失敗時まで Aptly が介入を強制することはできず、実行はホストが担当します。

ローカルの事前確認で明示フィールド・ロール・resume・ポリシー・キャッシュ・予算を評価します。呼び出しごとに新しい有料 Decisions 要求が必要なわけではありません。Codex のモデルまたは effort だけが指定された場合は、一致する許可済みの組み合わせに候補を絞り、未指定フィールドだけを補います。両方の指定、未対応値、固定ロール、resume は分類せず保持します。入力だけからユーザー指定かホストのデフォルトかを断定しません。

モデル・effort が未指定なら `fork_turns: "all"` や fork の省略も推薦を評価します。ただし**履歴は変更しません**。Codex のモデル・effort 適用には明示的な `fork_turns: "none"` が必要です。それ以外は `inherited_context_application_unverified` として元の引数を保持します。他の履歴フィールドは `history_semantics_unverified` で適用を止め、Claude の適用も履歴制約のない汎用呼び出しに限ります。推薦の生成と適用は別です。

Codex の本文が不透明な場合、`cleanup_merged_worktrees` のような具体的な短い作業名だけでも推薦できます。短い名前は cleanup/remove/prune + merged + worktrees/branches、または review/fix/test + failing/broken/flaky + tests/builds の組み合わせに限定し、他は従来の6単語チェックを維持します。本文は復号も送信もしません。詳細条件や削除権限は推測しません。履歴継承時の適用は対象ホストで未検証であり、全バージョンで不可能という意味ではありません。公開ソースだけでは実行環境の対応を確認できません。

独立した作業の場合だけ、呼び出し側が十分な単独のタスク情報を渡し、新しい子を明示的に選択してください。Aptly は `all` を `none` に変更せず、履歴の削除や明示モデル・effort の上書きもしません。[合成の継承・新規子の例](../../examples/spawn-preflight.codex.json)は別々の要求であり、自動再試行ではありません。結果不明の有料呼び出しを新しい ID で再試行しないでください。

`defaults` は互換性のある引数更新を、`advisory` は推薦だけを許可します。継承や一部だけ指定した呼び出しも、適用できなくても制限付きタスク抜粋を Decisions に送信する場合があります。履歴継承は共有の無効化ではありません。ポリシー無効・文脈不足・予算制限・失敗・キャンセルでは実行制約を保持します。入力・ポリシー・カタログの結合、重複防止、結果不明の保護を維持し、fixture の推薦で native のデフォルトを変更しません。自動ポリシーのない strict 証拠経路は別であり、ホスト内部のパッチは引き続き保留です。

| MCP ツール | 用途 |
|---|---|
| `get_routing_capabilities` | 候補・制限・provider・Hook の状態を、有料 API を呼び出さずに確認します |
| `recommend_agent` | タスク要約から直接推薦を取得します |
| `get_routing_precedence` | 呼び出しを保持する根拠と、未確認の設定元を説明します |
| `route_spawn_hook` | インストールしたポリシーに応じて、対象呼び出しのデフォルト値を選択するか、推薦だけを伝えます |
| `get_spawn_routing_observation` | 一致する Hook 呼び出しを照会し、native 実行を証明しません |
| `prepare_spawn_context` | 正確に一致する予定呼び出しに上限付きの説明を登録します |
| `cancel_spawn_context` | 説明の対応付けを取り消します。native 実行や送信済みリクエストは取り消しません |
| `retry_spawn_recommendation` | Hook が返す retry_id を使い、タスク説明を一度補って再推薦します |
| `prepare_fresh_delegation` | 完了済みの継承推薦から別の独立 Codex 呼び出し引数を準備し、実行はしません |

### 外部送信と自動共有の無効化

事前登録された説明がない場合、自動分類の `summary` は、有効なタスクラベルと本文の**最初の段落を切り詰めて組み合わせた抜粋**です。意味を再要約したものでも、匿名化したものでもありません。UTF-8 のサイズは `min(4000, max_summary_bytes)` 以下ですが、HTTP リクエスト全体の上限ではありません。Codex の opaque メッセージへのフォールバックでは、本文を復号・送信せず、十分に具体的な `task_name` だけを使用します。ラベルにも機密情報が含まれる可能性があります。

有効な `prepare_spawn_context` の説明は、固定の接頭辞とともに native の抜粋に代わって分類に使用されます。登録自体は API を呼び出しません。文脈不足の応答後、`retry_spawn_recommendation` は以前の本文を付け加えず、固定の接頭辞と新しい補足説明で一度だけ再推薦できます。両経路とも説明原文は `min(3800, max_summary_bytes - 96)` バイト以下、接頭辞を含む説明は `min(4000, max_summary_bytes)` バイト以下です。`prepare_fresh_delegation` 自体は完了済みの推薦を再利用し、追加の分類を呼び出さず、独立した指示をローカルの次回呼び出し引数として返します。返されたモデルと effort をそのまま明示した Codex 呼び出しは、現在の Hook で `explicit_model` として分類せずに保持されます。後続の呼び出しを検査することは、追加の分類を意味しません。どの経路も、説明に機密情報が含まれないことや自動的な匿名化を保証しません。

Decisions には `client`、`task.summary`、`task.operation`、`task.context_sufficient` と、候補プロファイル ID・モデルと effort の説明・設定したモデル特性を送信します。分類用 API キーは `Authorization` ヘッダー、リクエスト ID は `X-Client-Request-Id` ヘッダーで送信します。自動経路の ID はハッシュで、直接推薦の ID は呼び出し元が指定します。ID や候補の説明にも秘密情報を含めないでください。

自動共有を無効にするには、`APTLY_HOOK_POLICY_PATH` が指す既存の非公開ポリシーファイルで、**`enabled` だけを `false` に変更**してください。他のフィールドと所有権の記録は保持してください。その後の自動 Hook 呼び出しは、分類や呼び出しバインディングファイルの作成前に元の呼び出しを保持します。開始済みの送信を取り消したり、サーバーが受信した情報を回収したりすることはできません。生成済みのポリシーを変更すると、登録・設定・削除コマンドの所有権検査で競合する場合があり、それらのコマンドは無効化したポリシーを上書きしません。検査を回避するために所有権の記録を編集しないでください。

`mode: advisory` でも分類データは送信されるため、プライバシー上の共有停止にはなりません。`APTLY_HOOK_POLICY_PATH` を削除すると従来の strict 経路が有効になる場合があるため、共有停止の代わりにしないでください。`enabled: false` は、明示的な `recommend_agent` や `aptly recommend` のリクエストを止めるものではありません。

共有する要約を自分で選ぶ場合は、自動共有を無効にしてから直接推薦に必要な情報だけを記述してください。Aptly は要約中の URL の文書や、言及されたソースファイルを自動取得・添付しません。既知のキーや Bearer のパターン検査は、完全な秘密情報の検出や送信の安全性を保証しません。

台帳と Hook バインディングにはリクエストのメタデータ・ハッシュ・キャッシュ結果を保存し、タスクの抜粋は保存しません。Aptly の診断にもタスク原文を含めません。ただし、ローカルの Hook の `updatedInput` は、ホストが実行を続けられるよう元のタスクを保持します。ホスト自身の会話やログの保存は Aptly の制御対象ではありません。

### 不透明な呼び出しへの明示的な説明（0.1.4 以降）

実際の予定セッション・呼び出し ID と元のイベントを知る連携は、Hook の前に同じ MCP プロセスで `prepare_spawn_context({client, event, description})` を呼べます。目的・範囲・出力・制約・複雑さを短く記述してください。URL の内容は取得しません。上限付き説明と固定接頭文だけが抜粋を置き換え、履歴・ファイル・不透明な本文は送信しません。`cancel_spawn_context({client, event})` で取り消せます。有効な自動ポリシーが必要で、`enabled: false` は共有を止めます。既知の秘密パターン検査は完全ではありません。

対応付けは5分間有効で変更不可、プロセスごとに最大128件です。入力変更・期限切れ・取消時は分類を止め、評価済みの呼び出しを説明変更で有料再試行しません。実際の予定イベントを取得できない呼び出し元は利用できません。標準 Hook は説明や呼び出し ID を作成しません。ローカルの `insufficient_context`、プロバイダーの `provider_needs_context`、適用時の `inherited_context_application_unverified` は別の結果です。限定的な native 説明受け渡しの検証は[契約](../SPAWN_CONTEXT.md)に記録しています。この検証は、説明の自動生成や推薦モデルの実行を証明するものではありません。

### 文脈を補って再推薦する（0.1.5 以降）

自動 Hook が `insufficient_context` または `provider_needs_context` を返すと、`retry_id` と補足手順を提示します。`defaults` ではその生成呼び出しを拒否し、`advisory` では案内だけを返します。親エージェントは既知の情報から目的・範囲・期待する出力・複雑さを短く説明し、5分以内に同じ MCP プロセスで `retry_spawn_recommendation({retry_id, description})` を呼んでください。将来の native 呼び出し ID は不要です。本当に情報が不足する場合だけユーザーに質問してください。

元の呼び出しごとに補足は一度だけです。同じ入力はキャッシュを再利用し、説明の変更は競合として拒否します。再推薦も文脈不足または失敗なら終了し、結果不明の有料要求を新しい ID で繰り返さないでください。`spawn_application` が `blocked` なら推薦を適用せず制約を報告してください。それ以外も親は明示的な選択・履歴・役割・権限を保ち、新しい互換 native 呼び出しに未指定のモデル・effort だけを渡す必要があります。Hook 自体が親の再要求や native 実行を行うわけではありません。元の `prepare_spawn_context` の対応付けは変更不可のままです。[制限・費用・検証契約](../SPAWN_CONTEXT.md#one-context-supplement-after-a-hook-response)を参照してください。

再推薦の応答は `next_call.set_if_unspecified` に次の native 呼び出しで補う具体的な未指定フィールドを返します。明示済みのモデル・effort は含めず、Claude に effort を追加しません。履歴などで適用できない結果には `next_call` を返しません。実行証拠や権限承認ではありません。

キャッシュを再利用できるのは最初の結果が完了した場合です。結果が不明なら `outcome_unknown` を保持し、新しい ID で有料呼び出しを繰り返さないでください。

`context_retry_allowed: false` は追加の文脈補足を終了する意味です。互換性のある推薦の `caller_review_required` は親が引数を確認する意味であり、新しいユーザー承認の要求ではありません。既存の委任権限とホストの権限確認は引き続き適用されます。

### 自動ルーティングの保証範囲と拒否結果（0.1.5 以降）

保証は、有効かつ信頼済みの Hook が接続中の MCP で処理する対応呼び出しに限ります。`get_routing_capabilities.automatic_hook.guarantee` で範囲を確認してください。サーバーは未登録・未信頼・切断・ホスト側で失敗した Hook を検出したり強制したりできず、その後の処理はホストが決めます。MCP の接続表示だけでは個別呼び出しの経由を証明できません。

有効なポリシーと対象呼び出しを確認した後、`defaults` は適用不能・予算超過・分類失敗・結果不明を `deny` と安全な理由コードで返します。元の引数と制約は保持しますが、その生成は実行しません。継承履歴の互換性が未検証なら、親のデフォルトで黙って実行したり `none` に切り替えたりせず、制約を報告してください。`advisory` は拒否せず同じ制限を説明します。ポリシー未設定・無効、明示タプル・固定役割・resume は意図的なローカル保持経路であり、一律には拒否しません。

復旧 ID があれば、同じ MCP プロセスで `get_spawn_routing_observation({retry_id})` を呼べます。従来の `{client, event}` 形式も使えますが、混在や不完全な入力は拒否します。元の `awaiting_context` と `context_retry.outcome` は別の段階です。拒否した重複要求は `last_attempt` に記録し、以前の分類結果を上書きしません。照会は有料要求を発行せず、保持期限も延長しません。実行は常に `not_observed` であり、推薦や引数更新は実際の子の実行証拠ではありません。

### 別の独立した委任を準備する（0.1.6 以降）

defaults Hook が継承呼び出しへの適用を拒否した後、呼び出し元が**同じ独立タスクであり、ユーザーが継承履歴を要求せず、完全な独立指示を渡せる**と宣言できる場合だけ `prepare_fresh_delegation` を使えます。同じプロセスで Hook または再推薦の `retry_id`、`task_name`、`standalone_task` と `declaration: {independent_task:true, same_task:true, original_call_outcome:"blocked", history_requirement:"not_required", standalone_context_complete:true}` を渡してください。完了済みの許可プロファイルを再確認し、分類を追加で呼びません。

元の継承呼び出しは拒否されたままです。別の `next_call.arguments` を確認し、既存の委任権限と通常のホスト権限確認の下で新しい呼び出しを送ってください。`fork_turns: "none"` と、元の選択を保つモデル・effort を含みます。呼び出し元の宣言であり、ユーザー意図や実行を検証するものではありません。履歴が必要・不明、固定役割、resume、未検証の追加実行引数がある場合は使わないでください。参照は一つのタスクだけに結び付き、5分の期限・取消・ポリシー/候補/元の呼び出しの変更で準備を止めます。元の実行を許す advisory 経路には提供しません。[契約と制限](../SPAWN_CONTEXT.md#intentional-fresh-delegation)を確認してください。

ホストが元の呼び出しの拒否を報告した後だけ使ってください。`original_call_outcome` が `executed` または `unknown` なら準備を拒否します。これは呼び出し元の宣言で、サーバーの実行観測ではありません。同じ準備の反復は子の一回実行を保証しません。プロファイルは元の分類要約に基づくため別タスクに再利用しないでください。

## 直接推薦

`recommend_agent` MCP と CLI の `recommend` は、タスク要約を受け取ってプロファイルを推薦します。子エージェントを直接生成することはありません。以下の JSON を MCP ツールの引数として渡すか、ファイルに保存して CLI の標準入力に渡してください。

```json
{
  "request_id": "demo-codex-sort-001",
  "client": "codex",
  "task": {
    "summary": "Sort the supplied numbers [3, 1, 2] into ascending order. No files or network are needed.",
    "operation": "analysis",
    "context_sufficient": true
  }
}
```

```sh
ROUTER_PROVIDER=fixture aptly recommend < request.json
aptly capabilities
aptly config codex
aptly config claude
```

fixture は、キー・ネットワーク・子エージェントの実行なしで、ローカルで生成した試験用の結果を返します。実際の Decisions の判断や品質試験の結果ではありません。`config` は手動 MCP 登録用の断片を出力するだけで、`setup` は設定を実際に変更します。実際の API を使う場合は、前述のキー・provider・非公開台帳を準備してください。

`task.operation` は `read_only`、`write`、`review`、`analysis` のいずれかです。`context_sufficient` は、呼び出し元が必要な要約を提供したことを表すもので、ホスト設定の検証ではありません。`eligible_profile_ids` を省略すると、その client の有効なカタログを使用し、指定すると、その中で候補を制限します。

`constraints` の `model_pinned`、`effort_pinned`、`role_pinned`、`fork_inherits` のいずれかが true の場合は、既存の選択を保持します。省略は、この計画用リクエストで保持条件を宣言していないことを意味します。実際のホストで値が固定指定（pin）されていないことを証明するものではありません。新規リクエストでは `provenance_verified` を使用しないでください。

| status | 次の操作 |
|---|---|
| `recommended` | `profile` を確認し、既存のホストで別途実行するかどうかを判断してください |
| `keep_current` | 明示的な選択を保持するか、推薦を保留してください |
| `needs_context` | 必要な要約を補ってください |
| `unavailable` | 返された `reason` を確認してください。結果が不明な有料リクエストを新しい ID で自動再実行しないでください |

直接推薦の `application: advisory_only` は、ホスト設定の確認・モデルへのアクセス権限・実行承認を意味しません。完了済みの結果を再照会する際は、同じ ID・入力・ポリシー・台帳を使用してください。`unknown` は結果が不明確であることを意味するため、新しい ID で無条件に再試行しないでください。コンテキストの補完で入力が変わった新規リクエストには、別の ID を使用してください。

## モデルと環境変数

デフォルト候補は 6 つのプロファイルです。この区分は Aptly の運用プリセットであり、両プロバイダーのモデルが同等という意味ではありません。

| 区分 | Claude Code | Codex | 代表的なタスク |
|---|---|---|---|
| simple | `haiku` | `gpt-6-luna` / `max` | 抽出・形式変換・小さな機械的修正 |
| routine | `sonnet` | `gpt-6.1-terra` / `high` | コンテキストを考慮した執筆・翻訳・範囲が明確な実装 |
| deep | `opus` | `gpt-6.1-sol` / `medium` | 複数コンポーネントにまたがるデバッグ・設計判断・掘り下げたレビュー |

MCP の `env` の値は文字列なので、候補配列も JSON 文字列として渡します。

```json
{
  "env": {
    "APTLY_CLAUDE_MODELS": "[\"haiku\", \"sonnet\", \"opus\"]",
    "APTLY_CODEX_MODELS": "[\"gpt-6-luna\", \"gpt-6.1-terra\", \"gpt-6.1-sol\"]"
  }
}
```

未指定の場合は上記のデフォルト値を使い、`[]` の場合はその client の推薦を無効にします。空の文字列・重複・未対応のモデル・不正な JSON はエラーです。`CLAUDE_MODELS`・`CODEX_MODELS` も別名として利用できますが、同じプロバイダーの標準名と別名を同時に設定するとエラーになります。候補設定は、既存の選択を上書きしたり、アカウントのモデルへのアクセス権限を認証したりするものではありません。

### 公式説明とキャッシュ

Decisions の選択肢には、モデル名・Codex effort・公式の特性・タスク区分の説明を一緒に送ります。同梱の説明で開始でき、推薦のたびにドキュメントを取得することはありません。最新の公式 Markdown を反映するには、明示的に更新します。出力先の親ディレクトリは、ユーザー所有の非公開ディレクトリとして事前に用意してください。

```sh
mkdir -m 700 /absolute/private-aptly-state
aptly catalog refresh --output /absolute/private-aptly-state/model-info.json
export APTLY_MODEL_INFO_PATH=/absolute/private-aptly-state/model-info.json
```

更新時は、固定の [Claude モデルドキュメント](https://code.claude.com/docs/en/model-config.md)と [OpenAI モデルドキュメント](https://learn.chatgpt.com/docs/models.md)だけを読み、API キーは必要ありません。短く正規化したモデル情報だけを保存し、失敗した場合は既存のファイルを保持します。起動時にキャッシュを読み、7 日を超えているか無効な場合は同梱の説明を使用します。更新後は MCP を再起動してください。新しいドキュメントにモデルが登場しても、候補を自動追加したり、アカウントでのアクセス可否を確認したりすることはありません。

## コンテキストの提供

Codex が子エージェントの `message` を暗号文として Hook に渡す環境では、本文を読み取ったり復号したりしません。この場合は、十分に具体的な平文の `task_name` だけを要約として使用します。たとえば `sort_supplied_numbers_3_1_2_ascending_without_tools` のように、タスクの種類と範囲を表します。未対応または曖昧なタスク名の場合は、元のモデルを保持します。Claude Code と平文の本文が渡される呼び出しでは、提供された本文の要約を使用します。

同じ `client` と元の Hook `event` を指定して `get_spawn_routing_observation` で対象呼び出しを照会します。ハッシュ化した相関 ID と、事前確認・分類/キャッシュ結果・推薦・引数更新/適用停止・`execution: not_observed` を区別して返します。`arguments_updated` は Hook が出力した引数だけを意味し、実際の子モデルの観測ではありません。記録は当該 MCP プロセスの直近 128 件・10 分に限られます。`not_observed` は別プロセス・再起動・期限切れ・削除・入力不一致でも発生し、全体の Hook 迂回を証明しません。プロセス共通の `automatic_hook.last_result` は削除します。タスク原文・パス・セッション ID・資格情報は返しません。

直接推薦では、リポジトリ・ファイルの URL と、ドキュメントを読んで整理したタスクの範囲・規模・制約を、要約に含めて提供できます。URL の文字列を送ることと、ドキュメントの本文を提供することは異なります。現在の Aptly の分類リクエスト処理コードは、リポジトリ URL を GET したり、ドキュメントを収集したりしません。必要なドキュメントの取得と要約は、呼び出し元が行います。

現在の自動 Hook には、URL を別途平文で渡すフィールドがありません。URL を暗号化される `message` に追加しただけで、分類に渡されるとは想定しないでください。直接 MCP 推薦を受け取り、そのプロファイルをホストの呼び出し引数として渡す経路と、自動 Hook の適用は区別してください。

## 費用実測

2026-11-05 に [session-peer の英語 README](https://github.com/abruption/session-peer/blob/6e9efda7588e1df638748eeb7ad1b2707e0a3bf4/README.md)を正本として、[韓国語訳](https://github.com/abruption/session-peer/blob/6e9efda7588e1df638748eeb7ad1b2707e0a3bf4/README.ko.md)をレビューしました。合計 17,964 バイトの同じドキュメントと同じ指示で、実行ごとに 6 件の修正案を作成し、原本は変更していません。

タスク名だけを提供した自動 Hook 試験は、3 回とも `needs_context` で保留されました。`recommend_agent` にリポジトリ・ファイル URL を追加した 3 回と、URL にドキュメントの要約も追加した 3 回は、すべて Terra/high を推薦しました。以下は、URL+要約条件での実際の Terra/high 実行 3 回を、直前の Sol/high 実行 3 回と比較した 1 回あたりの平均です。

| Standard API 換算基準 | Sol/high | Terra/high + 分類費用 | 減少率 |
|---|---:|---:|---:|
| 実際のキャッシュ使用量を反映 | $0.03229 | $0.01354 | 58.05% |
| 入力全体をキャッシュなしで換算 | $0.11254 | $0.05363 | 52.35% |

ホストが記録した実測トークン数に [公式の Standard API 単価](https://developers.openai.com/api/docs/pricing)を適用した USD 換算値です。サブスクリプションの実際の請求額や、利用枠から実際に差し引かれた量を示すものではありません。Terra 側には [Decisions の分類費用](https://developers.openai.com/api/docs/guides/decisions) 1 回あたり $0.0000756 を含めています。比較範囲はレビューする子エージェントと分類で、ドキュメントの収集・要約の準備・メインエージェントの調査費用は除外しています。

測定経路は、**明示的な MCP 推薦 → 推薦プロファイルを引数として渡したホスト上での実行**です。自動 Hook の URL 収集・伝達機能を検証したものではありません。基準群は直前の実測を再利用しており、条件ごとの標本は 3 回です。ドキュメント全体の読み取り・原文の引用一致・出力形式は確認しましたが、品質の同等性、統計的有意性、他のタスクでの費用削減を保証するものではありません。

### プロセス中断と台帳ロック

このロック方式は Aptly `0.1.2` 以降で利用でき、npm `0.1.1` には含まれません。JSON 台帳のリクエスト ID・`unknown`・完了済みキャッシュ・呼び出し数・予約費用の形式は維持します。永続台帳だけが Node.js 24 内蔵の SQLite を使用します。隣接する `ledger.json.lock` は正常終了後も残るため、ファイルの存在だけではロックが使用中かどうかを判断できません。新方式ではプロセス終了時に OS のロックが解放され、後続のリクエストが同じ台帳を使用できます。結果が不明な既存 ID の再試行や予約費用の返却は行いません。

台帳とロックは、ハードリンクに対応したローカルファイルシステムの非公開ディレクトリに置き、各台帳に同一の正規パスを使用してください。ネットワーク共有・クラウド同期ディレクトリ・パスの別名はサポート範囲外です。新しいロックや SQLite journal を削除・置換したり、使用中に他の DB ツールで開いたりしないでください。ファイルの古さや PID だけでは所有プロセスの終了を確認できません。

旧版の空の `.lock` ファイルでは所有プロセスが生存しているかを確認できないため、自動で初期化・削除しません。旧版を含む関連ホスト・MCP・台帳にアクセスするすべてのプロセスを停止し、書き込み側をすべて新しい版に更新してください。旧方式のロックであると確認できた場合だけ、そのファイルを別途隔離し、同じ JSON 台帳パスで再開します。台帳・`unknown`・費用・完了結果を初期化・削除しないでください。所有者や形式を確認できない場合は、遮断状態を保って調査してください。

## 診断と開発

```sh
aptly report --format both --output-dir reports
```

report は、同じ ID の Markdown・JSON を非公開ファイルとして作成します。確認後に手動で共有し、自動アップロードは行いません。添付ファイルにキー・個人のパス・環境値・タスクの本文・加工していないエラー情報を含めないでください。API 認証の成功や、ホスト設定全体の確認を意味するものではありません。

ソースチェックアウトでは以下のコマンドを使います。前述のインストール済み CLI の例とは、実行パスを区別してください。

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck
npm run build
ROUTER_PROVIDER=fixture node bin/aptly.ts recommend < examples/recommend.codex.json
ROUTER_PROVIDER=fixture node bin/aptly.ts recommend < examples/recommend.claude.json
npm test
npm run poc
npm run check:release
```

標準の回帰試験と fixture を用いたスモークテストは、有料 API・実際の子エージェントなしで実行します。リリース検査は公開ファイル・個人情報パターン・npm file allowlist を確認し、公開や Git push は行いません。台帳は、完了結果の再利用・unknown の再呼び出し防止・呼び出し数・遅延・見積費用の制限に使いますが、実際の請求額の上限ではありません。

設計・過去の検証・開発履歴は、ソースチェックアウトの他のドキュメントに保持します。この多言語ガイドはインストールと日常的な使用の基準であり、過去の研究資料のすべての主張や未実装の計画を、現在の機能として扱うものではありません。
