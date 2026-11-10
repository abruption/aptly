# Aptly user guide

[한국어](ko.md) · **English** · [简体中文](zh-CN.md) · [日本語](ja.md)

[Back to README](../../README.en.md)

Korean is the canonical documentation. This guide covers general Aptly installation and usage. Package availability does not establish model access for every account. Claude Code or Codex controls native subagent execution, approvals, sandboxing, and MCP permissions.

For a first setup, read **Installation → Configuration → Automatic recommendations**.

## Topics

- [Installation and updates](en/installation.md)
- [Configuration and model candidates](en/configuration.md)
- [Automatic recommendations](en/routing.md)
- [Decisions API transmission](en/transmission.md)
- [Budget limits](en/budget.md)
- [Execution statistics](en/statistics.md)
- [Troubleshooting](en/troubleshooting.md)
- [Advanced MCP integration and development](en/advanced.md)
- [Measured costs](en/benchmarks.md)

## Previous links

Existing bookmark anchors remain available. Select an entry to open its section in the new topic page. This documentation move does not require setup or key re-entry.

<a id="installation"></a>
- [Installation](en/installation.md#guide-installation)
<a id="npm-install-script-approval"></a>
- [npm install-script approval](en/installation.md#guide-npm-install-scripts)
<a id="package-updates"></a>
- [Package updates](en/installation.md#guide-package-updates)
<a id="new-version-notifications"></a>
- [New-version notifications](en/installation.md#guide-version-notifications)
<a id="command-help-018"></a><a id="command-help"></a>
- [Command help (0.1.8+)](en/installation.md#guide-command-help)
<a id="configure-with-the-cli"></a>
- [Configure with the CLI](en/configuration.md#guide-cli-configuration)
<a id="recover-an-incompatible-launcher"></a>
- [Recover an incompatible launcher](en/troubleshooting.md#guide-launcher-recovery)
<a id="keys-and-restarting"></a>
- [Keys and restarting](en/configuration.md#guide-keys-and-restart)
<a id="mcp-environment-setup-step-by-step"></a>
- [MCP environment setup, step by step](en/advanced.md#guide-manual-mcp-setup)
<a id="configuration-file-locations"></a>
- [Configuration file locations](en/configuration.md#guide-host-config-locations)
<a id="passing-the-api-key"></a>
- [Passing the API key](en/advanced.md#guide-key-environment)
<a id="codex-example"></a>
- [Codex example](en/advanced.md#guide-codex-configuration)
<a id="claude-code-example"></a>
- [Claude Code example](en/advanced.md#guide-claude-configuration)
<a id="skipping-registration-and-removing-it"></a>
- [Skipping registration and removing it](en/installation.md#guide-skip-and-remove)
<a id="automatic-hook"></a>
- [Automatic Hook](en/routing.md#guide-automatic-routing)
<a id="confidence-and-abstention"></a>
- [Confidence and abstention](en/routing.md#guide-confidence-and-abstention)
<a id="budget-limits-and-usage-018"></a><a id="budget-limits"></a>
- [Budget limits and usage (0.1.8+)](en/budget.md#guide-budget-limits)
<a id="execution-statistics-0110-or-later"></a><a id="execution-statistics"></a>
- [Execution statistics (0.1.10 or later)](en/statistics.md#guide-execution-statistics)
<a id="decisions-api-transmission-scope"></a><a id="outbound-data-and-disabling-automatic-sharing"></a>
- [Decisions API transmission scope](en/transmission.md#guide-transmission-scope)
<a id="outbound-content-and-filtering-limits"></a>
- [Outbound content and filtering limits](en/transmission.md#guide-transmission-limits)
<a id="explicit-description-for-opaque-spawns-014"></a>
- [Explicit description for opaque spawns (0.1.4+)](en/advanced.md#guide-explicit-spawn-context)
<a id="retry-with-additional-context-015"></a>
- [Retry with additional context (0.1.5+)](en/advanced.md#guide-context-retry)
<a id="automatic-routing-guarantees-and-blocked-outcomes-015"></a>
- [Automatic routing guarantees and blocked outcomes (0.1.5+)](en/routing.md#guide-routing-guarantees)
<a id="prepare-a-separate-independent-delegation-016"></a>
- [Prepare a separate independent delegation (0.1.6+)](en/advanced.md#guide-fresh-delegation)
<a id="direct-recommendations"></a>
- [Direct recommendations](en/advanced.md#guide-direct-recommendations)
<a id="models-and-environment-variables"></a>
- [Models and environment variables](en/configuration.md#guide-models-and-environment)
<a id="official-descriptions-and-caching"></a>
- [Official descriptions and caching](en/advanced.md#guide-model-info-cache)
<a id="providing-context"></a>
- [Providing context](en/advanced.md#guide-context-delivery)
<a id="cost-benchmark"></a>
- [Cost benchmark](en/benchmarks.md#guide-cost-benchmarks)
<a id="interrupted-processes-and-ledger-locks"></a>
- [Interrupted processes and ledger locks](en/troubleshooting.md#guide-ledger-lock-recovery)
<a id="diagnostics-and-development"></a>
- [Diagnostics and development](en/advanced.md#guide-diagnostics-and-development)
