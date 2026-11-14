# 初期設定・候補モデル

[한국어](../ko/configuration.md) · [English](../en/configuration.md) · [简体中文](../zh-CN/configuration.md) · [日本語](../ja/configuration.md)

[ガイド目次](../ja.md)

## 目次

- [設定ファイルの場所](#guide-host-config-locations)
- [CLI 設定](#guide-cli-configuration)
- [キーと再起動](#guide-keys-and-restart)
- [stable ランチャー](#guide-stable-launcher)
- [候補モデル](#guide-models-and-environment)

<a id="guide-host-config-locations"></a>

## 設定ファイルの場所

| ホスト | 既定の場所 | 別のアカウントホーム |
|---|---|---|
| Codex | `~/.codex/config.toml` | `$CODEX_HOME/config.toml` |
| Claude Code | `~/.claude.json` の `mcpServers.aptly` | `$CLAUDE_CONFIG_DIR/.claude.json` |

Claude Hook は既定では `~/.claude/settings.json`、別のアカウントでは `$CLAUDE_CONFIG_DIR/settings.json` にあります。インストール・設定・統計コマンドにもホストと同じアカウント環境を渡してください。別のホームのポリシー・台帳・キー・信頼記録をコピーしないでください。

Codex MCP の `@codex-home` ポリシーは 0.1.15 以降、`CODEX_HOME` がなければ `~/.codex` を選びます。明示された絶対パスが優先され、空値・相対パス・制御文字は拒否します。カスタムホームを探索しないため、管理者が値を渡さなければ既定ホームのポリシー・送信範囲が適用されます。手動・プロジェクト・管理登録は[高度な設定](advanced.md#guide-manual-mcp-setup)を参照してください。

<a id="guide-cli-configuration"></a>

## CLI 設定

```sh
aptly set default
aptly set env APTLY_CODEX_MODELS
aptly set env OPENAI_API_KEY
```

`set default` は不足する登録・既定値を追加し、[送信範囲](transmission.md)を確認します。既存の実行コマンド・環境・provider・候補・advisory ポリシーは保持します。`set env` は非表示入力を受け、指定した変数のみを変更します。既定の対象は両ホストで、`--client codex|claude|all` で選択します。

```sh
aptly set env APTLY_CLAUDE_MODELS --client claude
```

候補の入力は `["haiku","sonnet","opus"]` のような JSON 配列文字列です。自動化には `--stdin` を使ってください。実際のキーを `printf` やシェル履歴に入れないでください。

```sh
printf '%s\n' '["gpt-6.1-terra"]' | aptly set env APTLY_CODEX_MODELS --stdin
```

一般に許可されるキーは `ROUTER_PROVIDER`（`fixture`/`decisions`）、`APTLY_CLAUDE_MODELS`、`APTLY_CODEX_MODELS`、別名 `CLAUDE_MODELS`・`CODEX_MODELS`、`APTLY_MODEL_INFO_PATH` です。モデルキャッシュのパスは非公開ディレクトリ内の絶対パスである必要があります。管理用の台帳・ポリシーパスはこのコマンドでは変更しません。

<a id="guide-keys-and-restart"></a>

## キーと再起動

`aptly set env OPENAI_API_KEY` はホスト別のキーを macOS Keychain・Linux `secret-tool`・Windows Credential Manager に保存し、MCP にはストア参照のみを登録します。ストアがないかロックされている場合はエラーとし、平文ファイルや別の環境変数のキーに代替しません。[資格情報ストアのエラー](troubleshooting.md)を確認してください。

ホストのサブスクリプションログインと API キーは別です。キーをコマンド引数・設定 JSON・リクエスト・リポジトリに記録しないでください。安全な MCP 実行環境から直接渡す方法は[手動設定](advanced.md#guide-key-environment)にあります。

キーの保存は互換性を確認した標準ランチャーでのみ許可します。カスタムラッパーは保持しますが、`credential_launcher_unverified` で拒否する場合があります。`partial` の場合はホスト別のエラーを確認してください。保存失敗時は以前のキーの復元を試みます。`credential_rollback_failed` の場合は OS ストアで有効なキーを確認してから再試行してください。複数ホストの変更は一つの原子的な操作ではありません。

変更後、MCP を再起動し、`get_routing_capabilities` の候補・provider・`credential_status` を確認してください。`os_store` はキーを読み取ったことを示し、API の有効性検証ではありません。Codex の `/hooks` 承認も別途必要です。

<a id="guide-stable-launcher"></a>

## Node バージョン変更に強いランチャー

既定の登録は Node の絶対パスを使います。Node のバージョンを頻繁に切り替える macOS・Linux では `stable` を選べます（0.1.14 以降）。Node フォルダーの外に Aptly と依存関係を保存し、別の対応 Node.js 24 以上を探索します。Node 自体は含まず、Windows には対応しません。

新規登録には `aptly setup --client all --launcher stable` を使います。既存登録は dry run を確認してから移行してください。別のアカウントではそのホーム環境を渡し、Claude では `--client claude` に変更します。

```sh
aptly setup --client codex --migrate-launcher --launcher stable --dry-run
aptly setup --client codex --migrate-launcher --launcher stable
```

グローバル Aptly の更新後も同じコマンドで保存コピーを更新する必要があります。通常の `setup` はコピーを置き換えず、古いコピーは `stable_snapshot_outdated` で通知します。移行時は所有する MCP・統計オブザーバーを併せて更新します。変更されたランチャー・Hook は引き継ぎません。保持された標準登録が対象なら確認後に `--include-existing` を追加してください。Codex の変更された Hook は `/hooks` で再承認します。

<details>
<summary>ランチャーの制限と復旧</summary>

インストール時の Node → 標準パス → 既定の `~/.nvm/versions/node` → 安全な絶対 PATH の順に探索します。最新版の選択やカスタム NVM_DIR・shim・シンボリックリンクに基づくマネージャーへの対応は保証しません。シェルプロファイル・npm・ダウンロードは実行しません。`NODE_OPTIONS`・`NODE_PATH`・`NODE_REPL_EXTERNAL_MODULE` は除去するため、追加 CA には `NODE_EXTRA_CA_CERTS` などを確認してください。

書き込み可能な祖先パス・外部に hoist された依存関係・ネイティブアドオンなど、検証できないソースは拒否します。整合性確認には I/O コストが加わり、探索予算は全ファイル I/O の hard timeout ではありません。サンドボックスや配布者の署名認証ではありません。MCP は失敗時にエラーで停止し、統計オブザーバーは静かに終了します。

所有権が一致すれば、紛失・破損・旧形式のコピーから新しい CLI ソースへ明示的に移行できます。破損した同世代・未完了の lock は自動で上書き・削除しません。別のホーム・プロセスが参照する可能性があるため、以前のコピーも自動削除しません。書き込みプロセスと参照を確認してから状態を確認してください。直接 Node ランチャー同士の移行には別途統計の更新（`statistics_observer_migration_required`）が必要な場合があります。

</details>

<a id="guide-models-and-environment"></a>

## モデルと環境変数

等級はタスクのプリセットであり、提供元間のモデル性能が同等であることを意味しません。

| 等級 | Claude Code | Codex | 代表的なタスク |
|---|---|---|---|
| simple | `haiku` | `gpt-6-luna` / `max` | 抽出・形式変換・小さな機械的修正 |
| routine | `sonnet` | `gpt-6.1-terra` / `high` | 文脈を考慮した作成・翻訳・範囲が明確な実装 |
| deep | `opus` | `gpt-6.1-sol` / `medium` | 複合的なデバッグ・設計判断・詳細レビュー |

MCP の `env` 値は文字列のため、候補配列も JSON 文字列で渡します。

```json
{
  "env": {
    "APTLY_CLAUDE_MODELS": "[\"haiku\", \"sonnet\", \"opus\"]",
    "APTLY_CODEX_MODELS": "[\"gpt-6-luna\", \"gpt-6.1-terra\", \"gpt-6.1-sol\"]"
  }
}
```

未指定なら上記の既定値、`[]` ならそのホストの推薦を無効にします。空文字列・重複・非対応モデル・不正な JSON はエラーです。`CLAUDE_MODELS`・`CODEX_MODELS` も別名として対応しますが、同じ提供元の基本名と別名を同時に設定するとエラーです。候補設定は既存の選択を上書きせず、アカウントのモデルアクセス権限を認証しません。

`set default` は既存の候補・別名・受け渡し宣言を保持し、不足するモデル群にのみ既定値を追加します。Codex の継承候補が現在の CLI に見えなくても上書きしません。最終候補は MCP の再起動後に確認してください。

[インストール](installation.md) · [トラブルシューティング](troubleshooting.md) · [ガイド目次](../ja.md)
