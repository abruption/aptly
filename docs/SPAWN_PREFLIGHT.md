# Pre-spawn routing and observation boundary

This change for #59 is unreleased. npm 0.1.3 does not include the new selection or observation behavior.

The existing installed native `PreToolUse` matchers run `route_spawn_hook` before supported new spawn tools. They match the tool name, not model or fork arguments. No parent-agent reminder is required when that host has loaded/trusted the Hook and connected MCP. This is not a new native dispatcher: an absent, disabled or unavailable integration cannot be enforced by an MCP server it never calls. Existing host-internal patch work stays paused.

## Selection and application

1. Validate the bounded event and correlate client, session, call ID and exact payload using hashes.
2. Resolve policy and constraints locally. Roles, resume, both-pinned fields and unsupported choices do not spend. Explicit fields restrict the allowlisted tuples; they are not claims of user-origin provenance.
3. Bind the call to its input, policy and catalog before recommendation. Use the existing Router ledger for cached outcomes, budgets, concurrency and uncertain paid requests. Do not change IDs to retry an unknown outcome.
4. Obtain a recommendation for unspecified defaults, even when fork is inherited or omitted. The selection constraints concern the remaining defaults; they do not remove native execution constraints.
5. Revalidate the event and policy after the asynchronous response. Emit updated arguments only when history and the native argument contract permit it. Otherwise emit a bounded compatibility explanation and retain every original argument. The caller alone may intentionally choose a fresh independent child with adequate task context.
6. The host retains permission decisions and native execution. An emitted `updatedInput` is not proof of acceptance or child model/effort.

The conservative Codex application contract requires `fork_turns: "none"`. Missing/all history reaches advice but is not rewritten. Claude application remains general-purpose only, with no resume, fixed role or history fields. Only native `reasoning_effort` has a Codex application contract; other supplied effort spellings are preserved rather than normalized silently. The catalog's full model/effort tuple is validated, including partial selections.

This uses the repository's existing supported Hook contract. [Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents) describe native model/effort configuration; [Claude Hook reference](https://code.claude.com/docs/en/hooks) describes `PreToolUse` argument updates. Neither source nor this implementation certifies complete host-setting provenance. No new native model/effort test is claimed.

## Call-scoped evidence

`get_spawn_routing_observation` takes the same `{client,event}` as the original Hook. It never classifies or records evidence itself. Its in-memory window contains at most 128 events for 10 minutes and is cleared on process exit. Exact input, session, tool and call identity must match. Another process or event cannot reuse the last event's result; there is no process-wide `last_result`.

The result separates `preflight`, `classification` (local outcome, provider requested, cache hit, or pending evaluation), `recommendation`, `application` and `execution`. `arguments_updated` means only that Hook replacement arguments were emitted. `execution` remains `not_observed`: the current PreToolUse-only integration has no authoritative child-completion/model metadata. Missing/expired/evicted records return `not_observed`, not a global claim that MCP was bypassed. Raw task text, session/call IDs, paths and credentials are not returned or stored in this observation window.

A pending evaluation is not proof of a paid request. Final `provider_requested` follows the Router's latency-bearing provider outcome; cache and local policy/budget outcomes remain separate. A cancelled or invalidated response may have produced a recommendation but cannot update arguments. Compatibility explanations contain only trusted catalog identifiers and fixed reasons.

## Validation and limits

Fixtures cover installed Hook expansion through the MCP protocol before a simulated native dispatch, inherited/omitted/fresh history, partial pins, roles/resume, budget/cache/unknown outcomes, concurrent calls, cancellation, input/policy changes, and observation correlation/expiry/eviction. These are fixture guarantees, not a native execution certification. Actual child metadata requires a separately authorized bounded native test and must be correlated independently; callers cannot self-certify it through MCP arguments.

Inherited/default-fork advice can now transmit the existing bounded task excerpt even if application is blocked. The sharing policy and known-secret filters are unchanged, not a complete privacy guarantee. `enabled: false` remains the automatic-sharing opt-out. See the four-language guides and [synthetic examples](../examples/spawn-preflight.codex.json).

## Short opaque tasks and host evidence

The original synthetic shape, an opaque Codex message with
`task_name: "cleanup_merged_worktrees"` and inherited/omitted fork, now reaches
recommendation. Only the visible name is shared, explicitly labelled as such.
The short-name allowlist accepts cleanup/remove/prune + merged +
worktrees/branches and review/fix/test + failing/broken/flaky + tests/builds.
Other labels retain the descriptive six-word check. Length, syntax, secret and
summary-byte checks still apply. This is a limited context heuristic, not proof
of task completeness, deletion permission or a privacy guarantee. Opaque text,
history and additional metadata are not decoded or added to the summary.

Application remains blocked with `inherited_context_application_unverified`.
This is an Aptly verification boundary, not a claim that every Codex version
rejects overrides. No event field or caller-supplied capability flag can lift it.

Evidence inspected on 2026-11-06:

- The local `codex-cli 0.159.0-alpha.3` binary reports that version and contains
  a full-history-inherits-model contract. This is static inspection, not a live
  child test and not evidence about the original Mac installation.
- Public Codex source at
  [55897425](https://github.com/openai/codex/blob/55897425e839d943a744c658701445ff732568a0/codex-rs/core/src/agent/child_config.rs)
  applies requested model/effort overrides in `prepare_agent_spawn_config`,
  including full-history configuration; the
  [V2 spawn handler](https://github.com/openai/codex/blob/55897425e839d943a744c658701445ff732568a0/codex-rs/core/src/tools/handlers/multi_agents_v2/spawn.rs)
  forwards fork mode and overrides. This establishes a source implementation,
  not that the target host exposes it, accepts Hook updates or uses the chosen
  model with preserved history.
- [Claude fork documentation](https://code.claude.com/docs/en/sub-agents#how-forks-differ-from-other-subagents)
  specifies the main session's model and full history for forks. No Claude
  executable was available here. Fixed-role/fork calls remain preserved.

The new regressions use a synthetic opaque string, an injected provider and
mocked HTTP. They verify classification requests, label-only payloads, duplicate
suppression and unchanged inherited arguments, not real encryption, paid
Decisions accuracy or native child model selection. Existing plaintext MCP
dispatch fixtures are likewise simulations.

Before enabling inherited application or completing #59, verify the exact host
build and native tool contract, demonstrate that Hook updates are accepted, and
correlate actual child model/effort with preserved history in a bounded native
test. No native child was launched for this follow-up; no all-to-none fallback
or host-internal patch was introduced. Keep this PR Draft while that original
use-case acceptance remains unresolved.
