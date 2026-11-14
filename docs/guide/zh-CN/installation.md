# 安装与更新

[한국어](../ko/installation.md) · [English](../en/installation.md) · [简体中文](../zh-CN/installation.md) · [日本語](../ja/installation.md)

[指南目录](../zh-CN.md)

## 本文目录

- [安装](#guide-installation)
- [npm 安装脚本许可](#guide-npm-install-scripts)
- [软件包更新](#guide-package-updates)
- [新版本通知](#guide-version-notifications)
- [命令帮助（0.1.8 起）](#guide-command-help)
- [跳过与移除](#guide-skip-and-remove)

<a id="guide-installation"></a>

## 安装

需要 Node.js 24 或更高版本、Claude Code 或 Codex 以及 OpenAI API 密钥。

```sh
npm install -g aptly@latest --allow-scripts=aptly
aptly set default
aptly set env OPENAI_API_KEY
aptly --version
```

`set default` 注册宿主并询问发送给 Decisions API 的信息范围。密钥通过隐藏输入保存在操作系统凭据存储中。请重启宿主，并在 Codex 的 `/hooks` 中批准新 Hook。

安装脚本在现有宿主目录中注册 MCP 和 Hook。如果目录不存在，请使用 `aptly setup --client all` 注册。使用 `CODEX_HOME` 或 `CLAUDE_CONFIG_DIR` 的账户在安装和设置时也须传递相同环境。现有设置和启动包装器会保留。请参阅[账户主目录与密钥设置](configuration.md)。

<a id="guide-npm-install-scripts"></a>

## npm 安装脚本许可

`--allow-scripts=aptly` 仅允许本次安装的 `postinstall`，不会更改 npm 全局设置（已在 npm 11.19.1 中确认）。如果不支持该选项或不希望自动注册，请运行：

```sh
npm install -g aptly@latest --ignore-scripts
aptly setup --client all
```

请勿仅凭安装成功或 `npm warn install-scripts` 判断 Hook 是否已注册。安装脚本可能因 npm 版本或策略而被跳过。[npm 说明](https://docs.npmjs.com/cli/v11/commands/npm-rebuild/#allow-scripts)

安装脚本不会获取传输同意。之后请通过交互式 `aptly setup`、`aptly set default` 或 `aptly set transmission --review` 选择[传输范围](transmission.md)。

<a id="guide-package-updates"></a>

## 软件包更新

请停止相关宿主、MCP 和 CLI，然后在经过验证的 npm 全局安装中运行：

```sh
aptly update
aptly setup --client all
aptly --version
```

`update` 在同一 npm prefix 中安装最新版，并保留设置和密钥；它不会运行安装脚本。设置后请重启宿主。如果出现 npm 错误，或使用本地、源码安装，请使用上面的手动安装命令。`dry-run=true` 的 npm 设置会被拒绝。

stable 启动器的保留副本独立于全局软件包。请通过[显式迁移](configuration.md#guide-stable-launcher)更新。如果原 Node 路径已不存在，请按[启动路径恢复](troubleshooting.md#guide-launcher-recovery)操作。

<details>
<summary>从 0.1.2 之前的账本升级</summary>

请停止使用同一账本的所有旧版宿主、MCP 和 CLI 写入进程。新的永久锁不能与旧版写入进程一起使用。请按[账本锁迁移](troubleshooting.md#guide-ledger-lock-recovery)离线隔离旧的空锁，并保留 JSON 账本、unknown、费用和完成缓存。

</details>

<a id="guide-version-notifications"></a>

## 新版本通知

交互式 CLI 会检查最新版本并通过 stderr 通知，不会自动更新。MCP、Hook、管道和 CI 不进行检查。仅查询公开的 npm 版本信息，不发送任务、密钥或设置。结果缓存 24 小时，检查错误不会导致原命令失败。如需关闭，请在运行环境中设置 `APTLY_NO_UPDATE_NOTIFIER=1`（不通过 `set env` 设置）。

<a id="guide-command-help"></a>

## 命令帮助

```sh
aptly --help
aptly setup -h
aptly set env OPENAI_API_KEY --help
aptly help catalog refresh
```

`--help`、`-h` 和 `aptly help <命令路径>` 仅显示用法，不查询设置或密钥，也不调用 API。无效选项或缺少选项值会报错。

<a id="guide-skip-and-remove"></a>

## 跳过与移除

```sh
APTLY_SKIP_SETUP=1 npm install -g aptly@latest
aptly setup --client codex --mode defaults
aptly remove --client all
```

`CI` 和 `--ignore-scripts` 也会跳过自动注册。`remove` 只移除未被修改的 Aptly 所有项，保留用户修改。如果结果为 `partial`，请检查各宿主错误。如需更改模式，请先移除，再用所需的 `--mode` 注册。如果传输范围允许，`advisory` 也会传输任务信息。

[设置](configuration.md) · [问题排查](troubleshooting.md) · [指南目录](../zh-CN.md)
