---
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
