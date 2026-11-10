# 自动推荐

[한국어](../ko/routing.md) · [English](../en/routing.md) · [简体中文](../zh-CN/routing.md) · [日本語](../ja/routing.md)

[指南目录](../zh-CN.md)

## 本页目录

- [自动 Hook](#guide-automatic-routing)
- [confidence 与推荐保留](#guide-confidence-and-abstention)
- [自动路由的保证范围与阻止结果（0.1.5 起）](#guide-routing-guarantees)

<a id="guide-automatic-routing"></a>

## 自动 Hook

**以下预检、推荐和观测行为需要 Aptly 0.1.4 或更高版本。** 已安装的 `PreToolUse` matcher 会在原生执行前，将 Codex 的 `spawn_agent` / `collaborationspawn_agent` / `Agent` 和 Claude Code 的 `Agent` 交给本地 `route_spawn_hook`。宿主必须加载并信任 Hook，且连接 MCP。Aptly 无法强制拦截未配置、不支持的宿主或 MCP 不可用的情况；执行仍由宿主负责。

本地预检评估显式字段、角色、resume、策略、缓存和预算。不是每次调用都需要新的付费 Decisions 请求。Codex 只指定模型或 effort 时，候选仅限于匹配的允许组合，只填写未指定字段。两者都指定、不支持的值、固定角色和 resume 均在本地保留，不进行分类。仅凭输入无法断定某个字段来自用户还是宿主默认值。

模型和 effort 未指定时，`fork_turns: "all"` 或省略 fork 也会评估推荐，但**不会改变历史**。Codex 应用模型和 effort 仍要求显式 `fork_turns: "none"`，否则报告 `inherited_context_application_unverified` 并保留原始参数。其他历史字段以 `history_semantics_unverified` 阻止应用；Claude 也只对没有历史约束的通用调用应用推荐。生成推荐不等于已应用。

Codex 正文不透明时，`cleanup_merged_worktrees` 等具体的短任务名也可用于仅基于名称的推荐。短名称仅允许 cleanup/remove/prune + merged + worktrees/branches，或 review/fix/test + failing/broken/flaky + tests/builds 组合；其他名称仍须通过原有的六词检查。不会解密或发送正文，也不会推断任务细节或删除权限。继承历史时的应用在目标主机上尚未验证，并非所有版本都不支持；公开源码不能证明已安装运行时的支持情况。

仅对独立任务，由调用方提供充分的独立任务上下文并明确选择新子代理。Aptly 不会将 `all` 改成 `none`，删除历史或覆盖显式模型和 effort。[合成的继承与新子代理示例](../../../examples/spawn-preflight.codex.json)是不同请求，不是自动重试。不要用新 ID 重试结果不明的付费调用。

`defaults` 允许兼容的参数更新，`advisory` 只提供建议。继承调用和部分指定的调用即使无法应用推荐，也可能向 Decisions 发送受限任务摘录；继承历史不是关闭共享的方式。策略关闭、上下文不足、预算限制、失败及取消时均保留执行约束。输入、策略和候选绑定、去重及未知结果保护保持不变，fixture 推荐不改写原生默认值。没有自动策略时的 strict 证据路径仍是独立路径；宿主内部补丁继续暂停。

| MCP 工具 | 用途 |
|---|---|
| `get_routing_capabilities` | 免费查询候选、限制、分类方式与 Hook 状态 |
| `recommend_agent` | 根据任务摘要获取直接推荐 |
| `get_routing_precedence` | 解释调用的保留依据与未确认的配置来源 |
| `route_spawn_hook` | 根据已安装的策略选择目标调用的默认值，或仅传递推荐 |
| `get_spawn_routing_observation` | 查询完全匹配的 Hook 调用，不证明原生执行 |
| `prepare_spawn_context` | 为完全匹配的待执行调用注册受限说明 |
| `cancel_spawn_context` | 撤销说明关联，不取消原生执行或已发送的请求 |
| `retry_spawn_recommendation` | 使用 Hook 返回的 retry_id 补充一次任务说明并重新推荐 |
| `prepare_fresh_delegation` | 根据已完成的继承调用推荐准备独立 Codex 调用参数，不执行调用 |

<a id="guide-confidence-and-abstention"></a>

## confidence 与推荐保留

`confidence` 是元数据，尚未验证其为经过校准的正确概率。目前不将其用作自动应用的阈值。目前，只要满足其他应用条件，0 和较低值也可被接受。实际 Decisions 响应缺少该值时会被作为错误拒绝；通用 Router 与已保存结果中的该字段仍为可选项。`keep_current` 与 `needs_context` 是独立于数值的结果，遵循既有的保留与上下文补充规则。显式指定的模型、effort、历史和权限均会保留。小规模分类评估不能证明子任务质量或总成本有所改善。

<a id="guide-routing-guarantees"></a>

## 自动路由的保证范围与阻止结果（0.1.5 起）

保证仅适用于已启用、已信任且连接到 MCP 的 Hook 所处理的受支持调用。请通过 `get_routing_capabilities.automatic_hook.guarantee` 查看范围。服务器无法检测或强制阻止未注册、未信任、断连或宿主出错的 Hook，后续处理由宿主决定。MCP 连接状态本身不是单次调用经过路由的证据。

确认有效的启用策略和适用调用后，`defaults` 对无法应用推荐、预算耗尽、分类失败或结果不明返回 `deny` 和安全原因码。原始参数与约束保持不变，但本次派生不会执行。若继承历史的兼容性未验证，请报告限制，不要静默使用父模型或改为 `none`。`advisory` 仅说明限制，不阻止执行。策略缺失或停用、显式配置组合、固定角色及 resume 仍属于有意保留的本地路径，不会一律阻止。

获得恢复 ID 后，可在同一 MCP 进程调用 `get_spawn_routing_observation({retry_id})`，或使用原有 `{client, event}` 格式。混用或不完整的输入会被拒绝。原始 `awaiting_context` 与 `context_retry.outcome` 是独立阶段；被拒绝的重复请求记录在 `last_attempt`，不会覆盖已有分类结果。查询不产生付费请求，也不延长保留时间。执行始终为 `not_observed`，推荐或参数更新都不能证明子代理已实际执行。

## 相关文档

[初始设置与候选模型](configuration.md) · [Decisions API 传输范围](transmission.md) · [执行统计](statistics.md) · [高级 MCP 集成与开发参考](advanced.md)

[指南目录](../zh-CN.md)
