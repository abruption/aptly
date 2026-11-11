# Decisions API の送信範囲

[한국어](../ko/transmission.md) · [English](../en/transmission.md) · [简体中文](../zh-CN/transmission.md) · [日本語](../ja/transmission.md)

[ガイド目次](../ja.md)

以下の送信レビューと `--review` コマンドは **Aptly 0.1.11 以降で提供されます**。0.1.10 を使用している場合は、先にパッケージを更新してください。

## このページの目次

- [Decisions API への送信範囲](#guide-transmission-scope)
- [送信内容とフィルターの限界](#guide-transmission-limits)

<a id="guide-transmission-scope"></a>

## Decisions API への送信範囲

この節の送信範囲コマンドは Aptly 0.1.7 以降で利用できます。

ここでの送信は、**ローカルのタスク情報を OpenAI Decisions API に送ること**であり、Aptly の開発者にタスクを提供する機能ではありません。適用モード `defaults/advisory` と送信範囲は別の設定です。新規登録は v2 ポリシーの `unselected` となり、自動送信しません。

0.1.10 からアップグレードする際の参考: このバージョンの対話形式 `aptly set default` は未選択のホストだけに質問し、Enter で `none` を選びます。非対話実行と postinstall は質問せず、同意したものとして扱いません。

0.1.11 以降、最初の通常の対話形式 `aptly setup` または `aptly set default` で、レビュー待ちのクライアントをまとめて一度に質問し、各現在値・出所・既定または上書きされたホームを表示します。推奨は選択肢 3 の `excerpt` です。Enter または維持を選ぶと既存の明示的な範囲・legacy 範囲と `none` を保持し、未選択の場合は `none` になります。明示的な `setup --transmission` または `set transmission <scope>` は実際の選択をレビュー済みとして記録します。クライアントホームごとの非公開 revision 1 マーカーはパッケージバージョン・モード・統計とは独立しており、通常のパッチ更新や再起動では再質問しません。

以下のコマンドは 0.1.11 以降でサポートされ、明示的な要求により毎回質問します。0.1.10 では先に更新してください:

```sh
aptly set transmission --review
```

キャンセルすると範囲とレビューマーカーは変わりません。通常の setup または default では送信以外の既定設定が既に適用されている場合があります。自動 setup、check、migrate、送信範囲を明示した setup、CI、非 TTY、setup のスキップ、npm lifecycle スクリプト、MCP、Hook、help、show、統計の読み取りでは質問しません。質問は stderr に出力し、JSON stdout は維持します。既存の無効化ポリシー・モード・ランチャー・キー・台帳・統計・信頼設定を保持します。

0.1.10 の更新プロセスは、更新された CLI の新しい質問を直ちに読み込みません。0.1.11 以降に更新した後、同じアカウント環境で対話形式の `aptly setup`、`aptly set default` または `aptly set transmission --review` を実行してください。0.1.11 以降の `aptly update` も新しいプロセスを起動せず、後続の設定コマンドを案内します。

```sh
aptly set transmission --show
aptly set transmission none
aptly set transmission description
aptly set transmission excerpt
```

変更コマンドは選択肢を示しています。希望する一つだけを実行してください。`--client codex|claude|all` で対象を選べます。`none` は自動送信を停止し、元の呼び出しを保持します。`description` は親エージェントが提供した説明だけを許可します。説明がなければ API 呼び出し前に文脈補足を求め、native 本文やラベルには自動で切り替えません。`defaults` は未解決の spawn を拒否し、`advisory` は案内のみを返します。`excerpt` は既存の native 抜粋と明示的な説明を許可します。出所・サイズ・既知の秘密パターンの検査は、非機密性やユーザーの同意を証明しません。

既存の v1 ポリシーはバイト単位で保持され、出所 `legacy` の `excerpt` と表示されます。明示的な変更時だけ v2 に移行し、所有権記録も同時に更新します。変更済みポリシーや独自ランチャーを自動で引き継がず、競合時は保持します。キー・台帳・不明な記録は削除しません。変更後は MCP を再起動してください。開始済みの送信は回収できず、ポリシー変更前の処理中結果・retry・fresh 準備は適用されません。既存の結合競合を新しい有料 ID で回避しないでください。明示的な `recommend_agent` と `aptly recommend` は別の要求であり、この自動送信設定では禁止しません。

手動の `enabled: false` は緊急停止として有効ですが、所有権記録と競合する場合があります。通常の変更には上記コマンドを使い、検査を回避するために所有権記録を編集しないでください。

<a id="guide-transmission-limits"></a>

## 送信内容とフィルターの限界

`excerpt` の範囲では、事前登録された説明がない場合、自動分類の `summary` は、有効なタスクラベルと本文の**最初の段落を切り詰めて組み合わせた抜粋**です。意味を再要約したものでも、匿名化したものでもありません。UTF-8 のサイズは `min(4000, max_summary_bytes)` 以下ですが、HTTP リクエスト全体の上限ではありません。Codex の opaque メッセージへのフォールバックでは、本文を復号・送信せず、十分に具体的な `task_name` だけを使用します。ラベルにも機密情報が含まれる可能性があります。

有効な `prepare_spawn_context` の説明は、固定の接頭辞とともに native の抜粋に代わって分類に使用されます。登録自体は API を呼び出しません。文脈不足の応答後、`retry_spawn_recommendation` は以前の本文を付け加えず、固定の接頭辞と新しい補足説明で一度だけ再推薦できます。両経路とも説明原文は `min(3800, max_summary_bytes - 96)` バイト以下、接頭辞を含む説明は `min(4000, max_summary_bytes)` バイト以下です。`prepare_fresh_delegation` 自体は完了済みの推薦を再利用し、追加の分類を呼び出さず、独立した指示をローカルの次回呼び出し引数として返します。返されたモデルと effort をそのまま明示した Codex 呼び出しは、現在の Hook で `explicit_model` として分類せずに保持されます。後続の呼び出しを検査することは、追加の分類を意味しません。どの経路も、説明に機密情報が含まれないことや自動的な匿名化を保証しません。

Decisions には `client`、`task.summary`、`task.operation`、`task.context_sufficient` と、候補プロファイル ID・モデルと effort の説明・設定したモデル特性を送信します。分類用 API キーは `Authorization` ヘッダー、リクエスト ID は `X-Client-Request-Id` ヘッダーで送信します。自動経路の ID はハッシュで、直接推薦の ID は呼び出し元が指定します。ID や候補の説明にも秘密情報を含めないでください。

自動共有を無効にするには、`APTLY_HOOK_POLICY_PATH` が指す既存の非公開ポリシーファイルで、**`enabled` だけを `false` に変更**してください。他のフィールドと所有権の記録は保持してください。その後の自動 Hook 呼び出しは、分類や呼び出しバインディングファイルの作成前に元の呼び出しを保持します。開始済みの送信を取り消したり、サーバーが受信した情報を回収したりすることはできません。生成済みのポリシーを変更すると、登録・設定・削除コマンドの所有権検査で競合する場合があり、それらのコマンドは無効化したポリシーを上書きしません。検査を回避するために所有権の記録を編集しないでください。

送信範囲で許可されていれば `mode: advisory` でも分類データは送信されるため、プライバシー上の共有停止にはなりません。`APTLY_HOOK_POLICY_PATH` を削除すると従来の strict 経路が有効になる場合があるため、共有停止の代わりにしないでください。`enabled: false` は、明示的な `recommend_agent` や `aptly recommend` のリクエストを止めるものではありません。

共有する要約を自分で選ぶ場合は、自動共有を無効にしてから直接推薦に必要な情報だけを記述してください。Aptly は要約中の URL の文書や、言及されたソースファイルを自動取得・添付しません。既知のキーや Bearer のパターン検査は、完全な秘密情報の検出や送信の安全性を保証しません。

台帳と Hook バインディングにはリクエストのメタデータ・ハッシュ・キャッシュ結果を保存し、タスクの抜粋は保存しません。Aptly の診断にもタスク原文を含めません。ただし、ローカルの Hook の `updatedInput` は、ホストが実行を続けられるよう元のタスクを保持します。ホスト自身の会話やログの保存は Aptly の制御対象ではありません。

## 関連文書

[自動推薦](routing.md) · [予算上限](budget.md) · [実行統計](statistics.md)

[ガイド目次](../ja.md)
