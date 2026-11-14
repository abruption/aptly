# Aptly 使用指南

[한국어](ko.md) · [English](en.md) · **简体中文** · [日本語](ja.md)

[README](../../README.zh-CN.md)

韩语文档为正本。首次使用请按安装 → 初始设置 → 自动推荐的顺序阅读。

| 任务 | 文档 |
|---|---|
| 安装、更新与移除 | [安装](zh-CN/installation.md) |
| API 密钥、账户主目录、候选模型与 stable 启动器 | [设置](zh-CN/configuration.md) |
| Hook 行为、推荐保留与应用条件 | [自动推荐](zh-CN/routing.md) |
| 选择发送给 OpenAI Decisions API 的信息 | [传输范围](zh-CN/transmission.md) |
| 调用与费用上限 | [预算](zh-CN/budget.md) |
| 比较推荐与实际执行 | [统计](zh-CN/statistics.md) |
| 注册、凭据存储与账本错误 | [问题排查](zh-CN/troubleshooting.md) |
| 手动 MCP 设置、直接推荐与开发 | [高级集成](zh-CN/advanced.md) |
| 测量方法与成本折算 | [成本实测](zh-CN/benchmarks.md) |

<details>
<summary>旧文档链接</summary>

<a id="安装"></a>
- [安装](zh-CN/installation.md#guide-installation)
<a id="npm-安装脚本许可"></a>
- [npm 安装脚本许可](zh-CN/installation.md#guide-npm-install-scripts)
<a id="软件包更新"></a>
- [软件包更新](zh-CN/installation.md#guide-package-updates)
<a id="新版本通知"></a>
- [新版本通知](zh-CN/installation.md#guide-version-notifications)
<a id="命令帮助018-起"></a><a id="command-help"></a>
- [命令帮助（0.1.8 起）](zh-CN/installation.md#guide-command-help)
<a id="使用-cli-设置"></a>
- [使用 CLI 设置](zh-CN/configuration.md#guide-cli-configuration)
<a id="恢复不兼容的启动路径"></a>
- [恢复不兼容的启动路径](zh-CN/troubleshooting.md#guide-launcher-recovery)
<a id="密钥与重启"></a>
- [密钥与重启](zh-CN/configuration.md#guide-keys-and-restart)
<a id="mcp-环境变量设置步骤"></a>
- [MCP 环境变量设置步骤](zh-CN/advanced.md#guide-manual-mcp-setup)
<a id="配置文件位置"></a>
- [配置文件位置](zh-CN/configuration.md#guide-host-config-locations)
<a id="传递-api-密钥"></a>
- [传递 API 密钥](zh-CN/advanced.md#guide-key-environment)
<a id="codex-示例"></a>
- [Codex 示例](zh-CN/advanced.md#guide-codex-configuration)
<a id="claude-code-示例"></a>
- [Claude Code 示例](zh-CN/advanced.md#guide-claude-configuration)
<a id="跳过与移除"></a>
- [跳过与移除](zh-CN/installation.md#guide-skip-and-remove)
<a id="自动-hook"></a>
- [自动 Hook](zh-CN/routing.md#guide-automatic-routing)
<a id="confidence-与推荐保留"></a>
- [confidence 与推荐保留](zh-CN/routing.md#guide-confidence-and-abstention)
<a id="预算上限与用量018-起"></a><a id="budget-limits"></a>
- [预算上限与用量（0.1.8 起）](zh-CN/budget.md#guide-budget-limits)
<a id="执行统计0110-起"></a><a id="execution-statistics"></a>
- [执行统计（0.1.10 起）](zh-CN/statistics.md#guide-execution-statistics)
<a id="decisions-api-传输范围"></a><a id="对外传输与关闭自动共享"></a>
- [Decisions API 传输范围](zh-CN/transmission.md#guide-transmission-scope)
<a id="传输内容与过滤限制"></a>
- [传输内容与过滤限制](zh-CN/transmission.md#guide-transmission-limits)
<a id="为不透明调用提供明确说明014-起"></a>
- [为不透明调用提供明确说明（0.1.4 起）](zh-CN/advanced.md#guide-explicit-spawn-context)
<a id="补充上下文后重新推荐015-起"></a>
- [补充上下文后重新推荐（0.1.5 起）](zh-CN/advanced.md#guide-context-retry)
<a id="自动路由的保证范围与阻止结果015-起"></a>
- [自动路由的保证范围与阻止结果（0.1.5 起）](zh-CN/routing.md#guide-routing-guarantees)
<a id="准备单独的独立委派016-起"></a>
- [准备单独的独立委派（0.1.6 起）](zh-CN/advanced.md#guide-fresh-delegation)
<a id="直接推荐"></a>
- [直接推荐](zh-CN/advanced.md#guide-direct-recommendations)
<a id="模型与环境变量"></a>
- [模型与环境变量](zh-CN/configuration.md#guide-models-and-environment)
<a id="官方说明与缓存"></a>
- [官方说明与缓存](zh-CN/advanced.md#guide-model-info-cache)
<a id="提供上下文"></a>
- [提供上下文](zh-CN/advanced.md#guide-context-delivery)
<a id="成本实测"></a>
- [成本实测](zh-CN/benchmarks.md#guide-cost-benchmarks)
<a id="进程中断与账本锁定"></a>
- [进程中断与账本锁定](zh-CN/troubleshooting.md#guide-ledger-lock-recovery)
<a id="诊断与开发"></a>
- [诊断与开发](zh-CN/advanced.md#guide-diagnostics-and-development)

</details>
