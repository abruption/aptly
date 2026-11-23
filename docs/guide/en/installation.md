# Installation and updates

[한국어](../ko/installation.md) · **English** · [简体中文](../zh-CN/installation.md) · [日本語](../ja/installation.md)

[Guide contents](../en.md)

## Contents

- [Installation](#guide-installation)
- [Verify setup](#guide-verify-setup)
- [Windows PowerShell](#guide-windows-powershell)
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

`set default` registers your hosts and asks what information to send to the Decisions API. The API key stays hidden as you type, and Aptly saves it in the OS credential store. Restart the host after setup. In Codex, approve the new Hook in `/hooks`.

The install script registers MCP and Hooks in host directories that already exist. If a directory is missing, run `aptly setup --client all` to register it.

If you use `CODEX_HOME` or `CLAUDE_CONFIG_DIR`, set the same value for installation and setup. Aptly keeps your existing settings and launcher wrappers. See [account homes and keys](configuration.md).

<a id="guide-verify-setup"></a>

## Verify setup

Check the setup plan and key registration readiness for the selected host. Replace `codex` with `claude` for Claude Code. On Windows PowerShell, use `aptly.cmd`.

```sh
aptly setup --check --client codex
aptly set env OPENAI_API_KEY --client codex --check
```

Both commands leave files unchanged. `setup --check` checks the setup plan at the time you run it. The key check reports registration and Linux store readiness without reading or storing a key or testing API authentication. Use the running host to verify its behavior separately. Exit code `0` means the check found no error. Exit code `1` indicates a partial failure or command error. Inspect each host’s `status` and `codes` in the JSON output.

After setup, restart the host and MCP; in Codex, review and trust the Hook in `/hooks`. [Recommendation and Hook argument updates](routing.md#guide-automatic-routing) are distinct observations; neither proves that a child ran or completed. Check execution and completion separately in the host. See [troubleshooting](troubleshooting.md).

<a id="guide-windows-powershell"></a>

## Windows PowerShell

Open PowerShell on your signed-in Windows desktop and run the following commands. This example uses `npm.cmd` and `aptly.cmd` directly. `--ignore-scripts` skips automatic registration during installation, so run `set default` to register Aptly.

```powershell
npm.cmd install -g aptly@latest --ignore-scripts
aptly.cmd --version
aptly.cmd set default --client codex
aptly.cmd set env OPENAI_API_KEY --client codex
```

For Claude Code, replace `codex` with `claude` in both setup commands. Restart the host. In Codex, open `/hooks` and approve the new Aptly Hook.

If you chose an install location with `--prefix`, use the same location when updating. If PowerShell cannot find `aptly.cmd`, run it using its full path at that location.

Aptly stores the API key in Windows Credential Manager. If the store is unavailable over SSH, register the key from your signed-in desktop. Seeing Aptly in the host’s MCP list confirms registration. Key loading and Decisions API responses need separate checks. See [credential troubleshooting](troubleshooting.md#guide-launcher-recovery) if key registration fails.

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
