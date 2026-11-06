# Aptly user guide

[한국어](ko.md) · **English** · [简体中文](zh-CN.md) · [日本語](ja.md)

[Back to README](../../README.en.md)

Korean is the canonical documentation. This guide covers general Aptly installation and usage. Package availability does not establish model access for every account. Claude Code or Codex controls native subagent execution, approvals, sandboxing, and MCP permissions.

## Installation

Requires Node.js 24 or later and Claude Code or Codex. Install the latest stable npm release globally:

**Before upgrading an existing persistent ledger to 0.1.2 or later**, stop every host, MCP server, standalone CLI, and older process that can access it. The persistent gate cannot coexist with older writers. Fresh installations need no legacy-lock quarantine. If an old empty lock remains, follow the [ledger transition procedure](#interrupted-processes-and-ledger-locks): quarantine only a confirmed legacy lock while offline and preserve the JSON ledger, `unknown` records, costs, and completed cache.

```sh
npm install -g aptly@latest
aptly setup --client all --mode defaults
aptly --version
```

Use `aptly --version` to check the installed version. Switching Node.js environments may require reinstalling.

`postinstall` registers the MCP server and a `PreToolUse` Hook in the current user's existing host configuration directories. If you use `CODEX_HOME` or `CLAUDE_CONFIG_DIR`, pass the same environment to installation. Automatic registration skips host directories that do not exist; explicit `setup` can create them. To register only one host, use `--client codex` or `--client claude`.

New registrations set `ROUTER_PROVIDER=decisions`, the Hook's `defaults` policy, and a private ledger for each host. Other settings and Hooks, and existing Aptly commands, environments, providers, and ledger paths, are preserved. Existing fixture settings are not automatically switched to paid mode.

### Package updates

`aptly update` is added in this follow-up source build and is **absent from npm 0.1.2**. It requires a verified global npm installation and installs `aptly@latest` into the same verified prefix as the running package. Local installations, source checkouts, and unverified paths are rejected.

Stop other host, MCP, and CLI processes using the ledger before updating, following the transition steps above. The command skips lifecycle scripts; explicitly configure afterward and restart hosts:

```sh
aptly update
aptly setup --client all --mode defaults
aptly --version
```

Existing MCP launchers and user wrappers are not automatically migrated. Follow the launcher recovery instructions below if old paths remain. Key setup and Codex `/hooks` trust review remain separate. For npm authentication, network, or permission failures, use the manual installation instructions. Updates are never installed automatically.

### New-version notifications

This follow-up source build checks the latest stable version during interactive human-facing CLI commands and suggests `aptly update` on stderr when a newer version exists. **npm 0.1.2 does not include this notification.** All three standard streams must be terminals. MCP serving, automatic setup, recommendation/classification paths, pipes, and CI skip checks. JSON stdout and MCP/Hook payloads stay unchanged.

Only public Aptly version metadata is requested from the npm registry; no key, task summary, or host configuration is sent. Network and body reads are limited to 800ms and 16KiB. Results are cached at `~/.cache/aptly/update-check.json` for 24 hours, with a one-hour cooldown after failure. Network/cache errors cannot fail the requested command. Set `APTLY_NO_UPDATE_NOTIFIER=1` in the CLI environment to disable checks; it is not a supported key for `aptly set env`. Notifications never install updates.

### Configure with the CLI

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

### Recover an incompatible launcher

These options require Aptly 0.1.2 or later and are not in npm 0.1.1. To test from source, run `npm ci --ignore-scripts` and `npm run build`, then replace `aptly` below with `node bin/aptly.ts`.

Key setup diagnoses selected hosts before input or storage. If any host fails, it does not prompt or change any host. `--check` does not access keys or the credential store. `credential_node_mismatch`, `credential_server_mismatch`, and `credential_runtime_unsupported` identify incompatible Node paths, server paths, and OS-store support respectively.

If only Claude failed, diagnose that host and review migration only when `launcher_migration_available` is returned:

```sh
aptly set env OPENAI_API_KEY --client claude --check
aptly setup --client claude --migrate-launcher --dry-run
aptly setup --client claude --migrate-launcher
aptly set env OPENAI_API_KEY --client claude
```

`--dry-run` makes no changes. Migration replaces the Node/server paths of a receipt-matching, Aptly-owned standard registration with the current build. It preserves environment settings, Hooks, policy and other hosts, accesses no credentials, and never executes the old launcher. Custom wrappers and missing or modified ownership records are rejected. Review such registrations locally; use the wrapper's secure environment or a separately reviewed standard registration. Do not edit or delete ownership records to bypass validation.

A successful Codex configuration needs no reset. Retry only the affected host and restart MCP. Codex still requires `/hooks` trust review. Changes after diagnosis stop with `concurrent_configuration_change`. If recovery observes another key or cannot read the current key, it leaves the store unchanged and reports `credential_rollback_failed`. Files and the OS store do not form an atomic transaction; avoid concurrent configuration operations.

### Keys and restarting

Pass the classification key, `OPENAI_API_KEY`, through a secure environment or credential launcher to the MCP process. It is separate from host subscription login. Never write key values into command arguments, requests, configuration files, source, logs, or temporary files.

### MCP environment setup, step by step

Run `setup`, then merge the examples below into the existing `aptly` registration. Preserve `command`, `args`, credential launchers, `ROUTER_LEDGER_PATH`, and `APTLY_HOOK_POLICY_PATH`. Setup creates the private ledger/policy directories; a manual ledger path must be absolute and inside a user-owned directory with mode 700.

#### Configuration file locations

| Host | User registration used by Aptly |
|---|---|
| Codex | `$CODEX_HOME/config.toml`; `~/.codex/config.toml` when `CODEX_HOME` is unset |
| Claude Code | `mcpServers.aptly` in `~/.claude.json`; `.claude.json` inside `CLAUDE_CONFIG_DIR` when that directory is configured |

Claude Code stores Hooks in `~/.claude/settings.json` by default, or `$CLAUDE_CONFIG_DIR/settings.json` when `CLAUDE_CONFIG_DIR` is set. This is separate from MCP registration. If project `.mcp.json`, managed settings, or account-specific directories are in use, check the active entry in `/mcp` before editing or adding a registration.

#### Passing the API key

For a direct launch, enter the key in **Bash** without displaying or saving its value, then start the host from that shell. In zsh, run `bash` first:

```sh
read -rsp 'OpenAI API key: ' OPENAI_API_KEY
printf '\n'
export OPENAI_API_KEY
codex
```

Replace `codex` with `claude` for Claude Code. This does not save the key permanently. A running GUI does not inherit another terminal’s environment; use its secure environment mechanism or preserve the existing credential launcher.

#### Codex example

Edit the existing `[mcp_servers.aptly]` tables; do not append duplicate tables. Add `OPENAI_API_KEY` to `env_vars` without removing existing entries. `env_vars` forwards named host variables; `.env` supplies fixed MCP values.

```toml
[mcp_servers.aptly]
env_vars = ["OPENAI_API_KEY"]

[mcp_servers.aptly.env]
ROUTER_PROVIDER = "decisions"
APTLY_CLAUDE_MODELS = '["haiku","sonnet","opus"]'
APTLY_CODEX_MODELS = '["gpt-6-luna","gpt-6.1-terra","gpt-6.1-sol"]'
```

#### Claude Code example

Merge these values into the existing `mcpServers.aptly.env` object:

```json
{
  "ROUTER_PROVIDER": "decisions",
  "APTLY_CLAUDE_MODELS": "[\"haiku\",\"sonnet\",\"opus\"]",
  "APTLY_CODEX_MODELS": "[\"gpt-6-luna\",\"gpt-6.1-terra\",\"gpt-6.1-sol\"]"
}
```

For direct launches, this optional reference forwards a key already present in the Claude Code environment. Do not add it to a credential-launcher setup. If the variable is missing, the key will not be supplied and the reference may remain unexpanded:

```json
{
  "OPENAI_API_KEY": "${OPENAI_API_KEY}"
}
```

Model candidates are **JSON strings**: leave them unset for defaults or use `[]` to disable that host’s recommendations. Aptly reads the MCP startup environment and does not load project `.env` files.

Restart the host or MCP server after changes. **In Codex, review and trust the new Hook through `/hooks`.** Check `/mcp` and `get_routing_capabilities` for `provider`, candidates, and `automatic_hook.mode`. This free query does not authenticate the key; `recommend_agent` may incur a charge. For `unauthorized`, check key forwarding; for `needs_context`, check the task summary.

See the official [Codex configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference) and [Claude Code MCP guide](https://code.claude.com/docs/en/mcp) for configuration locations and environment forwarding.

### Skipping registration and removing it

```sh
APTLY_SKIP_SETUP=1 npm install -g aptly@latest
aptly setup --client codex --mode defaults
aptly remove --client all
```

`CI` or npm `--ignore-scripts` also skips registration. Use `setup` to register later. To change mode, remove the registration and run setup with the desired `--mode`; `advisory` only supplies advice. For `partial`, check each host’s error codes. Removal preserves user-modified entries and reports conflicts.

## Automatic Hook

Connected, eligible calls automatically pass through `route_spawn_hook` → Decisions. The `defaults` policy lets an operator authorize Aptly's choice to take precedence over host defaults within this scope. It is not a claim that all host configuration sources have been observed.

| Host | Calls eligible for automatic selection |
|---|---|
| Codex | Fresh, general-purpose calls with no explicit model, effort, fixed role, or resume target, and `fork_turns: "none"` |
| Claude Code | Calls with `subagent_type: "general-purpose"` and no explicit model, effort, fixed role, resume target, or inherited history |

Explicit choices, roles, fork and resume settings, approvals, sandboxing, and MCP permissions are preserved. Fixture results never automatically change the default model. Insufficient context, unsupported responses, cancellation, or a changed call preserve the original arguments. Each call is bound to its input, policy, and catalog, and checked again after an asynchronous response.

The CLI without additional configuration, and existing manual configurations, default to fixture / shadow. The older host-evidence-based path without an automatic policy is distinct from the installed default-selection policy. Host-internal patches remain on hold and are not a prerequisite for direct recommendations.

| MCP tool | Purpose |
|---|---|
| `get_routing_capabilities` | Lists candidates, limits, provider, and Hook status without a paid API call |
| `recommend_agent` | Returns a direct recommendation for a task summary |
| `get_routing_precedence` | Explains preserved choices and unverified configuration sources for a call |
| `route_spawn_hook` | Selects defaults for eligible calls or passes advice only, according to the installed policy |

### Outbound data and disabling automatic sharing

For automatic classification, `summary` is an **excerpt assembled from an accepted task label and the clipped first paragraph** of the body. It is not a semantic rewrite or anonymization. Its UTF-8 size is at most `min(4000, max_summary_bytes)`; this is not a limit on the whole HTTP request. The opaque-message fallback in Codex uses only a sufficiently descriptive `task_name`, without decoding or transmitting that body. Labels can also contain sensitive information.

Decisions receives `client`, `task.summary`, `task.operation`, `task.context_sufficient`, candidate profile IDs, model/effort descriptions, and configured model facts. The classification API key is sent in `Authorization`; the request ID is sent in `X-Client-Request-Id`. Automatic IDs are hashes; direct recommendation IDs are caller-supplied. Do not put secrets in IDs or candidate descriptions.

To disable automatic sharing, change **only `enabled` to `false`** in the existing private policy file referenced by `APTLY_HOOK_POLICY_PATH`. Preserve the other fields and ownership record. Subsequent automatic Hook calls preserve the original call before classification or creation of a call-binding file. This cannot undo a transmission already started or recall information received by the server. Editing a generated policy can cause ownership conflicts in setup, configuration, or removal commands; those commands do not overwrite the disabled policy. Do not edit ownership records to bypass the checks.

`mode: advisory` still transmits classification data; it is not a privacy opt-out. Removing `APTLY_HOOK_POLICY_PATH` can activate the older strict path, so do not use removal as an alternative. `enabled: false` does not block explicit `recommend_agent` or `aptly recommend` requests.

For control over the shared summary, disable automatic sharing and write only the information needed for a direct recommendation. Aptly does not automatically fetch documents at URLs or attach source files mentioned in the summary. Checks for known key and Bearer patterns do not provide complete secret detection or establish that text is safe to transmit.

The ledger and Hook bindings store request metadata, hashes, and cached results, not task excerpts. Aptly diagnostics also exclude raw task text. The local Hook's `updatedInput` retains the original task so the host can continue execution. Aptly does not control the host's own transcript or log retention.

## Direct recommendations

The `recommend_agent` MCP tool and CLI `recommend` accept a task summary and recommend a profile. They do not spawn subagents. Pass this JSON as MCP tool arguments, or save it to a file and provide it to the CLI through standard input.

```json
{
  "request_id": "demo-codex-sort-001",
  "client": "codex",
  "task": {
    "summary": "Sort the supplied numbers [3, 1, 2] into ascending order. No files or network are needed.",
    "operation": "analysis",
    "context_sufficient": true
  }
}
```

```sh
ROUTER_PROVIDER=fixture aptly recommend < request.json
aptly capabilities
aptly config codex
aptly config claude
```

Fixture returns test results generated by local rules without a key, network access, or subagent execution. These are not actual Decisions judgments or quality-test results. `config` only prints a manual MCP registration fragment; `setup` changes configuration. For actual API use, prepare the key, provider, and private ledger described above.

`task.operation` is one of `read_only`, `write`, `review`, or `analysis`. `context_sufficient` means the caller has provided the summary needed for the task; it does not verify host settings. Omitting `eligible_profile_ids` uses the active catalog for that client; specifying it narrows candidates within that catalog.

If any of `model_pinned`, `effort_pinned`, `role_pinned`, or `fork_inherits` in `constraints` is true, the existing selection is preserved. Omitting these means no preservation constraints were declared for this planning request. It does not certify that the actual host has no pins. Do not use `provenance_verified` in new requests.

| status | Next action |
|---|---|
| `recommended` | Review `profile` and decide separately whether to execute it in the existing host |
| `keep_current` | Preserve the explicit selection or defer the recommendation |
| `needs_context` | Supply the necessary summary details |
| `unavailable` | Check the predefined `reason` code. Do not automatically retry a paid request with an unknown outcome under a new ID |

The direct recommendation's `application: advisory_only` does not verify host settings or model access, or authorize execution. To retrieve a completed result again, keep the same ID, input, policy, and ledger. `unknown` means the outcome is uncertain; do not blindly retry with a new ID. A new request whose input has changed because context was added uses a different ID.

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

### Official descriptions and caching

Decisions choices include the model name, Codex effort, official characteristics, and task-tier descriptions. Bundled descriptions are available at startup; documentation is not fetched on every recommendation. Refresh explicitly to incorporate the latest official Markdown. First create a private directory you own for the output file.

```sh
mkdir -m 700 /absolute/private-aptly-state
aptly catalog refresh --output /absolute/private-aptly-state/model-info.json
export APTLY_MODEL_INFO_PATH=/absolute/private-aptly-state/model-info.json
```

Refresh only reads the fixed [Claude model documentation](https://code.claude.com/docs/en/model-config.md) and [OpenAI model documentation](https://learn.chatgpt.com/docs/models.md), and requires no API key. It stores short, normalized model information and preserves the existing file on failure. The cache is read at startup; an invalid cache or one older than 7 days falls back to bundled descriptions. Restart MCP after refreshing. New models appearing in documentation are not automatically added to candidates, and account access is not certified.

## Providing context

When Codex passes a subagent `message` to the Hook as ciphertext, Aptly does not read or decrypt its body. It uses only a sufficiently descriptive plaintext `task_name` as a summary. Describe the task and its scope, for example `sort_supplied_numbers_3_1_2_ascending_without_tools`. Short or ambiguous names preserve the original model. Claude Code calls and calls that expose a plaintext body use a summary of the provided body.

Use `automatic_hook.last_result` in `get_routing_capabilities` to check the last application or preservation reason for that MCP process. `null` means it has not yet processed an automatic Hook call. Task bodies and personal configuration values are not returned.

For direct recommendations, you can include repository and file URLs alongside a summary of the scope, size, and constraints derived from reading the documents. Sending a URL string differs from providing document contents. Aptly's classification request code does not fetch repository URLs or retrieve their contents. The caller performs any required retrieval and summarization.

The current automatic Hook has no field for passing a URL separately as plaintext. Do not assume that adding a URL to an encrypted `message` forwards it for classification. Direct MCP recommendation followed by passing the profile as native arguments is distinct from automatic Hook application.

## Cost benchmark

On 2026-11-05, the [English session-peer README](https://github.com/abruption/session-peer/blob/6e9efda7588e1df638748eeb7ad1b2707e0a3bf4/README.md) was used as the canonical source for reviewing its [Korean translation](https://github.com/abruption/session-peer/blob/6e9efda7588e1df638748eeb7ad1b2707e0a3bf4/README.ko.md). Each run received the same documents, totaling 17,964 bytes, and the same instructions to produce six suggested edits. The original files were not changed.

All three automatic Hook trials supplied with only the task name abstained with `needs_context`. Three `recommend_agent` requests with repository/file URLs, and three with URLs plus a document summary, all recommended Terra/high. The per-run averages below compare three actual Terra/high runs using the URL-plus-summary condition with the three immediately preceding Sol/high runs.

| Standard API cost conversion | Sol/high | Terra/high + classification | Reduction |
|---|---:|---:|---:|
| Observed cache usage included | $0.03229 | $0.01354 | 58.05% |
| All input priced as uncached | $0.11254 | $0.05363 | 52.35% |

These are USD conversions of measured native tokens at the [official Standard API rates](https://developers.openai.com/api/docs/pricing). They are not actual subscription invoices or measured quota deductions. The Terra figures include the [Decisions classification cost](https://developers.openai.com/api/docs/guides/decisions), $0.0000756 per run. The comparison covers the reviewing subagent and classification; document retrieval, context preparation, and main-agent research costs are excluded.

The measured workflow was **explicit MCP recommendation → native execution with the recommended profile passed as arguments**. It did not test automatic Hook URL retrieval or forwarding. The prior benchmark was reused as the control, with three samples per condition. Full-document reads, matching source quotes, and output structure were checked, but the results do not establish equal quality, statistical significance, or savings for other tasks.

### Interrupted processes and ledger locks

This locking design requires Aptly `0.1.2` or later and is not included in npm `0.1.1`. The JSON ledger keeps its request IDs, `unknown` records, completed cache, call counts, and reserved costs. Only persistent ledgers use Node.js 24's built-in SQLite. The adjacent `ledger.json.lock` remains after a normal exit; its presence alone does not mean an active lock. With the new design, process exit releases the OS lock so a later request can use the same ledger. It does not retry an existing uncertain ID or refund reserved costs.

Keep the ledger and lock in a private directory on a local filesystem that supports hard links, and use one canonical path for each ledger. Network shares, cloud-synced directories, and path aliases are outside the supported scope. Do not delete or replace the new lock or SQLite journal, or open them with another database tool while in use. Age and PID alone do not establish that an owner has exited.

An old empty `.lock` cannot establish whether its owner is still alive, so it is never initialized or removed automatically. Stop every relevant host, MCP process, and ledger-accessing process, including older versions, and upgrade all writers. Only after confirming that the file belongs to the legacy locking design may you quarantine that file and restart against the same JSON ledger path. Do not reset or delete the ledger, `unknown` records, costs, or completed results. If ownership or format is uncertain, leave access blocked and investigate.

## Diagnostics and development

```sh
aptly report --format both --output-dir reports
```

`report` creates private Markdown and JSON files with the same ID. Review them before sharing manually; they are not uploaded automatically. Do not include keys, personal paths, environment values, task bodies, or raw errors in attachments. A report does not establish successful API authentication or verification of the host's full configuration.

Use the following commands in a source checkout. Distinguish their paths from the installed CLI examples above.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck
npm run build
ROUTER_PROVIDER=fixture node bin/aptly.ts recommend < examples/recommend.codex.json
ROUTER_PROVIDER=fixture node bin/aptly.ts recommend < examples/recommend.claude.json
npm test
npm run poc
npm run check:release
```

Default regression tests and fixture smoke tests run without paid APIs or actual subagents. Release checks inspect public files, private-data patterns, and the npm file allowlist; they do not publish or push to Git. The ledger supports completed-result reuse, prevention of retries for unknown outcomes, and guards on calls, latency, and estimated cost. It is not an actual billing cap.

Design notes, historical validation, and development history remain in other source-checkout documents. This multilingual guide is the reference for installation and everyday use; it does not turn historical research claims or unimplemented plans into current features.
