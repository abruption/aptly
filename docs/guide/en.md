# Aptly user guide

[한국어](ko.md) · **English** · [简体中文](zh-CN.md) · [日本語](ja.md)

[Back to README](../../README.en.md)

Korean is the canonical documentation. This guide covers Aptly 0.1.0, published on npm. Package availability does not establish model access for every account. Claude Code or Codex controls native subagent execution, approvals, sandboxing, and MCP permissions.

## Installation

You need Node.js 24 or later and Claude Code or Codex. Specify the npm package and installation location.

```sh
npm install -g aptly@0.1.0
aptly setup --client all --mode defaults
aptly --version
```

The default example installs globally. Confirm that `aptly --version` prints `0.1.0`. Global installation applies to the current Node.js environment; switching Node versions with a version manager may require reinstalling. If permissions prevent installation, use the local alternative below instead of blindly adding administrator privileges.

```sh
npm install --prefix ./aptly-local aptly@0.1.0
./aptly-local/node_modules/.bin/aptly setup --client all --mode defaults
```

For a local installation, use the executable at the path above. To install a local archive, replace `aptly@0.1.0` with `/absolute/path/aptly-0.1.0.tgz`. Do not run TypeScript source directly from an installed `node_modules` directory.

`postinstall` registers the MCP server and a `PreToolUse` Hook in the current user's existing host configuration directories. If you use `CODEX_HOME` or `CLAUDE_CONFIG_DIR`, pass the same environment to installation. Automatic registration skips host directories that do not exist; explicit `setup` can create them. To register only one host, use `--client codex` or `--client claude`.

New registrations set `ROUTER_PROVIDER=decisions`, the Hook's `defaults` policy, and a private ledger for each host. Other settings and Hooks, and existing Aptly commands, environments, providers, and ledger paths, are preserved. Existing fixture settings are not automatically switched to paid mode.

### Keys and restarting

`OPENAI_API_KEY` is the classification key. It is separate from the existing login or subscription authentication used to run subagent models. **Inject it into the MCP process's environment** through your credential store or a secure execution environment. Do not put keys in command arguments, tool arguments, request JSON, MCP configuration JSON, source files, logs, or temporary files. No particular credential store is required.

Start a new host process or restart the MCP server to load registration and environment changes. Changing environment variables in another terminal does not update an already-running GUI or MCP process. **Codex requires you to review and trust the exact new Hook definition through `/hooks`.** The installer does not bypass trust review.

Missing keys and connection, authentication, or timeout errors leave the original call unchanged. Direct Decisions calls require the following environment.

| Environment variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | Classification key injected through a secure execution environment |
| `ROUTER_PROVIDER=decisions` | Uses the actual classification API |
| `ROUTER_LEDGER_PATH` | Absolute ledger path inside a user-owned private directory with mode 700 |

### MCP environment setup, step by step

Install Aptly and run `setup` first, then edit the registered `aptly` entry. The examples below show **partial settings to merge into the existing entry**. Do not overwrite the entire configuration file or remove existing `command`, `args`, `ROUTER_LEDGER_PATH`, or `APTLY_HOOK_POLICY_PATH` values. Automatic registration prepares the ledger and policy paths and their private directories.

#### Configuration file locations

| Host | User registration used by Aptly |
|---|---|
| Codex | `$CODEX_HOME/config.toml`; `~/.codex/config.toml` when `CODEX_HOME` is unset |
| Claude Code | `mcpServers.aptly` in `~/.claude.json`; `.claude.json` inside `CLAUDE_CONFIG_DIR` when that directory is configured |

Claude Code's `~/.claude/settings.json` stores Hooks, not user-scoped MCP registrations. If project `.mcp.json` or managed settings already define the server, check the active entry in `/mcp` instead of adding a duplicate. In apps that use account-specific configuration directories, editing the default home path may not affect the current account.

#### Passing the API key

`OPENAI_API_KEY` is an OpenAI API key, separate from Codex or Claude Code subscription login and npm authentication. For a standard direct launch, provide it in the environment of the process that starts the host. The following example runs **in Bash**, reads the key without displaying it or placing its value in command history, and starts Codex from the same shell. If you use zsh, run `bash` first.

```sh
read -rsp 'OpenAI API key: ' OPENAI_API_KEY
printf '\n'
export OPENAI_API_KEY
codex
```

