# 执行统计

[한국어](../ko/statistics.md) · [English](../en/statistics.md) · [简体中文](../zh-CN/statistics.md) · [日本語](../ja/statistics.md)

[指南目录](../zh-CN.md)

## 本页目录

- [执行统计（0.1.10 起）](#guide-execution-statistics)

<a id="guide-execution-statistics"></a>

## 执行统计（0.1.10 起）

执行统计从 Aptly 0.1.10 起提供。请安装支持的版本，或按照[软件包更新](installation.md#guide-package-updates)升级后使用以下示例。需要已有 Aptly 设置。初期仅支持 POSIX 数据收集，Windows 统计收集不受支持；Windows 上的常规 Aptly 使用不受影响。

```sh
aptly stats
aptly stats --today --client codex
aptly stats enable --client codex
aptly stats enable --client codex --codex-native-metadata
aptly stats disable --client codex
```

`aptly stats` 查询（包括 `--today`）的顶层 `status` 在查询完成时为 `complete`（退出码 0）；请求不支持的统计，或发生损坏、读取或存储错误时为 `partial`（退出码 1）。关闭收集和确实未配置的客户端也属于查询完成。部分客户端失败时仍保留成功结果。现有客户端 JSON 字段和值保持不变；严格检查完整对象的使用方须接受新增的 `status`。`complete` 不证明宿主路由、模型或信任已就绪。意外统计错误报告为 `statistics_failed`；不输出原始路径、输入、密钥或堆栈。查询不自动修复、获取同意或调用服务提供方。

命令形式为 `aptly stats [--today] [--client codex|claude|all]`、`aptly stats enable [--client] [--codex-native-metadata]` 和 `aptly stats disable [--client]`。收集默认关闭，postinstall 也不会自动启用。enable 安装 Aptly 所有的命令观察器，并记录在独立的 `stats-ownership.json`；既有 receipt、MCP、launcher、密钥、预算和传输设置保持不变。启用后请重启 MCP 和宿主；Codex 还需在 `/hooks` 审核 native Hook 信任。

disable 关闭收集，只移除未修改的自有观察器。已修改或自定义的观察器会保留并给出警告；数据和密钥也会保留。`remove` 验证并移除统计功能拥有的定义，但保留数据。不会自动接管单独管理的收集器或自定义 Hook。

私有状态使用与预算账本分开的 `stats.sqlite`、`stats-config.json` 和 `stats-key`（HMAC 密钥）。请勿分享密钥。记录不包含任务原文、对话记录、原始 ID、路径、错误或凭据。读取统计不调用 API、不访问密钥或凭据存储，也不初始化或运行通知。

统计显示 `model_match`、`model_mismatch`、`model_changed`、`unknown`、`pending`、`expired_pending` 和 `application_unconfirmed`；advisory 单独显示。`blocked`、`explicit_preserved` 和 `unbound` 不计入分母。实际 effort 始终不测量，配置的 effort 并非实际值。Claude 别名 `haiku`、`sonnet`、`opus`、`fable` 无法解析为实际规范模型，因此为 `unknown`。仅支持精确的规范模型，观察到模型也不保证所有别名匹配。这些数字不能证明用户接受程度或质量。

直接 advisory、retry 和没有 native 连续性的新 unbound 调用不会按近似时间关联。`--today` 使用绑定首次创建时的 UTC 日期。容量固定为 10,000 条委派和 10,000 个 子项，不自动清理。计数只涵盖保留记录，并非历史总数；容量满时丢弃新身份并标记已达上限。缺少回调不能证明绕过。没有 token 或成本汇总、实时配额或节省金额。

Codex native 元数据默认关闭，只有显式选项才启用。它仅按精确子 ID 读取 SQLite native 元数据，不读取对话记录、不修复，也不启动 app-server。迁移过的 `sqlite_home`、不支持的 schema 或路径及有歧义的关联均为 unknown。SQL 读取可能更新现有 SHM 读取标记，但不写入行或 schema，也不主动创建 sidecar。

收集采用尽力而为方式。事件丢失、延迟或容量超限可能导致模型历史不完整。`model_match`仅表示保留证据一致，并不证明每次请求都使用该模型。禁用 Codex 收集、移除设置或不带 `--codex-native-metadata` 重新启用，均会撤销 native 元数据访问同意。Node 或软件包路径更改后，请禁用再启用收集以更新命令。不可用或损坏的存储会被保留；请在本地检查，不要删除密钥或推断使用量为零。

## 相关文档

[自动推荐](routing.md) · [Decisions API 传输范围](transmission.md) · [问题排查](troubleshooting.md)

[指南目录](../zh-CN.md)
