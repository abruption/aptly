# Spawn context handoff and recovery

Available from Aptly 0.1.4, following the pre-spawn routing changes in #60.
It does not decode opaque messages, inspect conversations or modify host
internals. It provides an explicit caller protocol, not an automatic description
producer for the shipped Hook templates.

## Supported caller contract

A caller/integration that knows the **real upcoming** client, session ID, native
call ID and exact original invocation can call these tools on the same MCP
server process, in order:

1. `prepare_spawn_context({client, event, description})`: register a short
   description before the installed PreToolUse Hook runs. Check for
   `status: "registered"`. Registration makes no provider request.
2. The existing Hook calls `route_spawn_hook({client, event})` with that exact
   event. It can use the registered description instead of the label/excerpt.
3. `get_spawn_routing_observation({client, event})` reports the result separately
   from native application/execution. Use `cancel_spawn_context({client, event})`
   to revoke the association if the intended spawn is abandoned.

Do not manually route and then invoke an unrelated native call: an MCP response
does not prove that a host Hook intercepted or updated it. The caller description
is untrusted task data, not permissions, policy, host capability or verified user
intent. Explicit pins, roles, resume and inherited history remain protected.

The shipped Hook templates do not produce descriptions or preassign native call
IDs. If an integration cannot obtain the exact event before preflight, or connects
to a different MCP process, this handoff cannot be used. In particular, a parent
agent cannot invent IDs or add unsupported fields to a native spawn to make this
work. Such paths retain the existing label/excerpt behavior. No automatic
integration with the original Mac host is claimed.

## What to describe and what is shared

Use purpose, bounded scope, expected output, constraints and relevant complexity.
For example:

> Inspect three synthetic merged branches and their worktrees. Return a short
> table proposing which could be cleaned up. Do not delete files or run commands.
> No repository contents are needed.

Only this description, prefixed as caller-supplied untrusted task data, is sent as
task text. The existing client/catalog/provider contract is also sent. Neither
the opaque body, original label, history, event metadata, files nor raw errors are
added. References can supplement the description; URLs are not fetched and do
not substitute for describing the task.

Descriptions are at most `min(3800, max_summary_bytes - 96)` UTF-8 bytes, with a
small minimum length/word check. The prefixed summary must also satisfy
`min(4000, max_summary_bytes)`. Known key/Bearer patterns are rejected; this is
not complete secret detection or anonymization. Review text before registration.
An enabled automatic policy is required; `enabled: false` blocks registration
and transmission even if an association already exists.

## Association, expiry and costs

The process keeps at most 128 immutable associations. Five-minute expiry starts
at first registration; a duplicate does not extend it. Changed payloads for the
same client/session/call are rejected, not rebound. Cancellation and expiry
leave tombstones until process exit; capacity rejects new registrations rather
than evicting a binding and silently falling back. Expired text is discarded
when the store is accessed; nothing is enumerated or written to disk as text.
A restart loses the handoff. The persistent paid-call binding still prevents a
context-free request from replacing an already evaluated context-bound call.

A summary hash joins the existing immutable input/policy/catalog binding before
classification. Duplicate calls use the same request/cache identity and budgets;
changed or missing context cannot replace it. Context is checked before and
after the asynchronous provider call. Expiry/cancellation prevents output but
cannot refund or erase a provider request already sent. Revocation does not
cancel native execution; the host controls execution.

The original prepare_spawn_context handoff is immutable. Register before the
first evaluation. If a label-only or description-bound evaluation already
started, adding/changing the description fails closed (`call_conflict`);
unknown paid outcomes remain unknown. Do not change IDs to bypass this guard.
The unreleased recovery protocol below provides a separate, bounded supplement;
it never rebinds this original association.

## Outcomes and evidence

- `insufficient_context`: local description/size/context checks failed.
- `provider_needs_context`: a valid provider abstention; its rationale is not
  inferred, and useful-looking text does not guarantee a recommendation.
- `inherited_context_application_unverified`: advice can be available while
  the native model/history update remains unverified and blocked.

Automated tests use synthetic opaque strings, injected providers, mocked
Decisions HTTP and in-memory MCP transport. They verify shared summaries,
identity, cancellation, bounds and cache/unknown protections. The separate
native observation below does not turn those fixtures into native evidence.

### Bounded native protocol verification — 2026-11-06

A macOS Codex CLI 0.167.0 test used product commit
`efae8211f6d92b9a9619886c80792d4e1b737d4d`. The installed Hook was enabled and
trusted without changing its trust settings. A test-only MCP transport adapter
captured the real host event, registered the description on the same product
server, and then forwarded the original `route_spawn_hook` request. It did not
invent IDs, decode the opaque body, alter Hook responses or patch host code.

The safe synthetic description requested extraction of a nonsecret marker
from earlier conversation history and output of `[1, 2, 3]`, with no tools,
files, network access, settings changes or real worktree deletion. An HTTP
boundary recorder confirmed exactly one forwarded Decisions request whose task
text was the labelled description, with no opaque body or native event fields.
Registration and observation correlation matched the actual invocation.

