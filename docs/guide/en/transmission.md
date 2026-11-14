# Decisions API transmission scope

[한국어](../ko/transmission.md) · **English** · [简体中文](../zh-CN/transmission.md) · [日本語](../ja/transmission.md)

[Guide contents](../en.md)

## Contents

- [Choose a transmission scope](#guide-transmission-scope)
- [Content and limits](#guide-transmission-limits)

<a id="guide-transmission-scope"></a>

## Choose a transmission scope

The recipient is the **OpenAI Decisions API**, not the Aptly developer. New registrations start `unselected` and do not transmit automatically.

| Scope | Information available for automatic recommendations |
|---|---|
| `none` | No automatic transmission; preserve the original call |
| `description` | Send only the caller-provided description; request more context if absent |
| `excerpt` | Allow explicit descriptions and supported native task excerpts |

The first interactive `setup` or `set default` asks for the scope of homes awaiting review. The recommended option is `excerpt`; Enter preserves an existing choice or selects `none` if unselected. Automatic installation, CI, and nonterminal execution are not treated as consent. Cancellation leaves the transmission choice unchanged, though earlier default registration may have completed.

To review again, run (since 0.1.11):

```sh
aptly set transmission --review
```

You can also show the current value or select a scope directly. Run only one of the change commands below. Choose targets with `--client codex|claude|all`.

```sh
aptly set transmission --show
aptly set transmission none
aptly set transmission description
aptly set transmission excerpt
```

Restart MCP after changes. Existing v1 policies remain legacy `excerpt` until changed. Operator changes and other wrappers are not automatically adopted. In-flight transmissions cannot be recalled, and results, retries, or fresh delegations from before the change are not applied to the new policy. Do not bypass conflicts with a new paid ID.

`--show` returning `complete`/exit code 0 means the query completed, including when the value is unset or `none`. Damaged, missing, or conflicting expected settings yield `partial`/exit code 1. This command does not verify host readiness or consent.

`advisory` limits application; it does not prohibit transmission. If a `description` is insufficient, `defaults` blocks the spawn and `advisory` reports guidance. `recommend_agent` and `aptly recommend` are separate explicit requests and are not prohibited by the automatic transmission setting.

<details>
<summary>Emergency stop by editing the policy</summary>

Changing only `enabled` to `false` in the existing private policy at `APTLY_HOOK_POLICY_PATH` preserves the original call before automatic classification and binding. Do not edit other fields or ownership records. Use the CLI above for ordinary changes because ownership conflicts can result. Do not clear the policy path as a stop method: it may switch to the strict path. Already started transmissions and explicit direct recommendations cannot be canceled this way.

</details>

<a id="guide-transmission-limits"></a>

## Content and limits

In `excerpt` scope, when no description was registered in advance, the automatic classification `summary` consists of an allowed task label and a **truncated excerpt of the first paragraph** of the body. It is not newly summarized or anonymized. Its UTF-8 size is at most `min(4000, max_summary_bytes)`; this is not a limit on the entire HTTP request. The Codex opaque-message fallback uses only a sufficiently specific `task_name`, without decrypting or sending the body. Labels can also contain sensitive information.

When a valid description is registered with `prepare_spawn_context`, a fixed prefix and that description replace the native excerpt for classification. Registration itself does not call the API. After an insufficient-context response, `retry_spawn_recommendation` retries once with a fixed prefix and a new supplemental description, without appending the previous body. In both paths, the raw description is limited to `min(3800, max_summary_bytes - 96)` bytes and the prefixed description to `min(4000, max_summary_bytes)` bytes. `prepare_fresh_delegation` itself reuses a completed recommendation without another classification call and returns independent instructions as local arguments for the next call. A Codex call explicitly specifying the returned model and effort is preserved by the current Hook as `explicit_model` without classification. A routing check on a subsequent call does not itself imply another classification. Neither path guarantees descriptions are non-sensitive or automatically anonymized.

Decisions receives `client`, `task.summary`, `task.operation`, `task.context_sufficient`, candidate profile IDs, model and effort descriptions, and configured model characteristics. The classification API key is sent in the `Authorization` header and the request ID in `X-Client-Request-Id`. Automatic-path IDs are hashes; direct recommendation IDs are caller-specified. Do not put secrets in IDs or candidate descriptions.

To choose a summary yourself, turn off automatic sharing and write only the information needed for a direct recommendation. Aptly does not automatically read and attach documents or source files at URLs in a summary. Checks for known key and Bearer patterns are not complete secret detection or a guarantee of transmission safety.

The ledger and Hook bindings store request metadata, hashes, and cached results, not task excerpts. Aptly diagnostics also omit the original text. However, the Hook's `updatedInput` retains the original task so the local host can continue execution. Aptly does not control the host's own conversation or log storage.

[Automatic recommendations](routing.md) · [Budget](budget.md) · [Guide contents](../en.md)
