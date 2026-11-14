# Aptly 使用ガイド

[한국어](ko.md) · [English](en.md) · [简体中文](zh-CN.md) · **日本語**

[README](../../README.ja.md)

韓国語版が正本です。初めて使う場合は、インストール → 初期設定 → 自動推薦の順にお読みください。

| 作業 | 文書 |
|---|---|
| インストール・更新・削除 | [インストール](ja/installation.md) |
| API キー・アカウントホーム・候補モデル・stable ランチャー | [設定](ja/configuration.md) |
| Hook の動作・推薦の保留・適用条件 | [自動推薦](ja/routing.md) |
| OpenAI Decisions API に送る情報の選択 | [送信範囲](ja/transmission.md) |
| 呼び出し・費用の上限 | [予算](ja/budget.md) |
| 推薦と実際の実行の比較 | [統計](ja/statistics.md) |
| 登録・資格情報ストア・台帳のエラー | [トラブルシューティング](ja/troubleshooting.md) |
| 手動 MCP 設定・直接推薦・開発 | [高度な連携](ja/advanced.md) |
| 測定方法と費用換算 | [費用実測](ja/benchmarks.md) |

<details>
<summary>以前の文書へのリンク</summary>

<a id="インストール"></a>
- [インストール](ja/installation.md#guide-installation)
<a id="npm-インストールスクリプトの許可"></a>
- [npm インストールスクリプトの許可](ja/installation.md#guide-npm-install-scripts)
<a id="パッケージの更新"></a>
- [パッケージの更新](ja/installation.md#guide-package-updates)
<a id="新しいバージョンの通知"></a>
- [新しいバージョンの通知](ja/installation.md#guide-version-notifications)
<a id="コマンドヘルプ018-以降"></a><a id="command-help"></a>
- [コマンドヘルプ（0.1.8 以降）](ja/installation.md#guide-command-help)
<a id="cli-による設定"></a>
- [CLI による設定](ja/configuration.md#guide-cli-configuration)
<a id="起動パスのエラーからの復旧"></a>
- [起動パスのエラーからの復旧](ja/troubleshooting.md#guide-launcher-recovery)
<a id="キーと再起動"></a>
- [キーと再起動](ja/configuration.md#guide-keys-and-restart)
<a id="mcp-環境変数の設定手順"></a>
- [MCP 環境変数の設定手順](ja/advanced.md#guide-manual-mcp-setup)
<a id="設定ファイルの場所"></a>
- [設定ファイルの場所](ja/configuration.md#guide-host-config-locations)
<a id="api-キーの渡し方"></a>
- [API キーの渡し方](ja/advanced.md#guide-key-environment)
<a id="codex-の例"></a>
- [Codex の例](ja/advanced.md#guide-codex-configuration)
<a id="claude-code-の例"></a>
- [Claude Code の例](ja/advanced.md#guide-claude-configuration)
<a id="スキップ削除"></a>
- [スキップ・削除](ja/installation.md#guide-skip-and-remove)
<a id="自動-hook"></a>
- [自動 Hook](ja/routing.md#guide-automatic-routing)
<a id="confidence-と推薦の保留"></a>
- [confidence と推薦の保留](ja/routing.md#guide-confidence-and-abstention)
<a id="予算上限と使用量018-以降"></a><a id="budget-limits"></a>
- [予算上限と使用量（0.1.8 以降）](ja/budget.md#guide-budget-limits)
<a id="実行統計0110-以降"></a><a id="execution-statistics"></a>
- [実行統計（0.1.10 以降）](ja/statistics.md#guide-execution-statistics)
<a id="decisions-api-への送信範囲"></a><a id="外部送信と自動共有の無効化"></a>
- [Decisions API への送信範囲](ja/transmission.md#guide-transmission-scope)
<a id="送信内容とフィルターの限界"></a>
- [送信内容とフィルターの限界](ja/transmission.md#guide-transmission-limits)
<a id="不透明な呼び出しへの明示的な説明014-以降"></a>
- [不透明な呼び出しへの明示的な説明（0.1.4 以降）](ja/advanced.md#guide-explicit-spawn-context)
<a id="文脈を補って再推薦する015-以降"></a>
- [文脈を補って再推薦する（0.1.5 以降）](ja/advanced.md#guide-context-retry)
<a id="自動ルーティングの保証範囲と拒否結果015-以降"></a>
- [自動ルーティングの保証範囲と拒否結果（0.1.5 以降）](ja/routing.md#guide-routing-guarantees)
<a id="別の独立した委任を準備する016-以降"></a>
- [別の独立した委任を準備する（0.1.6 以降）](ja/advanced.md#guide-fresh-delegation)
<a id="直接推薦"></a>
- [直接推薦](ja/advanced.md#guide-direct-recommendations)
<a id="モデルと環境変数"></a>
- [モデルと環境変数](ja/configuration.md#guide-models-and-environment)
<a id="公式説明とキャッシュ"></a>
- [公式説明とキャッシュ](ja/advanced.md#guide-model-info-cache)
<a id="コンテキストの提供"></a>
- [コンテキストの提供](ja/advanced.md#guide-context-delivery)
<a id="費用実測"></a>
- [費用実測](ja/benchmarks.md#guide-cost-benchmarks)
<a id="プロセス中断と台帳ロック"></a>
- [プロセス中断と台帳ロック](ja/troubleshooting.md#guide-ledger-lock-recovery)
<a id="診断と開発"></a>
- [診断と開発](ja/advanced.md#guide-diagnostics-and-development)

</details>
