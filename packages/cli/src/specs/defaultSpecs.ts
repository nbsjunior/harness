import * as fs from 'fs';
import * as path from 'path';

export interface DefaultSpecFile {
  filename: string;
  content: string;
}

/** SDD defaults — clean code, SOLID, OWASP, agent prompts, performance. Skips existing files. */
export const DEFAULT_TODDSPECT_SPECS: DefaultSpecFile[] = [
  {
    filename: 'skill-clean-code.md',
    content: `---
kind: Skill
name: clean-code
description: "Enforces Clean Code practices — readable, maintainable, testable code"
agents:
  preferred: copilot
  fallback: claude
tools:
  - name: read_file
    description: "Read source files"
  - name: write_file
    description: "Apply focused edits"
---

# Clean Code

Apply **Robert C. Martin / industry clean code** standards on every change.

## Rules

- **Names**: reveal intent; avoid abbreviations unless domain-standard; consistent vocabulary.
- **Functions**: single responsibility; ≤20 lines when practical; few parameters; no hidden side effects.
- **Comments**: explain *why*, not *what*; delete obsolete comments; prefer self-documenting code.
- **Formatting**: match project style; small files; related code stays together.
- **Error handling**: fail fast with clear messages; never swallow errors; use typed/structured errors.
- **Tests**: arrange-act-assert; one assertion concept per test; deterministic, fast unit tests.
- **DRY / KISS / YAGNI**: remove duplication; simplest design that works; no speculative features.

## Output

- Prefer minimal diffs; cite file paths.
- Flag smells: long methods, god classes, magic numbers, deep nesting.
`,
  },
  {
    filename: 'skill-solid-architecture.md',
    content: `---
kind: Skill
name: solid-architecture
description: "Applies SOLID and modern layered architecture patterns"
agents:
  preferred: copilot
  fallback: cursor
tools:
  - name: read_file
    description: "Inspect modules and dependencies"
  - name: write_file
    description: "Refactor with small safe steps"
---

# SOLID Architecture

Design and refactor for **maintainable, extensible** systems.

## SOLID

- **S**ingle Responsibility — one reason to change per module/class.
- **O**pen/Closed — extend via composition/interfaces, not fragile edits to core logic.
- **L**iskov Substitution — subtypes honor contracts of abstractions.
- **I**nterface Segregation — small, role-specific interfaces.
- **D**ependency Inversion — depend on abstractions; inject dependencies.

## Modern structure

- Clear boundaries: domain / application / infrastructure / presentation.
- Prefer composition over inheritance; explicit module boundaries.
- Avoid circular dependencies; dependency direction flows inward toward domain.
- Use ports & adapters (hexagonal) when integrating external systems.

## When editing

- Propose incremental refactors; keep builds green.
- Document public APIs; keep side effects at the edges.
`,
  },
  {
    filename: 'skill-owasp-security.md',
    content: `---
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
- **XSS**: contextual encoding; CSP; avoid \`dangerouslySetInnerHTML\` without sanitization.
- **Insecure dependencies**: note outdated/vulnerable packages when visible in manifests.
- **Logging & monitoring**: security events without leaking secrets.

## Output

- Rank findings: Critical / High / Medium / Low.
- Provide concrete remediations with minimal secure code samples.
- Never introduce hardcoded credentials or API keys.
`,
  },
  {
    filename: 'skill-agent-engineering.md',
    content: `---
kind: Skill
name: agent-engineering
description: "Prompt and agent behaviour — efficient, structured, production-grade responses"
agents:
  preferred: copilot
  fallback: claude
---

# Agent Engineering (Prompt Best Practices)

Optimize **how** you work so provider models stay **accurate, fast, and token-efficient**.

## Prompt structure

1. **Goal** — one sentence outcome.
2. **Constraints** — stack, style, files not to touch, deadlines.
3. **Context** — only relevant paths/facts (no filler).
4. **Output format** — bullets, diff-only, JSON schema, etc.

## Techniques (use appropriately)

- **Role clarity**: senior engineer for this stack; be explicit about scope.
- **Chain-of-thought**: brief plan before multi-file changes (Agent mode); hide verbose reasoning from final answer unless asked.
- **Decomposition**: break large tasks into verifiable steps.
- **Negative constraints**: "Do not change X", "No new dependencies unless required".
- **Few-shot**: one minimal example of desired output format when format is non-obvious.
- **Self-check**: verify requirements, types, and tests before finishing.

## Token efficiency

- Answer first; details second.
- Reference paths instead of pasting whole files.
- Prefer minimal diffs over full-file rewrites.
- Ask **one** clarifying question if blocked — do not guess on security or data loss.

## Quality bar

- Production-ready, typed, tested code.
- Secure by default (see \`skill-owasp-security\`).
- Clean Code + SOLID (see sibling specs).
`,
  },
  {
    filename: 'workflow-modern-performance.md',
    content: `---
kind: Workflow
name: modern-performance
description: "Deliver secure, performant, modern-architecture changes end-to-end"
agents:
  preferred: copilot
  fallback: cursor
tools:
  - name: read_file
    description: "Analyze hot paths"
  - name: write_file
    description: "Implement optimizations"
  - name: search_in_files
    description: "Locate bottlenecks"
---

# Modern Performance & Architecture Workflow

End-to-end workflow for **fast, secure, maintainable** delivery.

## Phases

1. **Understand** — confirm requirements, constraints, and affected modules.
2. **Assess** — complexity, I/O, allocations, N+1 queries, bundle size, caching opportunities.
3. **Design** — SOLID boundaries; avoid premature optimization; measure if possible.
4. **Implement** — small commits/diffs; preserve behaviour; add tests for critical paths.
5. **Harden** — OWASP checks on new surface area; input validation; error paths.
6. **Verify** — lint/types/tests; note trade-offs and follow-ups.

## Performance principles

- Measure before optimizing; optimize hot paths first.
- Prefer algorithmic wins (O(n)) over micro-optimizations.
- Cache with clear invalidation; async/I/O where it reduces latency.
- Avoid blocking the UI thread / event loop; stream large payloads.

## Active specs

When running **Spec+Agent**, combine with: clean-code, solid-architecture, owasp-secure-code, agent-engineering.
`,
  },
  {
    filename: 'skill-code-review.md',
    content: `---
kind: Skill
name: code-review
description: "Thorough review — correctness, security, SOLID, performance"
agents:
  preferred: copilot
  fallback: claude
tools:
  - name: read_file
    description: "Reads a source file"
  - name: search_in_files
    description: "Search patterns across the repo"
---

# Code Review

Review for **correctness, security (OWASP), SOLID, Clean Code, and performance**.

## Checklist

- Logic bugs, race conditions, null/undefined edges
- Security: injection, authz, secrets, XSS
- Design: SOLID violations, coupling, missing abstractions
- Style: naming, duplication, dead code
- Tests: missing coverage on changed behaviour

## Output format

- Summary (2–3 sentences)
- Findings by severity with file:line references
- Suggested minimal fixes
`,
  },
  {
    filename: 'workflow-refactor-solid.md',
    content: `---
kind: Workflow
name: refactor-to-solid
description: "Incremental refactor toward SOLID and clean architecture"
agents:
  preferred: copilot
  fallback: claude
tools:
  - name: read_file
    description: "Read target modules"
  - name: write_file
    description: "Apply refactoring patches"
---

# Refactor to SOLID Workflow

1. Map current dependencies and responsibilities.
2. Identify the highest-pain violation (SRP, DIP, etc.).
3. Refactor in **small steps** — compile/test after each step.
4. Preserve behaviour; add/adjust tests.
5. Document new boundaries (modules, public APIs).

Follow **skill-solid-architecture** and **skill-clean-code** for criteria.
`,
  },
];

/**
 * Writes default SDD spec files into \`specsDir\` (only if each file is missing).
 * @returns Relative paths created.
 */
export function ensureDefaultSpecs(specsDir: string): string[] {
  if (!fs.existsSync(specsDir)) {
    fs.mkdirSync(specsDir, { recursive: true });
  }

  const created: string[] = [];
  for (const spec of DEFAULT_TODDSPECT_SPECS) {
    const target = path.join(specsDir, spec.filename);
    if (fs.existsSync(target)) {
      continue;
    }
    fs.writeFileSync(target, spec.content.trim() + '\n', 'utf-8');
    created.push(path.relative(path.dirname(specsDir), target).replace(/\\/g, '/'));
  }
  return created;
}
