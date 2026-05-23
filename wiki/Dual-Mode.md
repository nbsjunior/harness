<p align="center">
  <img src="images/toddspect-icon.png" alt="Todd of AIDLC logo" width="80" />
</p>

# Dual Mode

Todd of AIDLC runs in two ways with the **same CLI logic**:

## VS Code Extension (default)

```
Extension UI  ←IPC→  CLI daemon (--ipc)  ←→  Agents
```

- Extension spawns `node cli/dist/index.js --ipc`
- JSON frames on stdin/stdout
- All file I/O and HTTP in the CLI process

## Standalone CLI

```bash
todd chat -a copilot "Explain this repo"
todd run -a claude "Refactor utils"
todd check getGoat
todd init
todd setup
todd aidlc install
```

No extension required. Uses the same `AgentRouter` and config layering.

## When to use which

| Use case | Mode |
|----------|------|
| Daily coding in VS Code | Extension |
| CI/CD, scripts, servers | CLI |
| Debugging agents | CLI `todd chat` + stderr logs |
| Kiro bootstrap / AI-DLC | Either (`todd setup`) |

## Config

Both modes read:

- `.toddspect/config.yaml`
- Environment variables
- Extension adds VS Code secrets via `TODDSPECT_SETTINGS_JSON`

See [Configuration](Configuration).
