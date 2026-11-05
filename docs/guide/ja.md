# Aptly 使用ガイド

[한국어](ko.md) · [English](en.md) · [简体中文](zh-CN.md) · **日本語**

[README に戻る](../../README.ja.md)

韓国語版が正本です。このガイドは 0.1.0 ローカルパッケージ案を対象とします。npm registry で公開済みであることや、すべてのアカウントでモデルにアクセスできることを意味しません。子エージェントの実行・承認・サンドボックス・MCP 権限は、Claude Code または Codex が管理します。

## インストール

Node.js 24 以上と Claude Code または Codex が必要です。確認済みのアーカイブとインストール先を指定してください。

```sh
aptly_install=/absolute/aptly-local
npm install --prefix "$aptly_install" /absolute/path/aptly-0.1.0.tgz
"$aptly_install/node_modules/.bin/aptly" setup --client all --mode defaults
```

以降の例の `aptly` は、上記のインストール先にある実行ファイルを指します。PATH に追加していない場合はフルパスで実行してください。インストール済みの `node_modules` 内で TypeScript ソースを直接実行しないでください。

`postinstall` は、現在のユーザーの既存のホスト設定ディレクトリに MCP と `PreToolUse` Hook を登録します。`CODEX_HOME`・`CLAUDE_CONFIG_DIR` を使う場合は、インストールプロセスにも同じ環境を渡してください。まだ存在しないホストディレクトリは自動登録ではスキップし、明示的な `setup` で作成できます。必要なホストだけを登録するには、`--client codex` または `--client claude` を使用してください。

新規登録では `ROUTER_PROVIDER=decisions`、Hook の `defaults` ポリシー、ホストごとの非公開台帳を指定します。他の既存設定・Hook と、既存の Aptly のコマンド・環境・provider・台帳パスは保持します。既存の fixture 設定を自動で有料モードに切り替えることはありません。

### キーと再起動

`OPENAI_API_KEY` は分類用のキーです。子エージェントのモデルが使用する既存のログイン・サブスクリプション認証とは別のものです。ユーザーの認証情報ストアや安全な実行環境から、**MCP プロセスの環境変数として渡して**ください。キーをコマンドライン・ツール引数・リクエスト JSON・MCP 設定 JSON・ソース・ログ・一時ファイルに含めないでください。特定の認証情報ストアは必須ではありません。

ホストを新しく起動するか MCP サーバーを再起動して、登録と環境を読み込ませてください。別のターミナルで環境変数を変更するだけでは、実行中の GUI・MCP の環境は更新されません。**Codex では `/hooks` で新しい Hook の正確な定義を確認し、信頼を承認する必要があります。** インストーラーがこの承認を迂回することはありません。

キーがない場合や、接続・認証・タイムアウトのエラーが発生した場合は、元の呼び出しの引数を変更しません。直接 Decisions を呼び出すには、次の環境が必要です。

| 環境変数 | 用途 |
|---|---|
| `OPENAI_API_KEY` | 安全な実行環境から注入する分類用キー |
| `ROUTER_PROVIDER=decisions` | 実際の分類 API を使用 |
| `ROUTER_LEDGER_PATH` | ユーザー所有・権限 700 の非公開ディレクトリ内にある台帳の絶対パス |

### スキップ・削除

```sh
APTLY_SKIP_SETUP=1 npm install --prefix "$aptly_install" /absolute/path/aptly-0.1.0.tgz
aptly setup --client codex --mode defaults
aptly remove --client all
```

`CI` 環境や npm の `--ignore-scripts` でも自動登録をスキップします。直接 `setup` を実行して登録できます。`advisory` モードは推薦だけを伝え、引数は変更しません。ポリシーを変える場合は、既存の登録を削除した後、希望する `--mode` で再登録してください。結果が `partial` の場合は client ごとのエラーコードを確認してください。削除の対象は、登録時の所有情報と一致する項目だけです。ユーザーが変更した項目は保持し、競合があることを通知します。

## 自動 Hook

接続済みの対象呼び出しは、`route_spawn_hook` → Decisions を自動で経由します。`defaults` は、対象範囲でホストのデフォルトモデルより Aptly の選択を優先することを、運用者が許可するポリシーです。このポリシーは、ホストのすべての設定元を確認したことを示すものではありません。

| ホスト | 自動選択の対象 |
|---|---|
| Codex | モデル・effort・固定ロール・resume の指定がなく、`fork_turns: "none"` の新しい汎用呼び出し |
| Claude Code | モデル・effort・固定ロール・resume・履歴継承の指定がない、`subagent_type: "general-purpose"` の呼び出し |

明示的な指定とロール・fork・resume、承認・サンドボックス・MCP 権限は保持します。fixture の結果でデフォルトモデルを自動変更することはありません。コンテキスト不足・未対応の応答・キャンセル・呼び出しの変更がある場合は、元の引数を変更しません。同じ呼び出しの入力・ポリシー・カタログを結び付け、非同期応答後に再確認します。

別途設定せずに実行する CLI と既存の手動設定は、fixture / shadow がデフォルトです。ホスト設定の証拠（host-evidence）に基づく従来の経路は、自動ポリシーがない場合のものです。インストールしたデフォルト値選択ポリシーとは区別してください。ホスト内部のパッチは保留中で、直接推薦の前提条件ではありません。

| MCP ツール | 用途 |
|---|---|
| `get_routing_capabilities` | 候補・制限・provider・Hook の状態を、有料 API を呼び出さずに確認します |
| `recommend_agent` | タスク要約から直接推薦を取得します |
| `get_routing_precedence` | 呼び出しを保持する根拠と、未確認の設定元を説明します |
| `route_spawn_hook` | インストールしたポリシーに応じて、対象呼び出しのデフォルト値を選択するか、推薦だけを伝えます |

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

Codex が子エージェントの `message` を暗号文として Hook に渡す環境では、本文を読み取ったり復号したりしません。この場合は、十分に具体的な平文の `task_name` だけを要約として使用します。たとえば `sort_supplied_numbers_3_1_2_ascending_without_tools` のように、タスクの種類と範囲を表します。短い名前や曖昧な名前の場合は、元のモデルを保持します。Claude Code と平文の本文が渡される呼び出しでは、提供された本文の要約を使用します。

`get_routing_capabilities` の `automatic_hook.last_result` で、その MCP プロセスによる最後の適用・保持の理由を確認できます。`null` は、まだ自動 Hook の処理記録がないことを意味します。タスクの本文や個人の設定値は返しません。

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
