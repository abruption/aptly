# Explicit spawn context handoff (unreleased)

This builds on PR #60 and is absent from npm 0.1.3. It does not decode opaque
messages, inspect conversations or modify host internals.

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

There is no richer-summary retry mechanism in this change. Register before the
first evaluation. If a label-only or description-bound evaluation already
started, adding/changing the description fails closed (`call_conflict`);
unknown paid outcomes remain unknown. Do not change IDs to bypass this guard.
A future deliberate re-evaluation workflow needs its own explicit association
and accounting design.

## Outcomes and evidence

- `insufficient_context`: local description/size/context checks failed.
- `provider_needs_context`: a valid provider abstention; its rationale is not
  inferred, and useful-looking text does not guarantee a recommendation.
- `inherited_context_application_unverified`: advice can be available while
  the native model/history update remains unverified and blocked.

Tests use synthetic opaque strings, injected providers, mocked Decisions HTTP
and in-memory MCP transport. They verify the exact shared summary, request
counts, identity, cancellation, bounds and cache/unknown protections. They do
not establish native host handoff availability, paid provider behavior or the
actual child's model/effort. The separately authorized native evaluation in
#61 acceptance criterion 4 remains outstanding. Keep the PR Draft until that
evidence and the integration's exact event handoff are reviewed.
