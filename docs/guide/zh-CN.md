# Aptly 使用指南

[한국어](ko.md) · [English](en.md) · **简体中文** · [日本語](ja.md)

[返回 README](../../README.zh-CN.md)

韩语文档是正本。本指南介绍 Aptly 的常规安装与使用方法。可以安装软件包，并不表示所有账户都能访问相关模型。子代理的实际执行、审批、沙箱与 MCP 权限仍由 Claude Code 或 Codex 负责。

## 安装

需要 Node.js 24 或更高版本，以及 Claude Code 或 Codex。请使用以下命令全局安装 npm 上的最新稳定版本：

**将现有持久化账本升级到 0.1.2 或更高版本前**，请停止所有可能访问该账本的宿主、MCP 服务器、独立 CLI 和旧版进程。新的持久锁不能与旧版写入进程并用。全新安装无需隔离旧锁。如果仍有旧版空锁，请遵循[账本迁移步骤](#进程中断与账本锁定)，仅在离线状态下隔离已确认的旧锁，并保留 JSON 账本、`unknown` 记录、成本和已完成缓存。

```sh
npm install -g aptly@latest --allow-scripts=aptly
aptly set default
aptly --version
```

请运行 `aptly --version` 确认已安装的版本。切换 Node.js 环境后可能需要重新安装。

`postinstall` 会在当前用户现有的宿主配置目录中注册 MCP 和 `PreToolUse` Hook。如果使用 `CODEX_HOME` 或 `CLAUDE_CONFIG_DIR`，请向安装进程传递相同的环境。自动注册会跳过尚不存在的宿主目录；显式运行 `setup` 可以创建这些目录。若只需注册某个宿主，请使用 `--client codex` 或 `--client claude`。

新注册项会指定 `ROUTER_PROVIDER=decisions`、Hook 的 `defaults` 策略，以及各宿主独立的私有账本。其他现有配置与 Hook，以及 Aptly 原有的命令、环境、分类方式和账本路径都会保留。现有 fixture 配置不会自动切换为付费模式。

### npm 安装脚本许可

上面的安装命令通过 `--allow-scripts=aptly` 显式允许本次安装运行 Aptly 的 `postinstall`。已在 npm 11.19.1 中确认支持，不会修改用户级 npm 许可配置。请参阅 [npm 官方说明](https://docs.npmjs.com/cli/v11/commands/npm-rebuild/#allow-scripts)。

`npm warn install-scripts ... not yet covered by allowScripts` 表示许可策略尚未记录此项。在 npm 11.19.1 中，仅凭此警告不能判断脚本被阻止。实际行为取决于 npm 版本、严格策略和 `ignore-scripts`；安装成功也不等于 MCP 或 Hook 注册成功。npm 可能隐藏 postinstall 输出。

如果 npm 不支持此选项，或希望手动配置而非自动注册，请运行：

```sh
npm install -g aptly@latest --ignore-scripts
aptly setup --client all
```

无论安装脚本是否运行，都可以显式执行 `setup`。它会保留已有启动路径；旧路径错误请按下文恢复步骤处理。密钥配置、MCP 重启和 Codex `/hooks` 信任审核仍需单独完成。

### 软件包更新

`aptly update` 需要 **Aptly 0.1.3 或更高版本**。仅支持已验证的全局 npm 安装，将 `aptly@latest` 安装到与当前运行软件包一致且已验证的 prefix。局部安装、源码检出和无法验证的路径会被拒绝。 如果 npm 的有效配置为 `dry-run=true`，命令会在开始安装前返回 `update_dry_run_enabled` 并拒绝更新。无法验证配置时返回 `update_configuration_unverified`。不会将试运行报告为更新成功。

更新前，请按上文账本迁移步骤停止其他使用账本的宿主、MCP 和 CLI 进程。该命令跳过安装脚本，更新后请显式配置并重启宿主：

```sh
aptly update
aptly setup --client all
aptly --version
```

不会自动迁移现有 MCP 启动路径或用户包装程序。如仍有旧路径，请按下文启动路径恢复步骤处理。密钥配置和 Codex `/hooks` 信任审核仍是单独步骤。如遇 npm 认证、网络或权限错误，请使用手动安装说明。不会自动安装更新。

### 新版本通知

**Aptly 0.1.3 或更高版本**会在交互式普通 CLI 命令中检查最新稳定版本，并在有新版时通过 stderr 提示 `aptly update`。 三个标准流必须都是终端；MCP 服务、自动 setup、推荐或分类路径、管道和 CI 均跳过检查。JSON stdout 和 MCP、Hook 响应保持不变。

仅向公开 npm 注册表请求 Aptly 版本元数据，不发送密钥、任务摘要或宿主配置。网络及响应读取限制为 800ms 和 16KiB，结果缓存于 `~/.cache/aptly/update-check.json`，有效期为 24 小时，失败后等待一小时。网络或缓存错误不会使原命令失败。在 CLI 环境中设置 `APTLY_NO_UPDATE_NOTIFIER=1` 可关闭检查；此变量不属于 `aptly set env` 支持的键。通知不会安装更新。

### 使用 CLI 设置

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

### 恢复不兼容的启动路径

以下选项需要 Aptly 0.1.2 或更高版本，npm 0.1.1 不包含这些选项。如需从源码测试，请运行 `npm ci --ignore-scripts` 和 `npm run build`，然后将下文的 `aptly` 替换为 `node bin/aptly.ts`。

密钥设置会在输入和保存前诊断所选宿主。任一宿主失败时，不提示输入，也不修改任何宿主。`--check` 不访问密钥或凭据存储。`credential_node_mismatch`、`credential_server_mismatch` 和 `credential_runtime_unsupported` 分别表示 Node 路径、服务器路径及 OS 存储支持不兼容。

如果只有 Claude 失败，按以下顺序诊断，仅在返回 `launcher_migration_available` 时考虑迁移：

```sh
aptly set env OPENAI_API_KEY --client claude --check
aptly setup --client claude --migrate-launcher --dry-run
aptly setup --client claude --migrate-launcher
aptly set env OPENAI_API_KEY --client claude
```

`--dry-run` 不修改文件。迁移仅将与所有权记录一致的 Aptly 标准注册的 Node 和服务器路径更新到当前构建，保留环境设置、Hook、策略及其他宿主，不访问凭据，也不执行旧启动程序。自定义包装程序、缺少所有权记录或已修改的注册会被拒绝。请在本地检查此类注册，使用包装程序的安全环境传递方式，或切换到另行审核的标准注册。不要编辑或删除所有权记录以绕过验证。

如果 `launcher_migration_not_owned` 对应的是保留的注册（`mcp_created: false`），**Aptly 0.1.3 或更高版本**提供显式选项 `--include-existing`。请安装 0.1.3 或更高版本，然后运行：

```sh
aptly setup --client claude --migrate-launcher --include-existing --dry-run
aptly setup --client claude --migrate-launcher --include-existing
```

请先在本地检查注册。必须已有有效的 Aptly 所有权记录，且受管理的环境变量、Hook 和策略与记录一致。仅接受绝对 Node 路径和单个标准服务器路径；包装程序或缺少记录的注册仍会被拒绝。此选项不会将整个 MCP 注册改为 Aptly 所有，后续移除仍会保留迁移后的启动路径和原有用户设置。仅可用于显式指定的单个宿主迁移，不适用于自动安装。

已成功的 Codex 无需重新设置。仅指定失败的宿主重试，然后重启 MCP。Codex 仍需通过 `/hooks` 审核信任。诊断后的配置变更会以 `concurrent_configuration_change` 中止。恢复时若发现其他密钥或无法读取当前值，不会覆盖存储，而是返回 `credential_rollback_failed`。文件与 OS 存储之间不是原子事务，请避免同时运行配置操作。

### 密钥与重启

通过安全环境或凭据启动程序将分类用的 `OPENAI_API_KEY` 传递给 MCP 进程。它与宿主订阅登录无关。不要将密钥值写入命令参数、请求、配置文件、源码、日志或临时文件。

### MCP 环境变量设置步骤

运行 `setup` 后，将以下示例合并到现有 `aptly` 注册中。保留 `command`、`args`、凭据启动程序、`ROUTER_LEDGER_PATH` 和 `APTLY_HOOK_POLICY_PATH`。Setup 会创建私有账本和策略目录。手动指定账本时，应使用用户所有、权限为 700 的目录内的绝对路径。

#### 配置文件位置

| 宿主 | Aptly 使用的用户注册位置 |
|---|---|
| Codex | `$CODEX_HOME/config.toml`；未设置 `CODEX_HOME` 时为 `~/.codex/config.toml` |
| Claude Code | `~/.claude.json` 中的 `mcpServers.aptly`；设置 `CLAUDE_CONFIG_DIR` 时为该目录中的 `.claude.json` |

Claude Code 默认将 Hook 存储在 `~/.claude/settings.json`；设置 `CLAUDE_CONFIG_DIR` 时则使用 `$CLAUDE_CONFIG_DIR/settings.json`。此文件与 MCP 注册分开。若使用项目 `.mcp.json`、托管设置或账户专用目录，请先通过 `/mcp` 确认当前注册，再编辑或添加。

#### 传递 API 密钥

直接启动时，在 **Bash** 中输入密钥，不回显也不记录到命令历史，然后从同一 shell 启动宿主。使用 zsh 时请先运行 `bash`：

```sh
read -rsp 'OpenAI API key: ' OPENAI_API_KEY
printf '\n'
export OPENAI_API_KEY
codex
```

Claude Code 用户将 `codex` 替换为 `claude`。密钥不会永久保存。已运行的 GUI 不会继承其他终端的环境，请使用应用的安全环境传递功能或保留现有凭据启动程序。

#### Codex 示例

编辑现有 `[mcp_servers.aptly]` 表，不要重复添加同名表。向 `env_vars` 添加 `OPENAI_API_KEY`，保留已有条目。`env_vars` 按名称转发宿主环境变量，`.env` 向 MCP 提供固定值。

```toml
[mcp_servers.aptly]
env_vars = ["OPENAI_API_KEY"]

[mcp_servers.aptly.env]
ROUTER_PROVIDER = "decisions"
APTLY_CLAUDE_MODELS = '["haiku","sonnet","opus"]'
APTLY_CODEX_MODELS = '["gpt-6-luna","gpt-6.1-terra","gpt-6.1-sol"]'
```

#### Claude Code 示例

将以下值合并到现有 `mcpServers.aptly.env` 对象：

```json
{
  "ROUTER_PROVIDER": "decisions",
  "APTLY_CLAUDE_MODELS": "[\"haiku\",\"sonnet\",\"opus\"]",
  "APTLY_CODEX_MODELS": "[\"gpt-6-luna\",\"gpt-6.1-terra\",\"gpt-6.1-sol\"]"
}
```

直接启动时，可用以下可选引用传递 Claude Code 环境中已有的密钥。使用凭据启动程序时不要添加。若变量缺失，密钥不会传入，引用字符串也可能保持未展开状态：

```json
{
  "OPENAI_API_KEY": "${OPENAI_API_KEY}"
}
```

模型候选使用 **JSON 字符串**。不设置则采用默认值，`[]` 禁用该宿主的推荐。Aptly 读取 MCP 启动环境，不会自动加载项目 `.env` 文件。

修改后重启宿主或 MCP。**在 Codex 的 `/hooks` 中审核新 Hook 并批准信任。** 通过 `/mcp` 和 `get_routing_capabilities` 检查 `provider`、候选和 `automatic_hook.mode`。免费状态查询不验证密钥认证；`recommend_agent` 可能产生费用。`unauthorized` 时检查密钥传递，`needs_context` 时检查任务摘要。

配置位置与传递方式的官方说明，请参阅 [Codex 配置参考](https://learn.chatgpt.com/docs/config-file/config-reference)和 [Claude Code MCP 指南](https://code.claude.com/docs/en/mcp)。

### 跳过与移除

```sh
APTLY_SKIP_SETUP=1 npm install -g aptly@latest
aptly setup --client codex --mode defaults
aptly remove --client all
```

`CI` 或 npm `--ignore-scripts` 也会跳过注册，可随后运行 `setup`。更改模式时，先移除注册，再使用所需 `--mode` 重新设置；`advisory` 只提供建议。出现 `partial` 时检查各宿主错误代码。移除操作保留用户修改的条目并报告冲突。

## 自动 Hook

**以下预检、推荐和观测行为需要 Aptly 0.1.4 或更高版本。** 已安装的 `PreToolUse` matcher 会在原生执行前，将 Codex 的 `spawn_agent` / `collaborationspawn_agent` / `Agent` 和 Claude Code 的 `Agent` 交给本地 `route_spawn_hook`。宿主必须加载并信任 Hook，且连接 MCP。Aptly 无法强制拦截未配置、不支持的宿主或 MCP 不可用的情况；执行仍由宿主负责。

本地预检评估显式字段、角色、resume、策略、缓存和预算。不是每次调用都需要新的付费 Decisions 请求。Codex 只指定模型或 effort 时，候选仅限于匹配的允许组合，只填写未指定字段。两者都指定、不支持的值、固定角色和 resume 均在本地保留，不进行分类。仅凭输入无法断定某个字段来自用户还是宿主默认值。

模型和 effort 未指定时，`fork_turns: "all"` 或省略 fork 也会评估推荐，但**不会改变历史**。Codex 应用模型和 effort 仍要求显式 `fork_turns: "none"`，否则报告 `inherited_context_application_unverified` 并保留原始参数。其他历史字段以 `history_semantics_unverified` 阻止应用；Claude 也只对没有历史约束的通用调用应用推荐。生成推荐不等于已应用。

Codex 正文不透明时，`cleanup_merged_worktrees` 等具体的短任务名也可用于仅基于名称的推荐。短名称仅允许 cleanup/remove/prune + merged + worktrees/branches，或 review/fix/test + failing/broken/flaky + tests/builds 组合；其他名称仍须通过原有的六词检查。不会解密或发送正文，也不会推断任务细节或删除权限。继承历史时的应用在目标主机上尚未验证，并非所有版本都不支持；公开源码不能证明已安装运行时的支持情况。

仅对独立任务，由调用方提供充分的独立任务上下文并明确选择新子代理。Aptly 不会将 `all` 改成 `none`，删除历史或覆盖显式模型和 effort。[合成的继承与新子代理示例](../../examples/spawn-preflight.codex.json)是不同请求，不是自动重试。不要用新 ID 重试结果不明的付费调用。

`defaults` 允许兼容的参数更新，`advisory` 只提供建议。继承调用和部分指定的调用即使无法应用推荐，也可能向 Decisions 发送受限任务摘录；继承历史不是关闭共享的方式。策略关闭、上下文不足、预算限制、失败及取消时均保留执行约束。输入、策略和候选绑定、去重及未知结果保护保持不变，fixture 推荐不改写原生默认值。没有自动策略时的 strict 证据路径仍是独立路径；宿主内部补丁继续暂停。

| MCP 工具 | 用途 |
|---|---|
| `get_routing_capabilities` | 免费查询候选、限制、分类方式与 Hook 状态 |
| `recommend_agent` | 根据任务摘要获取直接推荐 |
| `get_routing_precedence` | 解释调用的保留依据与未确认的配置来源 |
| `route_spawn_hook` | 根据已安装的策略选择目标调用的默认值，或仅传递推荐 |
| `get_spawn_routing_observation` | 查询完全匹配的 Hook 调用，不证明原生执行 |
| `prepare_spawn_context` | 为完全匹配的待执行调用注册受限说明 |
| `cancel_spawn_context` | 撤销说明关联，不取消原生执行或已发送的请求 |
| `retry_spawn_recommendation` | 使用 Hook 返回的 retry_id 补充一次任务说明并重新推荐 |
| `prepare_fresh_delegation` | 根据已完成的继承调用推荐准备独立 Codex 调用参数，不执行调用 |

### confidence 与推荐保留

`confidence` 是元数据，尚未验证其为经过校准的正确概率。目前不将其用作自动应用的阈值。目前，只要满足其他应用条件，0 和较低值也可被接受。实际 Decisions 响应缺少该值时会被作为错误拒绝；通用 Router 与已保存结果中的该字段仍为可选项。`keep_current` 与 `needs_context` 是独立于数值的结果，遵循既有的保留与上下文补充规则。显式指定的模型、effort、历史和权限均会保留。小规模分类评估不能证明子任务质量或总成本有所改善。

<a id="对外传输与关闭自动共享"></a>

### 预算上限与用量（下一版本）

此功能正在开发，已发布的 0.1.7 尚不包含。`aptly set default` 也会为所选宿主补齐缺失的预算环境设置。不增加预算问答，保留包括显式 `0` 在内的既有值，不重置用量、账本或缓存。既有传输范围选择是独立的。未设置预算变量的既有注册在升级后也会使用新的运行时默认值。原有隐式的 20 次、50 次及 $0.50 上限不会保留；请显式配置所需上限。

| 环境变量 | 默认值 | 含义 |
|---|---:|---|
| `APTLY_MAX_DAILY_CALLS` | `200` | 每个账本按 UTC 计算的每日分类尝试上限 |
| `APTLY_MAX_TOTAL_CALLS` | `0` | 每个账本的累计尝试上限 |
| `APTLY_MAX_ESTIMATED_USD` | `0` | 累计本地预留金额上限 |
| `APTLY_ESTIMATED_CALL_USD` | `0.002` | 每次新分类尝试预留的估计美元金额 |

三个上限中的 `0` 表示无限制。每次尝试的预留单价不是上限，必须为正数。未设置时使用默认值；空字符串、负数、异常数字及指数表示法均会被拒绝。调用次数使用整数；金额使用小数部分最多 6 位的十进制表示。有限值最大为每日 100,000 次、累计 1,000,000 次、金额设置 100。有限金额上限必须足够预留一次调用。不会静默覆盖既有无效设置。

```sh
aptly set env APTLY_MAX_DAILY_CALLS
aptly set env APTLY_MAX_TOTAL_CALLS
aptly set env APTLY_MAX_ESTIMATED_USD
aptly set env APTLY_ESTIMATED_CALL_USD
aptly budget status --client codex
aptly budget status --client claude
```

设置命令支持 `--client codex|claude|all`、隐藏输入与显式 `--stdin`。修改后请重启 MCP。状态仅为注册配置及获准的当前环境快照，不证明自定义包装器或正在运行的宿主所用值。不读取密钥、API 或任务原文，也不创建账本或 gate。无限制显示为 `Unlimited`，剩余额度显示为 `null`。共用同一账本的会话共用预算，不汇总其他账本或 OpenAI 账户的全部用量。

`budget_exhausted` 是本地限制，不是 OpenAI 认证或账户余额错误。直接推荐、上下文补充响应中的 `budget_limit` 和状态中的 `exhausted_by` 会标明耗尽项目。预留金额不是真实账单上限，不会按月自动重置。修改单价不会重算过去的预留金额；重新输入密钥或应用默认值也不会退款。

HTTP 之前产生的新预算拒绝不会缓存。只有可验证的既有默认策略中确定未付费的拒绝才会用同一 ID 重新评估，保留已完成的推荐、保留选择、上下文结果与 `unknown`。预算恢复不会延长原 retry 引用的 5 分钟期限或进程寿命，也不会解除历史或权限限制。不猜测任意历史自定义策略的 digest；请勿用新 ID 或删除账本绕过冲突及未知结果。

### Decisions API 传输范围

本节传输范围命令从 Aptly 0.1.7 起提供。

这里的传输是指**将本地任务信息发送至 OpenAI Decisions API**，不是向 Aptly 开发者提供任务的功能。应用模式 `defaults/advisory` 与传输范围相互独立。新注册使用 v2 策略的 `unselected` 状态，不自动传输。交互式 `aptly set default` 仅为尚未选择的宿主询问范围，按 Enter 默认选择 `none`。非交互运行和 postinstall 不询问，也不视为同意。

```sh
aptly set transmission --show
aptly set transmission none
aptly set transmission description
aptly set transmission excerpt
```

以上修改命令展示不同选项；请只执行所需的一项。可用 `--client codex|claude|all` 选择宿主。`none` 停止自动传输并保留原调用。`description` 仅允许父代理提供的说明。没有说明时，会在调用 API 前请求补充上下文，不自动回退到 native 正文或标签。`defaults` 阻止尚未解决的 spawn；`advisory` 仅提供提示。`excerpt` 允许既有 native 摘录和显式说明。来源、大小及已知秘密模式检查不能证明内容不敏感，也不代表用户同意。

既有 v1 策略保持原始字节不变，并显示来源为 `legacy` 的 `excerpt`。只有显式修改才迁移为 v2，并同时更新所有权记录。不会自动接管已修改的策略或自定义启动器，冲突时予以保留。不删除密钥、账本或未知结果记录。修改后请重启 MCP。无法撤回已开始的传输；策略变化会阻止之前的处理中结果、retry 和 fresh 准备被应用。请勿使用新的付费 ID 绕过旧调用的绑定冲突。显式的 `recommend_agent` 和 `aptly recommend` 属于独立请求，不受此自动传输设置禁止。

手动设置 `enabled: false` 仍可作为紧急停止方式，但可能引发所有权冲突。常规修改请使用以上命令，不要编辑所有权记录以绕过检查。

### 传输内容与过滤限制

在 `excerpt` 范围内，没有预先注册的说明时，自动分类的 `summary` 是由有效任务标签与正文**截取后的首段拼接成的摘录**，并不是重新进行语义摘要或匿名化。其 UTF-8 大小不超过 `min(4000, max_summary_bytes)`；这不是整个 HTTP 请求的大小限制。Codex 的 opaque 消息回退仅使用足够具体的 `task_name`，不会解码或传输该正文。标签也可能包含敏感信息。

有效的 `prepare_spawn_context` 说明会加上固定前缀，替代 native 摘录用于分类；注册本身不调用 API。收到上下文不足的响应后，`retry_spawn_recommendation` 可使用固定前缀与新的补充说明重新推荐一次，不附加先前正文。两条路径均将原始说明限制在 `min(3800, max_summary_bytes - 96)` 字节以内，含前缀的说明限制在 `min(4000, max_summary_bytes)` 字节以内。`prepare_fresh_delegation` 本身复用已完成的推荐，不再调用分类，并将独立指令作为本地下一次调用的参数返回。按返回参数明确指定模型与 effort 的 Codex 调用，目前会由 Hook 以 `explicit_model` 保留，不进行分类。检查后续调用并不意味着再次分类。这些路径均不保证说明不含敏感信息，也不保证自动匿名化。

Decisions 会收到 `client`、`task.summary`、`task.operation`、`task.context_sufficient`，以及候选配置 ID、模型与 effort 说明、已配置的模型特性。分类 API 密钥通过 `Authorization` 请求头发送，请求 ID 通过 `X-Client-Request-Id` 发送。自动路径使用哈希 ID，直接推荐的 ID 由调用方提供。请勿在 ID 或候选说明中放入秘密信息。

如需关闭自动共享，请在 `APTLY_HOOK_POLICY_PATH` 指向的现有私有策略文件中，**仅将 `enabled` 改为 `false`**，保留其他字段和所有权记录。之后的自动 Hook 调用会在分类或创建调用绑定文件之前保留原始调用。这无法撤销已开始的传输，也无法收回服务器已收到的信息。修改生成的策略后，安装、配置或移除命令的所有权检查可能报告冲突；这些命令不会覆盖已关闭的策略。请勿修改所有权记录来绕过检查。

传输范围允许时，`mode: advisory` 仍会传输分类数据，不是隐私共享的关闭方式。删除 `APTLY_HOOK_POLICY_PATH` 可能启用既有 strict 路径，请勿以此代替关闭共享。`enabled: false` 不会阻止显式发起的 `recommend_agent` 或 `aptly recommend` 请求。

如需自行控制共享摘要，请先关闭自动共享，再为直接推荐编写必要的信息。Aptly 不会自动获取摘要中 URL 的文档，也不会附加提到的源文件。已知密钥和 Bearer 模式检查不能完整检测所有秘密，也不能保证文本适合对外传输。

账本与 Hook 绑定保存请求元数据、哈希和缓存结果，不保存任务摘录。Aptly 诊断也不包含任务原文。但本地 Hook 的 `updatedInput` 会保留原任务，以便宿主继续执行。宿主自身的会话和日志保留不受 Aptly 控制。

### 为不透明调用提供明确说明（0.1.4 起）

知道真实的待执行会话、调用 ID 和原始事件的集成，可在 Hook 前向同一 MCP 进程调用 `prepare_spawn_context({client, event, description})`。简述目的、范围、预期输出、约束和复杂度；不会抓取 URL 内容。只有受限说明和固定前缀替代任务摘录，不会发送历史、文件或不透明正文。使用 `cancel_spawn_context({client, event})` 撤销。必须启用自动策略；`enabled: false` 阻止共享。已知秘密模式检查并非完整保护。

关联有效期为五分钟，不可修改，每个进程最多128项。输入变化、过期或撤销会阻止分类；不能通过修改说明对已评估调用进行付费重试。无法获取真实待执行事件的调用方不能使用此路径；默认 Hook 不生成说明或调用 ID。本地 `insufficient_context`、提供方 `provider_needs_context` 和应用阶段 `inherited_context_application_unverified` 是不同结果。有限的原生说明交接验证记录于[交接契约](../SPAWN_CONTEXT.md)。此验证不表示会自动生成说明或执行推荐的模型。

### 补充上下文后重新推荐（0.1.5 起）

自动 Hook 返回 `insufficient_context` 或 `provider_needs_context` 时，会提供 `retry_id` 和补充指引。`defaults` 模式会阻止该次派生调用，`advisory` 模式仅提供反馈。父代理应根据已知信息简要说明任务目的、范围、预期输出和复杂度，并在五分钟内通过同一 MCP 进程调用 `retry_spawn_recommendation({retry_id, description})`。无需提前知道 native 调用 ID。仅在确实缺少信息时询问用户。

每个原始调用仅允许补充一次；相同输入复用缓存，修改说明会因冲突而被拒绝。再次需要上下文或失败时，请停止，不要为结果不明的付费请求更换 ID 重试。若 `spawn_application` 为 `blocked`，请报告限制，不要应用推荐。否则，父代理仍须保留显式选择、历史、角色和权限，仅将未指定的模型和 effort 传给新的兼容 native 调用。Hook 不会自行执行父代理的重试或派生操作。原有 `prepare_spawn_context` 关联仍不可修改。请参阅[限制、费用与验证契约](../SPAWN_CONTEXT.md#one-context-supplement-after-a-hook-response)。

重新推荐的响应通过 `next_call.set_if_unspecified` 提供下一次 native 调用所需的未指定字段；不包含已显式指定的模型或 effort，也不会为 Claude 添加 effort。因历史等约束无法应用时，不提供 `next_call`。这些字段不是执行结果或权限批准。

只有首次结果已完成时才能复用缓存。结果未知时保持 `outcome_unknown`；请勿使用新 ID 重复付费调用。

`context_retry_allowed: false` 仅表示不再接受上下文补充。对于兼容的推荐，`caller_review_required` 表示父代理检查参数，并非要求用户重新批准。现有委派授权和宿主权限检查仍然有效。

### 自动路由的保证范围与阻止结果（0.1.5 起）

保证仅适用于已启用、已信任且连接到 MCP 的 Hook 所处理的受支持调用。请通过 `get_routing_capabilities.automatic_hook.guarantee` 查看范围。服务器无法检测或强制阻止未注册、未信任、断连或宿主出错的 Hook，后续处理由宿主决定。MCP 连接状态本身不是单次调用经过路由的证据。

确认有效的启用策略和适用调用后，`defaults` 对无法应用推荐、预算耗尽、分类失败或结果不明返回 `deny` 和安全原因码。原始参数与约束保持不变，但本次派生不会执行。若继承历史的兼容性未验证，请报告限制，不要静默使用父模型或改为 `none`。`advisory` 仅说明限制，不阻止执行。策略缺失或停用、显式配置组合、固定角色及 resume 仍属于有意保留的本地路径，不会一律阻止。

获得恢复 ID 后，可在同一 MCP 进程调用 `get_spawn_routing_observation({retry_id})`，或使用原有 `{client, event}` 格式。混用或不完整的输入会被拒绝。原始 `awaiting_context` 与 `context_retry.outcome` 是独立阶段；被拒绝的重复请求记录在 `last_attempt`，不会覆盖已有分类结果。查询不产生付费请求，也不延长保留时间。执行始终为 `not_observed`，推荐或参数更新都不能证明子代理已实际执行。

### 准备单独的独立委派（0.1.6 起）

当 defaults Hook 阻止继承调用的推荐应用后，仅当调用方能声明**这是同一项独立任务、用户不要求继承历史且可提供完整独立指令**时，才可调用 `prepare_fresh_delegation`。请在同一进程传入 Hook 或重新推荐返回的 `retry_id`、`task_name`、`standalone_task`，以及 `declaration: {independent_task:true, same_task:true, original_call_outcome:"blocked", history_requirement:"not_required", standalone_context_complete:true}`。它重新验证已完成的允许配置，不额外调用分类。

原始继承调用仍被阻止。请检查独立的 `next_call.arguments`，按现有委派授权和宿主权限检查提交新调用，其中包含 `fork_turns: "none"` 并保留模型与 effort 选择。这是调用方声明，不是已验证的用户意图或执行证据。历史必需或不明确、固定角色、resume 或含未验证额外执行参数时，请勿使用。每个引用仅绑定一项任务；五分钟到期、取消、策略或候选变化及原调用变化都会阻止准备。不会为不阻止原执行的 advisory 路径提供此功能。请参阅[契约与限制](../SPAWN_CONTEXT.md#intentional-fresh-delegation)。

仅在宿主报告原调用已被阻止后使用。`original_call_outcome` 为 `executed` 或 `unknown` 时拒绝准备。这是调用方声明，并非服务器对执行的观测。重复获得相同准备响应不能保证只执行一次子代理。配置依据原始分类摘要选择，不得用于其他任务。

## 直接推荐

`recommend_agent` MCP 与 CLI 的 `recommend` 接收任务摘要并推荐执行配置，不会直接创建子代理。请将以下 JSON 作为 MCP 工具参数传递，或保存为文件并通过 CLI 的标准输入提供。

```json
{
  "request_id": "demo-codex-sort-001",
  "client": "codex",
  "task": {
    "summary": "Sort the supplied numbers [3, 1, 2] into ascending order. No files or network are needed.",
    "operation": "analysis",
    "context_sufficient": true
  }
}
```

```sh
ROUTER_PROVIDER=fixture aptly recommend < request.json
aptly capabilities
aptly config codex
aptly config claude
```

fixture 无需密钥、网络或执行子代理，即可返回本地模拟结果。这不代表实际 Decisions 判断或质量测试结果。`config` 仅输出手动 MCP 注册片段，而 `setup` 会实际修改配置。使用实际 API 时，请先准备上述密钥、分类方式和私有账本。

`task.operation` 可为 `read_only`、`write`、`review` 或 `analysis`。`context_sufficient` 表示调用方已提供所需摘要，并非对宿主配置的验证。省略 `eligible_profile_ids` 时，会使用对应 client 当前启用的候选配置；指定该字段时，可在其中进一步限制候选。

如果 `constraints` 中的 `model_pinned`、`effort_pinned`、`role_pinned`、`fork_inherits` 任意一项为 true，则保留原有选择。省略这些字段，表示该规划请求未声明保留条件，并不能据此确认实际宿主没有明确指定的设置；新请求不要使用 `provenance_verified`。

| status | 后续操作 |
|---|---|
| `recommended` | 审核 `profile`，在现有宿主中另行决定是否执行 |
| `keep_current` | 保留明确选择或暂缓推荐 |
| `needs_context` | 补充所需摘要 |
| `unavailable` | 检查预定义的 `reason` 代码；不要以新 ID 自动重新发起结果不明的付费请求 |

直接推荐的 `application: advisory_only` 不代表已确认宿主配置、模型访问权限或执行批准。重新查询已完成的结果时，请保持相同的 ID、输入、策略和账本。`unknown` 表示结果不明确，不要无条件使用新 ID 重试。因补充上下文而改变输入的新请求，应使用不同的 ID。

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

### 官方说明与缓存

Decisions 的选项会同时包含模型名称、Codex effort、官方特性和任务等级说明。可以使用附带说明启动，不会在每次推荐时获取文档。若要反映最新的官方 Markdown，请显式更新。请先准备一个归用户所有的私有目录，作为输出文件的父目录。

```sh
mkdir -m 700 /absolute/private-aptly-state
aptly catalog refresh --output /absolute/private-aptly-state/model-info.json
export APTLY_MODEL_INFO_PATH=/absolute/private-aptly-state/model-info.json
```

更新仅读取固定的 [Claude 模型文档](https://code.claude.com/docs/en/model-config.md)和 [OpenAI 模型文档](https://learn.chatgpt.com/docs/models.md)，不需要 API 密钥。只保存简要整理并规范化的模型信息；更新失败时，原有文件会保留。服务器启动时读取缓存；缓存超过 7 天或无效时，会回退到附带说明。更新后请重启 MCP。即使新文档中出现了模型，也不会自动增加候选或确认账户的访问能力。

## 提供上下文

在 Codex 将子代理 `message` 以密文传递给 Hook 的环境中，Aptly 不会读取或解密正文。此时只使用足够具体的明文 `task_name` 作为摘要，例如用 `sort_supplied_numbers_3_1_2_ascending_without_tools` 说明任务类型与范围。不受支持或含糊的任务名称会保留原有模型。对于 Claude Code 或传递明文正文的调用，则使用所提供正文的摘要。

使用相同的 `client` 和原始 Hook `event` 调用 `get_spawn_routing_observation`，查询对应调用。它返回哈希关联 ID，并区分预检、分类/缓存结果、推荐、参数更新/应用受阻，以及 `execution: not_observed`。`arguments_updated` 只表示 Hook 输出的参数，不是实际子代理模型的观测。记录仅保留在当前 MCP 进程，最多 128 条、10 分钟。`not_observed` 也可能源于其他进程、重启、过期、淘汰或输入不匹配，不能证明全局绕过 Hook。进程级 `automatic_hook.last_result` 已移除，不返回原始任务、路径、会话 ID 或凭据。

直接推荐的摘要可以同时包含仓库、文件 URL，以及阅读文档后整理的任务范围、规模和约束。发送 URL 字符串与提供文档正文不同。目前 Aptly 的分类请求处理代码不会向仓库 URL 发起 GET 请求，也不会获取文档正文。所需的文档读取和摘要由调用方完成。

目前自动 Hook 没有单独以明文传递 URL 的字段。不要假定仅将 URL 添加到会被加密的 `message` 中，就能将其传递给分类器。请区分两种路径：直接获取 MCP 推荐后，将推荐配置作为参数传递给宿主的原生调用；或通过自动 Hook 应用推荐。

## 成本实测

2026-11-05，以 [session-peer 的英文 README](https://github.com/abruption/session-peer/blob/6e9efda7588e1df638748eeb7ad1b2707e0a3bf4/README.md) 为正本，审阅了[韩语翻译](https://github.com/abruption/session-peer/blob/6e9efda7588e1df638748eeb7ad1b2707e0a3bf4/README.ko.md)。使用合计 17,964 字节的相同文档和相同指令，每次生成 6 条修改建议，未修改原始文件。

仅提供任务名的自动 Hook 测试，3 次均以 `needs_context` 暂缓推荐。向 `recommend_agent` 添加仓库和文件 URL 的 3 次，以及同时添加 URL 和文档摘要的 3 次，均推荐了 Terra/high。下表是 URL+摘要条件下实际执行 Terra/high 的 3 次，与紧接在此前的 Sol/high 实测 3 次相比的每次平均值。

| Standard API 换算依据 | Sol/high | Terra/high + 分类费用 | 降幅 |
|---|---:|---:|---:|
| 计入实际缓存用量 | $0.03229 | $0.01354 | 58.05% |
| 将全部输入按非缓存换算 | $0.11254 | $0.05363 | 52.35% |

这些数值将宿主记录的实测 token 用量按[官方 Standard API 单价](https://developers.openai.com/api/docs/pricing)换算为 USD，并非实际订阅账单或实际额度扣减。Terra 一侧包括每次 $0.0000756 的 [Decisions 分类费用](https://developers.openai.com/api/docs/guides/decisions)。比较范围是审阅子代理和分类，不包括文档收集、摘要准备或主代理调查的成本。

测量路径为**显式 MCP 推荐 → 将推荐配置作为参数传递给宿主原生调用**。这不是对自动 Hook 的 URL 收集或传递功能的验证。基准组复用了紧接在此前的实测数据，每个条件的样本为 3 次。已确认各次执行读取了完整文档，并检查了原文引用的一致性和输出格式。这些检查不能证明结果质量相同或差异具有统计显著性，也不能保证其他任务会降低成本。

### 进程中断与账本锁定

此锁定方案需要 Aptly `0.1.2` 或更高版本，npm `0.1.1` 不包含。JSON 账本保留原有的请求 ID、`unknown` 记录、已完成缓存、调用次数和预留成本。只有持久化账本使用 Node.js 24 内置的 SQLite。相邻的 `ledger.json.lock` 在正常退出后仍会保留；仅凭文件存在，不能判断锁仍被占用。新方案在进程退出时释放 OS 锁，后续请求可继续使用同一账本，但不会重试原有的结果不明 ID，也不会退回预留成本。

请将账本和锁放在支持硬链接的本地文件系统私有目录中，并为每个账本使用同一个规范路径。网络共享、云同步目录和路径别名不在支持范围内。不要删除或替换新锁文件及 SQLite journal，也不要在使用期间用其他数据库工具打开它们。仅凭文件年龄或 PID，无法确认所有者已退出。

旧版空 `.lock` 文件无法证明所有者是否仍存活，因此不会自动初始化或删除。请先停止所有相关宿主、MCP 进程及访问账本的进程，包括旧版本，并升级所有写入进程。只有确认该文件属于旧锁定方案后，才可将其单独隔离，再使用相同的 JSON 账本路径重新启动。请勿重置或删除账本、`unknown` 记录、成本或已完成结果。若无法确认所有者或格式，请保持阻止访问并调查原因。

## 诊断与开发

```sh
aptly report --format both --output-dir reports
```

report 会以相同 ID 生成私有的 Markdown 和 JSON 文件。请审核后手动共享；不会自动上传。附件中不要包含密钥、个人路径、环境值、任务正文或原始错误信息。这些文件不代表 API 认证成功，也不代表已确认宿主的全部配置。

在源码检出目录中，请使用以下命令。请区分此处的执行路径与前面的已安装 CLI 示例。

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck
npm run build
ROUTER_PROVIDER=fixture node bin/aptly.ts recommend < examples/recommend.codex.json
ROUTER_PROVIDER=fixture node bin/aptly.ts recommend < examples/recommend.claude.json
npm test
npm run poc
npm run check:release
```

默认回归测试与 fixture smoke 测试无需付费 API 或实际子代理执行。发布检查会检查公开文件、个人信息模式和 npm 文件允许列表，不会发布或执行 Git push。账本用于复用已完成结果、防止重试 unknown 请求，以及限制调用次数、延迟和估算成本；它并非实际账单上限。

设计、历史验证与开发记录保留在源码检出目录的其他文档中。本多语言指南用于说明安装和日常使用。历史研究资料中的主张或尚未实现的计划，不应据此视为当前功能。
