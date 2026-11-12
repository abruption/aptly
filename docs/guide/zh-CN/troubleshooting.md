# 问题排查

[한국어](../ko/troubleshooting.md) · [English](../en/troubleshooting.md) · [简体中文](../zh-CN/troubleshooting.md) · [日本語](../ja/troubleshooting.md)

[指南目录](../zh-CN.md)

## 本页目录

- [账户目录与 Hook 注册检查](#guide-account-home-recovery)
- [恢复不兼容的启动路径](#guide-launcher-recovery)
- [进程中断与账本锁定](#guide-ledger-lock-recovery)

<a id="guide-account-home-recovery"></a>

## 账户目录与 Hook 注册检查

请先核对启动 Codex 的环境中的 `CODEX_HOME` 与 CLI 选择的目录是否一致。仅修改 `config.toml` 中的策略路径，不会创建目标策略文件或所有权记录。以下查询不会重置密钥或状态。

```sh
aptly setup --check --client codex
aptly stats --client codex
```

| 结果 | 检查事项 |
|---|---|
| `hook_policy_path_conflict` / `statistics_policy_conflict` | 核对所选账户目录、MCP 策略引用与实际策略文件位置。请勿跨目录复制状态或直接覆盖已有引用。 |
| `statistics_requires_setup` | 检查所选目录的 MCP 注册、策略文件和 setup 记录。请先确认该目录能够正常完成 setup。 |
| `existing_hook_not_owned` | 已有 Aptly Hook，但缺少有效的安装所有权记录。请先备份并审查定义，再进行明确的恢复；请勿编辑或复制所有权记录以绕过检查。 |

设置检查成功后，请按[统计启用说明](statistics.md)操作。`collection.codex: true` 仅表示收集配置，不证明运行中的宿主已加载或信任 Hook。请重启目标账户的 Codex，并在 `/hooks` 中检查实际条目。

### 托管账号的策略路径再次被覆盖

此策略引用迁移功能从 0.1.11 起提供。Orca 等管理器可能将默认主目录中同名 MCP 注册同步到账号目录，从而覆盖仅在账号中修改的绝对策略路径。即使 Hook 保留，MCP 与统计功能仍可能引用不同的策略。

请先升级所有已注册的 Aptly 服务端并停止相关宿主和 MCP 进程。对于所有权记录完整的现有 Codex 配置，请先在默认/权威注册所在的主目录中显式迁移，再在各目标账号已选择其 `CODEX_HOME` 的环境中重复执行。仅修改账号文件仍可能被同步覆盖。

```sh
CODEX_HOME="$HOME/.codex" aptly setup --client codex --policy-source codex-home --dry-run
CODEX_HOME="$HOME/.codex" aptly setup --client codex --policy-source codex-home
CODEX_HOME="$HOME/.codex" aptly setup --check --client codex
CODEX_HOME="$HOME/.codex" aptly stats --client codex
```

迁移注册 `APTLY_HOOK_POLICY_PATH = "@codex-home"`，并通过 `env_vars` 转发 `CODEX_HOME`。服务端启动时选择该目录下的 `aptly/auto-policy.json`。变量缺失、为空或为相对路径时会被拒绝，不会选择其他主目录。MCP 启动时仍须显式转发主目录，默认目录也须传入 `CODEX_HOME="$HOME/.codex"`。如果 0.1.11 CLI 在未设置变量的普通终端中返回 `policy_source_home_invalid`，请像上述示例一样显式指定默认目录。从 0.1.12 起，CLI 在变量缺失时使用已选择的标准 `~/.codex` 进行验证。CLI 的默认主目录选择与 MCP 启动时的环境转发是两回事，显式账号选择及无效值拒绝仍然保留。示例使用默认目录；针对账号执行时，请替换为目标账号的绝对主目录。这是操作者指定的来源选择，并非宿主完整配置的证明。请参阅 [Codex MCP 环境变量转发](https://learn.chatgpt.com/docs/extend/mcp#stdio-servers)。

迁移不会移动或重置策略内容、传输同意、账本路径、统计历史或 Hook 信任。现有固定/共享策略在未显式迁移时保持不变。自定义启动器、其他注册修改及所有权不匹配需要本地审查；请勿编辑或复制记录来绕过错误。重启服务端后，请在目标账号中再次检查。预演或文件检查成功并不证明运行中的 MCP 已更新，也不证明已观测到模型。

<a id="guide-launcher-recovery"></a>

## 恢复不兼容的启动路径

以下选项需要 Aptly 0.1.2 或更高版本，npm 0.1.1 不包含这些选项。如需从源码测试，请运行 `npm ci --ignore-scripts` 和 `npm run build`，然后将下文的 `aptly` 替换为 `node bin/aptly.ts`。

密钥设置会在输入和保存前诊断所选宿主。任一宿主失败时，不提示输入，也不修改任何宿主。`--check` 不访问密钥或凭据存储。

从 Aptly 0.1.9 起，在 Linux 上，`--check` 还会检查可执行的 `secret-tool`；如果有安全的显式会话总线地址和 `gdbus`，则只读取总线元数据，不启动或访问凭据服务。确认失败时，会在输入前报告 `secure_store_unavailable`，并附带 `secure_store_secret_tool_missing`、`secure_store_bus_missing` 或 `secure_store_service_missing`。`secure_store_bus_unverified`、`secure_store_probe_unavailable` 以及服务存在或可启动的未确认代码表示准备状态未知；服务存在或可启动并不能证明它已解锁或可写。必要时请安装 `secret-tool` 和 Secret Service 提供程序，并在目标桌面会话中运行。实际保存仍可能失败。对于 SSH 或无桌面会话，当 `APTLY_SECRET_BACKEND` 不存在时，请将 `OPENAI_API_KEY` 安全地传给宿主 MCP 进程，并保留现有认证包装程序或环境。`credential_node_mismatch`、`credential_server_mismatch` 和 `credential_runtime_unsupported` 分别表示 Node 路径、服务器路径及 OS 存储支持不兼容。

如果只有 Claude 失败，按以下顺序诊断，仅在返回 `launcher_migration_available` 时考虑迁移：

```sh
aptly set env OPENAI_API_KEY --client claude --check
aptly setup --client claude --migrate-launcher --dry-run
aptly setup --client claude --migrate-launcher
aptly set env OPENAI_API_KEY --client claude
```

`--dry-run` 不修改文件。迁移仅将与所有权记录一致的 Aptly 标准注册的 Node 和服务器路径更新到当前构建，保留环境设置、Hook、策略及其他宿主，不访问凭据，也不执行旧启动程序。自定义包装程序、缺少所有权记录或已修改的注册会被拒绝。请在本地检查此类注册，使用包装程序的安全环境传递方式，或切换到另行审核的标准注册。不要编辑或删除所有权记录以绕过验证。

从 Aptly 0.1.9 起，`aptly setup --check --client codex|claude|all` 只读取常规设置计划，不会写入文件或创建目录。结果是当前时点的快照，不验证运行中的主机。`--check` 只能与 `--client` 组合使用。如果出现 `hook_policy_path_conflict`，请在本地检查所选主机配置目录和现有策略引用，选择预期的主机目录后重试。设置会保留现有配置，不会移动或复制策略；迁移启动器不能解决此不匹配。

如果 `launcher_migration_not_owned` 对应的是保留的注册（`mcp_created: false`），**Aptly 0.1.3 或更高版本**提供显式选项 `--include-existing`。请安装 0.1.3 或更高版本，然后运行：

```sh
aptly setup --client claude --migrate-launcher --include-existing --dry-run
aptly setup --client claude --migrate-launcher --include-existing
```

请先在本地检查注册。必须已有有效的 Aptly 所有权记录，且受管理的环境变量、Hook 和策略与记录一致。仅接受绝对 Node 路径和单个标准服务器路径；包装程序或缺少记录的注册仍会被拒绝。此选项不会将整个 MCP 注册改为 Aptly 所有，后续移除仍会保留迁移后的启动路径和原有用户设置。仅可用于显式指定的单个宿主迁移，不适用于自动安装。

已成功的 Codex 无需重新设置。仅指定失败的宿主重试，然后重启 MCP。Codex 仍需通过 `/hooks` 审核信任。诊断后的配置变更会以 `concurrent_configuration_change` 中止。恢复时若发现其他密钥或无法读取当前值，不会覆盖存储，而是返回 `credential_rollback_failed`。文件与 OS 存储之间不是原子事务，请避免同时运行配置操作。

<a id="guide-ledger-lock-recovery"></a>

## 进程中断与账本锁定

此锁定方案需要 Aptly `0.1.2` 或更高版本，npm `0.1.1` 不包含。JSON 账本保留原有的请求 ID、`unknown` 记录、已完成缓存、调用次数和预留成本。只有持久化账本使用 Node.js 24 内置的 SQLite。相邻的 `ledger.json.lock` 在正常退出后仍会保留；仅凭文件存在，不能判断锁仍被占用。新方案在进程退出时释放 OS 锁，后续请求可继续使用同一账本，但不会重试原有的结果不明 ID，也不会退回预留成本。

请将账本和锁放在支持硬链接的本地文件系统私有目录中，并为每个账本使用同一个规范路径。网络共享、云同步目录和路径别名不在支持范围内。不要删除或替换新锁文件及 SQLite journal，也不要在使用期间用其他数据库工具打开它们。仅凭文件年龄或 PID，无法确认所有者已退出。

旧版空 `.lock` 文件无法证明所有者是否仍存活，因此不会自动初始化或删除。请先停止所有相关宿主、MCP 进程及访问账本的进程，包括旧版本，并升级所有写入进程。只有确认该文件属于旧锁定方案后，才可将其单独隔离，再使用相同的 JSON 账本路径重新启动。请勿重置或删除账本、`unknown` 记录、成本或已完成结果。若无法确认所有者或格式，请保持阻止访问并调查原因。

诊断报告请参见[诊断与开发](advanced.md#guide-diagnostics-and-development)。

## 相关文档

[初始设置与候选模型](configuration.md) · [安装与更新](installation.md) · [高级 MCP 集成与开发参考](advanced.md)

[指南目录](../zh-CN.md)
