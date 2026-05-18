# Agent Connectors

Harness routes requests to AI agents via **connectors** — adapter implementations in the CLI's `AgentRouter`. Each connector translates a generic `AgentRequest` into the specific API call for that agent.

---

## Configuration

Connectors are configured in two layers (CLI merges them, env vars take precedence):

### 1. `.harness/config.yaml` (project-level, committed)

```yaml
connectors:
  copilot:
    endpoint: https://api.githubcopilot.com
  devin:
    endpoint: https://api.devin.ai/v1
  cursor:
    endpoint: https://api.cursor.sh
  claude:
    path: claude      # path to Claude Code CLI binary
  kiro:
    endpoint: https://kiro.aws.amazon.com/v1
```

> **Never commit API keys.** Use environment variables or VSCode settings.

### 2. VSCode Settings (machine-level, not committed)

Open `Ctrl+Shift+P → Harness: Open Configuration` or edit `settings.json`:

```json
{
  "harness.connectors.copilot.token": "ghp_xxxx",
  "harness.connectors.devin.apiKey": "devin_xxxx",
  "harness.connectors.cursor.apiKey": "cursor_xxxx",
  "harness.connectors.claude.path": "/usr/local/bin/claude",
  "harness.connectors.claude.apiKey": "sk-ant-xxxx",
  "harness.connectors.kiro.apiKey": "kiro_xxxx"
}
```

### 3. Environment Variables

| Agent | Variable |
|---|---|
| GitHub Copilot | `GH_TOKEN`, `COPILOT_GITHUB_TOKEN`, or `GITHUB_TOKEN` |
| Devin | `DEVIN_API_KEY` |
| Cursor AI | `CURSOR_API_KEY` |
| Claude Code | `ANTHROPIC_API_KEY`, `CLAUDE_PATH` |
| AWS KIRO | `KIRO_API_KEY` |

---

## Connector Reference

### GitHub Copilot

**Protocol:** OpenAI-compatible REST API with SSE streaming  
**Streaming:** Yes  
**Default endpoint:** `https://api.githubcopilot.com`

#### How it works

Sends an OpenAI-compatible `POST /chat/completions` request with `"stream": true`. Parses SSE `data:` lines and extracts `choices[0].delta.content` chunks.

```yaml
connectors:
  copilot:
    endpoint: https://api.githubcopilot.com
    # token: set via GITHUB_TOKEN env var or VSCode settings
```

#### Authentication (important)

The Copilot API (`api.githubcopilot.com`) **does not accept classic PATs** (`ghp_…`).  
If you see:

```text
HTTP 400: Personal Access Tokens are not supported for this endpoint
```

use one of these instead:

