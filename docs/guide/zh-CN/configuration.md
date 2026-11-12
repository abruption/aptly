# 初始设置与候选模型

[한국어](../ko/configuration.md) · [English](../en/configuration.md) · [简体中文](../zh-CN/configuration.md) · [日本語](../ja/configuration.md)

[指南目录](../zh-CN.md)

设置前，请确认启动 Codex 的环境中的 `CODEX_HOME`，或 Claude Code 的 `CLAUDE_CONFIG_DIR`。安装、设置和统计命令也应使用相同环境，才能选择对应账户目录。

默认目录可能与宿主实际使用的账户目录不同。请勿跨目录复制策略、账本、密钥或信任记录。发生路径冲突或 `existing_hook_not_owned` 时，请保留注册并先审查，参见[问题排查](troubleshooting.md)。

需要手动配置 MCP 时，请参见[高级集成](advanced.md#guide-manual-mcp-setup)。

## 本页目录

- [配置文件位置](#guide-host-config-locations)
- [使用 CLI 设置](#guide-cli-configuration)
- [密钥与重启](#guide-keys-and-restart)
- [模型与环境变量](#guide-models-and-environment)
- [不依赖 Node 版本目录的启动器](#guide-stable-launcher)

<a id="guide-host-config-locations"></a>

## 配置文件位置

| 宿主 | Aptly 使用的用户注册位置 |
|---|---|
| Codex | `$CODEX_HOME/config.toml`；未设置 `CODEX_HOME` 时为 `~/.codex/config.toml` |
| Claude Code | `~/.claude.json` 中的 `mcpServers.aptly`；设置 `CLAUDE_CONFIG_DIR` 时为该目录中的 `.claude.json` |

0.1.14 之后的修复也允许使用 `@codex-home` 策略的 MCP 在未设置 `CODEX_HOME` 时选择 OS 用户主目录下的 `~/.codex`。显式指定的绝对路径优先；显式空值、相对路径或含控制字符的值仍会被拒绝。已发布的 0.1.14 即使使用默认主目录，也仍需传递该变量。自定义账户目录不会被自动查找，因此账户管理工具必须传递正确的 `CODEX_HOME`。 若自定义宿主未传递此值，将应用默认主目录的策略与传输范围；请传递该值以保留账户专属策略。

Claude Code 默认将 Hook 存储在 `~/.claude/settings.json`；设置 `CLAUDE_CONFIG_DIR` 时则使用 `$CLAUDE_CONFIG_DIR/settings.json`。此文件与 MCP 注册分开。若使用项目 `.mcp.json`、托管设置或账户专用目录，请先通过 `/mcp` 确认当前注册，再编辑或添加。

<a id="guide-cli-configuration"></a>

## 使用 CLI 设置

从 0.1.11 起，首次普通交互式 `aptly set default` 会按客户端主目录合并待审查项。推荐 `excerpt`；按 Enter 保留已有范围，未选择时则选择 `none`。请参见[传输审查](transmission.md#guide-transmission-scope)。0.1.10 不支持此重新审查流程，请先更新。

`set` 命令需要 0.1.1 或更高版本。命令不会自动切换现有启动路径。API 密钥设置仅允许当前软件包的标准 Node/服务器注册，并要求确认运行时支持系统凭据引用。自定义包装程序、旧版本及其他安装位置会以 `credential_launcher_unverified` 被拒绝；请先明确切换注册项或完成升级，再重新执行。

```sh
aptly set default
aptly set env APTLY_CODEX_MODELS
aptly set env OPENAI_API_KEY
```

第一条命令注册 Claude Code 和 Codex，并补充缺失的默认环境设置，不覆盖现有启动命令、环境变量白名单、分类方式、自定义候选或 advisory 策略。第二条命令以隐藏输入方式询问值，仅修改指定变量。第三条命令把 API 密钥存入操作系统凭据存储，并在所选宿主启动时读取。请勿把值作为命令参数传入。

默认选择两个宿主。可用 `--client codex`、`--client claude` 或 `--client all` 指定目标。例如，Claude 候选值可输入 `["haiku","sonnet","opus"]` 这样的 JSON 字符串。

```sh
aptly set env APTLY_CLAUDE_MODELS --client claude
```

自动化时请显式使用 `--stdin`。下面是公开变量的示例；不要把真实密钥放入 `printf` 命令或 shell 历史。

```sh
printf '%s\n' '["gpt-6.1-terra"]' | aptly set env APTLY_CODEX_MODELS --stdin
```

允许设置的公开键为 `ROUTER_PROVIDER`（`fixture` 或 `decisions`）、`APTLY_CLAUDE_MODELS`、`APTLY_CODEX_MODELS`、`CLAUDE_MODELS`、`CODEX_MODELS` 和 `APTLY_MODEL_INFO_PATH`。候选必须是受支持模型的 JSON 数组字符串；无效值、重复值及主名称与别名冲突会被拒绝。`[]` 关闭对应宿主的推荐；模型缓存必须使用私有目录内的绝对路径。账本及 Hook 策略路径等受管理项不能通过此命令更改。

API 密钥通过 macOS Keychain、已安装的 Linux `secret-tool` 或 Windows Credential Manager 保存。Windows 后端使用 PowerShell 和当前用户范围的 Win32 Generic 凭据，UTF-8 数据上限为 2,560 字节。Windows CI 已验证合成密钥的保存、读取、更新和删除，以及 Unicode 路径、隔离的宿主设置、密钥引用和 ACL 保留；并未运行 Windows 上真实的 Claude Code 或 Codex 会话。凭据存储不可用时会返回错误，不回退到明文文件。密钥按宿主账户分开，MCP 文件只保存 `APTLY_SECRET_BACKEND=os` 和 `APTLY_SECRET_CLIENT` 引用。明确选择系统存储后，缺少密钥或读取失败时，不会静默改用其他环境变量密钥。`set default` 保留现有包装程序或环境认证；只有执行 `set env OPENAI_API_KEY` 才明确选择系统存储认证。

命令只返回宿主状态和固定错误代码，不返回密钥值。结果为 `partial` 时，请逐个检查宿主。`credential_store_failed` 表示应检查存储访问或支持情况；`credential_rollback_failed` 表示需确认旧密钥是否恢复。失败宿主会在可能时恢复旧密钥，不能把其他宿主的成功视为所有宿主的原子成功。

保存超时或响应解析失败也可能发生在 OS 已写入新值之后。失败时会尝试恢复旧值；若原来没有值，则删除新条目，然后重新读取确认。如果无法确认恢复结果，会在原始错误代码之外添加 `credential_rollback_failed`。不要假定任一密钥仍然有效，请在重试前检查 OS 凭据存储。这是尽力恢复，并非跨进程或宿主的原子事务。

修改后请重启 MCP，并通过 `get_routing_capabilities` 查看 `provider`、候选和 `credential_status`。`os_store` 仅表示读到了密钥，不代表 API 已通过认证。默认设置和公开变量设置仍会保留自定义包装程序。API 密钥设置不会修改未经确认的启动路径所对应的宿主设置；如果已尝试保存，则会在可能时恢复该宿主的旧密钥。不要假定新密钥会通过现有包装程序自动生效。命令不会绕过 Codex 的 `/hooks` 信任批准或宿主权限。

<a id="guide-stable-launcher"></a>

## 不依赖 Node 版本目录的启动器

此选项自 0.1.14 起可用。在 POSIX（macOS/Linux）上显式指定 `--launcher stable`，会将启动器与 Aptly 运行时依赖保存在 Node 版本目录之外的私有位置。它不复制 Node，因此仍须安装受支持的 Node.js 24 以上版本。旧 Node 和原 npm 软件包目录被删除后，保留的启动器可寻找其他受支持安装。GUI 宿主的 PATH 可能没有 `node`，仅改成命令名无法提供相同保证。

默认安装、自动注册及既有注册仍使用直接 Node 路径。新注册可使用 `aptly setup --client all --launcher stable`；既有注册请先检查，再显式迁移。Claude 使用 `--client claude`，各 Codex 账号须选择正确的 `CODEX_HOME`。

```sh
aptly setup --client codex --migrate-launcher --launcher stable --dry-run
aptly setup --client codex --migrate-launcher --launcher stable
```

仅在审核符合条件的既有标准启动器后添加 `--include-existing`。不会自动接管自定义或已修改的启动器及统计 Hook。迁移同时更新 Aptly 所有的 MCP 和观察器目标，保留收集状态、native 元数据同意、密钥、策略、账本和统计历史。请在 Codex `/hooks` 重新审核新 Hook，不会自动批准信任。

依次尝试安装时 Node、标准路径、默认 `~/.nvm/versions/node` 中的正式版本及安全的绝对 PATH 项。不保证选择最新 Node；使用符号链接或 shim 的版本管理器即使在 PATH 中也可能被拒绝，仅支持可验证的实际可执行路径。启动时不加载 shell 配置、不运行 npm，也不下载网络内容。stable 模式主动移除 `NODE_OPTIONS`、`NODE_PATH` 和 `NODE_REPL_EXTERNAL_MODULE` 以避免继承常见 Node 启动覆盖设置；需要额外 CA 时请使用 `NODE_EXTRA_CA_CERTS` 等独立证书设置。需要原生扩展的运行时依赖会被拒绝。运行时缺失或完整性失败时 MCP 返回固定错误，统计观察器则保持静默的 best-effort 行为。

主要支持普通 npm 全局安装。重定向或可写的上级路径，以及本地软件包外被 hoist 的依赖等不可验证来源会被拒绝。Windows 保留直接模式，不支持 stable。后续不带选项的 setup/migration 保留 stable 模式。请使用实际 npm 全局 CLI 执行 `aptly update`，再显式迁移以选择新 Aptly 副本。`remove` 不自动删除其他主目录或进程仍可能使用的副本。`doctor` 仅观测副本元数据，不证明实际执行、认证或重载就绪。

普通 setup 不会静默替换既有副本。比 CLI 更旧的选定副本会报告 `stable_snapshot_outdated` 并提供显式迁移说明。所有权完全匹配的 stable 引用可从缺失、损坏或旧格式副本显式迁移到当前 CLI 的已验证来源。同代副本损坏或残留未完成 lock 时，不会自动覆盖或删除；请先检查写入者及其他主目录引用，再手动审核对应状态。不会将自定义或已修改的注册接管为产品所有。

stable 迁移同时更新所属观察器；既有直接模式之间的迁移仍可能需要另行刷新统计观察器（`statistics_observer_migration_required`）。setup 与启动的完整性检查会增加 I/O 开销，受限探测不保证全部文件系统操作的总墙钟时限。这不是隔离同用户程序或工作线程的安全 sandbox。

<a id="guide-keys-and-restart"></a>

## 密钥与重启

通过安全环境或凭据启动程序将分类用的 `OPENAI_API_KEY` 传递给 MCP 进程。它与宿主订阅登录无关。不要将密钥值写入命令参数、请求、配置文件、源码、日志或临时文件。

<a id="guide-models-and-environment"></a>

## 模型与环境变量

默认候选共有六个配置。这些等级是 Aptly 预设的运行配置，并不表示两家提供商的模型能力相等。

| 等级 | Claude Code | Codex | 典型任务 |
|---|---|---|---|
| simple | `haiku` | `gpt-6-luna` / `max` | 提取、格式转换、小型机械性修改 |
| routine | `sonnet` | `gpt-6.1-terra` / `high` | 结合上下文的撰写或翻译、范围明确的实现 |
| deep | `opus` | `gpt-6.1-sol` / `medium` | 复合调试、设计判断、深入审查 |

MCP 的 `env` 值是字符串，因此候选数组也必须以 JSON 字符串传递。

```json
{
  "env": {
    "APTLY_CLAUDE_MODELS": "[\"haiku\", \"sonnet\", \"opus\"]",
    "APTLY_CODEX_MODELS": "[\"gpt-6-luna\", \"gpt-6.1-terra\", \"gpt-6.1-sol\"]"
  }
}
```

未设置时使用上述默认值，`[]` 会禁用对应 client 的推荐。空字符串、重复项、不支持的模型或无效 JSON 都会报错。也支持别名 `CLAUDE_MODELS` 和 `CODEX_MODELS`，但同时设置同一提供商的主变量名与别名会报错。候选设置不会覆盖现有选择，也不代表已确认账户的模型访问权限。

`aptly set default` 会保留 MCP `env` 中已有的候选及其别名、Codex `env_vars` 的转发声明，以及当前 CLI 可观察到的 Claude 继承候选。仅当同一模型系列的两个变量名均未配置时，才添加默认候选。即使当前终端无法读取 Codex 转发变量的值，也会保留其声明，不会用默认值替换或把继承值复制到配置文件中。验证有效设置时，CLI 优先使用同名静态 `env` 值。目录验证规则保持不变；别名冲突或格式错误会使配置修改被拒绝。请在重启 MCP 后另行确认最终候选。

## 相关文档

[安装与更新](installation.md) · [自动推荐](routing.md) · [Decisions API 传输范围](transmission.md) · [高级 MCP 集成与开发参考](advanced.md) · [问题排查](troubleshooting.md)

[指南目录](../zh-CN.md)
