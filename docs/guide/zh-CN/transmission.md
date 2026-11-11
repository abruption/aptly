# Decisions API 传输范围

[한국어](../ko/transmission.md) · [English](../en/transmission.md) · [简体中文](../zh-CN/transmission.md) · [日本語](../ja/transmission.md)

[指南目录](../zh-CN.md)

下述传输审查是**尚未发布的源代码功能**，不包含在已发布的 Aptly 0.1.10 软件包中。

## 本页目录

- [Decisions API 传输范围](#guide-transmission-scope)
- [传输内容与过滤限制](#guide-transmission-limits)

<a id="guide-transmission-scope"></a>

## Decisions API 传输范围

本节传输范围命令从 Aptly 0.1.7 起提供。

这里的传输是指**将本地任务信息发送至 OpenAI Decisions API**，不是向 Aptly 开发者提供任务的功能。应用模式 `defaults/advisory` 与传输范围相互独立。新注册使用 v2 策略的 `unselected` 状态，不自动传输。

已发布的 0.1.10 中，交互式 `aptly set default` 仅询问未选择的宿主，按 Enter 选择 `none`。非交互运行和 postinstall 不提示，也不视为同意。

在未发布的源代码中，首次普通交互式 `aptly setup` 或 `aptly set default` 会将待审查客户端合并为一次提示，显示各自当前值、来源及默认或覆盖后的主目录。推荐选项 3 `excerpt`。按 Enter 或选择保留会保留已有的显式或 legacy 范围，包括 `none`；未选择的范围变为 `none`。显式 `setup --transmission` 或 `set transmission <scope>` 会将实际选择记为已审查。每个客户端主目录的私有 revision 1 审查标记独立于软件包版本、模式和统计数据，因此普通补丁更新或重启不会重复询问。

以下新命令按用户的显式请求每次重新询问；已发布的 0.1.10 不提供此命令:

```sh
aptly set transmission --review
```

取消不会更改范围或审查标记；普通 setup 或 default 可能已经应用传输以外的默认设置。自动 setup、check、migrate、显式指定传输范围的 setup、CI、非 TTY、跳过 setup、npm lifecycle 脚本、MCP、Hook、help、show 和统计读取均不提示。提示输出到 stderr，JSON stdout 保持干净。已有的禁用策略、模式、启动器、密钥、账本、统计和信任设置均予以保留。

0.1.10 更新进程无法立即加载新问题。首次推出时，请升级到包含该功能的版本后运行交互式 `aptly setup`、`aptly set default` 或 `aptly set transmission --review`。包含该功能的后续更新会提示下一步，不会启动新进程。

```sh
aptly set transmission --show
aptly set transmission none
aptly set transmission description
aptly set transmission excerpt
```

以上修改命令展示不同选项；请只执行所需的一项。可用 `--client codex|claude|all` 选择宿主。`none` 停止自动传输并保留原调用。`description` 仅允许父代理提供的说明。没有说明时，会在调用 API 前请求补充上下文，不自动回退到 native 正文或标签。`defaults` 阻止尚未解决的 spawn；`advisory` 仅提供提示。`excerpt` 允许既有 native 摘录和显式说明。来源、大小及已知秘密模式检查不能证明内容不敏感，也不代表用户同意。

既有 v1 策略保持原始字节不变，并显示来源为 `legacy` 的 `excerpt`。只有显式修改才迁移为 v2，并同时更新所有权记录。不会自动接管已修改的策略或自定义启动器，冲突时予以保留。不删除密钥、账本或未知结果记录。修改后请重启 MCP。无法撤回已开始的传输；策略变化会阻止之前的处理中结果、retry 和 fresh 准备被应用。请勿使用新的付费 ID 绕过旧调用的绑定冲突。显式的 `recommend_agent` 和 `aptly recommend` 属于独立请求，不受此自动传输设置禁止。

手动设置 `enabled: false` 仍可作为紧急停止方式，但可能引发所有权冲突。常规修改请使用以上命令，不要编辑所有权记录以绕过检查。

<a id="guide-transmission-limits"></a>

## 传输内容与过滤限制

在 `excerpt` 范围内，没有预先注册的说明时，自动分类的 `summary` 是由有效任务标签与正文**截取后的首段拼接成的摘录**，并不是重新进行语义摘要或匿名化。其 UTF-8 大小不超过 `min(4000, max_summary_bytes)`；这不是整个 HTTP 请求的大小限制。Codex 的 opaque 消息回退仅使用足够具体的 `task_name`，不会解码或传输该正文。标签也可能包含敏感信息。

有效的 `prepare_spawn_context` 说明会加上固定前缀，替代 native 摘录用于分类；注册本身不调用 API。收到上下文不足的响应后，`retry_spawn_recommendation` 可使用固定前缀与新的补充说明重新推荐一次，不附加先前正文。两条路径均将原始说明限制在 `min(3800, max_summary_bytes - 96)` 字节以内，含前缀的说明限制在 `min(4000, max_summary_bytes)` 字节以内。`prepare_fresh_delegation` 本身复用已完成的推荐，不再调用分类，并将独立指令作为本地下一次调用的参数返回。按返回参数明确指定模型与 effort 的 Codex 调用，目前会由 Hook 以 `explicit_model` 保留，不进行分类。检查后续调用并不意味着再次分类。这些路径均不保证说明不含敏感信息，也不保证自动匿名化。

Decisions 会收到 `client`、`task.summary`、`task.operation`、`task.context_sufficient`，以及候选配置 ID、模型与 effort 说明、已配置的模型特性。分类 API 密钥通过 `Authorization` 请求头发送，请求 ID 通过 `X-Client-Request-Id` 发送。自动路径使用哈希 ID，直接推荐的 ID 由调用方提供。请勿在 ID 或候选说明中放入秘密信息。

如需关闭自动共享，请在 `APTLY_HOOK_POLICY_PATH` 指向的现有私有策略文件中，**仅将 `enabled` 改为 `false`**，保留其他字段和所有权记录。之后的自动 Hook 调用会在分类或创建调用绑定文件之前保留原始调用。这无法撤销已开始的传输，也无法收回服务器已收到的信息。修改生成的策略后，安装、配置或移除命令的所有权检查可能报告冲突；这些命令不会覆盖已关闭的策略。请勿修改所有权记录来绕过检查。

传输范围允许时，`mode: advisory` 仍会传输分类数据，不是隐私共享的关闭方式。删除 `APTLY_HOOK_POLICY_PATH` 可能启用既有 strict 路径，请勿以此代替关闭共享。`enabled: false` 不会阻止显式发起的 `recommend_agent` 或 `aptly recommend` 请求。

如需自行控制共享摘要，请先关闭自动共享，再为直接推荐编写必要的信息。Aptly 不会自动获取摘要中 URL 的文档，也不会附加提到的源文件。已知密钥和 Bearer 模式检查不能完整检测所有秘密，也不能保证文本适合对外传输。

账本与 Hook 绑定保存请求元数据、哈希和缓存结果，不保存任务摘录。Aptly 诊断也不包含任务原文。但本地 Hook 的 `updatedInput` 会保留原任务，以便宿主继续执行。宿主自身的会话和日志保留不受 Aptly 控制。

## 相关文档

[自动推荐](routing.md) · [预算限制](budget.md) · [执行统计](statistics.md)

[指南目录](../zh-CN.md)
