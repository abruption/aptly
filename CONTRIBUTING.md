# Contributing

This project is an early implementation of advisory subagent routing for Claude Code and Codex. Changes must preserve explicit user settings, roles, conversation inheritance, permissions, and the original spawn when routing is unavailable or uncertain.

## Issue-first pull requests

Issue and pull request titles and bodies must be written in English. Use a `type(scope): description` title, such as `fix(router): preserve explicit models`, `chore(workflow): update CI`, `feat(catalog): add a profile`, or `docs(readme): clarify installation`. The scope may be empty (`docs(): ...`). The PR policy check validates this title format and the earlier issue reference; maintainers check that descriptions are written in English.

All changes, including documentation, CI, and release metadata, follow this sequence:

1. Create an Issue describing the problem and intended result before opening a PR.
2. Create a separate working branch for that Issue. Do not commit or push changes directly to `main`.
3. Open a PR targeting `main`. Include `Closed #n` in the PR body, replacing `n` with the Issue number, for example `Closed #123`.
4. Describe the resulting behavior and validation, and wait for all required CI checks to pass.
5. Leave the PR open for review. Merge only when the user separately instructs you to do so.

The only issue-first exception is an automated dependency PR whose GitHub-authenticated author is `dependabot[bot]` (a Bot), whose head belongs to this repository, and whose branch is under `dependabot/npm_and_yarn/` or `dependabot/github_actions/`. npm updates may change only the root `package.json` and `package-lock.json`; Actions updates may change only `.github/workflows/*.yml` or `*.yaml`. Removed, renamed, empty, incomplete or oversized (over 100 files) change lists fail closed and require manual handling. The English title format, normal review, required CI and separate merge authorization still apply. Human-authored and other bot PRs keep the earlier-open-issue requirement; labels, body text and the workflow actor cannot grant an exception.

These rules also apply to repository administrators. Do not bypass branch protection, force-push to `main`, or delete `main`. A successful CI run does not authorize a merge, release tag, or npm publication. The linked Issue closes when the PR is merged; opening a PR does not complete the Issue by itself.

## Local development

Use Node.js 24 or 26 and the committed lockfile:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck
npm run build
npm test
npm run check:release
npm run test:package
```

The package smoke check packs the built artifact and installs it into an isolated temporary prefix with setup disabled. It requires npm registry access for runtime dependencies, but no API key or host configuration. Run it through npm so it can invoke npm’s JavaScript entry point with Node rather than executing a Windows `.cmd` file. It verifies the installed CLI, compiled exports, and fixture MCP, then removes its temporary files. On Windows it checks the generated command shim exists and runs the declared compiled CLI target through Node; it does not execute the `.cmd` wrapper.

The default tests use synthetic inputs, deterministic providers, and local stdio MCP subprocesses. They require no OpenAI key or CLI subscription. Do not add live API calls or real host-agent runs to the default test suite or CI.

Tests create owner-only `codex-*` directories and remove only directories they created. Their temporary root follows the workspace volume when developing on a configured external volume; other environments use the operating system temporary directory. `POC_TEST_TMP_ROOT` can select an absolute temporary root. It must remain under the same volume's temporary root when the workspace is on a configured external volume. Persistent-state tests run without optional skips.

## Changes and evidence

- Keep classification and host execution separate. Provider responses may select only trusted catalog profiles.
- Treat task text and MCP arguments as untrusted data. They cannot establish configuration provenance or change routing policy.
- Preserve model and effort pins, fixed roles, fork semantics, and security Hook decisions. Unknown configuration sources must keep the original call.
- Test behavior at the relevant boundary. Mock tests establish policy behavior; actual host metadata establishes model application. Report those evidence levels separately.
- Keep examples synthetic. Never commit real prompts, credentials, transcript paths, vault identifiers, private hostnames, or local reports.
- Update user-facing behavior and compatibility documentation when contracts change. Do not claim quality or cost savings from connectivity tests.

Before opening a change, run the default tests and release-content check. Explain the problem, resulting behavior, validation, and any remaining uncertainty. Keep unrelated cleanup out of the change.

## Releases

Publishing a repository, creating a release, and publishing an npm package are separate actions. Contributors should prepare reviewable changes without publishing or changing users' global MCP and Hook settings. Release checks must inspect the actual packaged file list as well as source files; Git ignore rules alone do not define the public package.

Code contributions are made under the project's MIT license. See the repository license file for its terms.

## Diagnostic attachments

For a bug report, run `node bin/aptly.ts report --format both --output-dir reports`. Review the generated files, attach the JSON through the bug form, and include its report_id. Markdown from the same run is optional. Never attach raw configuration, credentials, or transcripts. See [reporting instructions](docs/REPORTING.md).
