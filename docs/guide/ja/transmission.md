# Decisions API の送信範囲

[한국어](../ko/transmission.md) · [English](../en/transmission.md) · [简体中文](../zh-CN/transmission.md) · [日本語](../ja/transmission.md)

[ガイド目次](../ja.md)

## 目次

- [送信範囲の選択](#guide-transmission-scope)
- [送信内容と制限](#guide-transmission-limits)

<a id="guide-transmission-scope"></a>

## 送信範囲の選択

送信先は **OpenAI Decisions API** であり、Aptly の開発者ではありません。新規登録は未選択（`unselected`）の状態で、自動送信しません。

| 範囲 | 自動推薦に送信できる情報 |
|---|---|
| `none` | 自動送信せず、元の呼び出しを保持 |
| `description` | 呼び出し元が提供した説明のみを送信。なければ文脈の補足を要求 |
| `excerpt` | 明示的な説明と対応する native タスクの抜粋を許可 |

初回の対話形式 `setup`・`set default` は、確認待ちのホームの範囲を尋ねます。推奨は `excerpt` で、Enter は既存の選択を保持し、未選択なら `none` を選びます。自動インストール・CI・非端末実行は同意として扱いません。キャンセルすると送信の選択は変わりませんが、それ以前の基本登録は完了している場合があります。

再確認するには次を実行してください（0.1.11 以降）。

```sh
aptly set transmission --review
```

現在値の参照や範囲の直接選択もできます。以下の変更コマンドのうち希望する一つだけを実行してください。対象は `--client codex|claude|all` で選びます。

```sh
aptly set transmission --show
aptly set transmission none
aptly set transmission description
aptly set transmission excerpt
```

変更後は MCP を再起動してください。既存の v1 ポリシーは変更前まで従来の `excerpt` として維持されます。運用者による変更・別のラッパーは自動で引き継ぎません。進行中の送信は取り消せず、変更前の結果・retry・fresh は新しいポリシーに適用しません。競合を新しい有料 ID で回避しないでください。

`--show` の `complete`/終了コード 0 は参照の完了を示し、実際の未設定・`none` も含みます。想定される設定の破損・欠落・競合は `partial`/終了コード 1 です。ホストの実行準備や同意を確認するコマンドではありません。

`advisory` は適用を制限するモードであり、送信禁止ではありません。`description` の説明が不足すると `defaults` は spawn をブロックし、`advisory` は通知します。`recommend_agent`・`aptly recommend` は別の明示的な要求のため、自動送信設定では禁止されません。

<details>
<summary>ポリシーを直接編集して緊急停止</summary>

`APTLY_HOOK_POLICY_PATH` の既存の非公開ポリシーで `enabled` のみを `false` にすると、自動分類・バインディング前に元の呼び出しを保持します。他のフィールド・所有権記録は編集しないでください。所有権の競合が生じる可能性があるため、通常の変更には上記 CLI を使ってください。ポリシーパスを消すと strict パスへ移行する可能性があるため、停止方法として使いません。開始済みの送信と明示的な直接推薦は取り消せません。

</details>

<a id="guide-transmission-limits"></a>

## 送信内容と制限

`excerpt` 範囲で事前登録された説明がない自動分類の `summary` は、許可されたタスクラベルと本文の**最初の段落を切り取って付けた抜粋**です。意味を新たに要約したり匿名化したりしません。UTF-8 サイズは `min(4000, max_summary_bytes)` 以下であり、HTTP リクエスト全体のサイズ制限ではありません。Codex の opaque メッセージの fallback は本文を復号・送信せず、十分に具体的な `task_name` のみを使います。ラベルにも機密情報が含まれる場合があります。

`prepare_spawn_context` に有効な説明を登録すると、固定接頭辞とその説明が native 抜粋の代わりに分類に使われます。登録自体は API を呼び出しません。`retry_spawn_recommendation` は文脈不足の応答後、固定接頭辞と新しい補足説明で一度再推薦し、以前の本文は付け加えません。どちらも生の説明は `min(3800, max_summary_bytes - 96)` バイト以下、接頭辞を含む説明は `min(4000, max_summary_bytes)` バイト以下です。`prepare_fresh_delegation` 自体は完了済みの推薦を再利用して追加分類を呼び出さず、独立した指示をローカルの次の呼び出し引数として返します。返されたモデル・effort をそのまま明示した Codex 呼び出しは、現在の Hook で `explicit_model` として分類せず保持されます。その後の呼び出しの経由確認は追加分類を意味しません。どの経路も説明に機密情報がないことや自動匿名化を保証しません。

Decisions には `client`、`task.summary`、`task.operation`、`task.context_sufficient` と候補プロファイル ID・モデル・effort の説明および設定されたモデル特性が送信されます。分類用 API キーは `Authorization` ヘッダーで、リクエスト ID は `X-Client-Request-Id` ヘッダーで送信します。自動経路の ID はハッシュで、直接推薦の ID は呼び出し元が指定します。ID や候補の説明にも秘密を入れないでください。

共有する要約を自分で選ぶには、自動共有を無効にしてから直接推薦に必要な情報のみを記述してください。Aptly は要約に記載された URL の文書やソースファイルを自動で読み取り添付しません。既知のキー・Bearer パターンを除く検査は、完全な秘密検出や送信の安全性を保証しません。

台帳と Hook バインディングにはリクエストメタデータ・ハッシュ・キャッシュ結果を保存し、タスクの抜粋は保存しません。Aptly の診断結果にも原文を含めません。ただし、ローカルホストが実行を続けられるよう Hook の `updatedInput` には元のタスクが保持されます。ホスト自体の会話・ログの保存は Aptly が制御しません。

[自動推薦](routing.md) · [予算](budget.md) · [ガイド目次](../ja.md)
