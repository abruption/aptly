# Execution statistics

[한국어](../ko/statistics.md) · [English](../en/statistics.md) · [简体中文](../zh-CN/statistics.md) · [日本語](../ja/statistics.md)

[Guide home](../en.md)

## On this page

- [Execution statistics (0.1.10 or later)](#guide-execution-statistics)

<a id="guide-execution-statistics"></a>

## Execution statistics (0.1.10 or later)

Execution statistics require Aptly 0.1.10 or later. Install a supported version or upgrade following [package updates](installation.md#guide-package-updates), then use the examples below. An existing Aptly setup is required. Collection is initially POSIX-only; Windows collection is unsupported and normal Aptly use on Windows is unaffected.

```sh
aptly stats
aptly stats --today --client codex
aptly stats enable --client codex
aptly stats enable --client codex --codex-native-metadata
aptly stats disable --client codex
```

The top-level `status` in `aptly stats` reads, including `--today`, is `complete` (exit 0) when the query completes and `partial` (exit 1) for unsupported statistics requests or corrupt, read, or store errors. Disabled collection and genuinely unconfigured clients are completed queries. Successful client results remain available when another client fails. Existing client JSON fields and values are retained; strict full-object consumers must accept the additive `status`. `complete` does not certify host routing, model, or trust readiness. Unexpected statistics failures report `statistics_failed`; raw paths, input, keys, and stacks are not printed. Reads do not repair setup, obtain consent, or call a provider.

The command forms are `aptly stats [--today] [--client codex|claude|all]`, `aptly stats enable [--client] [--codex-native-metadata]` and `aptly stats disable [--client]`. Collection is off by default and postinstall does not enable it. Enable installs Aptly-owned command observers recorded separately in `stats-ownership.json`; it leaves the legacy receipt, MCP, launchers, keys, budget and transmission settings intact. Restart MCP and the host after enabling; for Codex, review native Hook trust in `/hooks`.

Disable turns collection off and removes only unchanged owned observers. Modified or custom observers are preserved with a warning; data and the key remain. `remove` validates and removes stats-owned definitions but keeps the data. Independently managed collectors and custom Hooks are not adopted automatically.

Private state uses `stats.sqlite`, `stats-config.json` and `stats-key` (an HMAC secret), separately from the budget ledger. Do not share the key. Records contain no task text, transcripts, raw IDs, paths, errors or credentials. Reading stats makes no API, key or credential-store calls, initializes nothing and runs no notifier.

The projection reports `model_match`, `model_mismatch`, `model_changed`, `unknown`, `pending`, `expired_pending` and `application_unconfirmed`; advisory is separate. `blocked`, `explicit_preserved` and `unbound` are excluded from denominators. Effective effort is never measured; configured effort is not actual effort. Claude aliases `haiku`, `sonnet`, `opus` and `fable` cannot be resolved to an actual canonical model and are `unknown`; only exact canonical models are supported, and observing a model does not guarantee all aliases match. These figures do not establish user acceptance or quality.

Direct advisory, retries and fresh unbound calls without native continuity are not joined by approximate timing. `--today` uses the UTC date when the binding was first created. Capacity is fixed at 10,000 delegations and 10,000 children, with no automatic pruning. Counts cover retained records, not lifetime totals; at capacity, new identities are dropped and the reached flag is set. Missing callbacks do not prove bypass. There are no token or cost rollups, live quota or savings figures.

Codex native metadata is off unless explicitly enabled. It reads SQLite native metadata by exact child ID only: no transcripts, repairs or app-server launch. Relocated `sqlite_home`, unsupported schemas or paths, and ambiguous joins yield unknown. A SQL read may update existing SHM read marks; it writes no rows or schema and does not intentionally create sidecars.

Collection is best effort: lost, delayed or capacity-dropped events can leave an incomplete model history. `model_match` means the retained evidence matches, not that every request used that model. Disabling Codex collection, removing setup or enabling without `--codex-native-metadata` revokes native metadata access. After changing the Node or package path, disable and re-enable collection to register current commands. An unavailable or corrupt store is preserved; review it locally rather than deleting the key or assuming zero usage.

## Related topics

[Automatic recommendations](routing.md) · [Decisions API transmission](transmission.md) · [Troubleshooting](troubleshooting.md)

[Guide home](../en.md)
