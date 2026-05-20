---
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
