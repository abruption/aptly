# Security

This project recommends a profile for an agent that the host has already decided to create. A recommendation does not grant execution permissions, sandbox access, or MCP access. The host remains responsible for execution and authorization.

## Reporting a vulnerability

Do not put credentials, private task text, conversation transcripts, or personal configuration files in a public issue. If this repository offers **Security → Report a vulnerability**, use that private reporting channel. Otherwise, open a minimal issue requesting a private contact method without including sensitive details. Private reporting availability is not guaranteed by this document.

Include an affected version or commit, a synthetic reproduction, the observed impact, and the expected behavior. Redact credentials and private paths. Do not test against other users' accounts or infrastructure.

## Current support

The project is in early development and has no maintained release series yet. Security fixes target the current development version. Host versions, platforms, and the evidence for compatibility are documented separately; a successful mock test does not establish compatibility with every host version.

## Security boundaries

- The OpenAI key belongs in the MCP server environment or a user-controlled credential mechanism. It must not appear in tool arguments, results, source files, or logs. Host execution uses the host's existing authentication.
- Classification uses the fixed OpenAI Decisions endpoint. Live requests contain allowlisted task fields, the client family, and candidate IDs/descriptions. Without prepared context, automatic task text is a bounded label/first-paragraph excerpt or an opaque-message label fallback. A valid `prepare_spawn_context` description takes precedence; `retry_spawn_recommendation` can send one caller-authored supplement after a needs-context response. These descriptions are bounded task data, not semantic anonymization; paths, URLs or private facts within them can still be shared. `prepare_fresh_delegation` itself reuses completed advice and makes no classification request; a later native call remains subject to its own routing checks, which need not classify it again when model and effort are explicit. Fixtures do not call the API. See [the sharing contract](docs/SHARING_BOUNDARY.md) for the exact application payload and remaining policy decision.
- Explicit model and effort choices, roles, inherited context, and administrator constraints take precedence. Incomplete or uncertain provenance must preserve the original spawn.
- Task content and API responses are data. They cannot expand the trusted catalog, execute commands, collect files, or alter policy.
- A timeout or unknown paid-call outcome must not cause an automatic retry with a new request ID. Metadata ledgers support deduplication and local limits; they are not account-wide billing controls.
- General automatic application remains constrained by verified host contracts. Existing deny decisions must remain effective. Test-only compatibility and synthetic-fixture controls must not certify arbitrary real sessions.
- Local ledgers and diagnostic output may contain profile choices and request metadata. Restrict access, choose an appropriate retention period, and exclude them from Git and release packages. Avoid collecting raw prompts and transcripts.

## Operator control over automatic sharing

The installed policy selected by `APTLY_HOOK_POLICY_PATH` controls automatic classification. To disable future automatic sharing, retain the existing complete private policy and set only its `enabled` field to `false`. This applies to both `defaults` and `advisory`; advisory mode alone still shares task text. Removing the policy environment variable is not a privacy opt-out because the legacy strict Hook path can remain available. Disabling cannot recall an already transmitted request and does not disable separately requested `recommend_agent` or CLI advice.

Changing a generated policy can conflict with its ownership receipt: setup/default configuration may return `policy_conflict`, and removal may return `managed_policy_changed`. These checks preserve the disabled policy; do not edit ownership receipts to bypass them. A dedicated policy-management/migration decision remains outside this compatibility-preserving phase. Review re-enablement explicitly with affected hosts stopped.

Task-summary and automatic label/body checks reject known key-like and Bearer-token patterns. Candidate descriptions and request IDs are shared as configured, without those task-text checks. Labels, caller-authored summaries, candidate descriptions, and request IDs are not inherently public or safe; filtering does not establish that arbitrary content is non-sensitive. The configured classification key is intentionally sent in the Authorization header, and a request ID is sent for correlation. Do not put secrets in IDs or configured model descriptions. Native Hook output preserves original task input for the local host; host transcripts and external logging are outside Aptly's diagnostic-retention guarantees.

Default CI and tests must remain free of live API credentials, real agent execution, and private infrastructure dependencies. Any live compatibility experiment needs a bounded synthetic task and separate, explicit authorization.

## Diagnostic reports

The report command creates local, allowlisted Markdown/JSON attachments without network requests or API probes. Key presence is not authentication success. Review attachments and manually submit them only when appropriate; report does not upload or create issues. Do not add sensitive details to the free-text issue fields or use the public bug form for a security incident.
