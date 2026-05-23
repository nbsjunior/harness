---
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
- Secure by default (see `skill-owasp-security`).
- Clean Code + SOLID (see sibling specs).
