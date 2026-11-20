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

Run `--run` only after preflight passes. Preflight checks Codex login, the native MCP connection, key loading, and the exact trust status. It does not start a model turn. The live run requires one completed Decisions outcome, matching model and effort in the parent-linked child record, and a completed child response. The sanitized JSON reports versions, profile, counts, usage and fixed failure categories. A reservation without a completed outcome is an unknown request. Investigate that result before considering another attempt.

## Current evidence

The Windows 10 x64 desktop's native Codex fixture connection passed in [PR #202](https://github.com/abruption/aptly/pull/202). Its SSH process was in session 0 while Explorer was in session 2. Codex reported a ChatGPT login, but Aptly's Codex MCP and Hook were absent in the default home. A limited, read-only interactive Scheduler probe returned Windows error `0x80070005` (access denied) and was removed. This does not establish whether the Windows desktop Credential Manager contains an Aptly key. No live Decisions requests or child turns have been made for this MVP.
