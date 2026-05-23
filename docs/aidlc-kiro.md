# AI-DLC + Kiro integration

Todd of AIDLC implements the [AWS AI-DLC (AI-Driven Development Life Cycle)](https://github.com/awslabs/aidlc-workflows) methodology for the **Kiro** agent, matching the official Kiro steering layout.

## How it works

```
Todd of AIDLC Chat (agent: Kiro)
        │
        ▼
  kiro-cli chat --no-interactive
        │
        ▼
  Kiro loads .kiro/steering/aws-aidlc-rules/  ← AI-DLC core workflow
        │
        ▼
  Artifacts → aidlc-docs/
```

| Path | Purpose |
|------|---------|
| `.kiro/steering/aws-aidlc-rules/` | Core AI-DLC workflow (`core-workflow.md`) |
| `.kiro/aws-aidlc-rule-details/` | Phase rules (inception, construction, operations, extensions) |
| `aidlc-docs/` | Generated plans, questions, and stage outputs |

Rules version bundled with Todd of AIDLC: **v0.1.8** (from [awslabs/aidlc-workflows releases](https://github.com/awslabs/aidlc-workflows/releases)).

## Quick setup

Todd of AIDLC **installs and configures Kiro CLI automatically** when you:

- Run `todd setup` or `todd init`
- Install the VS Code extension (bootstrap on activate)
- First chat with agent **Kiro (AI-DLC)**

Kiro is cached at `~/.toddspect/tools/kiro-cli/` (Windows: `%USERPROFILE%\.toddspect\tools\kiro-cli\`).

### 1. One command (CLI)

```bash
npm run setup
# or
todd setup
```

### 2. API key (headless / Todd of AIDLC)

```bash
# Kiro Pro, Pro+, or Power — see Kiro authentication docs
export KIRO_API_KEY=your_api_key
```

In VS Code: **Todd of AIDLC → Open Configuration → Kiro** and save the API key.

### 3. AI-DLC rules

Included in `todd setup` / extension bootstrap. Manual install:

```bash
todd aidlc install
```

**Extension:** `Ctrl+Shift+P` → **Todd of AIDLC: Install AI-DLC Workflow (Kiro)**

### 4. Chat

Select agent **Kiro (AI-DLC)** and start with:

```text
Using AI-DLC, build a REST API for user profiles with JWT auth
```

Todd of AIDLC prefixes `Using AI-DLC,` automatically when you use the Kiro agent so the workflow activates.

## Three-phase workflow (summary)

| Phase | Focus |
|-------|--------|
| **Inception** | What to build and why — requirements, stories, design units |
| **Construction** | How to build — design, code, tests |
| **Operations** | Deploy and monitor (evolving in upstream AI-DLC) |

The workflow is **adaptive**: only stages that add value run. You approve plans and artifacts at each step.

## Verify (official checks)

**Kiro IDE:** Steering panel → `core-workflow` under Workspace.

**Kiro CLI:**

```bash
kiro-cli
/context show
```

Confirm entries for `.kiro/steering/aws-aidlc-rules`.

Use **Vibe mode** in Kiro IDE; decline prompts to switch to spec mode so AI-DLC stays in control.

## Configuration

`.toddspect/config.yaml`:

```yaml
connectors:
  kiro:
    cliPath: kiro-cli
    trustTools: read,grep,write
    mode: cli

aidlc:
  autoInstall: true
```

VS Code settings: `toddspect.connectors.kiro.*`, `toddspect.aidlc.autoInstall`.

### Legacy REST mode

If you previously used a custom REST endpoint, set `toddspect.connectors.kiro.mode` to `rest` and configure `endpoint` + `KIRO_API_KEY`. Prefer **cli** mode for AI-DLC.

## References

- [aidlc-workflows repository](https://github.com/awslabs/aidlc-workflows)
- [Kiro steering docs](https://kiro.dev/docs/cli/steering/)
- [Kiro headless mode](https://kiro.dev/docs/cli/headless)
- [Todd of AIDLC agent connectors](agent-connectors.md)
