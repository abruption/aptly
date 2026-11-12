# 初期設定と候補モデル

[한국어](../ko/configuration.md) · [English](../en/configuration.md) · [简体中文](../zh-CN/configuration.md) · [日本語](../ja/configuration.md)

[ガイド目次](../ja.md)

設定前に、Codex を起動する環境の `CODEX_HOME`、または Claude Code の `CLAUDE_CONFIG_DIR` を確認してください。インストール・設定・統計のコマンドにも同じ環境を渡すと、そのアカウントのホームを選択します。

既定のホームとホストが使用するアカウントのホームが異なる場合があります。ホーム間でポリシー・台帳・キー・信頼記録をコピーしないでください。パスの競合や `existing_hook_not_owned` は登録を保持して確認し、[トラブルシューティング](troubleshooting.md)を参照してください。

MCP の手動設定は[高度な連携](advanced.md#guide-manual-mcp-setup)を参照してください。

## このページの目次

- [設定ファイルの場所](#guide-host-config-locations)
- [CLI による設定](#guide-cli-configuration)
- [キーと再起動](#guide-keys-and-restart)
- [モデルと環境変数](#guide-models-and-environment)

<a id="guide-host-config-locations"></a>

## 設定ファイルの場所

| ホスト | Aptly が使用するユーザー登録の場所 |
|---|---|
| Codex | `$CODEX_HOME/config.toml`。`CODEX_HOME` 未指定の場合は `~/.codex/config.toml` |
| Claude Code | `~/.claude.json` の `mcpServers.aptly`。`CLAUDE_CONFIG_DIR` 指定時は、そのディレクトリの `.claude.json` |

Claude Code の Hook ファイルは通常 `~/.claude/settings.json` ですが、`CLAUDE_CONFIG_DIR` を指定すると `$CLAUDE_CONFIG_DIR/settings.json` になります。MCP 登録とは別です。プロジェクトの `.mcp.json`、管理設定、アカウント別ディレクトリを使う場合は、編集・追加前に `/mcp` で有効な登録を確認してください。

<a id="guide-cli-configuration"></a>

## CLI による設定

0.1.11 以降、最初の通常の対話形式 `aptly set default` がクライアントホームごとのレビュー待ち項目をまとめて質問します。`excerpt` を推奨し、Enter は既存の範囲を保持するか、未選択なら `none` を選びます。[送信レビュー](transmission.md#guide-transmission-scope)を参照してください。この再レビューの流れは 0.1.10 ではサポートされないため、先に更新してください。

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

<a id="guide-keys-and-restart"></a>

## キーと再起動

分類用の `OPENAI_API_KEY` は、安全な環境や資格情報ランチャーを通して MCP プロセスに渡してください。ホストのサブスクリプション認証とは別です。キーの値をコマンド引数・リクエスト・設定ファイル・ソース・ログ・一時ファイルに記録しないでください。

<a id="guide-models-and-environment"></a>

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

`aptly set default` は、MCP `env` の既存候補と別名、Codex `env_vars` の転送宣言、および現在の CLI で確認できる Claude の継承候補を保持します。同じモデル系列の両方の変数名が未設定の場合だけ既定候補を追加します。Codex の転送変数は現在の端末で値を確認できなくても既定値に置き換えず、継承値を設定ファイルにコピーしません。CLI は同名の静的な `env` 値を優先して有効な設定を検証します。カタログの検証は維持されるため、別名の競合や不正な値があれば設定変更を拒否します。再起動した MCP の最終候補は別途確認してください。

## 関連文書

[インストールと更新](installation.md) · [自動推薦](routing.md) · [Decisions API の送信範囲](transmission.md) · [高度な MCP 連携と開発参考](advanced.md) · [トラブルシューティング](troubleshooting.md)

[ガイド目次](../ja.md)
