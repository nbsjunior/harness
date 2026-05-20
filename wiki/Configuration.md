<p align="center">
  <img src="images/harness-icon.png" alt="Harness of AI logo" width="80" />
</p>

# Configuration

## Configuration panel

`Ctrl+Shift+P` → **Harness: Open Configuration**

Tabs:
- **Agents** — API keys and endpoints per provider
- **API Servers** — custom OpenAI-compatible servers
- **MCP** — Model Context Protocol servers
- **Workspace** — paths and harness settings

## VS Code settings

```json
{
  "harness.defaultAgent": "copilot",
  "harness.specsDirectory": ".harness/specs",
  "harness.connectors.copilot.token": "",
  "harness.connectors.cursor.endpoint": "https://api.cursor.com",
  "harness.connectors.cursor.apiKey": "",
  "harness.connectors.devin.apiKey": "",
  "harness.connectors.claude.path": "claude",
  "harness.connectors.kiro.apiKey": ""
}
```

Secrets should use **Harness: Open Configuration** (stored in VS Code Secret Storage), not plain `settings.json`.

## Project config (`.harness/config.yaml`)

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
| `HARNESS_WORKSPACE` | CLI working directory |

## Check getGoat

```bash
harness check getGoat
```

Or **Harness: Check getGoat** — shows which agents are ready and hints for missing config.
