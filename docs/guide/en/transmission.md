# Decisions API transmission

[한국어](../ko/transmission.md) · [English](../en/transmission.md) · [简体中文](../zh-CN/transmission.md) · [日本語](../ja/transmission.md)

[Guide home](../en.md)

The transmission review described below is an **unreleased source feature**; it is not included in the published Aptly 0.1.10 package.

## On this page

- [Decisions API transmission scope](#guide-transmission-scope)
- [Outbound content and filtering limits](#guide-transmission-limits)

<a id="guide-transmission-scope"></a>

## Decisions API transmission scope

The transmission commands in this section are supported from Aptly 0.1.7.

Transmission means **sending local task information to the OpenAI Decisions API**, not providing tasks to Aptly developers. Application mode `defaults/advisory` and transmission scope are independent. New registrations use v2 policy with `unselected` scope and make no automatic transmission.

In published 0.1.10, interactive `aptly set default` asks only for unselected hosts; Enter selects `none`. Noninteractive runs and postinstall do not prompt or imply consent.

In the unreleased source, the first normal interactive `aptly setup` or `aptly set default` presents one grouped review for clients awaiting review, showing each current value, provenance, and default or overridden home. `excerpt` is recommended as option 3. Enter or keep preserves an existing explicit or legacy scope, including `none`; an unselected scope becomes `none`. Explicit `setup --transmission` or `set transmission <scope>` records the actual choice as reviewed. A private revision 1 marker is stored per client home, independent of package version, mode, and statistics, so ordinary patch updates and restarts do not repeat the review.

The new command below always asks again by explicit request; it is not available in published 0.1.10:

```sh
aptly set transmission --review
```

Canceling leaves scopes and review markers unchanged; normal setup or default configuration may already have applied non-transmission defaults. Automatic setup, check, migrate, explicit-transmission setup, CI, non-TTY execution, skipped setup, npm lifecycle scripts, MCP, Hooks, help, show, and statistics reads do not prompt. Prompts use stderr and leave JSON stdout clean. Existing disabled policies, modes, launchers, keys, ledgers, statistics, and trust settings are preserved.

The 0.1.10 update process cannot load the new question immediately. For the first rollout, run interactive `aptly setup`, `aptly set default`, or `aptly set transmission --review` after upgrading to a release that contains it. Future updates containing this feature print the next step without spawning a new process.

```sh
aptly set transmission --show
aptly set transmission none
aptly set transmission description
aptly set transmission excerpt
```

The change commands above show alternatives; run only the one you want. Use `--client codex|claude|all` to select hosts. `none` disables automatic transmission and preserves the original call. `description` permits only a parent-supplied description. Without one, it requests context before calling the API and never falls back to native body or label. `defaults` denies the unresolved spawn; `advisory` supplies feedback only. `excerpt` permits existing native excerpts and explicit descriptions. Source, size and known-secret checks establish neither non-sensitive content nor user consent.

Existing v1 policies remain byte-identical and report `excerpt` with `legacy` provenance. An explicit change migrates the policy to v2 and updates its ownership receipt together. Modified policies and custom launchers are not silently adopted; conflicts preserve them. Keys, ledgers and unknown records are not deleted. Restart MCP after changes. Already-started transmission cannot be recalled; changed policy prevents in-flight results, retry and fresh preparation from applying. Do not bypass an old call-binding conflict with a new paid identity. Explicit `recommend_agent` and `aptly recommend` requests remain separate and are not prohibited by this automatic-transmission setting.

Manually setting `enabled: false` remains an emergency stop, but can conflict with ownership records. Use the commands above for normal changes and never edit ownership receipts to bypass checks.

<a id="guide-transmission-limits"></a>

## Outbound content and filtering limits

Under `excerpt` scope, Without prepared context, automatic classification `summary` is an **excerpt assembled from an accepted task label and the clipped first paragraph** of the body. It is not a semantic rewrite or anonymization. Its UTF-8 size is at most `min(4000, max_summary_bytes)`; this is not a limit on the whole HTTP request. The opaque-message fallback in Codex uses only a sufficiently descriptive `task_name`, without decoding or transmitting that body. Labels can also contain sensitive information.

A valid `prepare_spawn_context` description and fixed prefix replace the native excerpt for classification; registration itself makes no API call. After a needs-context response, `retry_spawn_recommendation` can classify one new supplement with a fixed prefix, without appending the earlier body. Both paths limit the raw description to `min(3800, max_summary_bytes - 96)` bytes and the prefixed summary to `min(4000, max_summary_bytes)` bytes. `prepare_fresh_delegation` itself reuses completed advice without another classification and returns standalone instructions as local next-call arguments. A Codex call submitted with the returned explicit model and effort is currently preserved by the Hook as `explicit_model`, without classification. Checking a later call does not imply another classification. None of these paths establishes that descriptions are non-sensitive or automatically anonymized.

Decisions receives `client`, `task.summary`, `task.operation`, `task.context_sufficient`, candidate profile IDs, model/effort descriptions, and configured model facts. The classification API key is sent in `Authorization`; the request ID is sent in `X-Client-Request-Id`. Automatic IDs are hashes; direct recommendation IDs are caller-supplied. Do not put secrets in IDs or candidate descriptions.

To disable automatic sharing, change **only `enabled` to `false`** in the existing private policy file referenced by `APTLY_HOOK_POLICY_PATH`. Preserve the other fields and ownership record. Subsequent automatic Hook calls preserve the original call before classification or creation of a call-binding file. This cannot undo a transmission already started or recall information received by the server. Editing a generated policy can cause ownership conflicts in setup, configuration, or removal commands; those commands do not overwrite the disabled policy. Do not edit ownership records to bypass the checks.

When the transmission scope permits it, `mode: advisory` still transmits classification data; it is not a privacy opt-out. Removing `APTLY_HOOK_POLICY_PATH` can activate the older strict path, so do not use removal as an alternative. `enabled: false` does not block explicit `recommend_agent` or `aptly recommend` requests.

For control over the shared summary, disable automatic sharing and write only the information needed for a direct recommendation. Aptly does not automatically fetch documents at URLs or attach source files mentioned in the summary. Checks for known key and Bearer patterns do not provide complete secret detection or establish that text is safe to transmit.

The ledger and Hook bindings store request metadata, hashes, and cached results, not task excerpts. Aptly diagnostics also exclude raw task text. The local Hook's `updatedInput` retains the original task so the host can continue execution. Aptly does not control the host's own transcript or log retention.

## Related topics

[Automatic recommendations](routing.md) · [Budget limits](budget.md) · [Execution statistics](statistics.md)

[Guide home](../en.md)
