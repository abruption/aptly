# Measured costs

[한국어](../ko/benchmarks.md) · [English](../en/benchmarks.md) · [简体中文](../zh-CN/benchmarks.md) · [日本語](../ja/benchmarks.md)

[Guide home](../en.md)

## On this page

- [Cost benchmark](#guide-cost-benchmarks)

<a id="guide-cost-benchmarks"></a>

## Cost benchmark

On 2026-11-05, the [English session-peer README](https://github.com/abruption/session-peer/blob/6e9efda7588e1df638748eeb7ad1b2707e0a3bf4/README.md) was used as the canonical source for reviewing its [Korean translation](https://github.com/abruption/session-peer/blob/6e9efda7588e1df638748eeb7ad1b2707e0a3bf4/README.ko.md). Each run received the same documents, totaling 17,964 bytes, and the same instructions to produce six suggested edits. The original files were not changed.

All three automatic Hook trials supplied with only the task name abstained with `needs_context`. Three `recommend_agent` requests with repository/file URLs, and three with URLs plus a document summary, all recommended Terra/high. The per-run averages below compare three actual Terra/high runs using the URL-plus-summary condition with the three immediately preceding Sol/high runs.

| Standard API cost conversion | Sol/high | Terra/high + classification | Reduction |
|---|---:|---:|---:|
| Observed cache usage included | $0.03229 | $0.01354 | 58.05% |
| All input priced as uncached | $0.11254 | $0.05363 | 52.35% |

These are USD conversions of measured native tokens at the [official Standard API rates](https://developers.openai.com/api/docs/pricing). They are not actual subscription invoices or measured quota deductions. The Terra figures include the [Decisions classification cost](https://developers.openai.com/api/docs/guides/decisions), $0.0000756 per run. The comparison covers the reviewing subagent and classification; document retrieval, context preparation, and main-agent research costs are excluded.

The measured workflow was **explicit MCP recommendation → native execution with the recommended profile passed as arguments**. It did not test automatic Hook URL retrieval or forwarding. The prior benchmark was reused as the control, with three samples per condition. Full-document reads, matching source quotes, and output structure were checked, but the results do not establish equal quality, statistical significance, or savings for other tasks.

## Related topics

[Budget limits](budget.md) · [Execution statistics](statistics.md) · [Advanced MCP integration and development](advanced.md)

[Guide home](../en.md)
