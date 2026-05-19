# Auto provider routing

Harness can select the best AI provider for each chat message when you choose **Auto** in the provider bar.

## How it works

1. You send a message with **Auto** selected (default).
2. The CLI scores each agent using keyword rules, mode bonuses, and context signals.
3. The highest-scoring **ready** agent handles the request.
4. The chat shows a notice: `Auto → Claude` (example) with a short reason.

Implementation: `packages/cli/src/router/autoRouter.ts` (documented in source).

## Routing table

| Task signal | Provider | Why |
|-------------|----------|-----|
| *(no strong signal)* | **Copilot** | Default — fast Q&A, GitHub workflow, lowest friction |
| Complex code, architecture, refactor, migration, performance | **Claude** | Strong long-context reasoning and code quality |
| Integrations (API, OAuth, webhooks, SDK, third-party) | **Claude** | Typical integration and API design work |
| Repo-wide / multi-file / monorepo edits | **Cursor** | Cloud Agents API tuned for codebase navigation |
| Long autonomous implementation | **Devin** | Autonomous engineer positioning |
| Spec+agent mode, AI-DLC, `.kiro`, steering rules | **Kiro** | Harness AI-DLC + Kiro CLI integration |

## Mode and context bonuses

| Signal | Effect |
|--------|--------|
| `spec+agent` or active spec files | +25 score for **Kiro** |
| `agent` mode + 5+ context files | +15 **Cursor** |
| `agent` mode + 2–4 context files | +8 **Cursor** |
| Long prompt in agent mode | +10 **Devin**, +8 **Claude** |

## Fallback chain

If the winning agent is not configured (`harness check getGoat` shows ✗), Harness tries:

`copilot` → `claude` → `cursor` → `devin` → `kiro`

## CLI

```bash
harness agent:run --agent auto --prompt "refactor the auth module for SOLID"
```

Stderr logs the routing decision; stdout is the agent response only.

## Settings

- VS Code: `harness.defaultAgent` = `auto` (default)
- Workspace: `.harness/config.yaml` → `defaultAgent: auto`

## Tuning rules

Edit `AUTO_ROUTING_RULES` in `autoRouter.ts`. Each rule has:

- `signals` — substrings matched in the user prompt (case-insensitive)
- `weight` — score per matched signal
- `priority` — tie-breaker when multiple rules hit the same agent

## IPC

When Auto resolves a provider, the CLI emits `chat:auto-routed` before streaming chunks so the UI can show the decision.