| Method | How |
|---|---|
| **GitHub CLI (recommended)** | `gh auth login` → copy output of `gh auth token` (`gho_…`) |
| **Fine-grained PAT** | [github.com/settings/personal-access-tokens](https://github.com/settings/personal-access-tokens) with **Copilot** permissions (`github_pat_…`) |

Harness sends the header `Copilot-Integration-Id: copilot-developer-cli` on every Copilot API request.

You need an **active GitHub Copilot subscription** on the account.

---

### Devin

**Protocol:** Cognition AI REST API (async session model)  
**Streaming:** No — returns a session URL  
**Default endpoint:** `https://api.devin.ai/v1`

#### How it works

Creates a new Devin session (`POST /sessions`) with the user's prompt. Returns a session URL where Devin works asynchronously. Harness displays the session URL in the chat so you can monitor progress.

```yaml
connectors:
  devin:
    endpoint: https://api.devin.ai/v1
    # apiKey: set via DEVIN_API_KEY env var
```

#### Notes

- Devin works asynchronously — it does not stream responses
- Use the session URL to monitor progress in Devin's web UI
- Ideal for long-running, multi-step engineering tasks

---

### Cursor AI

**Protocol:** OpenAI-compatible HTTP (MCP optional)  
**Streaming:** Yes  
**Default endpoint:** _(must be configured)_

#### How it works

Sends an OpenAI-compatible `POST /chat/completions` with `"stream": true` to the configured Cursor endpoint. Parses SSE chunks identically to the Copilot connector.

```yaml
connectors:
  cursor:
    endpoint: https://your-cursor-endpoint.example.com
    # apiKey: set via CURSOR_API_KEY env var
```

#### Notes

- The endpoint is not publicly documented by Cursor — use the endpoint provided in your Cursor subscription
- Supports the same model as your Cursor IDE subscription

---

### Claude Code

**Protocol:** CLI subprocess with `--output-format stream-json`  
**Streaming:** Yes (streaming JSON events on stdout)  
**Binary:** `claude` (must be on PATH or configured)

#### How it works

Spawns the `claude` CLI binary as a child process with:
```bash
claude -p "<user prompt>" --output-format stream-json --verbose
```

Parses each stdout line as a JSON event and extracts `delta.text` or `text` from `assistant` events.

```yaml
connectors:
  claude:
    path: claude      # or /usr/local/bin/claude
    # apiKey: set via ANTHROPIC_API_KEY env var (if not using Claude Code auth)
```

#### Installation

```bash
# macOS / Linux
npm install -g @anthropic-ai/claude-code

# Verify
claude --version
```

#### Notes

- Claude Code uses its own authentication by default (`claude auth login`)
- Set `ANTHROPIC_API_KEY` to use API key auth instead
- Context files are passed via `--file` flags (if supported by your Claude version)
- Stderr output from Claude is forwarded to Harness's stderr (not surfaced in chat)

---

### AWS KIRO

**Protocol:** REST API (single response)  
**Streaming:** No  
**Default endpoint:** _(must be configured)_

#### How it works

Sends a `POST /invoke` request with the user's prompt and context metadata. Returns a `response` or `output` field from the JSON response body.

```yaml
connectors:
  kiro:
    endpoint: https://your-kiro-endpoint.example.com
    # apiKey: set via KIRO_API_KEY env var
```

#### Notes

- AWS KIRO's public API is in preview — check the AWS documentation for the latest endpoint format
- Context items are sent as metadata (`{ path, kind, label }`) not file contents

---

## MCP Servers

In addition to the built-in connectors, Harness supports connecting to any **Model Context Protocol (MCP)** server. MCP servers expose tools and resources that can be invoked by agents.

### Configuration

```yaml
# .harness/config.yaml
mcp:
  enabled: true
  servers:
    - name: filesystem
      transport: stdio
      command: npx
      args: ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/workspace"]

    - name: github
      transport: stdio
      command: npx
      args: ["-y", "@modelcontextprotocol/server-github"]
      env:
        GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_xxxx"

    - name: remote-mcp
      transport: http
      url: http://localhost:3000/mcp
```

### VSCode settings equivalent

```json
{
  "harness.mcp.enabled": true,
  "harness.mcp.servers": [
    {
      "name": "filesystem",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"]
    }
  ]
}
```

### Available transports

| Transport | Use case |
|---|---|
| `stdio` | Local MCP server spawned as a subprocess |
| `http` | Remote MCP server with Streamable HTTP transport |

---

## Connector Selection Logic

When a chat message is sent without an explicit agent, Harness uses:

1. The agent selected in the chat dropdown (saved per session)
2. The `agents.preferred` field in the active Spec (if a spec context is loaded)
3. The `harness.defaultAgent` workspace setting
4. Falls back to `copilot` if nothing is configured

If the preferred agent fails (API error, missing token, etc.), Harness **does not** automatically fall back — the error is shown in the chat. The `agents.fallback` field in a Spec is intended for future automatic fallback support.

---

## Adding a Custom Connector

See [CONTRIBUTING.md](../CONTRIBUTING.md#adding-a-new-agent-connector) for a step-by-step guide on implementing a new connector in `AgentRouter.ts`.
