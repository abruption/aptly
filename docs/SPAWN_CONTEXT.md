# Spawn context handoff and recovery

The original exact-event handoff is available from Aptly 0.1.4, following the
pre-spawn routing changes in #60. Context recovery and visible routing outcomes
are available from Aptly 0.1.5.
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
The 0.1.5 recovery protocol below provides a separate, bounded supplement;
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


## One context supplement after a Hook response

Available from Aptly 0.1.5.

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
`context_retry_allowed` is false and no further recovery ticket is created. Each process
holds at most 128 tickets without eviction; duplicates do not extend expiry.
Restart loses ticket lookup, although persistent bindings and the ledger still
prevent a recreated original Hook event from creating another paid retry.

The retry tool returns advice, not a rewritten original Hook response or a native
spawn. For a recommendation, inspect `spawn_application`: `caller_review_required`
requires the parent to review and explicitly supply only unspecified model/effort
fields to a new compatible native call. Caller review means argument review,
not a request for new user approval. Existing delegation authorization and host
permission checks still apply; this advisory result grants neither.
The response supplies concrete fields in
`next_call.set_if_unspecified`, excluding original explicit choices. Claude
receives model only, never an effort field. Blocked results omit `next_call`. `blocked` requires reporting the original
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

A local Codex CLI 0.167.0 trial exercised the pre-release recovery implementation with
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


## Visible routing outcomes and correlated recovery

Available from Aptly 0.1.5.

After establishing a valid enabled policy, a supported unpinned/default-selection
call and eligible profiles, `defaults` denies application incompatibilities and
classification failures instead of silently continuing with the original model.
The safe reason is model-visible. Budget exhaustion, unknown results and provider
errors do not authorize retrying with another identity. Cancellation of the host
request suppresses output; an operator-disabled policy stays disabled.

In particular, omitted or inherited Codex history still cannot apply a recommended
profile under the current verified contract. Defaults mode stops the spawn and
asks the parent to report that constraint. It does not silently rewrite history,
create a fresh child or execute the parent's defaults. Advisory mode remains
nonblocking feedback. Fully specified tuples, fixed roles and resumed agents
retain intentional local preservation without unnecessary paid classification.

