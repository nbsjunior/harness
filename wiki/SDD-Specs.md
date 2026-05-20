<p align="center">
  <img src="images/harness-icon.png" alt="Harness of AI logo" width="80" />
</p>

# SDD Specs

**Spec-Driven Development** — YAML files in `.harness/specs/` that describe skills, tools, and workflows for agents.

## Spec types

| Type | Purpose |
|------|---------|
| `Skill` | Behaviour / expertise the agent should follow |
| `Tool` | Callable tool definition with parameters |
| `Workflow` | Multi-step process |

## Example

```yaml
name: security-review
type: Skill
description: Review code for security issues
preferredAgent: copilot
content: |
  Focus on injection, auth, and secrets handling.
  Reference OWASP top 10.
```

## Spec+Agent mode

When Copilot **Spec+Agent** mode is active, Harness:

1. Resolves all spec files in `harness.specsDirectory` (default `.harness/specs/`)
2. Prepends them as `<spec>` blocks in the system context
3. Runs the agent tool loop with that guidance

## CLI

```bash
harness spec list
```

IPC: `spec:parse` from the extension Spec Manager panel.
