# Windows live Codex MVP

On Windows 10 x64, a signed-in Codex session verified the full path with Aptly 0.1.20. Aptly read its key from Credential Manager, Decisions returned a profile, and an independent child ran with the recommended model and reasoning effort. The earlier 0.1.19 trial stopped at a network error.

The checked-in probe below targets Aptly 0.1.19. It uses a synthetic sort task and permits one new Decisions attempt. The candidate list contains only GPT-6 Luna so the test can trace the recommendation into the child. It does not measure how well Decisions chooses among models.

## Preparation

Use a signed-in Windows desktop terminal with Node 24 or later and Codex 0.171.0. Sign in to Codex with ChatGPT. Install Aptly 0.1.19 into a dedicated npm prefix with lifecycle scripts disabled. Run the installed Aptly CLI's `set default --client codex`. If the Codex Credential Manager item is missing, enter the key through `aptly set env OPENAI_API_KEY --client codex` in the Windows desktop terminal. Review the Aptly PreToolUse Hook in Codex's `/hooks` UI and approve the correct entry.

The probe uses that same Codex home and connection trust. It overrides the Aptly server path, provider, budget, transmission, and request record path for just the new app-server process. It sends only the synthetic task, then removes the temporary policy and request records. It does not copy credentials or change the trust file. Use a profile suitable for testing. Do not include project secrets in the test.

## Run and read the result

Pass absolute paths. Use an output file that does not exist yet.

```powershell
node test-support/windows-live-codex.mjs --preflight $aptlyPackageRoot $codexExe $preflightReport
node test-support/windows-live-codex.mjs --run $aptlyPackageRoot $codexExe $liveReport
```

Run `--run` only after preflight passes. Preflight checks Codex login, the native MCP connection, key loading, the exact trust status, and whether the default Codex state database can be read. Profiles that relocate SQLite with `sqlite_home` or `CODEX_SQLITE_HOME` stop before a live turn. Preflight does not start a model turn. The live run requires one completed Decisions outcome, matching model and effort in the parent-linked child record, and a completed child response. The sanitized JSON reports versions, profile, counts, usage and fixed failure categories. A reservation without a completed outcome is an unknown request. Investigate that result before considering another attempt.

## 0.1.19 trial

Aptly 0.1.19, Node 24.22.1, and Codex CLI 0.171.0 ran on Windows 10 build 19045 in a signed-in desktop session. The user entered the key locally into Credential Manager. Preflight verified the ChatGPT login, Decisions-mode MCP connection, `os_store` key loading, and the enabled, trusted Aptly routing Hook. Preflight made no Decisions reservation and started no child.

The live probe observed one native `spawn_agent` call with `fork_turns: none` and model and effort omitted. The trusted Hook ran, reserved one Decisions attempt, and blocked with `network`. The request record remained `unknown` with no completed response. No child was observed, and the parent turn completed. The harness removed its temporary state. The attempt was not replayed. The record does not establish whether the API received it.

Later unauthenticated GET probes to `api.openai.com/v1/models` returned HTTP 401 both from Windows Node and from a Node MCP subprocess started by the same Codex version. Those probes confirm reachability at their own times. They neither explain the earlier failure nor verify the key against OpenAI.

The earlier fixture connection is documented in [PR #202](https://github.com/abruption/aptly/pull/202). The 0.1.19 trial verified startup, key loading, and Hook execution. It did not verify recommendation application or child execution.

## 0.1.20 follow-up

The Windows 10 build 19045 x64 desktop used Node 24.22.1. The npm package was updated in the existing prefix, and `aptly.cmd --version` reported 0.1.20. Codex CLI 0.171.0 and Claude Code 2.1.311 both connected to the fixture MCP through temporary registrations. Windows Credential Manager was unavailable in the SSH session.

The signed-in desktop trial used a separate 0.1.20 probe derived from the checked-in script and a new synthetic task. The preflight checked the Codex login, Decisions-mode MCP connection, Credential Manager key, trusted Hook, and readable Codex state database.

The Hook handled one independent `spawn_agent` call with model and effort omitted. Decisions made one recommendation, `gpt-6-luna / max`, using 295 input tokens. The initial report did not find the child. A read-only check of the original parent-linked child record confirmed the same model and effort, task completion, and the expected result and marker. We made no additional Decisions requests and did not replay the unknown 0.1.19 request.

This test verified one Codex request from recommendation through child completion on the signed-in desktop. Claude Code was checked with the fixture MCP only. [PR #210](https://github.com/abruption/aptly/pull/210)
