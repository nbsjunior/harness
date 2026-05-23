# Security Policy

## Supported versions

| Version | Security fixes |
|---------|---------------|
| 0.2.x | ✅ Active |
| < 0.2 | ❌ No longer supported |

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Send a report to: **security@nbsjunior.dev** (or use [GitHub Private Security Advisories](https://github.com/nbsjunior/todd/security/advisories/new)).

Include:
1. Description of the vulnerability
2. Steps to reproduce
3. Potential impact
4. (Optional) Suggested fix

You will receive a response within **72 hours**. We aim to release a patch within **14 days** of confirmation.

## Scope

Todd of AIDLC handles API keys and tokens for external AI providers. In scope:

- Hardcoded secrets or tokens in source code
- Token leakage via IPC, logs, or telemetry
- Privilege escalation via the CLI daemon subprocess
- Malicious `.toddspect/config.yaml` or spec files leading to code execution

Out of scope:
- Security of third-party AI provider APIs (Copilot, Claude, Cursor, etc.)
- Issues in vendored AI-DLC rules not introduced by this project

## Token / secret handling model

Todd of AIDLC stores API tokens **exclusively** in VS Code Secret Storage (system keychain) or environment variables. Tokens are:

- Never written to `.toddspect/config.yaml` or any committed file
- Redacted in all log output (`trace.ts` sanitises `gho_`, `ghp_`, `github_pat_`, `sk-ant-` prefixes)
- Passed to the CLI daemon via environment variables (not command-line arguments)
