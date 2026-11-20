# Budget limits

[한국어](../ko/budget.md) · **English** · [简体中文](../zh-CN/budget.md) · [日本語](../ja/budget.md)

[Guide home](../en.md)

## On this page

- [Budget limits and usage (0.1.8+)](#guide-budget-limits)

<a id="guide-budget-limits"></a>

## Budget limits and usage (0.1.8+)

Budget settings and usage queries are available in Aptly 0.1.8 and later. Aptly stores Decisions request outcomes and budget usage in a local request log (the ledger). `aptly set default` also fills missing budget environment settings for selected hosts. It adds no budget questionnaire, preserves existing values including explicit `0`, and does not reset usage, the request log, or cached results. The existing transmission-scope question is separate. Existing registrations without budget variables also use the new runtime defaults after upgrade. The old implicit 20-call/50-call/$0.50 ceilings are not retained; configure any limits you require explicitly.

| Environment variable | Default | Meaning |
|---|---:|---|
| `APTLY_MAX_DAILY_CALLS` | `200` | Per-ledger UTC daily classification-attempt ceiling |
| `APTLY_MAX_TOTAL_CALLS` | `0` | Per-ledger cumulative attempt ceiling |
| `APTLY_MAX_ESTIMATED_USD` | `0` | Cumulative local reservation ceiling |
| `APTLY_ESTIMATED_CALL_USD` | `0.002` | Estimated dollars reserved for each new classification attempt |

Zero means unlimited for the three ceilings. The per-attempt reservation is a rate and must stay positive. Only literal `0` means unlimited; forms such as `0.0` and `0.00` are rejected. Unset uses defaults; empty, negative, malformed or exponent notation values are rejected. Calls use whole integers; money uses fixed decimal notation with at most six fractional digits. Maximum finite settings are 100,000 daily calls, 1,000,000 cumulative calls and 100 for monetary values. A finite cost ceiling must cover one reservation. Existing invalid settings are not silently overwritten.

```sh
aptly set env APTLY_MAX_DAILY_CALLS
aptly set env APTLY_MAX_TOTAL_CALLS
aptly set env APTLY_MAX_ESTIMATED_USD
aptly set env APTLY_ESTIMATED_CALL_USD
aptly budget status --client codex
aptly budget status --client claude
```

Setting commands support `--client codex|claude|all`, hidden input and explicit `--stdin`. Restart MCP after changes. Defaults also preserve existing Codex budget passthrough bindings in `env_vars` and Claude budget values observed in this CLI process environment, listed as `inherited`. Direct `recommend`/`capabilities` use the CLI process environment and do not automatically read host settings files. The status command briefly holds the request log lock. A concurrent request may receive `ledger_locked`. Status is a snapshot of registration and permitted current environment settings, not verification of custom wrappers or the running host. It reads no keys, API or task text and creates no request log or lock file. Unlimited ceilings display `Unlimited` with `null` remaining. Sessions that share a request log also share its budget. Aptly does not add usage from other logs or the entire OpenAI account.

`budget_exhausted` is local, not an OpenAI authentication or account-credit error. Direct recommendations and context retries report the limit in `budget_limit`. The status command reports it in `exhausted_by`. Reservations are not an actual billing cap and do not reset monthly. Changing the rate does not reprice past reservations; replacing a key or applying defaults does not refund them.

Aptly does not cache new budget denials when it has not sent the request to the API. Under an earlier default policy, it rechecks the same ID only if it can verify the original denial incurred no cost. It keeps completed recommendations, abstentions, context outcomes, and `unknown` records. Budget recovery does not extend the original five-minute retry reference or process lifetime and does not remove history or permission constraints. Arbitrary historical custom-policy digests are not guessed; do not bypass conflicts/unknowns with new IDs or by deleting the request log.

## Related topics

[Decisions API transmission](transmission.md) · [Measured costs](benchmarks.md) · [Troubleshooting](troubleshooting.md)

[Guide home](../en.md)
