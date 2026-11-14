# Installation and updates

[한국어](../ko/installation.md) · **English** · [简体中文](../zh-CN/installation.md) · [日本語](../ja/installation.md)

[Guide contents](../en.md)

## Contents

- [Installation](#guide-installation)
- [Allow npm install scripts](#guide-npm-install-scripts)
- [Package updates](#guide-package-updates)
- [New-version notifications](#guide-version-notifications)
- [Command help (0.1.8+)](#guide-command-help)
- [Skip registration or remove](#guide-skip-and-remove)

<a id="guide-installation"></a>

## Installation

You need Node.js 24 or later, Claude Code or Codex, and an OpenAI API key.

```sh
npm install -g aptly@latest --allow-scripts=aptly
aptly set default
aptly set env OPENAI_API_KEY
aptly --version
```

`set default` registers hosts and asks what information to send to the Decisions API. Enter the key through the hidden prompt; it is stored in the OS credential store. Restart the host and approve the new Hook in Codex `/hooks`.

The install script registers MCP and Hooks in existing host directories. If a directory does not exist, register with `aptly setup --client all`. Accounts using `CODEX_HOME` or `CLAUDE_CONFIG_DIR` must pass the same environment during installation and setup. Existing settings and launcher wrappers are preserved. See [account homes and keys](configuration.md).

<a id="guide-npm-install-scripts"></a>

## Allow npm install scripts

`--allow-scripts=aptly` allows only this installation's `postinstall` and does not change npm's global configuration (verified with npm 11.19.1). If the option is unsupported or you do not want automatic registration, run:

```sh
npm install -g aptly@latest --ignore-scripts
aptly setup --client all
```

Do not infer Hook registration from installation success or `npm warn install-scripts` alone. npm versions or policies may skip the install script. See [npm documentation](https://docs.npmjs.com/cli/v11/commands/npm-rebuild/#allow-scripts).

The install script does not obtain transmission consent. Choose the [transmission scope](transmission.md) later in interactive `aptly setup`, `aptly set default`, or `aptly set transmission --review`.

<a id="guide-package-updates"></a>

## Package updates

Stop the relevant hosts, MCP servers, and CLI processes, then run from a verified global npm installation:

```sh
aptly update
aptly setup --client all
aptly --version
```

`update` installs the latest version in the same npm prefix and preserves settings and keys. It does not run install scripts. Restart the host after setup. On npm errors or local/source installations, use the manual installation command above. npm configuration with `dry-run=true` is rejected.

A stable launcher's preserved copy is separate from the global package. Update it with an [explicit migration](configuration.md#guide-stable-launcher). If the old Node path has disappeared, follow [launcher recovery](troubleshooting.md#guide-launcher-recovery).

<details>
<summary>Upgrade from a pre-0.1.2 ledger</summary>

Stop all older host, MCP, and CLI writers using the same ledger. The new persistent lock cannot be used with older writers. Quarantine old empty locks offline as described in [ledger lock migration](troubleshooting.md#guide-ledger-lock-recovery), and preserve the JSON ledger, unknown entries, costs, and completion cache.

</details>

<a id="guide-version-notifications"></a>

## New-version notifications

The interactive CLI checks for the latest version and reports it on stderr; it does not update automatically. MCP, Hooks, pipes, and CI do not check. Only public npm version information is queried; tasks, keys, and settings are not sent. Results are cached for 24 hours and errors do not fail the original command. To disable this, set `APTLY_NO_UPDATE_NOTIFIER=1` in the execution environment (not through `set env`).

<a id="guide-command-help"></a>

## Command help

```sh
aptly --help
aptly setup -h
aptly set env OPENAI_API_KEY --help
aptly help catalog refresh
```

`--help`, `-h`, and `aptly help <command path>` display usage without reading settings or keys or calling the API. Invalid options and missing option values are errors.

<a id="guide-skip-and-remove"></a>

## Skip registration or remove

```sh
APTLY_SKIP_SETUP=1 npm install -g aptly@latest
aptly setup --client codex --mode defaults
aptly remove --client all
```

`CI` and `--ignore-scripts` also skip automatic registration. `remove` removes only unchanged Aptly-owned entries and preserves user changes. If the result is `partial`, check each host's error. To change modes, remove the registration and register with the desired `--mode`. `advisory` also sends task information when the transmission scope permits it.

[Configuration](configuration.md) · [Troubleshooting](troubleshooting.md) · [Guide contents](../en.md)
