# 高级 MCP 集成与开发参考

[한국어](../ko/advanced.md) · [English](../en/advanced.md) · [简体中文](../zh-CN/advanced.md) · [日本語](../ja/advanced.md)

[指南目录](../zh-CN.md)

## 本页目录

- [MCP 环境变量设置步骤](#guide-manual-mcp-setup)
- [传递 API 密钥](#guide-key-environment)
- [Codex 示例](#guide-codex-configuration)
- [Claude Code 示例](#guide-claude-configuration)
- [直接推荐](#guide-direct-recommendations)
- [为不透明调用提供明确说明（0.1.4 起）](#guide-explicit-spawn-context)
- [补充上下文后重新推荐（0.1.5 起）](#guide-context-retry)
- [准备单独的独立委派（0.1.6 起）](#guide-fresh-delegation)
- [官方说明与缓存](#guide-model-info-cache)
- [提供上下文](#guide-context-delivery)
- [诊断与开发](#guide-diagnostics-and-development)

<a id="guide-manual-mcp-setup"></a>

## MCP 环境变量设置步骤

运行 `setup` 后，将以下示例合并到现有 `aptly` 注册中。保留 `command`、`args`、凭据启动程序、`ROUTER_LEDGER_PATH` 和 `APTLY_HOOK_POLICY_PATH`。Setup 会创建私有账本和策略目录。手动指定账本时，应使用用户所有、权限为 700 的目录内的绝对路径。

<a id="guide-key-environment"></a>

### 传递 API 密钥

直接启动时，在 **Bash** 中输入密钥，不回显也不记录到命令历史，然后从同一 shell 启动宿主。使用 zsh 时请先运行 `bash`：

```sh
read -rsp 'OpenAI API key: ' OPENAI_API_KEY
printf '\n'
export OPENAI_API_KEY
codex
```

Claude Code 用户将 `codex` 替换为 `claude`。密钥不会永久保存。已运行的 GUI 不会继承其他终端的环境，请使用应用的安全环境传递功能或保留现有凭据启动程序。

<a id="guide-codex-configuration"></a>

### Codex 示例

编辑现有 `[mcp_servers.aptly]` 表，不要重复添加同名表。向 `env_vars` 添加 `OPENAI_API_KEY`，保留已有条目。`env_vars` 按名称转发宿主环境变量，`.env` 向 MCP 提供固定值。

```toml
[mcp_servers.aptly]
env_vars = ["OPENAI_API_KEY"]

[mcp_servers.aptly.env]
ROUTER_PROVIDER = "decisions"
APTLY_CLAUDE_MODELS = '["haiku","sonnet","opus"]'
APTLY_CODEX_MODELS = '["gpt-6-luna","gpt-6.1-terra","gpt-6.1-sol"]'
```

<a id="guide-claude-configuration"></a>

### Claude Code 示例

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

<a id="guide-direct-recommendations"></a>

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

<a id="guide-explicit-spawn-context"></a>

## 为不透明调用提供明确说明（0.1.4 起）

知道真实的待执行会话、调用 ID 和原始事件的集成，可在 Hook 前向同一 MCP 进程调用 `prepare_spawn_context({client, event, description})`。简述目的、范围、预期输出、约束和复杂度；不会抓取 URL 内容。只有受限说明和固定前缀替代任务摘录，不会发送历史、文件或不透明正文。使用 `cancel_spawn_context({client, event})` 撤销。必须启用自动策略；`enabled: false` 阻止共享。已知秘密模式检查并非完整保护。

关联有效期为五分钟，不可修改，每个进程最多128项。输入变化、过期或撤销会阻止分类；不能通过修改说明对已评估调用进行付费重试。无法获取真实待执行事件的调用方不能使用此路径；默认 Hook 不生成说明或调用 ID。本地 `insufficient_context`、提供方 `provider_needs_context` 和应用阶段 `inherited_context_application_unverified` 是不同结果。有限的原生说明交接验证记录于[交接契约](../../SPAWN_CONTEXT.md)。此验证不表示会自动生成说明或执行推荐的模型。

<a id="guide-context-retry"></a>

## 补充上下文后重新推荐（0.1.5 起）

自动 Hook 返回 `insufficient_context` 或 `provider_needs_context` 时，会提供 `retry_id` 和补充指引。`defaults` 模式会阻止该次派生调用，`advisory` 模式仅提供反馈。父代理应根据已知信息简要说明任务目的、范围、预期输出和复杂度，并在五分钟内通过同一 MCP 进程调用 `retry_spawn_recommendation({retry_id, description})`。无需提前知道 native 调用 ID。仅在确实缺少信息时询问用户。

每个原始调用仅允许补充一次；相同输入复用缓存，修改说明会因冲突而被拒绝。再次需要上下文或失败时，请停止，不要为结果不明的付费请求更换 ID 重试。若 `spawn_application` 为 `blocked`，请报告限制，不要应用推荐。否则，父代理仍须保留显式选择、历史、角色和权限，仅将未指定的模型和 effort 传给新的兼容 native 调用。Hook 不会自行执行父代理的重试或派生操作。原有 `prepare_spawn_context` 关联仍不可修改。请参阅[限制、费用与验证契约](../../SPAWN_CONTEXT.md#one-context-supplement-after-a-hook-response)。

重新推荐的响应通过 `next_call.set_if_unspecified` 提供下一次 native 调用所需的未指定字段；不包含已显式指定的模型或 effort，也不会为 Claude 添加 effort。因历史等约束无法应用时，不提供 `next_call`。这些字段不是执行结果或权限批准。

只有首次结果已完成时才能复用缓存。结果未知时保持 `outcome_unknown`；请勿使用新 ID 重复付费调用。

`context_retry_allowed: false` 仅表示不再接受上下文补充。对于兼容的推荐，`caller_review_required` 表示父代理检查参数，并非要求用户重新批准。现有委派授权和宿主权限检查仍然有效。

<a id="guide-fresh-delegation"></a>

## 准备单独的独立委派（0.1.6 起）

当 defaults Hook 阻止继承调用的推荐应用后，仅当调用方能声明**这是同一项独立任务、用户不要求继承历史且可提供完整独立指令**时，才可调用 `prepare_fresh_delegation`。请在同一进程传入 Hook 或重新推荐返回的 `retry_id`、`task_name`、`standalone_task`，以及 `declaration: {independent_task:true, same_task:true, original_call_outcome:"blocked", history_requirement:"not_required", standalone_context_complete:true}`。它重新验证已完成的允许配置，不额外调用分类。

原始继承调用仍被阻止。请检查独立的 `next_call.arguments`，按现有委派授权和宿主权限检查提交新调用，其中包含 `fork_turns: "none"` 并保留模型与 effort 选择。这是调用方声明，不是已验证的用户意图或执行证据。历史必需或不明确、固定角色、resume 或含未验证额外执行参数时，请勿使用。每个引用仅绑定一项任务；五分钟到期、取消、策略或候选变化及原调用变化都会阻止准备。不会为不阻止原执行的 advisory 路径提供此功能。请参阅[契约与限制](../../SPAWN_CONTEXT.md#intentional-fresh-delegation)。

仅在宿主报告原调用已被阻止后使用。`original_call_outcome` 为 `executed` 或 `unknown` 时拒绝准备。这是调用方声明，并非服务器对执行的观测。重复获得相同准备响应不能保证只执行一次子代理。配置依据原始分类摘要选择，不得用于其他任务。

<a id="guide-model-info-cache"></a>

## 官方说明与缓存

Decisions 的选项会同时包含模型名称、Codex effort、官方特性和任务等级说明。可以使用附带说明启动，不会在每次推荐时获取文档。若要反映最新的官方 Markdown，请显式更新。请先准备一个归用户所有的私有目录，作为输出文件的父目录。

```sh
mkdir -m 700 /absolute/private-aptly-state
aptly catalog refresh --output /absolute/private-aptly-state/model-info.json
export APTLY_MODEL_INFO_PATH=/absolute/private-aptly-state/model-info.json
```

更新仅读取固定的 [Claude 模型文档](https://code.claude.com/docs/en/model-config.md)和 [OpenAI 模型文档](https://learn.chatgpt.com/docs/models.md)，不需要 API 密钥。只保存简要整理并规范化的模型信息；更新失败时，原有文件会保留。服务器启动时读取缓存；缓存超过 7 天或无效时，会回退到附带说明。更新后请重启 MCP。即使新文档中出现了模型，也不会自动增加候选或确认账户的访问能力。

<a id="guide-context-delivery"></a>

## 提供上下文

在 Codex 将子代理 `message` 以密文传递给 Hook 的环境中，Aptly 不会读取或解密正文。此时只使用足够具体的明文 `task_name` 作为摘要，例如用 `sort_supplied_numbers_3_1_2_ascending_without_tools` 说明任务类型与范围。不受支持或含糊的任务名称会保留原有模型。对于 Claude Code 或传递明文正文的调用，则使用所提供正文的摘要。

使用相同的 `client` 和原始 Hook `event` 调用 `get_spawn_routing_observation`，查询对应调用。它返回哈希关联 ID，并区分预检、分类/缓存结果、推荐、参数更新/应用受阻，以及 `execution: not_observed`。`arguments_updated` 只表示 Hook 输出的参数，不是实际子代理模型的观测。记录仅保留在当前 MCP 进程，最多 128 条、10 分钟。`not_observed` 也可能源于其他进程、重启、过期、淘汰或输入不匹配，不能证明全局绕过 Hook。进程级 `automatic_hook.last_result` 已移除，不返回原始任务、路径、会话 ID 或凭据。

直接推荐的摘要可以同时包含仓库、文件 URL，以及阅读文档后整理的任务范围、规模和约束。发送 URL 字符串与提供文档正文不同。目前 Aptly 的分类请求处理代码不会向仓库 URL 发起 GET 请求，也不会获取文档正文。所需的文档读取和摘要由调用方完成。

目前自动 Hook 没有单独以明文传递 URL 的字段。不要假定仅将 URL 添加到会被加密的 `message` 中，就能将其传递给分类器。请区分两种路径：直接获取 MCP 推荐后，将推荐配置作为参数传递给宿主的原生调用；或通过自动 Hook 应用推荐。

<a id="guide-diagnostics-and-development"></a>

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

在源码工作目录运行 `npm run check:docs`，检查文档链接、打包和各语言对应的示例。

## 相关文档

[自动推荐](routing.md) · [初始设置与候选模型](configuration.md) · [问题排查](troubleshooting.md) · [成本实测](benchmarks.md)

[指南目录](../zh-CN.md)
