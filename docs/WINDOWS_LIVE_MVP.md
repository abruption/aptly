# Windows live Codex MVP

This probe checks one path through Aptly 0.1.19 on Windows x64. A signed-in Codex client starts Aptly in Decisions mode, the MCP reads its key from Credential Manager, and a trusted Hook handles one independent child with no explicit model or reasoning effort. The probe uses a synthetic sort task and permits one new Decisions reservation. It fixes the candidate list to GPT-6 Luna to test plumbing. It does not measure recommendation quality.

## Preparation

Use a signed-in Windows desktop terminal with Node 24 or later and Codex 0.171.0. Sign in to Codex with ChatGPT. Install Aptly 0.1.19 into a dedicated npm prefix with lifecycle scripts disabled. Run the installed Aptly CLI's `set default --client codex`. If the Codex Credential Manager item is missing, enter the key through `aptly set env OPENAI_API_KEY --client codex` in the Windows desktop terminal. Review the Aptly PreToolUse Hook in Codex's `/hooks` UI and approve the correct entry.

The probe uses that same Codex home and connection trust. It overrides the Aptly server path, provider, budget, transmission, and request record path for just the new app-server process. It sends only the synthetic task, then removes the temporary policy and request records. It does not copy credentials or change the trust file. Use a profile suitable for testing. Do not include project secrets in the test.

## Run and read the result

Pass absolute paths. Use an output file that does not exist yet.

```powershell
node test-support/windows-live-codex.mjs --preflight $aptlyPackageRoot $codexExe $preflightReport
node test-support/windows-live-codex.mjs --run $aptlyPackageRoot $codexExe $liveReport
```

Run `--run` only after preflight passes. Preflight checks Codex login, the native MCP connection, key loading, the exact trust status, and whether the default Codex state database can be read. Profiles that relocate SQLite with `sqlite_home` or `CODEX_SQLITE_HOME` stop before a live turn. It does not start a model turn. The live run requires one completed Decisions outcome, matching model and effort in the parent-linked child record, and a completed child response. The sanitized JSON reports versions, profile, counts, usage and fixed failure categories. A reservation without a completed outcome is an unknown request. Investigate that result before considering another attempt.

## Windows 10 x64 result

Aptly 0.1.19, Node 24.22.1, and Codex CLI 0.171.0 ran on Windows 10 build 19045 in a signed-in desktop session. The user entered the key locally into Credential Manager. Preflight verified the ChatGPT login, Decisions-mode MCP connection, `os_store` key loading, and the enabled, trusted Aptly routing Hook. Preflight made no Decisions reservation and started no child.

The live probe observed one native `spawn_agent` call with `fork_turns: none` and model and effort omitted. The trusted Hook ran, reserved one Decisions attempt, and blocked with `network`. The request record remained `unknown` with no completed response. No child was observed, and the parent turn completed. The harness removed its temporary state. The attempt was not replayed. The record does not establish whether the API received it.

Later unauthenticated GET probes to `api.openai.com/v1/models` returned HTTP 401 both from Windows Node and from a Node MCP subprocess started by the same Codex version. Those probes confirm reachability at their own times. They neither explain the earlier failure nor verify the key against OpenAI.

The earlier fixture connection is documented in [PR #202](https://github.com/abruption/aptly/pull/202). The Windows MVP verifies startup, key loading, Hook dispatch, and the blocked outcome for this attempt. Recommendation application and child execution remain unverified.
