<div align="center">

# Aptly

[![npm version](https://img.shields.io/npm/v/aptly)](https://www.npmjs.com/package/aptly)
[![npm downloads](https://img.shields.io/npm/dm/aptly)](https://www.npmjs.com/package/aptly)
[![MIT license](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/abruption/aptly/blob/main/LICENSE)

**Model and reasoning recommendations for subagents.**

[한국어](README.md) · [English](README.en.md) · **简体中文** · [日本語](README.ja.md)

**用于为 Claude Code 和 Codex 子代理选择合适模型与推理强度（effort）的本地 MCP 服务器。**

</div>

Aptly 使用 OpenAI Decisions API 对简要任务摘要进行分类，并推荐允许使用的执行配置。安装 Hook 后，可为未明确指定配置的新建通用子代理自动选择默认值。实际执行与权限决策仍由宿主（Claude Code 或 Codex）负责。

## 快速开始

需要 Node.js **24 或更高版本**，以及 Claude Code 或 Codex。请从 npm registry 安装**采用 MIT 许可证的 Aptly 0.1.0**。

```sh
npm install --prefix ./aptly-local aptly@0.1.0
./aptly-local/node_modules/.bin/aptly setup --client all --mode defaults
```

安装时的 `postinstall` 会在现有宿主配置目录中注册 MCP 和 `PreToolUse` Hook。如果跳过了自动注册，或宿主尚无配置目录，也可以显式运行 `setup`。其他现有配置与 Hook，以及 Aptly 原有的启动命令和环境均会保留。

请通过安全的运行环境，将分类用的 `OPENAI_API_KEY` 传递给 MCP 进程。不要将密钥写入命令行、请求、配置 JSON 或代码仓库。重启宿主或 MCP 后，**请在 Codex 的 `/hooks` 中审核新 Hook 并批准信任**。详见[安装、密钥与注册](docs/guide/zh-CN.md#安装)。

## 使用方式

| 方式 | 行为 |
|---|---|
| 自动 Hook | 为未指定模型、effort、固定角色、历史继承或 resume 的新建通用调用选择默认值 |
| 直接推荐 | 通过 `recommend_agent` 或 `aptly recommend` 获取执行配置，再在宿主中明确选择并执行 |
| fixture | 无需密钥或网络即可测试本地模拟推荐；结果并非实际 Decisions 判断 |

自动选择适用于 Codex 的 `fork_turns: "none"` 调用和 Claude Code 的 `subagent_type: "general-purpose"` 调用。如果已有明确选择，或发生上下文不足、认证或连接错误，则保留原始调用。推荐结果并不表示已确认账户的模型访问权限，也不表示已核实宿主的全部配置。

## 文档

- [下一版本 CLI 配置](docs/guide/zh-CN.md#使用-cli-设置--计划用于下一版本)
- [使用指南](docs/guide/zh-CN.md)：安装与移除、密钥、Hook、直接推荐、错误恢复
- [安装与移除](docs/guide/zh-CN.md#安装)：npm 与本地归档安装、宿主注册、重启与信任批准
- [模型与环境变量](docs/guide/zh-CN.md#模型与环境变量)：六个默认配置与候选设置
- [提供上下文](docs/guide/zh-CN.md#提供上下文)：加密消息与仓库 URL 的限制
- [成本实测](docs/guide/zh-CN.md#成本实测)：README 翻译审阅的 token、换算成本与测量范围
- [诊断与开发](docs/guide/zh-CN.md#诊断与开发)：本地诊断报告与免费验证命令

韩语文档为正本，英语、简体中文和日语文档与其保持相同的使用范围。选择文档语言不会改变 CLI 或 MCP 的输出语言。

## 许可证

[MIT](LICENSE)。
