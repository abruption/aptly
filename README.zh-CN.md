<div align="center">

# Aptly

[![npm version](https://img.shields.io/npm/v/aptly)](https://www.npmjs.com/package/aptly)
[![npm downloads](https://img.shields.io/npm/dm/aptly)](https://www.npmjs.com/package/aptly)
[![MIT license](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/abruption/aptly/blob/main/LICENSE)

**Model and reasoning recommendations for subagents, powered by the OpenAI Decisions API.**

[한국어](README.md) · [English](README.en.md) · **简体中文** · [日本語](README.ja.md)

**用于为 Claude Code 和 Codex 子代理选择合适模型与推理强度（effort）的本地 MCP 服务器。**

</div>

Aptly 使用 OpenAI Decisions API 对简要任务摘要进行分类，并推荐允许使用的执行配置。安装 Hook 后，可为未明确指定配置的新建通用子代理自动选择默认值。实际执行与权限决策仍由宿主（Claude Code 或 Codex）负责。

在我们的测试中，**API 折算成本降低了约 52%～58%**。详见[测试条件与详细结果](docs/guide/zh-CN.md#成本实测)。

## 快速开始

需要 Node.js **24 或更高版本**以及 Claude Code 或 Codex。首次安装时，请使用以下命令全局安装并配置最新稳定版。

```sh
npm install -g aptly@latest --allow-scripts=aptly
aptly setup --client all --mode defaults
aptly set env OPENAI_API_KEY
aptly --version
```

请使用 `aptly --version` 确认已安装的版本。在支持此选项的 npm 中，`--allow-scripts=aptly` 允许执行 Aptly 的安装脚本。如果 npm 不支持此选项，请按照[安装指南](docs/guide/zh-CN.md#安装)中的显式安装与配置步骤操作。

安装时的 `postinstall` 会在现有宿主配置目录中注册 MCP 和 `PreToolUse` Hook。如果跳过了自动注册，或宿主尚无配置目录，也可以显式运行 `setup`。其他现有配置与 Hook，以及 Aptly 原有的启动命令和环境均会保留。

请通过 `aptly set env OPENAI_API_KEY` 的隐藏输入，将分类用的 `OPENAI_API_KEY` 存入系统凭据存储，或通过安全的运行环境传递给 MCP 进程。不要将密钥写入命令行、请求、配置 JSON 或代码仓库。重启宿主或 MCP 后，**请在 Codex 的 `/hooks` 中审核新 Hook 并批准信任**。详见[安装、密钥与注册](docs/guide/zh-CN.md#安装)。

## 更新

如需更新通过 npm 全局安装的 Aptly 0.1.3 或更高版本，请先停止所有相关宿主、MCP 和 CLI 写入进程，并查阅[安装与升级指南](docs/guide/zh-CN.md#安装)中的账本迁移和手动备用步骤。现有密钥设置会保留，无需重新输入密钥。执行命令后请重启。

```sh
aptly update
aptly setup --client all --mode defaults
```

## 使用方式

| 方式 | 行为 |
|---|---|
| 自动 Hook | 检查新调用的约束，并推荐未指定的默认值 |
| 直接推荐 | 通过 `recommend_agent` 或 `aptly recommend` 获取执行配置，再在宿主中明确选择并执行 |
| fixture | 无需密钥或网络即可测试本地模拟推荐；结果并非实际 Decisions 判断 |

Aptly 0.1.4 起也会为继承调用评估推荐。应用仍要求 Codex 显式指定 `fork_turns: "none"`，或 Claude Code 使用无历史约束的通用调用；已指定字段会保留。推荐、Hook 参数更新与实际子代理执行是不同事实。应用条件详见[指南](docs/guide/zh-CN.md#自动-hook)。

## 文档

- [使用指南](docs/guide/zh-CN.md)：安装与移除、密钥、Hook、直接推荐、错误恢复
- [安装与移除](docs/guide/zh-CN.md#安装)及 [CLI 配置](docs/guide/zh-CN.md#使用-cli-设置)：npm 全局安装、宿主注册、重启与信任批准
- [模型与环境变量](docs/guide/zh-CN.md#模型与环境变量)：六个默认配置与候选设置
- [提供上下文](docs/guide/zh-CN.md#提供上下文)：加密消息与仓库 URL 的限制
- [成本实测](docs/guide/zh-CN.md#成本实测)：README 翻译审阅的 token、换算成本与测量范围
- [诊断与开发](docs/guide/zh-CN.md#诊断与开发)：本地诊断报告与免费验证命令

韩语文档为正本，英语、简体中文和日语文档与其保持相同的使用范围。选择文档语言不会改变 CLI 或 MCP 的输出语言。

## 许可证

[MIT](LICENSE)。
