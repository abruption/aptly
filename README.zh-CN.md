<div align="center">

# Aptly

[![npm version](https://img.shields.io/npm/v/aptly)](https://www.npmjs.com/package/aptly)
[![npm downloads](https://img.shields.io/npm/dm/aptly)](https://www.npmjs.com/package/aptly)
[![MIT license](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/abruption/aptly/blob/main/LICENSE)

**Model and reasoning recommendations for subagents, powered by the OpenAI Decisions API.**

[한국어](README.md) · [English](README.en.md) · **简体中文** · [日本語](README.ja.md)

</div>

为 Claude Code 和 Codex 子代理推荐模型与推理强度。Aptly 将任务摘要发送给 OpenAI Decisions API，并保留明确指定的模型、推理强度和执行权限。

## 快速开始

需要 Node.js **24 或更高版本**、Claude Code 或 Codex 以及 OpenAI API 密钥。

```sh
npm install -g aptly@latest --allow-scripts=aptly
aptly set default
aptly set env OPENAI_API_KEY
```

请在 `set default` 中选择传输范围，并通过隐藏输入注册 API 密钥。重启宿主后，**请在 Codex 的 `/hooks` 中审核并批准新 Hook**。有关 npm 兼容选项和各账户设置，请参阅[安装与密钥设置](docs/guide/zh-CN/installation.md)。

## 更新

```sh
aptly update
aptly setup --client all
```

请重启宿主，无需重新输入密钥。如果从 stable 启动器或旧版本迁移，请参阅[更新指南](docs/guide/zh-CN/installation.md#guide-package-updates)。

## 文档

- [使用指南](docs/guide/zh-CN.md)：设置、自动推荐、预算、统计与问题排查
- [候选模型设置](docs/guide/zh-CN/configuration.md#guide-models-and-environment)
- [传输范围](docs/guide/zh-CN/transmission.md)：发送给 Decisions API 的信息
- [成本实测](docs/guide/zh-CN/benchmarks.md)：在小规模 README 审阅测试中，子代理审阅与分类费用的 API 折算额降低约 52%～58%；这不是整体任务成本或订阅实际账单的降幅。
