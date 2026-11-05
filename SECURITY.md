# Security

This project recommends a profile for an agent that the host has already decided to create. A recommendation does not grant execution permissions, sandbox access, or MCP access. The host remains responsible for execution and authorization.

## Reporting a vulnerability

Do not put credentials, private task text, conversation transcripts, or personal configuration files in a public issue. If this repository offers **Security → Report a vulnerability**, use that private reporting channel. Otherwise, open a minimal issue requesting a private contact method without including sensitive details. Private reporting availability is not guaranteed by this document.

Include an affected version or commit, a synthetic reproduction, the observed impact, and the expected behavior. Redact credentials and private paths. Do not test against other users' accounts or infrastructure.

## Current support

The project is in early development and has no maintained release series yet. Security fixes target the current development version. Host versions, platforms, and the evidence for compatibility are documented separately; a successful mock test does not establish compatibility with every host version.

## Security boundaries

- The OpenAI key belongs in the MCP server environment or a user-controlled credential mechanism. It must not appear in tool arguments, results, source files, or logs. Host execution uses the host's existing authentication.
- Only the configured OpenAI Decisions endpoint is used for classification. Summaries and the minimum required features leave the local machine in live mode; fixtures do not call the API.
- Explicit model and effort choices, roles, inherited context, and administrator constraints take precedence. Incomplete or uncertain provenance must preserve the original spawn.
- Task content and API responses are data. They cannot expand the trusted catalog, execute commands, collect files, or alter policy.
- A timeout or unknown paid-call outcome must not cause an automatic retry with a new request ID. Metadata ledgers support deduplication and local limits; they are not account-wide billing controls.
- General automatic application remains constrained by verified host contracts. Existing deny decisions must remain effective. Test-only compatibility and synthetic-fixture controls must not certify arbitrary real sessions.
- Local ledgers and diagnostic output may contain profile choices and request metadata. Restrict access, choose an appropriate retention period, and exclude them from Git and release packages. Avoid collecting raw prompts and transcripts.

Default CI and tests must remain free of live API credentials, real agent execution, and private infrastructure dependencies. Any live compatibility experiment needs a bounded synthetic task and separate, explicit authorization.

## Diagnostic reports

The report command creates local, allowlisted Markdown/JSON attachments without network requests or API probes. Key presence is not authentication success. Review attachments and manually submit them only when appropriate; report does not upload or create issues. Do not add sensitive details to the free-text issue fields or use the public bug form for a security incident.
