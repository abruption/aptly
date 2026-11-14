# Decisions API 传输范围

[한국어](../ko/transmission.md) · [English](../en/transmission.md) · [简体中文](../zh-CN/transmission.md) · [日本語](../ja/transmission.md)

[指南目录](../zh-CN.md)

## 目录

- [选择传输范围](#guide-transmission-scope)
- [传输内容与限制](#guide-transmission-limits)

<a id="guide-transmission-scope"></a>

## 选择传输范围

传输目标是 **OpenAI Decisions API**，而非 Aptly 开发者。新注册处于未选择（`unselected`）状态，不会自动传输。

| 范围 | 可为自动推荐发送的信息 |
|---|---|
| `none` | 不自动传输，保留原调用 |
| `description` | 仅发送调用方提供的说明；没有说明时请求补充上下文 |
| `excerpt` | 允许明确说明和受支持的原生任务摘录 |

首次运行交互式 `setup` 或 `set default` 时，会询问待审核主目录的范围。推荐 `excerpt`；按 Enter 保留现有选择，未选择时则选用 `none`。自动安装、CI 和非终端执行不视为同意。取消不会改变传输选择，但之前的基本注册可能已经完成。

如需重新审核，请运行（0.1.11 起）：

```sh
aptly set transmission --review
```

也可查询当前值或直接选择范围。请仅运行以下更改命令中的一个，通过 `--client codex|claude|all` 选择目标。

```sh
aptly set transmission --show
aptly set transmission none
aptly set transmission description
aptly set transmission excerpt
```

更改后请重启 MCP。现有 v1 策略在更改前保持为旧版 `excerpt`。操作员修改和其他包装器不会被自动接管。进行中的传输无法撤回，更改前的结果、retry 和 fresh 不适用新策略。请勿用新的付费 ID 绕过冲突。

`--show` 的 `complete` 和退出代码 0 表示查询完成，也包括实际未设置和 `none`。预期设置损坏、缺失或冲突时为 `partial` 和退出代码 1。此命令不确认宿主是否已准备运行或是否同意传输。

`advisory` 是限制应用的模式，并非禁止传输。`description` 的说明不足时，`defaults` 阻止派生，`advisory` 给出提示。`recommend_agent` 和 `aptly recommend` 是单独的明确请求，不受自动传输设置禁止。

<details>
<summary>直接编辑策略以紧急停止</summary>

在 `APTLY_HOOK_POLICY_PATH` 指向的现有私有策略中，仅将 `enabled` 改为 `false`，即可在自动分类和绑定之前保留原调用。请勿编辑其他字段或所有权记录。由于可能发生所有权冲突，常规更改请使用上述 CLI。清除策略路径可能切换到 strict 路径，因此不能用作停止方法。已开始的传输和明确的直接推荐无法取消。

</details>

<a id="guide-transmission-limits"></a>

## 传输内容与限制

在 `excerpt` 范围内，没有预先注册说明的自动分类，其 `summary` 由允许的任务标签和正文**第一段截取的摘录**组成。它不会重新概括含义或匿名化。UTF-8 大小不超过 `min(4000, max_summary_bytes)`，这不是整个 HTTP 请求的大小限制。Codex 不透明消息的 fallback 不解密或传输正文，仅使用足够具体的 `task_name`。标签也可能包含敏感信息。

通过 `prepare_spawn_context` 注册有效说明后，分类使用固定前缀和该说明，而非原生摘录。注册本身不调用 API。`retry_spawn_recommendation` 在上下文不足的响应后，使用固定前缀和新的补充说明重新推荐一次，不附加先前正文。这两条路径的原始说明均不超过 `min(3800, max_summary_bytes - 96)` 字节，含前缀的说明不超过 `min(4000, max_summary_bytes)` 字节。`prepare_fresh_delegation` 本身复用已完成的推荐，不调用额外分类，并将独立指令作为本地下次调用的参数返回。明确指定返回的模型和 effort 的 Codex 调用，在当前 Hook 中会以 `explicit_model` 保留而不分类。后续调用的路由检查不意味着额外分类。任何路径都不保证说明不含敏感信息或已自动匿名化。

发送给 Decisions 的内容包括 `client`、`task.summary`、`task.operation`、`task.context_sufficient`，以及候选配置的 ID、模型和 effort 说明及已设置的模型特性。分类用 API 密钥通过 `Authorization` 头发送，请求 ID 通过 `X-Client-Request-Id` 头发送。自动路径的 ID 是哈希，直接推荐的 ID 由调用方指定。请勿在 ID 或候选说明中放入秘密信息。

如需自行选择共享摘要，请关闭自动共享后，仅编写直接推荐所需的信息。Aptly 不会自动读取并附加摘要中 URL 指向的文档或源文件。已知密钥和 Bearer 模式过滤并不能完整检测秘密或保证传输安全。

账本和 Hook 绑定保存请求元数据、哈希和缓存结果，不保存任务摘录。Aptly 的诊断结果也不包含原文。但为了让本地宿主继续执行，Hook 的 `updatedInput` 保留原始任务。Aptly 不控制宿主自身的对话或日志存储。

[自动推荐](routing.md) · [预算](budget.md) · [指南目录](../zh-CN.md)
