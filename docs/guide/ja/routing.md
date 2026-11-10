# 自動推薦

[한국어](../ko/routing.md) · [English](../en/routing.md) · [简体中文](../zh-CN/routing.md) · [日本語](../ja/routing.md)

[ガイド目次](../ja.md)

## このページの目次

- [自動 Hook](#guide-automatic-routing)
- [confidence と推薦の保留](#guide-confidence-and-abstention)
- [自動ルーティングの保証範囲と拒否結果（0.1.5 以降）](#guide-routing-guarantees)

<a id="guide-automatic-routing"></a>

## 自動 Hook

**以下の事前確認・推薦・観測の動作は Aptly 0.1.4 以降で利用できます。** インストールした `PreToolUse` matcher は Codex の `spawn_agent` / `collaborationspawn_agent` / `Agent` と Claude Code の `Agent` を、native 実行前にローカルの `route_spawn_hook` へ渡します。ホストによる Hook の読み込み・信頼承認と MCP 接続が必要です。未設定・未対応のホストや MCP 接続失敗時まで Aptly が介入を強制することはできず、実行はホストが担当します。

ローカルの事前確認で明示フィールド・ロール・resume・ポリシー・キャッシュ・予算を評価します。呼び出しごとに新しい有料 Decisions 要求が必要なわけではありません。Codex のモデルまたは effort だけが指定された場合は、一致する許可済みの組み合わせに候補を絞り、未指定フィールドだけを補います。両方の指定、未対応値、固定ロール、resume は分類せず保持します。入力だけからユーザー指定かホストのデフォルトかを断定しません。

モデル・effort が未指定なら `fork_turns: "all"` や fork の省略も推薦を評価します。ただし**履歴は変更しません**。Codex のモデル・effort 適用には明示的な `fork_turns: "none"` が必要です。それ以外は `inherited_context_application_unverified` として元の引数を保持します。他の履歴フィールドは `history_semantics_unverified` で適用を止め、Claude の適用も履歴制約のない汎用呼び出しに限ります。推薦の生成と適用は別です。

Codex の本文が不透明な場合、`cleanup_merged_worktrees` のような具体的な短い作業名だけでも推薦できます。短い名前は cleanup/remove/prune + merged + worktrees/branches、または review/fix/test + failing/broken/flaky + tests/builds の組み合わせに限定し、他は従来の6単語チェックを維持します。本文は復号も送信もしません。詳細条件や削除権限は推測しません。履歴継承時の適用は対象ホストで未検証であり、全バージョンで不可能という意味ではありません。公開ソースだけでは実行環境の対応を確認できません。

独立した作業の場合だけ、呼び出し側が十分な単独のタスク情報を渡し、新しい子を明示的に選択してください。Aptly は `all` を `none` に変更せず、履歴の削除や明示モデル・effort の上書きもしません。[合成の継承・新規子の例](../../../examples/spawn-preflight.codex.json)は別々の要求であり、自動再試行ではありません。結果不明の有料呼び出しを新しい ID で再試行しないでください。

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

<a id="guide-confidence-and-abstention"></a>

## confidence と推薦の保留

`confidence` はメタデータであり、校正された正解確率としては検証されていません。現在、自動適用の閾値としては使用しません。現在は他の適用条件を満たせば、0 や低い値も許容します。実際の Decisions 応答で値が欠けている場合はエラーとして拒否しますが、汎用 Router と保存結果では任意項目です。`keep_current` と `needs_context` は数値とは別の結果であり、既存の保留・文脈補足規則に従います。明示されたモデル・effort・履歴・権限は保持します。小規模な分類評価だけで、子タスクの品質や総費用の改善を主張しません。

<a id="guide-routing-guarantees"></a>

## 自動ルーティングの保証範囲と拒否結果（0.1.5 以降）

保証は、有効かつ信頼済みの Hook が接続中の MCP で処理する対応呼び出しに限ります。`get_routing_capabilities.automatic_hook.guarantee` で範囲を確認してください。サーバーは未登録・未信頼・切断・ホスト側で失敗した Hook を検出したり強制したりできず、その後の処理はホストが決めます。MCP の接続表示だけでは個別呼び出しの経由を証明できません。

有効なポリシーと対象呼び出しを確認した後、`defaults` は適用不能・予算超過・分類失敗・結果不明を `deny` と安全な理由コードで返します。元の引数と制約は保持しますが、その生成は実行しません。継承履歴の互換性が未検証なら、親のデフォルトで黙って実行したり `none` に切り替えたりせず、制約を報告してください。`advisory` は拒否せず同じ制限を説明します。ポリシー未設定・無効、明示タプル・固定役割・resume は意図的なローカル保持経路であり、一律には拒否しません。

復旧 ID があれば、同じ MCP プロセスで `get_spawn_routing_observation({retry_id})` を呼べます。従来の `{client, event}` 形式も使えますが、混在や不完全な入力は拒否します。元の `awaiting_context` と `context_retry.outcome` は別の段階です。拒否した重複要求は `last_attempt` に記録し、以前の分類結果を上書きしません。照会は有料要求を発行せず、保持期限も延長しません。実行は常に `not_observed` であり、推薦や引数更新は実際の子の実行証拠ではありません。

## 関連文書

[初期設定と候補モデル](configuration.md) · [Decisions API の送信範囲](transmission.md) · [実行統計](statistics.md) · [高度な MCP 連携と開発参考](advanced.md)

[ガイド目次](../ja.md)
