# 高度な MCP 連携と開発参考

[한국어](../ko/advanced.md) · [English](../en/advanced.md) · [简体中文](../zh-CN/advanced.md) · [日本語](../ja/advanced.md)

[ガイド目次](../ja.md)

## このページの目次

- [MCP 環境変数の設定手順](#guide-manual-mcp-setup)
- [API キーの渡し方](#guide-key-environment)
- [Codex の例](#guide-codex-configuration)
- [Claude Code の例](#guide-claude-configuration)
- [直接推薦](#guide-direct-recommendations)
- [不透明な呼び出しへの明示的な説明（0.1.4 以降）](#guide-explicit-spawn-context)
- [文脈を補って再推薦する（0.1.5 以降）](#guide-context-retry)
- [別の独立した委任を準備する（0.1.6 以降）](#guide-fresh-delegation)
- [公式説明とキャッシュ](#guide-model-info-cache)
- [コンテキストの提供](#guide-context-delivery)
- [診断と開発](#guide-diagnostics-and-development)

<a id="guide-manual-mcp-setup"></a>

## MCP 環境変数の設定手順

`setup` 後、以下の例を既存の `aptly` 登録に統合してください。`command`、`args`、資格情報ランチャー、`ROUTER_LEDGER_PATH`、`APTLY_HOOK_POLICY_PATH` は保持します。Setup は非公開の台帳・ポリシーディレクトリを作成します。台帳を手動指定する場合は、ユーザー所有で権限 700 のディレクトリ内の絶対パスを使ってください。

<a id="guide-key-environment"></a>

### API キーの渡し方

直接起動する場合は、**Bash** でキーを画面やコマンド履歴に残さず入力し、同じシェルからホストを起動します。zsh では先に `bash` を実行してください:

```sh
read -rsp 'OpenAI API key: ' OPENAI_API_KEY
printf '\n'
export OPENAI_API_KEY
codex
```

Claude Code では `codex` を `claude` に置き換えます。キーは永続保存されません。起動済み GUI は別のターミナルの環境を継承しないため、アプリの安全な環境受け渡し機能か既存の資格情報ランチャーを使ってください。

<a id="guide-codex-configuration"></a>

### Codex の例

既存の `[mcp_servers.aptly]` テーブルを編集し、同じテーブルを重複追加しないでください。`env_vars` の既存項目を保持して `OPENAI_API_KEY` を追加します。`env_vars` はホストの環境変数を名前で転送し、`.env` は MCP に固定値を渡します。

```toml
[mcp_servers.aptly]
env_vars = ["OPENAI_API_KEY"]

[mcp_servers.aptly.env]
ROUTER_PROVIDER = "decisions"
APTLY_CLAUDE_MODELS = '["haiku","sonnet","opus"]'
APTLY_CODEX_MODELS = '["gpt-6-luna","gpt-6.1-terra","gpt-6.1-sol"]'
```

<a id="guide-claude-configuration"></a>

### Claude Code の例

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

<a id="guide-direct-recommendations"></a>

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

<a id="guide-explicit-spawn-context"></a>

## 不透明な呼び出しへの明示的な説明（0.1.4 以降）

実際の予定セッション・呼び出し ID と元のイベントを知る連携は、Hook の前に同じ MCP プロセスで `prepare_spawn_context({client, event, description})` を呼べます。目的・範囲・出力・制約・複雑さを短く記述してください。URL の内容は取得しません。上限付き説明と固定接頭文だけが抜粋を置き換え、履歴・ファイル・不透明な本文は送信しません。`cancel_spawn_context({client, event})` で取り消せます。有効な自動ポリシーが必要で、`enabled: false` は共有を止めます。既知の秘密パターン検査は完全ではありません。

対応付けは5分間有効で変更不可、プロセスごとに最大128件です。入力変更・期限切れ・取消時は分類を止め、評価済みの呼び出しを説明変更で有料再試行しません。実際の予定イベントを取得できない呼び出し元は利用できません。標準 Hook は説明や呼び出し ID を作成しません。ローカルの `insufficient_context`、プロバイダーの `provider_needs_context`、適用時の `inherited_context_application_unverified` は別の結果です。限定的な native 説明受け渡しの検証は[契約](../../SPAWN_CONTEXT.md)に記録しています。この検証は、説明の自動生成や推薦モデルの実行を証明するものではありません。

<a id="guide-context-retry"></a>

## 文脈を補って再推薦する（0.1.5 以降）

自動 Hook が `insufficient_context` または `provider_needs_context` を返すと、`retry_id` と補足手順を提示します。`defaults` ではその生成呼び出しを拒否し、`advisory` では案内だけを返します。親エージェントは既知の情報から目的・範囲・期待する出力・複雑さを短く説明し、5分以内に同じ MCP プロセスで `retry_spawn_recommendation({retry_id, description})` を呼んでください。将来の native 呼び出し ID は不要です。本当に情報が不足する場合だけユーザーに質問してください。

元の呼び出しごとに補足は一度だけです。同じ入力はキャッシュを再利用し、説明の変更は競合として拒否します。再推薦も文脈不足または失敗なら終了し、結果不明の有料要求を新しい ID で繰り返さないでください。`spawn_application` が `blocked` なら推薦を適用せず制約を報告してください。それ以外も親は明示的な選択・履歴・役割・権限を保ち、新しい互換 native 呼び出しに未指定のモデル・effort だけを渡す必要があります。Hook 自体が親の再要求や native 実行を行うわけではありません。元の `prepare_spawn_context` の対応付けは変更不可のままです。[制限・費用・検証契約](../../SPAWN_CONTEXT.md#one-context-supplement-after-a-hook-response)を参照してください。

再推薦の応答は `next_call.set_if_unspecified` に次の native 呼び出しで補う具体的な未指定フィールドを返します。明示済みのモデル・effort は含めず、Claude に effort を追加しません。履歴などで適用できない結果には `next_call` を返しません。実行証拠や権限承認ではありません。

キャッシュを再利用できるのは最初の結果が完了した場合です。結果が不明なら `outcome_unknown` を保持し、新しい ID で有料呼び出しを繰り返さないでください。

`context_retry_allowed: false` は追加の文脈補足を終了する意味です。互換性のある推薦の `caller_review_required` は親が引数を確認する意味であり、新しいユーザー承認の要求ではありません。既存の委任権限とホストの権限確認は引き続き適用されます。

<a id="guide-fresh-delegation"></a>

## 別の独立した委任を準備する（0.1.6 以降）

defaults Hook が継承呼び出しへの適用を拒否した後、呼び出し元が**同じ独立タスクであり、ユーザーが継承履歴を要求せず、完全な独立指示を渡せる**と宣言できる場合だけ `prepare_fresh_delegation` を使えます。同じプロセスで Hook または再推薦の `retry_id`、`task_name`、`standalone_task` と `declaration: {independent_task:true, same_task:true, original_call_outcome:"blocked", history_requirement:"not_required", standalone_context_complete:true}` を渡してください。完了済みの許可プロファイルを再確認し、分類を追加で呼びません。

元の継承呼び出しは拒否されたままです。別の `next_call.arguments` を確認し、既存の委任権限と通常のホスト権限確認の下で新しい呼び出しを送ってください。`fork_turns: "none"` と、元の選択を保つモデル・effort を含みます。呼び出し元の宣言であり、ユーザー意図や実行を検証するものではありません。履歴が必要・不明、固定役割、resume、未検証の追加実行引数がある場合は使わないでください。参照は一つのタスクだけに結び付き、5分の期限・取消・ポリシー/候補/元の呼び出しの変更で準備を止めます。元の実行を許す advisory 経路には提供しません。[契約と制限](../../SPAWN_CONTEXT.md#intentional-fresh-delegation)を確認してください。

ホストが元の呼び出しの拒否を報告した後だけ使ってください。`original_call_outcome` が `executed` または `unknown` なら準備を拒否します。これは呼び出し元の宣言で、サーバーの実行観測ではありません。同じ準備の反復は子の一回実行を保証しません。プロファイルは元の分類要約に基づくため別タスクに再利用しないでください。

<a id="guide-model-info-cache"></a>

## 公式説明とキャッシュ

Decisions の選択肢には、モデル名・Codex effort・公式の特性・タスク区分の説明を一緒に送ります。同梱の説明で開始でき、推薦のたびにドキュメントを取得することはありません。最新の公式 Markdown を反映するには、明示的に更新します。出力先の親ディレクトリは、ユーザー所有の非公開ディレクトリとして事前に用意してください。

```sh
mkdir -m 700 /absolute/private-aptly-state
aptly catalog refresh --output /absolute/private-aptly-state/model-info.json
export APTLY_MODEL_INFO_PATH=/absolute/private-aptly-state/model-info.json
```

更新時は、固定の [Claude モデルドキュメント](https://code.claude.com/docs/en/model-config.md)と [OpenAI モデルドキュメント](https://learn.chatgpt.com/docs/models.md)だけを読み、API キーは必要ありません。短く正規化したモデル情報だけを保存し、失敗した場合は既存のファイルを保持します。起動時にキャッシュを読み、7 日を超えているか無効な場合は同梱の説明を使用します。更新後は MCP を再起動してください。新しいドキュメントにモデルが登場しても、候補を自動追加したり、アカウントでのアクセス可否を確認したりすることはありません。

<a id="guide-context-delivery"></a>

## コンテキストの提供

Codex が子エージェントの `message` を暗号文として Hook に渡す環境では、本文を読み取ったり復号したりしません。この場合は、十分に具体的な平文の `task_name` だけを要約として使用します。たとえば `sort_supplied_numbers_3_1_2_ascending_without_tools` のように、タスクの種類と範囲を表します。未対応または曖昧なタスク名の場合は、元のモデルを保持します。Claude Code と平文の本文が渡される呼び出しでは、提供された本文の要約を使用します。

同じ `client` と元の Hook `event` を指定して `get_spawn_routing_observation` で対象呼び出しを照会します。ハッシュ化した相関 ID と、事前確認・分類/キャッシュ結果・推薦・引数更新/適用停止・`execution: not_observed` を区別して返します。`arguments_updated` は Hook が出力した引数だけを意味し、実際の子モデルの観測ではありません。記録は当該 MCP プロセスの直近 128 件・10 分に限られます。`not_observed` は別プロセス・再起動・期限切れ・削除・入力不一致でも発生し、全体の Hook 迂回を証明しません。プロセス共通の `automatic_hook.last_result` は削除します。タスク原文・パス・セッション ID・資格情報は返しません。

直接推薦では、リポジトリ・ファイルの URL と、ドキュメントを読んで整理したタスクの範囲・規模・制約を、要約に含めて提供できます。URL の文字列を送ることと、ドキュメントの本文を提供することは異なります。現在の Aptly の分類リクエスト処理コードは、リポジトリ URL を GET したり、ドキュメントを収集したりしません。必要なドキュメントの取得と要約は、呼び出し元が行います。

現在の自動 Hook には、URL を別途平文で渡すフィールドがありません。URL を暗号化される `message` に追加しただけで、分類に渡されるとは想定しないでください。直接 MCP 推薦を受け取り、そのプロファイルをホストの呼び出し引数として渡す経路と、自動 Hook の適用は区別してください。

<a id="guide-diagnostics-and-development"></a>

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

ソースの作業ディレクトリで `npm run check:docs` を実行すると、文書リンク・パッケージ・言語間の対応例を検査できます。

## 関連文書

[自動推薦](routing.md) · [初期設定と候補モデル](configuration.md) · [トラブルシューティング](troubleshooting.md) · [費用の実測](benchmarks.md)

[ガイド目次](../ja.md)
