<div align="center">

# Aptly

[![npm version](https://img.shields.io/npm/v/aptly)](https://www.npmjs.com/package/aptly)
[![npm downloads](https://img.shields.io/npm/dm/aptly)](https://www.npmjs.com/package/aptly)
[![MIT license](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/abruption/aptly/blob/main/LICENSE)

**Model and reasoning recommendations for subagents, powered by the OpenAI Decisions API.**

[한국어](README.md) · [English](README.en.md) · [简体中文](README.zh-CN.md) · **日本語**

**タスクに適した Claude Code・Codex のサブエージェント用モデルと effort を選ぶローカル MCP です。**

</div>

Aptly は必要最小限のタスク要約を OpenAI Decisions API で分類し、あらかじめ許可された実行プロファイルを推薦します。インストールした Hook は、明示的な指定のない新しい汎用サブエージェントのデフォルト値を自動で選択できます。サブエージェントの実行と権限に関する判断は、既存のホストが行います。

独自テストでは、**API 換算コストが約 52～58% 減少しました**。[測定条件と詳細結果](docs/guide/ja.md#費用実測)をご覧ください。

## クイックスタート

Node.js **24 以上**と Claude Code または Codex が必要です。以下のコマンドで最新の安定版をグローバルインストールしてください。

```sh
npm install -g aptly@latest --allow-scripts=aptly
aptly setup --client all --mode defaults
aptly --version
```

`aptly --version` でインストール済みのバージョンを確認してください。対応する npm では、`--allow-scripts=aptly` で Aptly のインストールスクリプトを許可します。このオプションに対応していない npm では、[インストール案内](docs/guide/ja.md#インストール)の明示的なインストール・設定手順に従ってください。

アップグレード前に、関連するホスト・MCP・CLI の全プロセスを停止し、[インストールとアップグレードの案内](docs/guide/ja.md#インストール)で台帳の移行手順を確認してください。

インストール時の `postinstall` は、既存のホスト設定ディレクトリに MCP と `PreToolUse` Hook を登録します。自動登録をスキップした場合や、ホストに設定ディレクトリがまだない場合も、`setup` を明示的に実行して登録できます。他の既存設定・Hook と、既存の Aptly の実行コマンド・環境は保持します。

分類用の `OPENAI_API_KEY` は、`aptly set env OPENAI_API_KEY` の非表示入力で OS の資格情報ストアに保存するか、安全な実行環境から MCP プロセスに渡してください。キーをコマンドライン・リクエスト・設定 JSON・リポジトリに記載しないでください。ホストまたは MCP を再起動した後、**Codex では `/hooks` で新しい Hook を確認し、信頼を承認**してください。[インストール・キー・登録の詳細](docs/guide/ja.md#インストール)を確認してください。

## 使用方法

| 方法 | 動作 |
|---|---|
| 自動 Hook | 新しい呼び出しの制約を確認し、未指定のデフォルト値を推薦します |
| 直接推薦 | `recommend_agent` または `aptly recommend` でプロファイルを受け取り、実行するかどうかをホストで明示的に判断します |
| fixture | キーやネットワークを使わず、ローカルで生成した試験用の推薦を確認できます。実際の Decisions の結果ではありません |

次のリリースでは継承呼び出しも推薦を評価します。適用には Codex の明示的な `fork_turns: "none"`、または履歴制約のない Claude Code の汎用呼び出しが必要で、指定済みフィールドは保持します。推薦・Hook 引数更新・実際の子の実行は別です。この動作は npm 0.1.3 にはありません。[ガイド](docs/guide/ja.md#自動-hook)を参照してください。

## ドキュメント

- [CLI 設定](docs/guide/ja.md#cli-による設定)
- [使用ガイド](docs/guide/ja.md): インストール・削除、キー、Hook、直接推薦、エラー復旧
- [インストール・削除](docs/guide/ja.md#インストール): npm のグローバルインストール、ホスト登録、再起動と信頼の承認
- [モデルと環境変数](docs/guide/ja.md#モデルと環境変数): 6 つのデフォルトプロファイルと候補の設定
- [コンテキストの提供](docs/guide/ja.md#コンテキストの提供): 暗号化されたメッセージとリポジトリ URL の制約
- [費用実測](docs/guide/ja.md#費用実測): README 翻訳レビューのトークン・換算費用と測定範囲
- [診断・開発](docs/guide/ja.md#診断と開発): ローカル report と無料の検証コマンド

韓国語版が正本です。英語・簡体字中国語・日本語のドキュメントは同じ使用範囲を説明しており、ドキュメントの言語を選んでも CLI・MCP の出力言語は変わりません。

## ライセンス

[MIT](LICENSE)。
