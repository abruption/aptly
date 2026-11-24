<div align="center">

# Aptly

[![npm version](https://img.shields.io/npm/v/aptly)](https://www.npmjs.com/package/aptly)
[![npm downloads](https://img.shields.io/npm/dm/aptly)](https://www.npmjs.com/package/aptly)
[![MIT license](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/abruption/aptly/blob/main/LICENSE)

**Model and reasoning recommendations for subagents, powered by the OpenAI Decisions API.**

[한국어](README.md) · [English](README.en.md) · [简体中文](README.zh-CN.md) · **日本語**

</div>

Claude Code・Codex のサブエージェントにモデルと推論強度を推薦します。タスクの要約を OpenAI Decisions API に送信し、明示されたモデル・推論強度・実行権限は保持します。

## クイックスタート

Node.js **24 以上**、Claude Code または Codex、OpenAI API キーが必要です。

```sh
npm install -g aptly@latest --allow-scripts=aptly
aptly set default
aptly set env OPENAI_API_KEY
```

`set default` で送信範囲を選び、API キーは非表示入力で登録します。ホストを再起動した後、**Codex では `/hooks` で新しい Hook を確認・承認**してください。登録状況の確認方法は[インストールと設定の確認](docs/guide/ja/installation.md#guide-verify-setup)を参照してください。

## 更新

関連するホスト・MCP サーバー・CLI を停止してから `aptly update` を実行してください。macOS と Linux では Aptly が所有する既存登録を管理型 npx に移行し、Windows ではパッケージを更新します。0.1.21 から更新する場合は、新しい CLI で `aptly update` をもう一度実行してください。変更された Codex Hook を `/hooks` で承認し、ホストを再起動してください。[更新ガイド](docs/guide/ja/installation.md#guide-package-updates)

## ドキュメント

- [使用ガイド](docs/guide/ja.md): 設定・自動推薦・予算・統計・トラブルシューティング
- [候補モデルの設定](docs/guide/ja/configuration.md#guide-models-and-environment)
- [送信範囲](docs/guide/ja/transmission.md): Decisions API に送る情報
- [費用実測](docs/guide/ja/benchmarks.md) — 1 つの README レビュー課題を各条件で 3 回ずつ実行しました。明示的な MCP 推薦を使った場合、サブエージェントのレビューと Decisions の分類にかかる費用は、Standard API の単価で換算すると約 52～58% 低くなりました。
