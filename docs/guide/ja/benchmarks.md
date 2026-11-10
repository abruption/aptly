# 費用の実測

[한국어](../ko/benchmarks.md) · [English](../en/benchmarks.md) · [简体中文](../zh-CN/benchmarks.md) · [日本語](../ja/benchmarks.md)

[ガイド目次](../ja.md)

## このページの目次

- [費用実測](#guide-cost-benchmarks)

<a id="guide-cost-benchmarks"></a>

## 費用実測

2026-11-05 に [session-peer の英語 README](https://github.com/abruption/session-peer/blob/6e9efda7588e1df638748eeb7ad1b2707e0a3bf4/README.md)を正本として、[韓国語訳](https://github.com/abruption/session-peer/blob/6e9efda7588e1df638748eeb7ad1b2707e0a3bf4/README.ko.md)をレビューしました。合計 17,964 バイトの同じドキュメントと同じ指示で、実行ごとに 6 件の修正案を作成し、原本は変更していません。

タスク名だけを提供した自動 Hook 試験は、3 回とも `needs_context` で保留されました。`recommend_agent` にリポジトリ・ファイル URL を追加した 3 回と、URL にドキュメントの要約も追加した 3 回は、すべて Terra/high を推薦しました。以下は、URL+要約条件での実際の Terra/high 実行 3 回を、直前の Sol/high 実行 3 回と比較した 1 回あたりの平均です。

| Standard API 換算基準 | Sol/high | Terra/high + 分類費用 | 減少率 |
|---|---:|---:|---:|
| 実際のキャッシュ使用量を反映 | $0.03229 | $0.01354 | 58.05% |
| 入力全体をキャッシュなしで換算 | $0.11254 | $0.05363 | 52.35% |

ホストが記録した実測トークン数に [公式の Standard API 単価](https://developers.openai.com/api/docs/pricing)を適用した USD 換算値です。サブスクリプションの実際の請求額や、利用枠から実際に差し引かれた量を示すものではありません。Terra 側には [Decisions の分類費用](https://developers.openai.com/api/docs/guides/decisions) 1 回あたり $0.0000756 を含めています。比較範囲はレビューする子エージェントと分類で、ドキュメントの収集・要約の準備・メインエージェントの調査費用は除外しています。

測定経路は、**明示的な MCP 推薦 → 推薦プロファイルを引数として渡したホスト上での実行**です。自動 Hook の URL 収集・伝達機能を検証したものではありません。基準群は直前の実測を再利用しており、条件ごとの標本は 3 回です。ドキュメント全体の読み取り・原文の引用一致・出力形式は確認しましたが、品質の同等性、統計的有意性、他のタスクでの費用削減を保証するものではありません。

## 関連文書

[予算上限](budget.md) · [実行統計](statistics.md) · [高度な MCP 連携と開発参考](advanced.md)

[ガイド目次](../ja.md)
