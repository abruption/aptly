# 安装与更新

[한국어](../ko/installation.md) · [English](../en/installation.md) · [简体中文](../zh-CN/installation.md) · [日本語](../ja/installation.md)

[指南目录](../zh-CN.md)

## 本页目录

- [安装](#guide-installation)
- [npm 安装脚本许可](#guide-npm-install-scripts)
- [软件包更新](#guide-package-updates)
- [新版本通知](#guide-version-notifications)
- [命令帮助（0.1.8 起）](#guide-command-help)
- [跳过与移除](#guide-skip-and-remove)

<a id="guide-installation"></a>

## 安装

需要 Node.js 24 或更高版本，以及 Claude Code 或 Codex。请使用以下命令全局安装 npm 上的最新稳定版本：

**将现有持久化账本升级到 0.1.2 或更高版本前**，请停止所有可能访问该账本的宿主、MCP 服务器、独立 CLI 和旧版进程。新的持久锁不能与旧版写入进程并用。全新安装无需隔离旧锁。如果仍有旧版空锁，请遵循[账本迁移步骤](troubleshooting.md#guide-ledger-lock-recovery)，仅在离线状态下隔离已确认的旧锁，并保留 JSON 账本、`unknown` 记录、成本和已完成缓存。

```sh
npm install -g aptly@latest --allow-scripts=aptly
aptly set default
aptly --version
```

请运行 `aptly --version` 确认已安装的版本。切换 Node.js 环境后可能需要重新安装。

`postinstall` 会在当前用户现有的宿主配置目录中注册 MCP 和 `PreToolUse` Hook。如果使用 `CODEX_HOME` 或 `CLAUDE_CONFIG_DIR`，请向安装进程传递相同的环境。自动注册会跳过尚不存在的宿主目录；显式运行 `setup` 可以创建这些目录。若只需注册某个宿主，请使用 `--client codex` 或 `--client claude`。

新注册项会指定 `ROUTER_PROVIDER=decisions`、Hook 的 `defaults` 策略，以及各宿主独立的私有账本。其他现有配置与 Hook，以及 Aptly 原有的命令、环境、分类方式和账本路径都会保留。现有 fixture 配置不会自动切换为付费模式。

<a id="guide-npm-install-scripts"></a>

## npm 安装脚本许可

上面的安装命令通过 `--allow-scripts=aptly` 显式允许本次安装运行 Aptly 的 `postinstall`。已在 npm 11.19.1 中确认支持，不会修改用户级 npm 许可配置。请参阅 [npm 官方说明](https://docs.npmjs.com/cli/v11/commands/npm-rebuild/#allow-scripts)。

`npm warn install-scripts ... not yet covered by allowScripts` 表示许可策略尚未记录此项。在 npm 11.19.1 中，仅凭此警告不能判断脚本被阻止。实际行为取决于 npm 版本、严格策略和 `ignore-scripts`；安装成功也不等于 MCP 或 Hook 注册成功。npm 可能隐藏 postinstall 输出。

如果 npm 不支持此选项，或希望手动配置而非自动注册，请运行：

```sh
npm install -g aptly@latest --ignore-scripts
aptly setup --client all
```

在未发布的源代码中，npm lifecycle 安装也不会询问传输审查。升级到包含该功能的版本后，请在相同账户环境中运行交互式 `aptly setup`、`aptly set default` 或 `aptly set transmission --review`。0.1.10 更新进程无法在更新期间提出新问题；请参见[传输审查](transmission.md#guide-transmission-scope)。

无论安装脚本是否运行，都可以显式执行 `setup`。它会保留已有启动路径；旧路径错误请参见[执行路径恢复步骤](troubleshooting.md#guide-launcher-recovery)。密钥配置、MCP 重启和 Codex `/hooks` 信任审核仍需单独完成。

未发布的安装脚本在已有注册需要审查时，仅向 stderr 输出运行 `aptly set transmission --review` 的提示，不提问，也不记录选择。

<a id="guide-package-updates"></a>

## 软件包更新

`aptly update` 需要 **Aptly 0.1.3 或更高版本**。仅支持已验证的全局 npm 安装，将 `aptly@latest` 安装到与当前运行软件包一致且已验证的 prefix。局部安装、源码检出和无法验证的路径会被拒绝。 如果 npm 的有效配置为 `dry-run=true`，命令会在开始安装前返回 `update_dry_run_enabled` 并拒绝更新。无法验证配置时返回 `update_configuration_unverified`。不会将试运行报告为更新成功。

更新前，请按上文账本迁移步骤停止其他使用账本的宿主、MCP 和 CLI 进程。该命令跳过安装脚本，更新后请显式配置并重启宿主：

```sh
aptly update
aptly setup --client all
aptly --version
```

不会自动迁移现有 MCP 启动路径或用户包装程序。如仍有旧路径，请参见[启动路径恢复步骤](troubleshooting.md#guide-launcher-recovery)。密钥配置和 Codex `/hooks` 信任审核仍是单独步骤。如遇 npm 认证、网络或权限错误，请使用手动安装说明。不会自动安装更新。

<a id="guide-version-notifications"></a>

## 新版本通知

**Aptly 0.1.3 或更高版本**会在交互式普通 CLI 命令中检查最新稳定版本，并在有新版时通过 stderr 提示 `aptly update`。 三个标准流必须都是终端；MCP 服务、自动 setup、推荐或分类路径、管道和 CI 均跳过检查。JSON stdout 和 MCP、Hook 响应保持不变。

仅向公开 npm 注册表请求 Aptly 版本元数据，不发送密钥、任务摘要或宿主配置。网络及响应读取限制为 800ms 和 16KiB，结果缓存于 `~/.cache/aptly/update-check.json`，有效期为 24 小时，失败后等待一小时。网络或缓存错误不会使原命令失败。在 CLI 环境中设置 `APTLY_NO_UPDATE_NOTIFIER=1` 可关闭检查；此变量不属于 `aptly set env` 支持的键。通知不会安装更新。

<a id="guide-command-help"></a>

## 命令帮助（0.1.8 起）

统一命令及子命令帮助从 Aptly 0.1.8 起提供。支持以下形式：

```sh
aptly --help
aptly setup -h
aptly set default --help
aptly set env OPENAI_API_KEY --help
aptly budget status --help
aptly help catalog refresh
```

`--help`、`-h` 和 `aptly help <命令路径>` 只显示用法，不读取配置、指定文件、stdin 或凭据存储，不询问、不修改设置、不调用 API 或模型信息端点、不安装或更新，也不运行更新通知。可在有效选项后加帮助标志；未知路径或选项、已提供的无效值及矛盾的选项组合仍返回错误。可省略必填位置参数以查看用法。`--output --help` 这类把帮助放在选项值位置的形式按缺少选项值处理。

<a id="guide-skip-and-remove"></a>

## 跳过与移除

```sh
APTLY_SKIP_SETUP=1 npm install -g aptly@latest
aptly setup --client codex --mode defaults
aptly remove --client all
```

`CI` 或 npm `--ignore-scripts` 也会跳过注册，可随后运行 `setup`。更改模式时，先移除注册，再使用所需 `--mode` 重新设置；`advisory` 只提供建议。出现 `partial` 时检查各宿主错误代码。移除操作保留用户修改的条目并报告冲突。

## 相关文档

[初始设置与候选模型](configuration.md) · [问题排查](troubleshooting.md)

[指南目录](../zh-CN.md)
