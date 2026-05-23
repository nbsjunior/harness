# @toddspect/cli

Node.js orchestrator: agent routing, SDD specs, IPC daemon for the Todd of AIDLC VS Code extension.

## Commands

| Command | Module |
|---------|--------|
| `todd --ipc` | `src/ipc/IpcServer.ts` — daemon (stdout = JSON only) |
| `todd chat` / `run` | `src/commands/` → `AgentRouter` |
| `todd check getGoat` | `src/commands/getGoat.ts` |
| `todd setup` | `src/commands/setup.ts` |

Build: `npm run build -w packages/cli`
