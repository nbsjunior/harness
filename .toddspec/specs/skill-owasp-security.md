---
kind: Skill
name: owasp-secure-code
description: "Secure coding aligned with OWASP Top 10 and ASVS fundamentals"
agents:
  preferred: copilot
  fallback: claude
tools:
  - name: read_file
    description: "Review code for vulnerabilities"
  - name: search_in_files
    description: "Find insecure patterns across the repo"
---

# OWASP Secure Code

Treat security as **non-negotiable**. Align reviews and changes with **OWASP Top 10** and **ASVS** basics.

## Must-check

- **Injection**: parameterized queries; no string-concat SQL/shell; validate/sanitize inputs.
- **Broken auth**: secure session handling; strong password flows; protect tokens/secrets.
- **Sensitive data**: encrypt at rest/transit; never log secrets/PII; least-privilege access.
- **XXE / deserialization**: safe parsers; avoid untrusted deserialization.
- **Access control**: authorize every request; deny by default; prevent IDOR.
- **Misconfiguration**: secure defaults; disable debug in prod; hardened headers (CSP, HSTS where applicable).
- **XSS**: contextual encoding; CSP; avoid `dangerouslySetInnerHTML` without sanitization.
- **Insecure dependencies**: note outdated/vulnerable packages when visible in manifests.
- **Logging & monitoring**: security events without leaking secrets.

## Output

- Rank findings: Critical / High / Medium / Low.
- Provide concrete remediations with minimal secure code samples.
- Never introduce hardcoded credentials or API keys.
