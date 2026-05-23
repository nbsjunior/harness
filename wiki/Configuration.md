<p align="center">
  <img src="images/toddspect-icon.png" alt="Todd of AIDLC logo" width="80" />
</p>

# Configuration

## Configuration panel

`Ctrl+Shift+P` → **Todd of AIDLC: Open Configuration**

Tabs:
- **Agents** — API keys and endpoints per provider
- **API Servers** — custom OpenAI-compatible servers
- **MCP** — Model Context Protocol servers
- **Workspace** — paths and toddspect settings

## VS Code settings

```json
{
  "toddspect.defaultAgent": "copilot",
  "toddspect.specsDirectory": ".toddspect/specs",
  "toddspect.connectors.copilot.token": "",
  "toddspect.connectors.cursor.endpoint": "https://api.cursor.com",
  "toddspect.connectors.cursor.apiKey": "",
  "toddspect.connectors.devin.apiKey": "",
  "toddspect.connectors.claude.path": "claude",
  "toddspect.connectors.kiro.apiKey": ""
}
```

Secrets should use **Todd of AIDLC: Open Configuration** (stored in VS Code Secret Storage), not plain `settings.json`.

## Project config (`.toddspect/config.yaml`)

```yaml
connectors:
  copilot:
    endpoint: https://api.githubcopilot.com
  devin:
    endpoint: https://api.devin.ai/v1
  cursor:
    endpoint: https://api.cursor.com
  claude:
    path: claude
  kiro:
    cliPath: kiro-cli
```

Never commit API keys in YAML.

## Environment variables

| Variable | Agent |
|----------|--------|
| `GH_TOKEN`, `COPILOT_GITHUB_TOKEN` | Copilot |
| `DEVIN_API_KEY` | Devin |
| `CURSOR_API_KEY`, `CURSOR_API_ENDPOINT` | Cursor |
| `ANTHROPIC_API_KEY`, `CLAUDE_PATH` | Claude |
| `KIRO_API_KEY` | Kiro |
| `TODDSPECT_WORKSPACE` | CLI working directory |

## Check getGoat

```bash
toddspect check getGoat
```

Or **Todd of AIDLC: Check getGoat** — shows which agents are ready and hints for missing config.
