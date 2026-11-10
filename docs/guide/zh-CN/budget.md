# 预算限制

[한국어](../ko/budget.md) · [English](../en/budget.md) · [简体中文](../zh-CN/budget.md) · [日本語](../ja/budget.md)

[指南目录](../zh-CN.md)

## 本页目录

- [预算上限与用量（0.1.8 起）](#guide-budget-limits)

<a id="guide-budget-limits"></a>

## 预算上限与用量（0.1.8 起）

预算环境设置和用量查询从 Aptly 0.1.8 起提供。`aptly set default` 也会为所选宿主补齐缺失的预算环境设置。不增加预算问答，保留包括显式 `0` 在内的既有值，不重置用量、账本或缓存。既有传输范围选择是独立的。未设置预算变量的既有注册在升级后也会使用新的运行时默认值。原有隐式的 20 次、50 次及 $0.50 上限不会保留；请显式配置所需上限。

| 环境变量 | 默认值 | 含义 |
|---|---:|---|
| `APTLY_MAX_DAILY_CALLS` | `200` | 每个账本按 UTC 计算的每日分类尝试上限 |
| `APTLY_MAX_TOTAL_CALLS` | `0` | 每个账本的累计尝试上限 |
| `APTLY_MAX_ESTIMATED_USD` | `0` | 累计本地预留金额上限 |
| `APTLY_ESTIMATED_CALL_USD` | `0.002` | 每次新分类尝试预留的估计美元金额 |

三个上限中的 `0` 表示无限制。每次尝试的预留单价不是上限，必须为正数。仅字面值 `0` 表示无限制；`0.0`、`0.00` 等形式会被拒绝。未设置时使用默认值；空字符串、负数、异常数字及指数表示法均会被拒绝。调用次数使用整数；金额使用小数部分最多 6 位的十进制表示。有限值最大为每日 100,000 次、累计 1,000,000 次、金额设置 100。有限金额上限必须足够预留一次调用。不会静默覆盖既有无效设置。

```sh
aptly set env APTLY_MAX_DAILY_CALLS
aptly set env APTLY_MAX_TOTAL_CALLS
aptly set env APTLY_MAX_ESTIMATED_USD
aptly set env APTLY_ESTIMATED_CALL_USD
aptly budget status --client codex
aptly budget status --client claude
```

设置命令支持 `--client codex|claude|all`、隐藏输入与显式 `--stdin`。修改后请重启 MCP。默认设置也会保留既有 Codex `env_vars` 预算变量传递绑定，以及此 CLI 进程环境中可观察到的 Claude 继承预算值，并在 `inherited` 中列出。直接运行 `recommend`、`capabilities` 使用 CLI 进程环境，不自动读取宿主配置文件。状态查询会短暂占用既有 gate，因此并发请求可能暂时收到 `ledger_locked`。状态仅为注册配置及获准的当前环境快照，不证明自定义包装器或正在运行的宿主所用值。不读取密钥、API 或任务原文，也不创建账本或 gate。无限制显示为 `Unlimited`，剩余额度显示为 `null`。共用同一账本的会话共用预算，不汇总其他账本或 OpenAI 账户的全部用量。

`budget_exhausted` 是本地限制，不是 OpenAI 认证或账户余额错误。直接推荐、上下文补充响应中的 `budget_limit` 和状态中的 `exhausted_by` 会标明耗尽项目。预留金额不是真实账单上限，不会按月自动重置。修改单价不会重算过去的预留金额；重新输入密钥或应用默认值也不会退款。

HTTP 之前产生的新预算拒绝不会缓存。只有可验证的既有默认策略中确定未付费的拒绝才会用同一 ID 重新评估，保留已完成的推荐、保留选择、上下文结果与 `unknown`。预算恢复不会延长原 retry 引用的 5 分钟期限或进程寿命，也不会解除历史或权限限制。不猜测任意历史自定义策略的 digest；请勿用新 ID 或删除账本绕过冲突及未知结果。

## 相关文档

[Decisions API 传输范围](transmission.md) · [成本实测](benchmarks.md) · [问题排查](troubleshooting.md)

[指南目录](../zh-CN.md)
