<div align="center">

# Aptly

[![npm version](https://img.shields.io/npm/v/aptly)](https://www.npmjs.com/package/aptly)
[![npm downloads](https://img.shields.io/npm/dm/aptly)](https://www.npmjs.com/package/aptly)
[![MIT license](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/abruption/aptly/blob/main/LICENSE)

**Model and reasoning recommendations for subagents, powered by the OpenAI Decisions API.**

[한국어](README.md) · **English** · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

</div>

Aptly recommends models and reasoning effort for Claude Code and Codex subagents. It sends a task summary to the OpenAI Decisions API and preserves explicitly selected models, reasoning effort, and execution permissions.

## Quick start

You need Node.js **24 or later**, Claude Code or Codex, and an OpenAI API key.

```sh
npm install -g aptly@latest --allow-scripts=aptly
aptly set default
aptly set env OPENAI_API_KEY
```

Choose the transmission scope in `set default` and enter your API key through the hidden prompt. Restart the host, then **review and approve the new Hook in `/hooks` for Codex**. See [installation and setup verification](docs/guide/en/installation.md#guide-verify-setup) to check the registration.

## Update

Stop the related hosts, MCP servers, and CLI processes, then run `aptly update`. On macOS and Linux, the update migrates existing Aptly-owned registrations to managed npx. On Windows, it updates the package. When upgrading from 0.1.21, run `aptly update` again with the new CLI. Approve changed Codex Hooks in `/hooks` and restart the host. [Update guide](docs/guide/en/installation.md#guide-package-updates)

## Documentation

- [User guide](docs/guide/en.md): configuration, automatic recommendations, budgets, statistics, and troubleshooting
- [Model candidates](docs/guide/en/configuration.md#guide-models-and-environment)
- [Transmission scope](docs/guide/en/transmission.md): information sent to the Decisions API
- [Measured costs](docs/guide/en/benchmarks.md) — For one README review task with three runs per condition, subagent review and Decisions classification costs at Standard API rates were about 52–58% lower with explicit MCP recommendations.
