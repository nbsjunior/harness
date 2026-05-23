# SDD + GitHub spec-kit integration

Harness aligns with [GitHub spec-kit](https://github.com/github/spec-kit) while keeping Harness-native specs in `.harness/specs/` (Skills, Tools, Workflows for `spec+agent` chat).

## Two layers

| Layer | Path | Purpose |
|-------|------|---------|
| **Harness specs** | `.harness/specs/` | Reusable agent Skills/Tools/Workflows (YAML/Markdown) |
| **spec-kit SDD** | `.harness/sdd/` | Full product workflow: constitution → spec → plan → tasks → implement |

## spec-kit commands in Harness

| spec-kit | Harness SDD UI | Artifact |
|----------|----------------|----------|
| `/speckit.constitution` | Constitution step | `.harness/sdd/memory/constitution.md` |
| `/speckit.specify` | Specify | `specs/<id>/spec.md` |
| `/speckit.clarify` | Clarify (optional) | `clarifications.md` |
| `/speckit.plan` | Plan | `plan.md` |
| `/speckit.tasks` | Tasks | `tasks.md` |
| `/speckit.analyze` | Analyze (optional) | — (prompt-only) |
| `/speckit.checklist` | Checklist (optional) | `checklist.md` |
| `/speckit.implement` | Implement | — (Agent execution) |
| `/speckit.taskstoissues` | Tasks → Issues (optional) | — |

Open **View → SDD** in the activity bar. Use **SDD Workflow** tab:

1. **Initialize SDD** — creates `.harness/sdd/` layout
2. **+ New feature** — wizard creates `001-<slug>/spec.md`
3. For each step: **Scaffold** → **Open** → **Run in chat** (Spec+Agent + SDD files in context)

## What Harness adds beyond spec-kit

- Multi-provider routing (Copilot, Cursor, Claude, Kiro, …) for every step
- Same workspace as VS Code chat, context chips, and Live Edits
- `harness spec:discover` for repo-based Harness spec suggestions
- Optional `specify` CLI install remains compatible (external)

## IPC

| Action | Description |
|--------|-------------|
| `sdd:workflow:status` | Step states + features |
| `sdd:workflow:init` | Bootstrap `.harness/sdd/` |
| `sdd:workflow:createFeature` | New feature folder |
| `sdd:workflow:writeArtifact` | Scaffold template file |
| `sdd:workflow:stepPrompt` | Prompt + context paths for chat |

## External specify CLI (optional)

To use upstream spec-kit templates and agent slash files:

```bash
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git
specify init . --integration copilot
```

Harness `.harness/sdd/` can coexist with `.specify/` from `specify init`.

## Related docs

- [sdd-specs.md](sdd-specs.md) — Harness Skills/Tools/Workflows (`.harness/specs/`)
- [user-guide.md](user-guide.md) — §8–9 SDD UI walkthrough
- [backlog-features.md](backlog-features.md) — session, budgets, fan-out, and other platform features
