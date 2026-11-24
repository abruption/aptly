# 安装与更新

[한국어](../ko/installation.md) · [English](../en/installation.md) · **简体中文** · [日本語](../ja/installation.md)

[指南目录](../zh-CN.md)

## 本文目录

- [安装](#guide-installation)
- [验证设置](#guide-verify-setup)
- [Windows PowerShell](#guide-windows-powershell)
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

运行 `set default` 会注册宿主，并询问要向 Decisions API 发送哪些信息。输入 API 密钥时，屏幕上不会显示密钥。Aptly 会将密钥保存在操作系统的凭据存储中。设置完成后请重启宿主。在 Codex 中，请打开 `/hooks` 并批准新的 Hook。

安装脚本会在已有的宿主目录中注册 MCP 和 Hook。如果目录还不存在，请运行 `aptly setup --client all` 完成注册。

如果使用 `CODEX_HOME` 或 `CLAUDE_CONFIG_DIR`，请在安装和设置时使用相同的值。Aptly 会保留已有设置和启动脚本。请参阅[账户主目录与密钥设置](configuration.md)。

<a id="guide-verify-setup"></a>

## 验证设置

请使用以下命令检查所选宿主的设置计划和密钥注册准备状态。使用 Claude Code 时，请将 `codex` 改为 `claude`。Windows PowerShell 中请使用 `aptly.cmd`。

```sh
aptly setup --check --client codex
aptly set env OPENAI_API_KEY --client codex --check
```

这两条命令都不会修改文件。`setup --check` 是对常规设置计划在当前时点的检查，不验证正在运行的宿主。密钥的 `--check` 检查注册和 Linux 存储准备状态，不读取或保存密钥，也不验证 API 认证。退出码 `0` 表示检查未发现错误，`1` 表示部分失败或命令错误。请检查 JSON 输出中各宿主的 `status` 和 `codes`。

设置后请重启宿主和 MCP；在 Codex 中，请通过 `/hooks` 审核并信任 Hook。[推荐和 Hook 参数更新](routing.md#guide-automatic-routing)是不同的观测结果，两者都不能证明子代理已执行或完成。请在宿主中另行确认执行和完成情况。另请参阅[问题排查](troubleshooting.md)。

<a id="guide-windows-powershell"></a>

## Windows PowerShell

在已登录的 Windows 桌面上打开 PowerShell 并运行以下命令。示例直接运行 `npm.cmd` 和 `aptly.cmd`。`--ignore-scripts` 会跳过安装时的自动注册，因此请运行 `set default` 注册 Aptly。

```powershell
npm.cmd install -g aptly@latest --ignore-scripts
aptly.cmd --version
aptly.cmd set default --client codex
aptly.cmd set env OPENAI_API_KEY --client codex
```

如果要设置 Claude Code，请将两条设置命令中的 `codex` 改为 `claude`。请重启宿主。如果使用 Codex，请打开 `/hooks` 并批准新的 Aptly Hook。

如果安装时用 `--prefix` 指定了位置，更新时也请使用同一位置。如果 PowerShell 找不到 `aptly.cmd`，请使用该目录下 `aptly.cmd` 的完整路径运行。

API 密钥保存在 Windows 凭据管理器中。如果 SSH 中出现无法使用凭据存储的错误，请在已登录的桌面上注册密钥。宿主显示 MCP 并不表示已经读取密钥或收到 Decisions API 的响应。如果密钥注册失败，请参阅[凭据问题排查](troubleshooting.md#guide-launcher-recovery)。

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
aptly --version
```

`update` 在同一 npm prefix 中更新软件包，不运行安装脚本。在 macOS 和 Linux 上，新 CLI 随后会尝试将当前环境所选配置主目录中未修改且由 Aptly 管理的 Codex 和 Claude Code 注册迁移到托管 npx。direct 和 stable 注册均可迁移；自定义或非托管注册以及不存在的注册保持不变。请分别检查软件包和各宿主的迁移结果：一个宿主成功时另一个仍可能失败。在 Windows 上，该命令只更新软件包。

0.1.21 的现有更新程序首次运行时只更新软件包。请使用新安装的 CLI 再次运行 `aptly update`，以尝试迁移现有注册；现有注册不需要 setup。需要新注册时可以使用 `aptly setup`。通过所有权检查后，Hook、凭据和传输范围选择会保留。请在 `/hooks` 中重新信任更改后的 Codex Hook 并重启宿主。请查看[传输范围](transmission.md)，并在需要时显式选择。

遇到 npm 错误或使用本地／源码安装时，请使用上面的手动安装命令。npm 配置中的 `dry-run=true` 会被拒绝。如果旧 Node 路径已不存在，请参阅[启动路径恢复](troubleshooting.md#guide-launcher-recovery)。

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
