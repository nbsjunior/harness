---
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