The guarantee is limited to an enabled, trusted, connected and supported Hook.
The MCP server cannot intercept calls when the host does not invoke it. The
`automatic_hook.guarantee` capability describes this boundary and does not certify
installation, trust or dispatch. Missing/untrusted/unavailable Hooks remain a host
fallback condition, not a server-enforced block. See the official
[Codex Hook limitations](https://learn.chatgpt.com/docs/hooks) and
[Claude Code Hook reference](https://code.claude.com/docs/en/hooks).

A parent with a Hook-issued retry ID can query the existing observation tool:

```text
get_spawn_routing_observation({retry_id})
```

This is an alternative to `{client, event}`; the two forms are mutually exclusive
and partial forms are rejected. Both look up the same bounded process-local
record. Original preflight remains `awaiting_context`; `context_retry.outcome`
records the separately classified recovery and `context_retry.last_attempt`
records the latest retrieval/rejection. A conflicting or concurrent duplicate
does not erase an earlier classification. Only safe status/reason, classification,
recommendation/application state and allowlisted profile identity are retained in
this view, never the description, original event, policy or raw provider output.
Lookups make no paid calls or retention renewal. Missing/expired records do not
prove bypass, and execution remains `not_observed` throughout.


### Ordinary Codex follow-through verification — 2026-11-07

A bounded native Codex CLI 0.167.0 trial used the existing trusted Hook with an
ephemeral product-server override and a transparent observer. The user prompt
requested a sorting delegation, a short synthetic task name and omitted model,
effort, fork and role fields. It did not describe the recovery tool, provide a
retry sequence or tell the parent how to supply a description after a denial.

The real opaque-body Hook invocation was denied for local context shortage.
The parent followed the Hook feedback and supplied a bounded description through
MCP. Exactly one real Decisions classification produced a recommendation, while
the original omitted-fork history constraint was returned as application blocked.
The parent reported the constraint without creating a child, switching to a
fresh fork or supplying a model to bypass it. The HTTP boundary recorder checked
that only the labelled description was shared as task text, without opaque body
or native event metadata. Persistent host configuration/trust stayed unchanged;
temporary files were removed.

This verifies one ordinary follow-through and a stopped inherited application,
not inherited-model compatibility, unconditional model compliance, a benchmark
or successful child execution. It does not recover evidence for the historical
reported session. The earlier fresh-child recovery verification is a separate
scenario and must not be substituted for this omitted-fork result.


### Claude Code recovery and child verification — 2026-11-07

A native Claude Code 2.1.314 trial used an ephemeral copy of the installed Hook
settings, a temporary MCP server override and normal permission checks. The
parent received an ordinary sorting-delegation request with a short initial
Agent prompt and no initial model. The request explicitly distinguished that
initial unpinned omission from a user prohibition on later model selection. It
did not provide recovery tool names or an MCP retry sequence.

The first real Agent call was denied for insufficient context. The parent
supplied a description through MCP; exactly one real Decisions request selected
`claude-simple` / `haiku`. The retry returned concrete missing defaults under
`next_call.set_if_unspecified`. The parent submitted a second Agent call with
`model: "haiku"`. One actual child produced `[1, 2, 3]`; forwarded child messages
with parent-tool linkage recorded `claude-haiku-5-5`, also present in model usage.
The transparent observer did not modify Hook responses. Persistent settings and
MCP registration were unchanged, permission bypass was not used, and temporary
files were removed.

Earlier native attempts remain failures, not successes. Two stopped before any
Agent/classification under the previous login context. Four authenticated trials
reached recommendation but did not create a child: one resubmitted omitted
defaults, one answered inline, and two stopped without a second Agent call. The final retained assistant
report attributed its stop to interpreting the test's model-omission wording as
a user constraint. The contract was clarified with concrete missing
fields and `context_retry_allowed` (ending supplementation, not authorizing or
forbidding native execution), while the final prompt clarified only the initial
unpinned state. These trials are not a model-quality or cost comparison.

This verifies one caller-driven Claude recovery under explicit unpinned task
semantics. It does not guarantee every parent model follows feedback, change
host permission decisions, or establish inherited Codex application support.


## Intentional fresh delegation (unreleased)

`prepare_fresh_delegation` is a caller protocol for a separate Codex invocation,
not a rewrite of the original inherited invocation. An enabled defaults Hook can
provide a routing reference named `retry_id` after direct completed inherited
advice, or the caller can use the existing context-retry reference after a
completed recommendation. Direct-advice references cannot request another paid
context supplement. Advisory paths are excluded because the original invocation
may already execute.

The caller supplies `task_name`, a bounded `standalone_task`, and a declaration:
`independent_task: true`, `same_task: true`, `original_call_outcome: "blocked"`,
`history_requirement: "not_required"`,
`standalone_context_complete: true`. Required/unknown history, undeclared
independence, incomplete context and changed scope reject without preparing a
call. These declarations are not verified user-intent provenance. The caller
must not make them when the user explicitly requires inheritance.

Only original native inputs with the supported task/model/effort/fork fields
qualify. Unknown additional execution fields are rejected rather than silently
dropped. Fixed roles/resume remain locally preserved before advice. Explicit
partial model/effort choices still constrain the completed allowlisted profile.
The current policy/catalog, original event/context and completed ledger result
are revalidated. Unknown results and missing/abstaining recommendations cannot
prepare a child. No new classification occurs.

A successful response provides separate `next_call.arguments` including explicit
`fork_turns: "none"`, the validated profile and the caller's standalone task.
A deny was returned for the original input, which was not rewritten. Server
observation does not certify that the host enforced it. The caller must have a
host-reported blocked tool outcome; executed/unknown declarations reject.
The caller reviews and submits a
new native call under unchanged host permissions and existing delegation
authorization. Neither preparation nor argument output proves dispatch/execution.
The process does not own native spawn or guarantee caller compliance.

The original five-minute lifetime and process/capacity boundaries apply. One
immutable preparation digest binds task, declaration, profile and original
reference; text/history are not persisted. Duplicate identical preparation is
idempotent; changed input conflicts. Expiry, cancellation, original-event or
policy/catalog changes prevent preparation. `fresh_delegation` observations
separate the prepared outcome from the latest rejected attempt and always keep
execution `not_observed`. The eventual new native call has its own identity;
server evidence does not automatically certify its relationship to this plan.


### Bounded native fresh-delegation verification — 2026-11-07

Codex CLI 0.167.0 used its existing trusted Hook with an ephemeral product-server
override. One standalone sorting task specified an initial inherited caller
default while explicitly requiring no inherited history. The original opaque
call stayed blocked; the parent supplied context, obtained one real Decisions
recommendation, declared independent same-task intent and called the preparation
API. It then submitted a separate native call with `fork_turns: "none"` and the
returned Luna/max profile. The actual linked child recorded `gpt-6-luna` / `max`,
returned the expected list and contained no copied parent message payloads.
Approval/sandbox constraints matched the parent. Preparation added no paid call.

A separate two-turn test explicitly required inherited history. It obtained one
real recommendation, preserved `fork_turns: "all"`, made no fresh preparation and
created no child. Both tests preserved persistent configuration/trust, used no
response-modifying adapter and removed their temporary files. These are bounded
caller-driven checks, not universal model compliance or verified user provenance.


Captured event/context checks are process-local and do not observe later native
host-setting changes or host cancellation unless forwarded through the request
signal or explicit registered-context revocation. The reused profile was chosen
from the original classification summary; `same_task` is a caller declaration,
not a semantic comparison of the standalone task. Do not reuse it for different
work. Repeated preparation is idempotent, not an exactly-once spawn mechanism.
The host still owns each actual invocation and its permissions.

Private preparation digests are intentionally immutable once written, including
when a final currentness check rejects the response. This fail-closed binding
prevents changing a task under a consumed reference; it is not a plaintext backup
and is not deleted to permit a different-task retry. The advisory read-only hint
means no user file, host configuration or native execution is changed; like the
existing recommendation/cache tools, private query bookkeeping is still written.
It is not a statelessness or permission-approval claim.


The final instruction-contract candidate was also checked with explicit session
owner authorization for Aptly to choose model/effort defaults for the independent
task. The original caller-default all was denied, the caller used the declared
preparation API, and a separate none invocation ran the recommended Luna/max
child with the expected output. Exactly one Decisions request was forwarded.
A final explicit-history case preserved all and created no child. Persistent
configuration/trust stayed unchanged. An intervening candidate stopped after
recommendation when the parent treated original-fork preservation as a blanket
ban; that run remains a failed caller-follow-through observation, not successful
execution. This motivated the stricter instruction distinguishing original-call
resubmission from the only supported separate preparation protocol. These results
remain bounded and do not guarantee arbitrary parent-model compliance.