The provider selected `codex-simple` (`gpt-6-luna` / `max`). Application remained
blocked as `inherited_context_application_unverified` for `fork_turns: "all"`.
The native child's final context remained `gpt-6.1-sol` / `low`, matching the
parent. Parent linkage, exact copying of the marker-bearing parent user payload,
and the child's final marker/list response were independently checked.

This is one protocol and payload verification, not a provider-quality benchmark,
a causal comparison with label-only advice, or successful application of the
recommended model. The test used two parent turns and one child; temporary
files were removed and persistent host configuration was unchanged.

This validates a caller that can capture the exact event before product
preflight. The adapter does not ship an automatic description producer, and
ordinary parent agents still cannot invent the required IDs. PR #60's separate
history/model application acceptance and merge order must be resolved before
merging this dependent change. That historical test did not exercise the later recovery protocol below.


## One context supplement after a Hook response (unreleased)

When the enabled automatic Hook encounters local `insufficient_context` or a
completed provider `provider_needs_context`, it issues a `retry_id`. In
`defaults` mode it denies that pending spawn and includes model-visible recovery
instructions. In `advisory` mode it supplies those instructions without blocking.
This uses the documented [Codex PreToolUse deny feedback](https://learn.chatgpt.com/docs/hooks).
A missing, untrusted or failed Hook is outside this guarantee.

The parent agent can use its existing task knowledge to call:

```json
{
  "retry_id": "<copy the 64-character retry_id from the Hook response>",
  "description": "Review a small synthetic refresh change for conflict markers and incorrect imports. Return findings only; do not edit files."
}
```

Send this input to `retry_spawn_recommendation` on the same MCP process within
five minutes. No future native call ID is required. Describe purpose, scope,
expected output and complexity; ask the user only for information genuinely
missing from the task. The description uses the same size and known-secret
checks as the original handoff. Only the labelled description and normal
classification contract are sent, never the opaque body or original event.

One valid supplement is allowed per original immutable call binding. Its
classification request ID is fixed, and a description digest is persisted before
provider preflight; text is not persisted by Aptly. Duplicate input reuses the
ledger/cache. Changed input conflicts, including after process recreation.
Timeout/network/unknown outcomes never issue replacement identities. A second
`needs_context`, a budget failure or an unavailable result ends this recovery:
`retry_allowed` is false and no further recovery ticket is created. Each process
holds at most 128 tickets without eviction; duplicates do not extend expiry.
Restart loses ticket lookup, although persistent bindings and the ledger still
prevent a recreated original Hook event from creating another paid retry.

The retry tool returns advice, not a rewritten original Hook response or a native
spawn. For a recommendation, inspect `spawn_application`: `caller_review_required`
requires the parent to review and explicitly supply only unspecified model/effort
fields to a new compatible native call. `blocked` requires reporting the original
history/application constraint. Never change `all` or omitted fork to `none`,
discard history, alter explicit choices or bypass permissions to apply advice.
If no recommendation is available, stop and report the result.

Cancellation during the retry, expiry, and changed/disabled policy or catalog
suppress its result. A sent request may still consume budget and complete in the
ledger. The original event observation remains `awaiting_context` with execution
`not_observed`; a retry recommendation does not prove child execution.

This is a caller-driven recovery protocol. Hook feedback does not itself run the
parent's next MCP call or spawn a child. It does not guarantee that every host or
parent model follows the instructions, and inherited application remains blocked.


### Bounded native recovery verification — 2026-11-07

A local Codex CLI 0.167.0 trial exercised this unreleased implementation with
its existing trusted Hook and ephemeral MCP command/environment overrides.
The parent was instructed to attempt one fresh child (`fork_turns: "none"`)
with no model/effort, a short synthetic task name and a message that the Hook
received as opaque. The Hook denied the call and returned recovery instructions.
The parent then called `retry_spawn_recommendation` through normal MCP tool
orchestration, supplying a bounded description of sorting `[3, 1, 2]` without
files, tools, network activity or changes.

The accepted retry ID matched the Hook feedback. Exactly one real Decisions
request contained the labelled description, without the opaque body or native
event metadata. It recommended `codex-simple` (`gpt-6-luna` / `max`). The parent
explicitly supplied that profile on its second native attempt, with the original
fresh-child semantics. The actual linked child recorded Luna/max and returned
`[1, 2, 3]`. Only one child was created. Neither Hook responses nor product
behavior were modified by the transparent observation adapter; persistent host
configuration and trust settings were unchanged, and temporary files were removed.

Three earlier attempts were retained as failures: each stopped before a paid
classification or child execution. Inspection of the nested MCP call established
that the recovery tool's initial write annotation required approval and was
rejected under `approvalPolicy: "never"`. The successful trial used the same
read-only advisory annotations as `recommend_agent`; local cache/budget metadata
is still recorded, and this is not a claim of stateless execution.

This is a prompt-guided caller recovery check, not proof that every parent model
will retry automatically. It does not validate inherited model application,
Claude Code native recovery, model quality or cost savings. Claude recovery,
provider abstention, duplicate/unknown outcomes and revocation are covered by
separate offline tests; they are not native execution evidence.
