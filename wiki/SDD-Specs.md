<p align="center">
  <img src="images/toddspect-icon.png" alt="Todd of AIDLC logo" width="80" />
</p>

# SDD Specs

**Spec-Driven Development** — YAML files in `.toddspect/specs/` that describe skills, tools, and workflows for agents.

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

When Copilot **Spec+Agent** mode is active, Todd of AIDLC:

1. Resolves all spec files in `toddspect.specsDirectory` (default `.toddspect/specs/`)
2. Prepends them as `<spec>` blocks in the system context
3. Runs the agent tool loop with that guidance

## CLI

```bash
todd spec list
```

IPC: `spec:parse` from the extension Spec Manager panel.
