# Agent Connectors

Todd of AIDLC routes requests to AI agents via **connectors** — adapter implementations in the CLI's `AgentRouter`. Each connector translates a generic `AgentRequest` into the specific API call for that agent.

---

## Configuration

Connectors are configured in two layers (CLI merges them, env vars take precedence):

### 1. `.toddspect/config.yaml` (project-level, committed)

```yaml
connectors:
  copilot:
    endpoint: https://api.githubcopilot.com
  devin:
    endpoint: https://api.devin.ai/v1
  cursor:
    endpoint: https://api.cursor.com
  claude:
    path: claude      # path to Claude Code CLI binary
  kiro:
    endpoint: https://kiro.aws.amazon.com/v1
```

> **Never commit API keys.** Use environment variables or VSCode settings.

### 2. VSCode Settings (machine-level, not committed)

Open `Ctrl+Shift+P → Todd of AIDLC: Open Configuration` or edit `settings.json`:

```json
{
  "toddspect.connectors.copilot.token": "ghp_xxxx",
  "toddspect.connectors.devin.apiKey": "devin_xxxx",
  "toddspect.connectors.cursor.apiKey": "cursor_xxxx",
  "toddspect.connectors.claude.path": "/usr/local/bin/claude",
  "toddspect.connectors.claude.apiKey": "sk-ant-xxxx",
  "toddspect.connectors.kiro.apiKey": "kiro_xxxx"
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

Todd of AIDLC sends the header `Copilot-Integration-Id: copilot-developer-cli` on every Copilot API request.

You need an **active GitHub Copilot subscription** on the account.

---

### Devin

**Protocol:** Cognition AI REST API (async session model)  
**Streaming:** No — returns a session URL  
**Default endpoint:** `https://api.devin.ai/v1`

#### How it works

Creates a new Devin session (`POST /sessions`) with the user's prompt. Returns a session URL where Devin works asynchronously. Todd of AIDLC displays the session URL in the chat so you can monitor progress.

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

Todd of AIDLC uses **two paths** depending on chat mode and settings:

| Path | When | Local VS Code files |
|------|------|---------------------|
| **Cursor SDK local** | Agent / Spec+Agent + API key + `agentExecution` `auto` or `local` | Yes |
| **Cursor Cloud API v1** | Ask mode, or `agentExecution` `cloud` | No |

Full details: [cursor-agent.md](cursor-agent.md).

#### Local Agent (Cursor SDK)

**Package:** `@cursor/sdk` (loaded at runtime from `extension/cli/node_modules/@cursor/`).

**Requires:** `CURSOR_API_KEY` or `toddspect.connectors.cursor.apiKey`.

**Setting:** `toddspect.cursor.agentExecution` — `auto` (default), `local`, or `cloud`.

Does **not** require GitHub Copilot for local file edits.

#### Cloud (Ask / remote Agent)

**Protocol:** [Cursor Cloud Agents API v1](https://cursor.com/docs/cloud-agent/api/endpoints)  
**Streaming:** Yes (SSE on run stream)  
**Default endpoint:** `https://api.cursor.com`

Todd of AIDLC calls `POST /v1/agents`, then streams from `GET /v1/agents/{id}/runs/{runId}/stream`. Follow-ups use `POST /v1/agents/{id}/runs`.

**Do not use `api2.cursor.sh`** — IDE internal API (gRPC), not REST → HTTP 404.

```yaml
connectors:
  cursor:
    endpoint: https://api.cursor.com
    # apiKey: set via CURSOR_API_KEY env var
```

API key: [cursor.com/dashboard/integrations](https://cursor.com/dashboard/integrations). Auth: Basic `CURSOR_API_KEY:`.

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
- Stderr output from Claude is forwarded to Todd of AIDLC's stderr (not surfaced in chat)

---

### Kiro (AI-DLC)

**Protocol:** [Kiro CLI](https://kiro.dev/docs/cli/) headless (`kiro-cli chat --no-interactive`)  
**Workflow:** [AWS AI-DLC](https://github.com/awslabs/aidlc-workflows) steering rules in `.kiro/steering/`  
**Streaming:** Line-by-line stdout (non-interactive session)  
**Artifacts:** `aidlc-docs/`

#### How it works

1. Todd of AIDLC installs (or verifies) AI-DLC rules under `.kiro/steering/aws-aidlc-rules/` and `.kiro/aws-aidlc-rule-details/`.
2. Chat messages to agent `kiro` run `kiro-cli` with your prompt (prefixed with `Using AI-DLC,` when needed).
3. Kiro loads steering files and executes the adaptive Inception → Construction → Operations workflow.
4. Generated documentation lands in `aidlc-docs/`.

```yaml
connectors:
  kiro:
    cliPath: kiro-cli
    trustTools: read,grep,write
    mode: cli

aidlc:
  autoInstall: true
```

```bash
export KIRO_API_KEY=...   # Kiro Pro API key — see kiro.dev/docs/cli/authentication
toddspect aidlc install
toddspect agent:run -a kiro -p "Using AI-DLC, add user authentication"
```

#### Notes

- Install rules: `toddspect aidlc install` or **Todd of AIDLC: Install AI-DLC Workflow (Kiro)**
- Verify in Kiro CLI: `/context show` → `.kiro/steering/aws-aidlc-rules`
- Full guide: [aidlc-kiro.md](aidlc-kiro.md)
- Legacy `mode: rest` + `endpoint` still supported for custom REST gateways

---

## MCP Servers

In addition to the built-in connectors, Todd of AIDLC supports connecting to any **Model Context Protocol (MCP)** server. MCP servers expose tools and resources that can be invoked by agents.

### Configuration

```yaml
# .toddspect/config.yaml
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
  "toddspect.mcp.enabled": true,
  "toddspect.mcp.servers": [
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

When a chat message is sent without an explicit agent, Todd of AIDLC uses:

1. The agent selected in the chat dropdown (saved per session)
2. The `agents.preferred` field in the active Spec (if a spec context is loaded)
3. The `toddspect.defaultAgent` workspace setting
4. Falls back to `copilot` if nothing is configured

If the preferred agent fails (API error, missing token, etc.), Todd of AIDLC **does not** automatically fall back — the error is shown in the chat. The `agents.fallback` field in a Spec is intended for future automatic fallback support.

---

## Adding a Custom Connector

See [CONTRIBUTING.md](../CONTRIBUTING.md#adding-a-new-agent-connector) for a step-by-step guide on implementing a new connector in `AgentRouter.ts`.
