# Dual Mode

Harness runs in two ways with the **same CLI logic**:

## VS Code Extension (default)

```
Extension UI  ←IPC→  CLI daemon (--ipc)  ←→  Agents
```

- Extension spawns `node cli/dist/index.js --ipc`
- JSON frames on stdin/stdout
- All file I/O and HTTP in the CLI process

## Standalone CLI

```bash
harness chat -a copilot "Explain this repo"
harness run -a claude "Refactor utils"
harness check getGoat
harness init
harness setup
harness aidlc install
```

No extension required. Uses the same `AgentRouter` and config layering.

## When to use which

| Use case | Mode |
|----------|------|
| Daily coding in VS Code | Extension |
| CI/CD, scripts, servers | CLI |
| Debugging agents | CLI `harness chat` + stderr logs |
| Kiro bootstrap / AI-DLC | Either (`harness setup`) |

## Config

Both modes read:

- `.harness/config.yaml`
- Environment variables
- Extension adds VS Code secrets via `HARNESS_SETTINGS_JSON`

See [Configuration](Configuration).
