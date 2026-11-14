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

`set default` で送信範囲を選び、API キーは非表示入力で登録します。ホストを再起動した後、**Codex では `/hooks` で新しい Hook を確認・承認**してください。[インストール・キー設定](docs/guide/ja/installation.md)で npm の互換オプションとアカウント別の設定を確認できます。

## 更新

実行前に、関連するホスト・MCP サーバー・CLI プロセスを停止してください。

```sh
aptly update
aptly setup --client all
```

ホストを再起動してください。キーの再入力は不要です。stable ランチャーや以前のバージョンから移行する場合は、[更新案内](docs/guide/ja/installation.md#guide-package-updates)を確認してください。

## ドキュメント

- [使用ガイド](docs/guide/ja.md): 設定・自動推薦・予算・統計・トラブルシューティング
- [候補モデルの設定](docs/guide/ja/configuration.md#guide-models-and-environment)
- [送信範囲](docs/guide/ja/transmission.md): Decisions API に送る情報
- [費用実測](docs/guide/ja/benchmarks.md): 小規模な README レビュー試験で子レビュー・分類費の API 換算額が約 52～58% 減少。タスク全体の費用やサブスクリプションの実請求額の削減率ではありません。
