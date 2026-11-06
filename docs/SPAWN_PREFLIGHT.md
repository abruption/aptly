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
