# @toddspect/cli

Node.js orchestrator: agent routing, SDD specs, IPC daemon for the Todd of AIDLC VS Code extension.

## Commands

| Command | Module |
|---------|--------|
| `toddspect --ipc` | `src/ipc/IpcServer.ts` — daemon (stdout = JSON only) |
| `toddspect chat` / `run` | `src/commands/` → `AgentRouter` |
| `toddspect check getGoat` | `src/commands/getGoat.ts` |
| `toddspect setup` | `src/commands/setup.ts` |

Build: `npm run build -w packages/cli`
