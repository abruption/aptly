# Configuration and model candidates

[한국어](../ko/configuration.md) · [English](../en/configuration.md) · [简体中文](../zh-CN/configuration.md) · [日本語](../ja/configuration.md)

[Guide home](../en.md)

Before configuring, identify `CODEX_HOME` in the environment that launches Codex, or `CLAUDE_CONFIG_DIR` for Claude Code. Pass the same environment to installation, setup and statistics commands to select that account home.

The default home may differ from the account home used by the host. Do not copy policies, ledgers, keys or trust records across homes. Preserve conflicting registrations and `existing_hook_not_owned` cases for review; see [Troubleshooting](troubleshooting.md).

For manual MCP configuration, see [Advanced integration](advanced.md#guide-manual-mcp-setup).

## On this page

- [Configuration file locations](#guide-host-config-locations)
- [Configure with the CLI](#guide-cli-configuration)
- [Keys and restarting](#guide-keys-and-restart)
- [Models and environment variables](#guide-models-and-environment)
- [Node-version-independent launcher](#guide-stable-launcher)

<a id="guide-host-config-locations"></a>

## Configuration file locations

| Host | User registration used by Aptly |
|---|---|
| Codex | `$CODEX_HOME/config.toml`; `~/.codex/config.toml` when `CODEX_HOME` is unset |
| Claude Code | `mcpServers.aptly` in `~/.claude.json`; `.claude.json` inside `CLAUDE_CONFIG_DIR` when that directory is configured |

The post-0.1.14 fix also lets MCP using the `@codex-home` policy select `~/.codex` under the OS user home when `CODEX_HOME` is absent. An explicit absolute path takes precedence; explicitly empty, relative or control-character-containing values remain rejected. Published 0.1.14 still requires the variable to be forwarded even for the default home. Custom account homes are not discovered automatically, so account managers must forward the correct `CODEX_HOME`. If a custom host omits this value, the default home’s policy and transmission scope apply; forward it to preserve account-specific policy.

Claude Code stores Hooks in `~/.claude/settings.json` by default, or `$CLAUDE_CONFIG_DIR/settings.json` when `CLAUDE_CONFIG_DIR` is set. This is separate from MCP registration. If project `.mcp.json`, managed settings, or account-specific directories are in use, check the active entry in `/mcp` before editing or adding a registration.

<a id="guide-cli-configuration"></a>

## Configure with the CLI

From 0.1.11, the first normal interactive `aptly set default` groups pending transmission reviews by client home. The recommendation is `excerpt`; Enter preserves an existing scope or selects `none` if unselected. See [transmission review](transmission.md#guide-transmission-scope). This review flow is not supported in 0.1.10, so update first.

The `set` commands require 0.1.1 or later. Commands do not automatically switch existing launch paths. API-key setup accepts only the current package’s standard Node/server registration with a verified OS-source-compatible runtime. Custom wrappers, older versions, and other installation prefixes are rejected with `credential_launcher_unverified`; explicitly switch the registration or upgrade it before trying again.

```sh
aptly set default
aptly set env APTLY_CODEX_MODELS
aptly set env OPENAI_API_KEY
```

The first command registers Claude Code and Codex and adds missing default environment settings. It preserves existing launch commands, environment whitelists, providers, custom candidates, and advisory policies. The second prompts for a value with hidden input and changes only the named variable. The third stores the API key in the OS credential store and connects it to the selected host at startup. Do not pass values as command arguments.

Both hosts are selected by default. Use `--client codex`, `--client claude`, or `--client all` to select targets. For example, enter a JSON string such as `["haiku","sonnet","opus"]` for Claude candidates.

```sh
aptly set env APTLY_CLAUDE_MODELS --client claude
```

Use explicit `--stdin` for automation. This is a public-variable example; never put a real key in a `printf` command or shell history.

```sh
printf '%s\n' '["gpt-6.1-terra"]' | aptly set env APTLY_CODEX_MODELS --stdin
```

Allowed public keys are `ROUTER_PROVIDER` (`fixture` or `decisions`), `APTLY_CLAUDE_MODELS`, `APTLY_CODEX_MODELS`, `CLAUDE_MODELS`, `CODEX_MODELS`, and `APTLY_MODEL_INFO_PATH`. Candidates must be JSON array strings of supported models. Invalid values, duplicates, and primary-name/alias conflicts are rejected. `[]` disables that host; a model-cache path must be absolute and inside a private directory. Managed ledger and Hook-policy paths cannot be changed through this command.

API keys are stored through macOS Keychain, an installed Linux `secret-tool`, or Windows Credential Manager. The Windows backend uses PowerShell and Win32 Generic credentials in the current-user scope, with a limit of 2,560 UTF-8 bytes. Windows CI verified synthetic key storage, lookup, update and deletion, Unicode paths, isolated host configuration, key references, and ACL preservation. It did not run actual Claude Code or Codex sessions on Windows. Unavailable credential stores return an error; there is no plaintext-file fallback. Keys use separate host accounts, while MCP files contain only `APTLY_SECRET_BACKEND=os` and `APTLY_SECRET_CLIENT` references. Once the OS source is selected, a missing or unreadable key does not silently fall back to another environment key. `set default` preserves existing wrapper/environment authentication; running `set env OPENAI_API_KEY` explicitly selects OS-store authentication.

Results contain host statuses and fixed error codes, never key values. Inspect each host when the result is `partial`. `credential_store_failed` requires checking store access/support; `credential_rollback_failed` requires checking whether the previous key was restored. A failed host restores its old key where possible. Do not interpret success on another host as an atomic success across all hosts.

A store timeout or malformed acknowledgement may occur after the OS has written the new value. On failure, Aptly attempts to restore the previous value (or remove the new entry if none existed), then reads it back. `credential_rollback_failed` is added to the original failure codes when recovery cannot be confirmed; do not assume either key is active. Check the OS credential store before retrying. This is best-effort recovery, not an atomic transaction across processes or hosts.

Restart MCP, then inspect `provider`, candidates, and `credential_status` with `get_routing_capabilities`. `os_store` means a key was loaded, not that the API authenticated it. Default and public-variable setup continue to preserve custom wrappers. API-key setup does not change host settings for an unverified launch path and restores that host's previous key where possible if storage was already attempted. Do not assume a new key automatically takes effect through an existing wrapper. These commands do not bypass Codex `/hooks` trust or host permissions.

<a id="guide-stable-launcher"></a>

## Node-version-independent launcher

This option is available starting with 0.1.14. Explicit `--launcher stable` on POSIX (macOS/Linux) preserves an executable and Aptly runtime dependencies in private storage outside versioned Node directories. It does not copy Node: an installed supported Node.js 24+ is still required. After the original Node and npm package directory disappear, the preserved launcher can locate another supported installation. Bare `node` cannot offer that guarantee when a GUI host lacks it in PATH.

Default/automatic and existing registrations keep direct Node paths. Use `aptly setup --client all --launcher stable` only for new registrations. For existing ones, inspect then migrate explicitly as below. Use `--client claude` for Claude and select the intended `CODEX_HOME` for each Codex account.

```sh
aptly setup --client codex --migrate-launcher --launcher stable --dry-run
aptly setup --client codex --migrate-launcher --launcher stable
```

Add `--include-existing` only after reviewing an eligible preserved standard launcher. Modified/custom launchers and statistics Hooks are never adopted automatically. Migration updates owned MCP and observer targets together, preserving collection state, native metadata consent, keys, policies, ledgers and statistics history. Review new Codex Hooks with `/hooks`; trust is never approved automatically.

Resolution tries the installer Node, standard locations, numeric release directories in the default `~/.nvm/versions/node`, then safe absolute PATH entries. It does not promise the newest Node; symlink/shim-based managers may be rejected even with PATH; only qualified real executable paths are supported. No shell profile, npm or network download runs at startup. Stable mode deliberately removes `NODE_OPTIONS`, `NODE_PATH` and `NODE_REPL_EXTERNAL_MODULE` to avoid inheriting common Node startup overrides; use separate certificate settings such as `NODE_EXTRA_CA_CERTS` when needed. Runtime closures requiring native addons are refused. Missing runtime or failed integrity stops MCP with a fixed error; observers stay silent and best-effort.

Normal global npm installations are the primary supported source. Redirected/writable ancestors and dependencies hoisted outside a local package cannot be verified and are refused. Windows retains direct mode and rejects the stable option. Stable mode remains sticky across later setup/migration without the flag. Run `aptly update` from the actual global npm CLI; explicitly migrate to select a new Aptly snapshot. Remove retains old/shared snapshots because other homes or running processes may still use them. Doctor observes snapshot metadata, not full execution, authentication or reload readiness.

Plain setup does not silently replace an existing snapshot. Older selected versions report `stable_snapshot_outdated` and explicit migration guidance. An exact-owned stable reference can explicitly migrate from a missing, damaged or older-format snapshot to verified source from the current CLI. A corrupt same-generation directory or incomplete lock is never overwritten/deleted automatically: inspect only that state after checking writers and other homes. Modified/custom registration is not adopted as product-owned.

Stable migration updates owned observers together; legacy direct-to-direct migration may still need separate observer refresh (`statistics_observer_migration_required`). Full snapshot checks during setup and startup add I/O overhead. Bounded runtime probes do not provide a hard wall-clock bound for all filesystem operations. This is not a sandbox against same-user programs or worker threads.

<a id="guide-keys-and-restart"></a>

## Keys and restarting

Pass the classification key, `OPENAI_API_KEY`, through a secure environment or credential launcher to the MCP process. It is separate from host subscription login. Never write key values into command arguments, requests, configuration files, source, logs, or temporary files.

<a id="guide-models-and-environment"></a>

## Models and environment variables

There are six default profiles. Tiers are Aptly operational presets, not statements that the two providers' models have equivalent capabilities.

| Tier | Claude Code | Codex | Typical tasks |
|---|---|---|---|
| simple | `haiku` | `gpt-6-luna` / `max` | Extraction, format conversion, or small mechanical edits |
| routine | `sonnet` | `gpt-6.1-terra` / `high` | Context-aware writing or translation, or clearly scoped implementation |
| deep | `opus` | `gpt-6.1-sol` / `medium` | Cross-component debugging, architectural judgment, or in-depth review |

MCP `env` values are strings, so candidate arrays must also be passed as JSON strings.

```json
{
  "env": {
    "APTLY_CLAUDE_MODELS": "[\"haiku\", \"sonnet\", \"opus\"]",
    "APTLY_CODEX_MODELS": "[\"gpt-6-luna\", \"gpt-6.1-terra\", \"gpt-6.1-sol\"]"
  }
}
```

When unset, the defaults above apply; `[]` disables recommendations for that client. Empty strings, duplicates, unsupported models, and malformed JSON are errors. `CLAUDE_MODELS` and `CODEX_MODELS` are supported aliases, but setting both the primary name and its alias for the same provider is an error. Candidate configuration does not override existing choices or certify model access for an account.

`aptly set default` preserves candidates and aliases already in MCP `env`, Codex `env_vars` declarations, and inherited candidates visible to the current CLI for Claude. It adds default candidates only for a model family with neither name configured. A Codex passthrough is preserved even when its value is unavailable in the current terminal; inherited values are not copied into configuration files. The CLI gives a static `env` value precedence over an inherited value with the same name when validating effective settings. Catalog validation remains in place, so conflicting aliases or malformed values reject the configuration change. Check the final candidates in the restarted MCP separately.

## Related topics

[Installation and updates](installation.md) · [Automatic recommendations](routing.md) · [Decisions API transmission](transmission.md) · [Advanced MCP integration and development](advanced.md) · [Troubleshooting](troubleshooting.md)

[Guide home](../en.md)
