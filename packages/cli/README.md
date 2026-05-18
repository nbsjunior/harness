# @harness/cli

Node.js orchestrator: agent routing, IPC daemon, SDD spec parsing, Kiro/AI-DLC bootstrap.

## For AI assistants

Read in order: [../../AGENTS.md](../../AGENTS.md) → [../../docs/ai-reference.md](../../docs/ai-reference.md) → [../../docs/code-map.md](../../docs/code-map.md).

## Entry points

| Command | Module |
|---------|--------|
| `harness --ipc` | `src/ipc/IpcServer.ts` — daemon (stdout = JSON only) |
| `harness chat` / `run` | `src/commands/` → `AgentRouter` |
| `harness doctor` | `src/commands/doctor.ts` |
| `harness setup` | `src/commands/setup.ts` |

## Build

```bash
npm run build          # tsup → dist/index.js (single bundled ESM)
```

Bundled into the VS Code extension via `../../scripts/bundle-cli.mjs`.

## Key directories

| Path | Role |
|------|------|
| `src/router/` | Agent routing and Copilot tool loop |
| `src/connectors/` | Auth and Kiro CLI |
| `src/ipc/` | Extension ↔ CLI protocol |
| `src/aidlc/` | AWS AI-DLC steering install |
| `src/kiro/` | Kiro CLI download/cache |
| `src/parsers/` | Spec YAML |
