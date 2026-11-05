<div align="center">

# Aptly

[![npm version](https://img.shields.io/npm/v/aptly)](https://www.npmjs.com/package/aptly)
[![npm downloads](https://img.shields.io/npm/dm/aptly)](https://www.npmjs.com/package/aptly)
[![MIT license](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/abruption/aptly/blob/main/LICENSE)

**Model and reasoning recommendations for subagents.**

[한국어](README.md) · [English](README.en.md) · [简体中文](README.zh-CN.md) · **日本語**

**タスクに適した Claude Code・Codex のサブエージェント用モデルと effort を選ぶローカル MCP です。**

</div>

Aptly は必要最小限のタスク要約を OpenAI Decisions API で分類し、あらかじめ許可された実行プロファイルを推薦します。インストールした Hook は、明示的な指定のない新しい汎用サブエージェントのデフォルト値を自動で選択できます。サブエージェントの実行と権限に関する判断は、既存のホストが行います。

独自テストでは、**API 換算コストが約 52～58% 減少しました**。[測定条件と詳細結果](docs/guide/ja.md#費用実測)をご覧ください。

## クイックスタート

Node.js **24 以上**と Claude Code または Codex が必要です。**MIT ライセンスの Aptly 0.1.0** を npm registry からインストールしてください。

```sh
npm install --prefix ./aptly-local aptly@0.1.0
./aptly-local/node_modules/.bin/aptly setup --client all --mode defaults
```

インストール時の `postinstall` は、既存のホスト設定ディレクトリに MCP と `PreToolUse` Hook を登録します。自動登録をスキップした場合や、ホストに設定ディレクトリがまだない場合も、`setup` を明示的に実行して登録できます。他の既存設定・Hook と、既存の Aptly の実行コマンド・環境は保持します。

分類用の `OPENAI_API_KEY` は、安全な実行環境から MCP プロセスに渡してください。キーをコマンドライン・リクエスト・設定 JSON・リポジトリに記載しないでください。ホストまたは MCP を再起動した後、**Codex では `/hooks` で新しい Hook を確認し、信頼を承認**してください。[インストール・キー・登録の詳細](docs/guide/ja.md#インストール)を確認してください。

## 使用方法

| 方法 | 動作 |
|---|---|
| 自動 Hook | モデル・effort・固定ロール・履歴継承・resume の指定がない、新しい汎用呼び出しのデフォルト値を選びます |
| 直接推薦 | `recommend_agent` または `aptly recommend` でプロファイルを受け取り、実行するかどうかをホストで明示的に判断します |
| fixture | キーやネットワークを使わず、ローカルで生成した試験用の推薦を確認できます。実際の Decisions の結果ではありません |

自動選択の対象は、Codex の `fork_turns: "none"`、Claude Code の `subagent_type: "general-purpose"` の呼び出しです。明示的な指定や、コンテキスト不足・認証・接続エラーがある場合は、元の呼び出しの引数を変更しません。推薦されたというだけでは、モデルへのアクセス権限やホストの設定全体が確認されたことにはなりません。

## ドキュメント

- [使用ガイド](docs/guide/ja.md): インストール・削除、キー、Hook、直接推薦、エラー復旧
- [インストール・削除](docs/guide/ja.md#インストール): npm・ローカルアーカイブのインストール、ホスト登録、再起動と信頼の承認
- [モデルと環境変数](docs/guide/ja.md#モデルと環境変数): 6 つのデフォルトプロファイルと候補の設定
- [コンテキストの提供](docs/guide/ja.md#コンテキストの提供): 暗号化されたメッセージとリポジトリ URL の制約
- [費用実測](docs/guide/ja.md#費用実測): README 翻訳レビューのトークン・換算費用と測定範囲
- [診断・開発](docs/guide/ja.md#診断と開発): ローカル report と無料の検証コマンド

韓国語版が正本です。英語・簡体字中国語・日本語のドキュメントは同じ使用範囲を説明しており、ドキュメントの言語を選んでも CLI・MCP の出力言語は変わりません。

## ライセンス

[MIT](LICENSE)。
