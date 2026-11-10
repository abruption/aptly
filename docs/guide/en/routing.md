# Automatic recommendations

[한국어](../ko/routing.md) · [English](../en/routing.md) · [简体中文](../zh-CN/routing.md) · [日本語](../ja/routing.md)

[Guide home](../en.md)

## On this page

- [Automatic Hook](#guide-automatic-routing)
- [Confidence and abstention](#guide-confidence-and-abstention)
- [Automatic routing guarantees and blocked outcomes (0.1.5+)](#guide-routing-guarantees)

<a id="guide-automatic-routing"></a>

## Automatic Hook

**The following preflight, recommendation and observation behavior requires Aptly 0.1.4 or later.** The installed `PreToolUse` matcher routes supported Codex `spawn_agent` / `collaborationspawn_agent` / `Agent` and Claude Code `Agent` calls to local `route_spawn_hook` before native execution. The host must load and trust this Hook and connect its MCP server. Aptly cannot enforce interception in an unconfigured or unsupported host, or when MCP is unavailable; native execution remains the host's responsibility.

Local preflight checks explicit fields, roles/resume, policy, cache and budget. A new paid Decisions request is not required for every spawn. Model-only or effort-only Codex selections restrict candidates to matching allowlisted tuples; only the unspecified field can be filled. Both specified fields, unsupported values, fixed roles and resumed identities are preserved without classification. Input fields do not establish whether a choice came from the user or a host default.

Unspecified model/effort with `fork_turns: "all"` or omitted fork now reaches recommendation. It does **not** authorize history changes: Codex model/effort application still requires explicit `fork_turns: "none"`. Otherwise the Hook reports `inherited_context_application_unverified` and preserves the original arguments. Other history fields produce `history_semantics_unverified`; Claude application remains limited to general-purpose calls without history constraints. A recommendation may therefore be produced without being applied.

For opaque Codex messages, a concrete short task name such as `cleanup_merged_worktrees` can supply label-only advice. The short-name allowlist covers cleanup/remove/prune + merged + worktrees/branches, and review/fix/test + failing/broken/flaky + tests/builds; other names retain the descriptive six-word check. The body is never decoded or sent. This does not establish missing task details or permission to clean up. Inherited application is unverified for the target host, not universally impossible; public source support alone cannot certify the installed runtime.

For genuinely independent work, the caller can intentionally choose a fresh child and provide sufficient standalone task context. Aptly never changes `all` to `none`, removes history or rewrites a specified model/effort. [Synthetic inherited and fresh examples](../../../examples/spawn-preflight.codex.json) show the distinct requests; they are not automatic retries. Never retry an uncertain paid call with a new ID.

`defaults` enables compatible argument updates; `advisory` supplies advice only. Inherited calls and partially specified calls may now share the same bounded task excerpt with Decisions even when application is blocked; history is not a privacy opt-out. Disabled policy, insufficient context, budget limits, failure and cancellation preserve execution constraints. Input, policy and catalog bindings, duplicate suppression and unknown-outcome protection remain in place. Fixture recommendations never rewrite native defaults. The strict evidence-based path without an automatic policy remains separate; host-internal patches stay paused.

| MCP tool | Purpose |
|---|---|
| `get_routing_capabilities` | Lists candidates, limits, provider, and Hook status without a paid API call |
| `recommend_agent` | Returns a direct recommendation for a task summary |
| `get_routing_precedence` | Explains preserved choices and unverified configuration sources for a call |
| `route_spawn_hook` | Selects defaults for eligible calls or passes advice only, according to the installed policy |
| `get_spawn_routing_observation` | Looks up one exact Hook invocation; never proves native execution |
| `prepare_spawn_context` | Registers a bounded description for one exact upcoming invocation |
| `cancel_spawn_context` | Revokes the description association, not native execution or a request already sent |
| `retry_spawn_recommendation` | Accepts one task-description supplement using a Hook-issued retry_id |
| `prepare_fresh_delegation` | Prepares a separate independent Codex call from completed inherited advice; never executes it |

<a id="guide-confidence-and-abstention"></a>

## Confidence and abstention

`confidence` is metadata and has not been validated here as a calibrated probability of correctness. It is not currently used as an automatic-application threshold. Zero and low values are currently allowed when other application conditions hold. A missing value in a live Decisions response is rejected as an error; it remains optional in generic Router and stored results. `keep_current` and `needs_context` are separate outcomes with existing abstention and context-recovery rules. Explicit model, effort, history and permissions are preserved. A small classification pilot does not establish improved child-task quality or total cost.

<a id="guide-routing-guarantees"></a>

## Automatic routing guarantees and blocked outcomes (0.1.5+)

The guarantee covers supported calls handled by an enabled, trusted Hook on a connected MCP process. Check `get_routing_capabilities.automatic_hook.guarantee` for this scope. The server cannot detect or enforce an absent, untrusted, disconnected or host-failed Hook; the host controls fallback. MCP connection status alone is not per-call routing evidence.

After a valid enabled policy and eligible call are established, `defaults` returns a deny decision and a safe reason for incompatible application, budget exhaustion, classification failure or unknown outcomes. Original arguments and constraints remain intact, but that spawn does not proceed. For unverified inherited history, report the constraint instead of silently running parent defaults or switching to `none`. `advisory` describes the limit without blocking. Missing/disabled policy, explicit tuples, fixed roles and resume remain intentional local preservation paths rather than blanket denials.

With a recovery ID, use `get_spawn_routing_observation({retry_id})` on the same MCP process, or use the existing `{client, event}` form. Mixed or partial forms are rejected. Original `awaiting_context` and `context_retry.outcome` are separate stages; rejected duplicates appear under `last_attempt` without replacing an earlier classification outcome. Lookups incur no paid request and do not renew retention. Execution always remains `not_observed`; neither advice nor argument updates establish actual child execution.

## Related topics

[Configuration and model candidates](configuration.md) · [Decisions API transmission](transmission.md) · [Execution statistics](statistics.md) · [Advanced MCP integration and development](advanced.md)

[Guide home](../en.md)
