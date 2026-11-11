# Troubleshooting

[한국어](../ko/troubleshooting.md) · [English](../en/troubleshooting.md) · [简体中文](../zh-CN/troubleshooting.md) · [日本語](../ja/troubleshooting.md)

[Guide home](../en.md)

## On this page

- [Account home and Hook registration](#guide-account-home-recovery)
- [Recover an incompatible launcher](#guide-launcher-recovery)
- [Interrupted processes and ledger locks](#guide-ledger-lock-recovery)

<a id="guide-account-home-recovery"></a>

## Account home and Hook registration

First compare `CODEX_HOME` in the environment launching Codex with the home selected by the CLI. Editing a policy path in `config.toml` does not create the target policy file or ownership record. These queries do not reset keys or state.

```sh
aptly setup --check --client codex
aptly stats --client codex
```

| Result | What to check |
|---|---|
| `hook_policy_path_conflict` / `statistics_policy_conflict` | Compare the selected account home, MCP policy reference and actual policy location. Do not copy state across homes or blindly overwrite an existing reference. |
| `statistics_requires_setup` | Check MCP registration, the policy file and setup record in the selected home. Establish that normal setup is valid for that home first. |
| `existing_hook_not_owned` | An Aptly Hook exists without valid setup ownership. Back up and review its definition before explicit recovery; do not edit or copy ownership records to bypass validation. |

After the setup check succeeds, follow [statistics activation](statistics.md). `collection.codex: true` describes collection configuration, not proof that the running host loaded or trusted the Hook. Restart Codex for the intended account and inspect the actual entries in `/hooks`.

### Policy paths revert in managed accounts

Planned for 0.1.11. A manager such as Orca can mirror a same-name MCP registration from the canonical home and overwrite an account-only absolute policy path. Hooks can remain intact while MCP and statistics reference different policies.

Upgrade every registered Aptly backend first and stop the affected hosts/MCP processes. For an existing Codex setup with intact ownership, explicitly migrate the canonical/default registration first, then repeat in each intended account environment with its selected `CODEX_HOME`. An account-only edit can still be overwritten by synchronization.

```sh
CODEX_HOME="$HOME/.codex" aptly setup --client codex --policy-source codex-home --dry-run
CODEX_HOME="$HOME/.codex" aptly setup --client codex --policy-source codex-home
CODEX_HOME="$HOME/.codex" aptly setup --check --client codex
CODEX_HOME="$HOME/.codex" aptly stats --client codex
```

Migration registers `APTLY_HOOK_POLICY_PATH = "@codex-home"` and forwards `CODEX_HOME` through `env_vars`. At startup, the server selects that home's `aptly/auto-policy.json`. Missing, empty or relative values are rejected without selecting another home. For the default home, explicitly launch the CLI and Codex with `CODEX_HOME="$HOME/.codex"`. The example uses the default home; substitute the intended absolute account home for account-specific commands. This is an operator-declared source selection, not complete host provenance. See [Codex MCP environment forwarding](https://learn.chatgpt.com/docs/extend/mcp#stdio-servers).

Migration does not move or reset policy contents, transmission consent, ledger paths, statistics history or Hook trust. Existing fixed/shared policies remain fixed unless explicitly migrated. Custom launchers, unrelated registration changes and ownership mismatches require local review; do not edit or copy receipts to bypass errors. Restart the server and check again in the intended account. A successful dry-run or file check does not prove the running MCP updated or a model was observed.

<a id="guide-launcher-recovery"></a>

## Recover an incompatible launcher

These options require Aptly 0.1.2 or later and are not in npm 0.1.1. To test from source, run `npm ci --ignore-scripts` and `npm run build`, then replace `aptly` below with `node bin/aptly.ts`.

Key setup diagnoses selected hosts before input or storage. If any host fails, it does not prompt or change any host. `--check` does not access keys or the credential store.

From Aptly 0.1.9, on Linux, `--check` also checks for an executable `secret-tool` and, when a safe explicit session-bus address and `gdbus` are available, reads bus metadata without activating or accessing the credential service. Confirmed failures report `secure_store_unavailable` with `secure_store_secret_tool_missing`, `secure_store_bus_missing`, or `secure_store_service_missing` before input. `secure_store_bus_unverified`, `secure_store_probe_unavailable`, and service-present or activatable unverified codes mean readiness is unknown; a running or activatable service does not prove it is unlocked or writable. Install `secret-tool` and a Secret Service provider, and run from the intended desktop session when needed. The actual store operation can still fail. For SSH or headless sessions, supply `OPENAI_API_KEY` securely to the host MCP process when `APTLY_SECRET_BACKEND` is absent; preserve an existing authentication wrapper or environment. `credential_node_mismatch`, `credential_server_mismatch`, and `credential_runtime_unsupported` identify incompatible Node paths, server paths, and OS-store support respectively.

If only Claude failed, diagnose that host and review migration only when `launcher_migration_available` is returned:

```sh
aptly set env OPENAI_API_KEY --client claude --check
aptly setup --client claude --migrate-launcher --dry-run
aptly setup --client claude --migrate-launcher
aptly set env OPENAI_API_KEY --client claude
```

`--dry-run` makes no changes. Migration replaces the Node/server paths of a receipt-matching, Aptly-owned standard registration with the current build. It preserves environment settings, Hooks, policy and other hosts, accesses no credentials, and never executes the old launcher. Custom wrappers and missing or modified ownership records are rejected. Review such registrations locally; use the wrapper's secure environment or a separately reviewed standard registration. Do not edit or delete ownership records to bypass validation.

From Aptly 0.1.9, `aptly setup --check --client codex|claude|all` reads the normal setup plan without writing files or creating directories. It is a snapshot, not a check of the running host. Only `--client` can be combined with `--check`. If `hook_policy_path_conflict` appears, review the selected host configuration directory and existing policy reference locally, then select the intended host directory before retrying. Setup preserves the existing configuration and does not move or copy the policy; launcher migration does not resolve this mismatch.

If `launcher_migration_not_owned` refers to a preserved registration (`mcp_created: false`), **Aptly 0.1.3 or later** offers the explicit `--include-existing` opt-in. Install 0.1.3 or later, then run:

```sh
aptly setup --client claude --migrate-launcher --include-existing --dry-run
aptly setup --client claude --migrate-launcher --include-existing
```

Review the local registration first. A valid existing Aptly ownership receipt and matching managed environment additions, Hook, and policy are required. Only an absolute Node path with a single standard server path is accepted; wrappers and registrations without a receipt remain unsupported. This does not make the entire MCP registration Aptly-owned: later removal preserves the migrated launcher and original user settings. The option applies only to explicit single-client migration, never automatic installation.

A successful Codex configuration needs no reset. Retry only the affected host and restart MCP. Codex still requires `/hooks` trust review. Changes after diagnosis stop with `concurrent_configuration_change`. If recovery observes another key or cannot read the current key, it leaves the store unchanged and reports `credential_rollback_failed`. Files and the OS store do not form an atomic transaction; avoid concurrent configuration operations.

<a id="guide-ledger-lock-recovery"></a>

## Interrupted processes and ledger locks

This locking design requires Aptly `0.1.2` or later and is not included in npm `0.1.1`. The JSON ledger keeps its request IDs, `unknown` records, completed cache, call counts, and reserved costs. Only persistent ledgers use Node.js 24's built-in SQLite. The adjacent `ledger.json.lock` remains after a normal exit; its presence alone does not mean an active lock. With the new design, process exit releases the OS lock so a later request can use the same ledger. It does not retry an existing uncertain ID or refund reserved costs.

Keep the ledger and lock in a private directory on a local filesystem that supports hard links, and use one canonical path for each ledger. Network shares, cloud-synced directories, and path aliases are outside the supported scope. Do not delete or replace the new lock or SQLite journal, or open them with another database tool while in use. Age and PID alone do not establish that an owner has exited.

An old empty `.lock` cannot establish whether its owner is still alive, so it is never initialized or removed automatically. Stop every relevant host, MCP process, and ledger-accessing process, including older versions, and upgrade all writers. Only after confirming that the file belongs to the legacy locking design may you quarantine that file and restart against the same JSON ledger path. Do not reset or delete the ledger, `unknown` records, costs, or completed results. If ownership or format is uncertain, leave access blocked and investigate.

See [Diagnostics and development](advanced.md#guide-diagnostics-and-development) for diagnostic reports.

## Related topics

[Configuration and model candidates](configuration.md) · [Installation and updates](installation.md) · [Advanced MCP integration and development](advanced.md)

[Guide home](../en.md)
