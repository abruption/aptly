# Installation and updates

[한국어](../ko/installation.md) · [English](../en/installation.md) · [简体中文](../zh-CN/installation.md) · [日本語](../ja/installation.md)

[Guide home](../en.md)

## On this page

- [Installation](#guide-installation)
- [npm install-script approval](#guide-npm-install-scripts)
- [Package updates](#guide-package-updates)
- [New-version notifications](#guide-version-notifications)
- [Command help (0.1.8+)](#guide-command-help)
- [Skipping registration and removing it](#guide-skip-and-remove)

<a id="guide-installation"></a>

## Installation

Requires Node.js 24 or later and Claude Code or Codex. Install the latest stable npm release globally:

**Before upgrading an existing persistent ledger to 0.1.2 or later**, stop every host, MCP server, standalone CLI, and older process that can access it. The persistent gate cannot coexist with older writers. Fresh installations need no legacy-lock quarantine. If an old empty lock remains, follow the [ledger transition procedure](troubleshooting.md#guide-ledger-lock-recovery): quarantine only a confirmed legacy lock while offline and preserve the JSON ledger, `unknown` records, costs, and completed cache.

```sh
npm install -g aptly@latest --allow-scripts=aptly
aptly set default
aptly --version
```

Use `aptly --version` to check the installed version. Switching Node.js environments may require reinstalling.

`postinstall` registers the MCP server and a `PreToolUse` Hook in the current user's existing host configuration directories. If you use `CODEX_HOME` or `CLAUDE_CONFIG_DIR`, pass the same environment to installation. Automatic registration skips host directories that do not exist; explicit `setup` can create them. To register only one host, use `--client codex` or `--client claude`.

New registrations set `ROUTER_PROVIDER=decisions`, the Hook's `defaults` policy, and a private ledger for each host. Other settings and Hooks, and existing Aptly commands, environments, providers, and ledger paths, are preserved. Existing fixture settings are not automatically switched to paid mode.

<a id="guide-npm-install-scripts"></a>

## npm install-script approval

The installation command above uses `--allow-scripts=aptly` to explicitly allow Aptly's `postinstall` for that installation. Support was checked with npm 11.19.1; the command does not change user-wide npm approval settings. See the [official npm guidance](https://docs.npmjs.com/cli/v11/commands/npm-rebuild/#allow-scripts).

`npm warn install-scripts ... not yet covered by allowScripts` reports an unreviewed policy entry. In npm 11.19.1, this warning alone does not mean scripts were blocked. Behavior depends on npm version, strict policy, and `ignore-scripts`; installation success alone does not verify MCP or Hook registration. npm may hide postinstall output.

For npm versions without this option, or to configure explicitly instead of automatic registration, run:

```sh
npm install -g aptly@latest --ignore-scripts
aptly setup --client all
```

Transmission review is available from 0.1.11 and does not prompt during npm lifecycle installation. When upgrading from 0.1.10, update the package first, then run interactive `aptly setup`, `aptly set default`, or `aptly set transmission --review` with the same account environment. The update process does not perform the new review or imply consent; see [transmission review](transmission.md#guide-transmission-scope).

Explicit `setup` works regardless of lifecycle execution. It preserves existing launchers; use the [launcher recovery steps](troubleshooting.md#guide-launcher-recovery) for stale paths. Key setup, MCP restart, and Codex `/hooks` trust review remain separate steps.

The 0.1.11 or later installer writes only a stderr instruction to run `aptly set transmission --review` when setup completes successfully and registered clients have reviews pending; it does not ask a question or record a choice.

<a id="guide-package-updates"></a>

## Package updates

`aptly update` requires **Aptly 0.1.3 or later**. It requires a verified global npm installation and installs `aptly@latest` into the same verified prefix as the running package. Local installations, source checkouts, and unverified paths are rejected. If the effective npm configuration has `dry-run=true`, the command refuses with `update_dry_run_enabled` before starting installation. If configuration cannot be verified, it stops with `update_configuration_unverified`. A dry-run is never reported as a successful update.

Stop other host, MCP, and CLI processes using the ledger before updating, following the transition steps above. The command skips lifecycle scripts; explicitly configure afterward and restart hosts:

```sh
aptly update
aptly setup --client all
aptly --version
```

Existing MCP launchers and user wrappers are not automatically migrated. Follow the [launcher recovery instructions](troubleshooting.md#guide-launcher-recovery) if old paths remain. Key setup and Codex `/hooks` trust review remain separate. For npm authentication, network, or permission failures, use the manual installation instructions. Updates are never installed automatically.

<a id="guide-version-notifications"></a>

## New-version notifications

**Aptly 0.1.3 or later** checks the latest stable version during interactive human-facing CLI commands and suggests `aptly update` on stderr when a newer version exists. All three standard streams must be terminals. MCP serving, automatic setup, recommendation/classification paths, pipes, and CI skip checks. JSON stdout and MCP/Hook payloads stay unchanged.

Only public Aptly version metadata is requested from the npm registry; no key, task summary, or host configuration is sent. Network and body reads are limited to 800ms and 16KiB. Results are cached at `~/.cache/aptly/update-check.json` for 24 hours, with a one-hour cooldown after failure. Network/cache errors cannot fail the requested command. Set `APTLY_NO_UPDATE_NOTIFIER=1` in the CLI environment to disable checks; it is not a supported key for `aptly set env`. Notifications never install updates.

<a id="guide-command-help"></a>

## Command help (0.1.8+)

Consistent per-command and nested help is supported from Aptly 0.1.8. Use these forms:

```sh
aptly --help
aptly setup -h
aptly set default --help
aptly set env OPENAI_API_KEY --help
aptly budget status --help
aptly help catalog refresh
```

`--help`, `-h` and `aptly help <command path>` only show usage. They do not read settings, supplied files, stdin or credential stores; prompt; change settings; call APIs or model metadata endpoints; install/update; or run update notifications. Help can follow valid options, but unknown paths/options, invalid supplied values and contradictory option combinations remain errors. Required positional arguments may be omitted to discover usage. A form such as `--output --help` is a missing option value, not a help request that supplies an output path.

<a id="guide-skip-and-remove"></a>

## Skipping registration and removing it

```sh
APTLY_SKIP_SETUP=1 npm install -g aptly@latest
aptly setup --client codex --mode defaults
aptly remove --client all
```

`CI` or npm `--ignore-scripts` also skips registration. Use `setup` to register later. To change mode, remove the registration and run setup with the desired `--mode`; `advisory` only supplies advice. For `partial`, check each host’s error codes. Removal preserves user-modified entries and reports conflicts.

## Related topics

[Configuration and model candidates](configuration.md) · [Troubleshooting](troubleshooting.md)

[Guide home](../en.md)
