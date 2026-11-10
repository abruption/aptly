# 成本实测

[한국어](../ko/benchmarks.md) · [English](../en/benchmarks.md) · [简体中文](../zh-CN/benchmarks.md) · [日本語](../ja/benchmarks.md)

[指南目录](../zh-CN.md)

## 本页目录

- [成本实测](#guide-cost-benchmarks)

<a id="guide-cost-benchmarks"></a>

## 成本实测

2026-11-05，以 [session-peer 的英文 README](https://github.com/abruption/session-peer/blob/6e9efda7588e1df638748eeb7ad1b2707e0a3bf4/README.md) 为正本，审阅了[韩语翻译](https://github.com/abruption/session-peer/blob/6e9efda7588e1df638748eeb7ad1b2707e0a3bf4/README.ko.md)。使用合计 17,964 字节的相同文档和相同指令，每次生成 6 条修改建议，未修改原始文件。

仅提供任务名的自动 Hook 测试，3 次均以 `needs_context` 暂缓推荐。向 `recommend_agent` 添加仓库和文件 URL 的 3 次，以及同时添加 URL 和文档摘要的 3 次，均推荐了 Terra/high。下表是 URL+摘要条件下实际执行 Terra/high 的 3 次，与紧接在此前的 Sol/high 实测 3 次相比的每次平均值。

| Standard API 换算依据 | Sol/high | Terra/high + 分类费用 | 降幅 |
|---|---:|---:|---:|
| 计入实际缓存用量 | $0.03229 | $0.01354 | 58.05% |
| 将全部输入按非缓存换算 | $0.11254 | $0.05363 | 52.35% |

这些数值将宿主记录的实测 token 用量按[官方 Standard API 单价](https://developers.openai.com/api/docs/pricing)换算为 USD，并非实际订阅账单或实际额度扣减。Terra 一侧包括每次 $0.0000756 的 [Decisions 分类费用](https://developers.openai.com/api/docs/guides/decisions)。比较范围是审阅子代理和分类，不包括文档收集、摘要准备或主代理调查的成本。

测量路径为**显式 MCP 推荐 → 将推荐配置作为参数传递给宿主原生调用**。这不是对自动 Hook 的 URL 收集或传递功能的验证。基准组复用了紧接在此前的实测数据，每个条件的样本为 3 次。已确认各次执行读取了完整文档，并检查了原文引用的一致性和输出格式。这些检查不能证明结果质量相同或差异具有统计显著性，也不能保证其他任务会降低成本。

## 相关文档

[预算限制](budget.md) · [执行统计](statistics.md) · [高级 MCP 集成与开发参考](advanced.md)

[指南目录](../zh-CN.md)
