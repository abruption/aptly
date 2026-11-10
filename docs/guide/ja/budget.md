# 予算上限

[한국어](../ko/budget.md) · [English](../en/budget.md) · [简体中文](../zh-CN/budget.md) · [日本語](../ja/budget.md)

[ガイド目次](../ja.md)

## このページの目次

- [予算上限と使用量（0.1.8 以降）](#guide-budget-limits)

<a id="guide-budget-limits"></a>

## 予算上限と使用量（0.1.8 以降）

予算環境設定と使用量照会は Aptly 0.1.8 以降で利用できます。`aptly set default` は選択したホストの未設定の予算環境変数も補います。予算に関する追加の質問はなく、明示的な `0` を含む既存値を保持し、使用量・台帳・キャッシュをリセットしません。既存の送信範囲の質問は別です。予算変数がない既存登録も、アップグレード後は新しいランタイム既定値を使います。従来の暗黙の 20 回・50 回・$0.50 の上限は維持されないため、必要な上限を明示的に設定してください。

| 環境変数 | 既定値 | 意味 |
|---|---:|---|
| `APTLY_MAX_DAILY_CALLS` | `200` | 台帳ごとの UTC 日次分類試行上限 |
| `APTLY_MAX_TOTAL_CALLS` | `0` | 台帳ごとの累積分類試行上限 |
| `APTLY_MAX_ESTIMATED_USD` | `0` | 累積ローカル予約額の上限 |
| `APTLY_ESTIMATED_CALL_USD` | `0.002` | 新しい分類試行ごとに予約する推定ドル額 |

三つの上限では `0` が無制限を意味します。試行ごとの予約単価は上限ではないため正数が必要です。無制限には厳密な `0` を使い、`0.0` や `0.00` は拒否します。未設定なら既定値を使い、空文字・負数・不正な数値・指数表記は拒否します。呼び出し数は整数、金額は小数点以下最大 6 桁の十進表記です。有限値の上限は日次 100,000 回・累積 1,000,000 回・金額設定 100 です。有限の金額上限は 1 回分の予約額以上である必要があります。既存の不正な値を自動で置き換えません。

```sh
aptly set env APTLY_MAX_DAILY_CALLS
aptly set env APTLY_MAX_TOTAL_CALLS
aptly set env APTLY_MAX_ESTIMATED_USD
aptly set env APTLY_ESTIMATED_CALL_USD
aptly budget status --client codex
aptly budget status --client claude
```

設定コマンドは `--client codex|claude|all`、非表示入力と明示的な `--stdin` に対応します。変更後は MCP を再起動してください。既存の Codex `env_vars` による予算変数の転送設定と、この CLI 実行環境で確認できる Claude の継承予算値も既定値で隠さず、`inherited` に表示します。直接の `recommend`・`capabilities` は CLI プロセスの環境を使い、ホスト設定ファイルを自動参照しません。状態照会は既存 gate を短時間占有するため、同時要求では一時的に `ledger_locked` が返る場合があります。状態は登録と許可された現在の環境のスナップショットであり、独自ラッパーや実行中ホストの値を認証しません。キー・API・タスク原文を参照せず、台帳や gate を作成しません。無制限は `Unlimited`、残量は `null` で表示します。同じ台帳を使うセッションは予算を共有しますが、他の台帳や OpenAI アカウント全体の使用量は合算しません。

`budget_exhausted` はローカル制限であり、OpenAI 認証や残高のエラーではありません。直接推薦・文脈補足の応答の `budget_limit` と状態の `exhausted_by` で上限を区別します。予約額は実際の請求上限ではなく、月次で自動リセットしません。単価変更で過去の予約を再計算せず、キー再入力や既定値適用で返金しません。

HTTP 前の新しい予算拒否はキャッシュしません。検証可能な既存の既定ポリシーによる未課金の拒否だけを同じ ID で再評価し、完了した推薦・保留・文脈不足の結果と `unknown` は保持します。予算回復は元の retry 参照の 5 分やプロセス寿命を延長せず、履歴や権限の制約も解除しません。任意の過去の独自ポリシーの digest を推測せず、新しい ID や台帳削除で競合・不明結果を回避しないでください。

## 関連文書

[Decisions API の送信範囲](transmission.md) · [費用の実測](benchmarks.md) · [トラブルシューティング](troubleshooting.md)

[ガイド目次](../ja.md)
