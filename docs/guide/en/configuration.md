# Configuration and model candidates

[한국어](../ko/configuration.md) · **English** · [简体中文](../zh-CN/configuration.md) · [日本語](../ja/configuration.md)

[Guide contents](../en.md)

## Contents

- [Configuration file locations](#guide-host-config-locations)
- [CLI configuration](#guide-cli-configuration)
- [Keys and restarting](#guide-keys-and-restart)
- [Stable launcher](#guide-stable-launcher)
- [Model candidates](#guide-models-and-environment)

<a id="guide-host-config-locations"></a>

## Configuration file locations

| Host | Default location | Alternate account home |
|---|---|---|
| Codex | `~/.codex/config.toml` | `$CODEX_HOME/config.toml` |
| Claude Code | `mcpServers.aptly` in `~/.claude.json` | `$CLAUDE_CONFIG_DIR/.claude.json` |

Claude Hooks are in `~/.claude/settings.json` by default, or `$CLAUDE_CONFIG_DIR/settings.json` for another account. Pass the host's account environment to installation, setup, and statistics commands too. Do not copy policies, ledgers, keys, or trust records from another home.

Since 0.1.15, the Codex MCP `@codex-home` policy selects `~/.codex` when `CODEX_HOME` is absent. An explicit absolute path takes precedence; empty or relative paths and control characters are rejected. Custom homes are not discovered, so the default home's policy and transmission scope apply unless the administrator passes the value. See [advanced setup](advanced.md#guide-manual-mcp-setup) for manual, project, and managed registrations.

<a id="guide-cli-configuration"></a>

## CLI configuration

```sh
aptly set default
aptly set env APTLY_CODEX_MODELS
aptly set env OPENAI_API_KEY
```

`set default` adds missing registrations and defaults and reviews the [transmission scope](transmission.md). It preserves existing commands, environment, provider, candidates, and advisory policy. `set env` accepts hidden input and changes only the named variable. Both hosts are targeted by default; select with `--client codex|claude|all`.

```sh
aptly set env APTLY_CLAUDE_MODELS --client claude
```

Enter candidates as a JSON array string such as `["haiku","sonnet","opus"]`. For automation use `--stdin`. Do not put real keys in `printf` or shell history.

```sh
printf '%s\n' '["gpt-6.1-terra"]' | aptly set env APTLY_CODEX_MODELS --stdin
```

Generally allowed keys are `ROUTER_PROVIDER` (`fixture`/`decisions`), `APTLY_CLAUDE_MODELS`, `APTLY_CODEX_MODELS`, aliases `CLAUDE_MODELS` and `CODEX_MODELS`, and `APTLY_MODEL_INFO_PATH`. The model cache path must be absolute and inside a private directory. This command does not change administrative ledger or policy paths.

<a id="guide-keys-and-restart"></a>

## Keys and restarting

`aptly set env OPENAI_API_KEY` stores each host's key in macOS Keychain, Linux `secret-tool`, or Windows Credential Manager and registers only a store reference with MCP. An unavailable or locked store produces an error; Aptly does not fall back to a plaintext file or another environment key. See [credential store errors](troubleshooting.md).

Host subscription login and the API key are separate. Do not record keys in command arguments, configuration JSON, requests, or repositories. For direct delivery through a secure MCP execution environment, see [manual setup](advanced.md#guide-key-environment).

Key storage is allowed only for standard launchers verified as compatible. Custom wrappers are preserved but may be rejected with `credential_launcher_unverified`. For `partial`, check each host's error. On a storage failure Aptly attempts to restore the previous key; if `credential_rollback_failed` occurs, check the active key in the OS store before retrying. Changes across multiple hosts are not atomic.

Restart MCP after changes and check candidates, provider, and `credential_status` with `get_routing_capabilities`. `os_store` means the key was read, not that its API validity was verified. Codex `/hooks` approval is also required.

<a id="guide-stable-launcher"></a>

## Launcher resilient to Node version changes

Default registrations use an absolute Node path. On macOS and Linux, `stable` is available for frequent Node version changes (since 0.1.14). It preserves Aptly and dependencies outside the Node directory and searches for another supported Node.js 24+. It does not include Node and does not support Windows.

For a new registration, use `aptly setup --client all --launcher stable`. For an existing one, review the dry run before migration. Pass the appropriate home environment for other accounts and use `--client claude` for Claude.

```sh
aptly setup --client codex --migrate-launcher --launcher stable --dry-run
aptly setup --client codex --migrate-launcher --launcher stable
```

After updating global Aptly, run the same command to update the preserved copy. Ordinary `setup` does not replace it; an old copy reports `stable_snapshot_outdated`. Migration updates owned MCP and statistics observers together. Modified launchers and Hooks are not adopted. To target a preserved standard registration, review it and add `--include-existing`. Approve changed Codex Hooks again in `/hooks`.

<details>
<summary>Launcher limits and recovery</summary>

The search order is installation Node, standard paths, default `~/.nvm/versions/node`, then safe absolute PATH entries. Selection of the newest version and support for custom NVM_DIR, shims, or symlink-based managers are not guaranteed. Shell profiles, npm, and downloads are not executed. `NODE_OPTIONS`, `NODE_PATH`, and `NODE_REPL_EXTERNAL_MODULE` are removed; review `NODE_EXTRA_CA_CERTS` and similar settings for additional CAs.

Unverifiable sources such as writable ancestor paths, externally hoisted dependencies, and native add-ons are rejected. Integrity checks add I/O cost, and the search budget is not a hard timeout for all file I/O. This is not sandboxing or publisher signature verification. On failure MCP stops with an error and the statistics observer exits quietly.

If ownership matches, a missing, damaged, or older-format copy can be explicitly migrated from a new CLI source. Damaged same-generation copies and incomplete locks are not automatically overwritten or deleted. Old copies are not automatically deleted because other homes or processes may reference them. Check writers and references before reviewing the state. Migration between direct Node launchers may require a separate statistics update (`statistics_observer_migration_required`).

</details>

<a id="guide-models-and-environment"></a>

## Models and environment variables

Tiers are task presets and do not imply equivalent model performance across providers.

| Tier | Claude Code | Codex | Example tasks |
|---|---|---|---|
| simple | `haiku` | `gpt-6-luna` / `max` | Extraction, format conversion, small mechanical edits |
| routine | `sonnet` | `gpt-6.1-terra` / `high` | Context-aware writing, translation, scoped implementation |
| deep | `opus` | `gpt-6.1-sol` / `medium` | Complex debugging, design decisions, deep review |

MCP `env` values are strings, so pass candidate arrays as JSON strings.

```json
{
  "env": {
    "APTLY_CLAUDE_MODELS": "[\"haiku\", \"sonnet\", \"opus\"]",
    "APTLY_CODEX_MODELS": "[\"gpt-6-luna\", \"gpt-6.1-terra\", \"gpt-6.1-sol\"]"
  }
}
```

When omitted, the defaults above apply; `[]` disables recommendations for that host. Empty strings, duplicates, unsupported models, and invalid JSON are errors. `CLAUDE_MODELS` and `CODEX_MODELS` are aliases, but setting both the primary name and alias for one provider is an error. Candidate settings do not overwrite existing selections or verify account access to models.

`set default` preserves existing candidates, aliases, and pass-through declarations and adds defaults only for missing model families. It does not overwrite inherited Codex candidates even if the current CLI cannot see them. Check final candidates after restarting MCP.

[Installation](installation.md) · [Troubleshooting](troubleshooting.md) · [Guide contents](../en.md)
