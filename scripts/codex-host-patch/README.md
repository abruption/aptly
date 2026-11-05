# Codex provenance capture patch

**On hold (2026-11-05, user decision).** Retained research artifact. Do not continue development, run native validation, or install this patch without an explicit resumption request. It is not a prerequisite for the advisory MCP preview. See [current scope](../../docs/ROADMAP.md).

Base: openai/codex rust-v0.166.0, commit 6ff1e1ca3b30fc8b914720681fcf5fe62e95f856.

This patch observes native child resolver merge stages. It does not install a CLI, expose an MCP tool, enable routing, or provide complete host evidence. See [implementation and validation](../../docs/CODEX_PROVENANCE_PATCH.md).

Verify manifest.json and the patch SHA-256. On a clean checkout of the exact base commit, run git apply --check with provenance-capture.patch before applying it. The project-local development checkout already contains the patch.

Upstream source is licensed under Apache-2.0. UPSTREAM_LICENSE and UPSTREAM_NOTICE preserve the original notices. Modified source files are identified by the patch; newly added provenance capture and regression code is part of this experimental patch.
