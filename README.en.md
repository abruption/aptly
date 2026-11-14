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

Choose the transmission scope in `set default` and enter your API key through the hidden prompt. Restart the host, then **review and approve the new Hook in `/hooks` for Codex**. See [installation and key setup](docs/guide/en/installation.md) for npm compatibility and account-specific configuration.

## Update

```sh
aptly update
aptly setup --client all
```

Restart the host. You do not need to re-enter the key. If migrating a stable launcher or an older version, see [updates](docs/guide/en/installation.md#guide-package-updates).

## Documentation

- [User guide](docs/guide/en.md): configuration, automatic recommendations, budgets, statistics, and troubleshooting
- [Model candidates](docs/guide/en/configuration.md#guide-models-and-environment)
- [Transmission scope](docs/guide/en/transmission.md): information sent to the Decisions API
- [Measured costs](docs/guide/en/benchmarks.md): approximately 52–58% lower API-equivalent child review and classification costs in a small README review test. This is not a reduction in total task costs or subscription charges.
