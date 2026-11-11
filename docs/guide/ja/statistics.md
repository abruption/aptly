# 実行統計

[한국어](../ko/statistics.md) · [English](../en/statistics.md) · [简体中文](../zh-CN/statistics.md) · [日本語](../ja/statistics.md)

[ガイド目次](../ja.md)

## このページの目次

- [実行統計（0.1.10 以降）](#guide-execution-statistics)

<a id="guide-execution-statistics"></a>

## 実行統計（0.1.10 以降）

実行統計は Aptly 0.1.10 以降で利用できます。対応バージョンをインストールするか、[パッケージの更新](installation.md#guide-package-updates)に従ってアップグレードしてから次の例を使用してください。既存の Aptly 設定が必要です。初期の収集は POSIX のみ対応し、Windows の統計収集は未対応です。Windows での通常の Aptly 利用には影響しません。

```sh
aptly stats
aptly stats --today --client codex
aptly stats enable --client codex
aptly stats enable --client codex --codex-native-metadata
aptly stats disable --client codex
```

`aptly stats` の読み取り（`--today` を含む）のトップレベル `status` は、照会が完了すると `complete`（終了コード 0）、未対応の統計要求や破損・読み取り・ストアのエラーがあると `partial`（終了コード 1）です。収集が無効な場合や実際に未設定のクライアントも照会完了です。一部のクライアントが失敗しても成功した結果は保持します。既存のクライアント JSON フィールドと値は維持するため、オブジェクト全体を厳密に検査する利用側は追加された `status` を受け入れてください。`complete` はホストのルーティング・モデル・信頼の準備を保証しません。予期しない統計エラーは `statistics_failed` で報告し、生のパス・入力・キー・スタックは出力しません。読み取りは自動修復・同意取得・プロバイダー呼び出しを行いません。

形式は `aptly stats [--today] [--client codex|claude|all]`、`aptly stats enable [--client] [--codex-native-metadata]`、`aptly stats disable [--client]` です。収集は既定で無効で、postinstall でも自動有効化しません。enable は Aptly 所有のコマンド観測器を設置し、別の `stats-ownership.json` に記録します。既存の receipt・MCP・launcher・キー・予算・送信設定は保持します。有効化後は MCP とホストを再起動し、Codex では `/hooks` で native Hook の信頼を確認してください。

`stats enable` は最初のイベント前に空の統計 DB を初期化し、既存 DB は検証して保持します。初期化に失敗すると `partial` と `statistics_store_initialization_failed` を返し、適用済みの登録設定が残る場合があります。旧バージョンで有効化後、イベントがなく DB が未作成の場合は `stats enable` を再実行してください。照会は DB の作成や修復を行いません。

disable は収集を無効にし、変更されていない所有観測器だけを削除します。変更済みやカスタムの観測器は警告して保持し、データとキーも残します。`remove` は統計所有の定義を検証・削除しますが、データは保持します。個別に管理される収集器やカスタム Hook は自動的に取り込みません。

非公開の状態は予算台帳とは別の `stats.sqlite`、`stats-config.json`、`stats-key`（HMAC 秘密鍵）を使用します。鍵を共有しないでください。記録にタスク原文・会話記録・生 ID・パス・エラー・資格情報は含まれません。統計の読み取りは API・キー・資格情報ストアにアクセスせず、初期化や通知も行いません。

集計は `model_match`、`model_mismatch`、`model_changed`、`unknown`、`pending`、`expired_pending`、`application_unconfirmed` を示し、advisory は別に扱います。`blocked`、`explicit_preserved`、`unbound` は分母から除外します。実際の effort は測定せず、設定された effort は実際の値ではありません。Claude のエイリアス `haiku`、`sonnet`、`opus`、`fable` は実際の正規モデルに解決できず `unknown` です。正確な正規モデルのみ対応し、モデルの観測は全エイリアスの一致を保証しません。ユーザーの受容や品質を示す数値ではありません。

直接 advisory・retry・native の連続性がない新規 unbound 呼び出しを曖昧な時刻で結合しません。`--today` はバインディングの初回作成日の UTC 日付を使います。容量は委任 10,000 件と 子 10,000 件に固定され、自動削除はありません。件数は保持レコードの値であり、生涯累計ではありません。容量到達時は新規 ID を破棄し、到達フラグを表示します。コールバックの欠落はバイパスの証拠ではありません。トークン・コストの集計、ライブ割当量や節約額はありません。

Codex native メタデータは明示オプションがない限り無効です。正確な子 ID で SQLite の native メタデータだけを読み、会話記録の取得・修復・app-server の起動はしません。移動された `sqlite_home`、未対応のスキーマ・パス、曖昧な結合は unknown です。SQL 読み取りで既存 SHM の読み取りマークが更新される場合がありますが、行・スキーマを書き込まず、sidecar を意図的に作成しません。

収集はベストエフォートです。イベントの欠落・遅延・容量超過により、モデル履歴が不完全になる場合があります。`model_match`は保持された証拠の一致であり、すべてのリクエストで同じモデルを使用した証明ではありません。Codexの収集無効化、設定削除、または`--codex-native-metadata`なしの有効化でnativeメタデータへの同意も解除されます。Nodeやパッケージのパスを変更した場合は、収集を無効化して再度有効化し、コマンドを更新してください。利用不能・破損したストアは保持されます。キーを削除したり使用量をゼロと判断したりせず、ローカルで確認してください。

## 関連文書

[自動推薦](routing.md) · [Decisions API の送信範囲](transmission.md) · [トラブルシューティング](troubleshooting.md)

[ガイド目次](../ja.md)
