# 初始设置与候选模型

[한국어](../ko/configuration.md) · [English](../en/configuration.md) · [简体中文](../zh-CN/configuration.md) · [日本語](../ja/configuration.md)

[指南目录](../zh-CN.md)

## 目录

- [配置文件位置](#guide-host-config-locations)
- [CLI 设置](#guide-cli-configuration)
- [密钥与重启](#guide-keys-and-restart)
- [stable 启动器](#guide-stable-launcher)
- [候选模型](#guide-models-and-environment)

<a id="guide-host-config-locations"></a>

## 配置文件位置

| 宿主 | 默认位置 | 其他账户主目录 |
|---|---|---|
| Codex | `~/.codex/config.toml` | `$CODEX_HOME/config.toml` |
| Claude Code | `~/.claude.json` 中的 `mcpServers.aptly` | `$CLAUDE_CONFIG_DIR/.claude.json` |

Claude Hook 默认位于 `~/.claude/settings.json`，其他账户位于 `$CLAUDE_CONFIG_DIR/settings.json`。请为安装、设置和统计命令传递与宿主相同的账户环境。请勿复制其他主目录的策略、账本、密钥或信任记录。

从 0.1.15 起，Codex MCP 的 `@codex-home` 策略在没有 `CODEX_HOME` 时选择 `~/.codex`。显式指定的绝对路径优先；空值、相对路径和控制字符会被拒绝。它不会搜索自定义主目录，因此管理员未传递值时会应用默认主目录的策略与传输范围。手动、项目和托管注册请参阅[高级设置](advanced.md#guide-manual-mcp-setup)。

<a id="guide-cli-configuration"></a>

## CLI 设置

```sh
aptly set default
aptly set env APTLY_CODEX_MODELS
aptly set env OPENAI_API_KEY
```

`set default` 添加缺失的注册与默认值，并审核[传输范围](transmission.md)。现有启动命令、环境、provider、候选和 advisory 策略会保留。`set env` 接收隐藏输入，只修改指定变量。默认目标为两个宿主，可通过 `--client codex|claude|all` 选择。

```sh
aptly set env APTLY_CLAUDE_MODELS --client claude
```

候选输入是 JSON 数组字符串，例如 `["haiku","sonnet","opus"]`。自动化请使用 `--stdin`。请勿将实际密钥放入 `printf` 或 shell 历史记录。

```sh
printf '%s\n' '["gpt-6.1-terra"]' | aptly set env APTLY_CODEX_MODELS --stdin
```

常规允许的键包括 `ROUTER_PROVIDER`（`fixture`/`decisions`）、`APTLY_CLAUDE_MODELS`、`APTLY_CODEX_MODELS`、别名 `CLAUDE_MODELS` 和 `CODEX_MODELS`，以及 `APTLY_MODEL_INFO_PATH`。模型缓存路径必须是私有目录内的绝对路径。此命令不修改管理用账本或策略路径。

<a id="guide-keys-and-restart"></a>

## 密钥与重启

`aptly set env OPENAI_API_KEY` 将各宿主密钥存入 macOS Keychain、Linux `secret-tool` 或 Windows Credential Manager，MCP 中只注册存储引用。存储不可用或锁定时会报错，不会改用明文文件或其他环境变量密钥。请查看[凭据存储错误](troubleshooting.md)。

宿主订阅登录与 API 密钥相互独立。请勿将密钥写入命令参数、配置 JSON、请求或仓库。通过安全 MCP 运行环境直接传递的方法见[手动设置](advanced.md#guide-key-environment)。

仅允许向已确认兼容的标准启动器保存密钥。自定义包装器会保留，但可能以 `credential_launcher_unverified` 拒绝。如果结果为 `partial`，请检查各宿主错误。保存失败时会尝试恢复旧密钥；若出现 `credential_rollback_failed`，请在重试前检查操作系统存储中的活动密钥。多个宿主的更改不是单个原子操作。

更改后请重启 MCP，并检查 `get_routing_capabilities` 的候选、provider 和 `credential_status`。`os_store` 表示已读取密钥，并不验证 API 有效性。Codex 的 `/hooks` 还需要单独批准。

<a id="guide-stable-launcher"></a>

## 适应 Node 版本变更的启动器

默认注册使用 Node 绝对路径。经常更换 Node 版本的 macOS 和 Linux 可选择 `stable`（0.1.14 起）。它在 Node 文件夹之外保留 Aptly 及其依赖，并搜索其他受支持的 Node.js 24+。它不包含 Node 本身，也不支持 Windows。

新注册请使用 `aptly setup --client all --launcher stable`。现有注册请先检查 dry run 再迁移。其他账户请传递对应主目录环境，Claude 请改用 `--client claude`。

```sh
aptly setup --client codex --migrate-launcher --launcher stable --dry-run
aptly setup --client codex --migrate-launcher --launcher stable
```

全局 Aptly 更新后也须用相同命令更新保留副本。普通 `setup` 不替换副本，过期副本会以 `stable_snapshot_outdated` 提示。迁移会一并更新其拥有的 MCP 和统计观察器，不会接管修改过的启动器或 Hook。如果目标是保留的标准注册，请审核后添加 `--include-existing`。Codex 中更改过的 Hook 须在 `/hooks` 中重新批准。

<details>
<summary>启动器限制与恢复</summary>

搜索顺序为安装时的 Node → 标准路径 → 默认 `~/.nvm/versions/node` → 安全的绝对 PATH。不保证选择最新版本，也不保证支持自定义 NVM_DIR、shim 或基于符号链接的管理器。不会执行 shell 配置、npm 或下载。`NODE_OPTIONS`、`NODE_PATH` 和 `NODE_REPL_EXTERNAL_MODULE` 会被移除；额外 CA 请检查 `NODE_EXTRA_CA_CERTS` 等设置。

可写祖先路径、外部提升的依赖、原生插件等无法验证的来源会被拒绝。完整性检查会增加 I/O 成本，搜索预算不是全部文件 I/O 的硬超时。这不是沙箱或发布者签名认证。MCP 失败时会报错停止，统计观察器则静默退出。

所有权一致时，可从丢失、损坏或旧格式副本显式迁移至新 CLI 来源。损坏的同代锁或未完成锁不会自动覆盖或删除。旧副本也不会自动删除，因为其他主目录或进程可能引用它。请确认写入进程与引用后检查状态。直接 Node 启动器之间的迁移可能需要单独更新统计（`statistics_observer_migration_required`）。

</details>

<a id="guide-models-and-environment"></a>

## 模型与环境变量

等级是任务预设，并不表示不同提供商的模型性能相当。

| 等级 | Claude Code | Codex | 代表任务 |
|---|---|---|---|
| simple | `haiku` | `gpt-6-luna` / `max` | 提取、格式转换、小型机械修改 |
| routine | `sonnet` | `gpt-6.1-terra` / `high` | 考虑上下文的写作、翻译、范围明确的实现 |
| deep | `opus` | `gpt-6.1-sol` / `medium` | 复杂调试、设计判断、深入审阅 |

MCP 的 `env` 值是字符串，因此候选数组也须作为 JSON 字符串传递。

```json
{
  "env": {
    "APTLY_CLAUDE_MODELS": "[\"haiku\", \"sonnet\", \"opus\"]",
    "APTLY_CODEX_MODELS": "[\"gpt-6-luna\", \"gpt-6.1-terra\", \"gpt-6.1-sol\"]"
  }
}
```

未指定时使用上述默认值；`[]` 会禁用该宿主的推荐。空字符串、重复项、不支持的模型或无效 JSON 会报错。也支持别名 `CLAUDE_MODELS` 和 `CODEX_MODELS`，但同时设置同一提供商的主名称和别名会报错。候选设置不会覆盖现有选择，也不证明账户有模型访问权限。

`set default` 保留现有候选、别名和传递声明，只为缺失的模型族添加默认值。即使 Codex 的继承候选在当前 CLI 中不可见，也不会覆盖。请在重启 MCP 后确认最终候选。

[安装](installation.md) · [问题排查](troubleshooting.md) · [指南目录](../zh-CN.md)