For Claude Code, replace the final `codex` command with `claude`. The key is passed only to this shell and its child processes; it is not saved permanently. An already-running GUI app does not inherit `export` changes from another terminal. For a GUI launch, use the app's secure environment-passing mechanism or a launcher that reads a credential store. Preserve any existing credential-injection launcher. Do not write the key value directly into configuration JSON, TOML, or shared files.

#### Codex example

Add `OPENAI_API_KEY` to the existing `env_vars` list under `[mcp_servers.aptly]`. Preserve existing entries such as `SSH_AUTH_SOCK`. `env_vars` lists **variable names to forward from the Codex process environment**; the `.env` table supplies **fixed values** to the MCP server. This is a partial entry, not a complete server registration.

```toml
[mcp_servers.aptly]
env_vars = ["OPENAI_API_KEY"]

[mcp_servers.aptly.env]
ROUTER_PROVIDER = "decisions"
APTLY_CLAUDE_MODELS = '["haiku","sonnet","opus"]'
APTLY_CODEX_MODELS = '["gpt-6-luna","gpt-6.1-terra","gpt-6.1-sol"]'
```

Edit the existing tables: appending the same TOML table again can cause an error. Keep the launch command and ledger/Hook policy paths omitted from this example.

#### Claude Code example

Merge these values into the existing `mcpServers.aptly.env` object. This JSON shows only the contents of `env`. Preserve the existing key-reading launcher and ledger/Hook policy paths.

```json
{
  "ROUTER_PROVIDER": "decisions",
  "APTLY_CLAUDE_MODELS": "[\"haiku\",\"sonnet\",\"opus\"]",
  "APTLY_CODEX_MODELS": "[\"gpt-6-luna\",\"gpt-6.1-terra\",\"gpt-6.1-sol\"]"
}
```

For a standard direct-launch registration, you can explicitly connect the key using Claude Code's environment-variable reference syntax. The key must first exist in the environment that starts Claude Code. This example does not store the actual key in the file.

```json
{
  "OPENAI_API_KEY": "${OPENAI_API_KEY}"
}
```

This last entry is optional for a standard direct-launch registration. Do not add it indiscriminately to an entry that uses a separate credential launcher. If the referenced variable is missing, the correct key will not be passed and the reference text itself may remain unexpanded.

#### Which values should you change?

| Setting | Action for normal use |
|---|---|
| `OPENAI_API_KEY` | Provide it in the host environment for a standard direct launch. Preserve the existing method when using a credential launcher |
| `ROUTER_PROVIDER` | `decisions` for actual classification; `fixture` for free synthetic tests |
| `ROUTER_LEDGER_PATH`, `APTLY_HOOK_POLICY_PATH` | Keep the values created by `setup` |
| `APTLY_CLAUDE_MODELS`, `APTLY_CODEX_MODELS` | Leave unset to use defaults. Set them only to restrict candidates |
| `APTLY_MODEL_INFO_PATH` | Set only when explicitly refreshing and using the official model-information cache |

Candidate arrays are always **JSON strings**. Escaped quotes in JSON configuration and single-quoted TOML strings pass the same value. `[]` disables recommendations for that host. Creating a project `.env` file alone does not apply these settings. Aptly does not automatically load `.env`; it reads the environment supplied when the MCP server starts.

After saving, restart the host or MCP server. Check the `aptly` connection in `/mcp`, then use `get_routing_capabilities` to inspect `provider: decisions`, the candidate list, and `automatic_hook.mode`. This free status query does not validate the API key. An actual `recommend_agent` request may incur a classification charge. For `unavailable`/`unauthorized`, check key forwarding; for `needs_context`, check the task summary. Do not print keys or the full configuration to logs.

See the official [Codex configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference) and [Claude Code MCP guide](https://code.claude.com/docs/en/mcp) for configuration locations and environment forwarding.

### Skipping registration and removing it

```sh
APTLY_SKIP_SETUP=1 npm install --prefix "$aptly_install" aptly@0.1.0
aptly setup --client codex --mode defaults
aptly remove --client all
```

A `CI` environment or npm `--ignore-scripts` also skips automatic registration. You can register explicitly with `setup`. The `advisory` mode passes recommendations without changing arguments. To change policy, remove the existing registration, then register again with the desired `--mode`. For a `partial` result, check the error codes for each client. Removal only targets entries that match Aptly's ownership records; it preserves user changes and reports conflicts.

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
