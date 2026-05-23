<p align="center">
  <img src="images/toddspect-icon.png" alt="ToddSpect logo" width="80" />
</p>

# Agent Connectors

ToddSpect routes chat to five agents via the CLI `AgentRouter`.

| Agent | Protocol | API key / auth |
|-------|----------|----------------|
| **GitHub Copilot** | OpenAI-compatible SSE | `gh auth token` or `GH_TOKEN` |
| **Devin** | REST session API | `DEVIN_API_KEY` |
| **Cursor AI** | Cloud Agents API v1 | `CURSOR_API_KEY` |
| **Claude Code** | CLI subprocess | `claude` on PATH + optional `ANTHROPIC_API_KEY` |
| **Kiro (AI-DLC)** | kiro-cli + steering | `KIRO_API_KEY` |

Run `toddspect check getGoat` or **ToddSpect: Check getGoat** to see readiness.

---

## GitHub Copilot

- **Endpoint:** `https://api.githubcopilot.com`
- **Auth:** `gh auth login` with `copilot` scope, or VS Code secret
- **Modes:** Ask, Agent, Spec+Agent — see [Copilot Modes](Copilot-Modes)

```bash
gh auth refresh --scopes copilot
```

---

## Devin

- **Endpoint:** `https://api.devin.ai/v1` (default)
- **Env:** `DEVIN_API_KEY`

Devin runs asynchronously — ToddSpect shows the session URL.

---

## Cursor AI

ToddSpect uses **Cursor SDK local** for **Agent** / **Spec+Agent** when you have a Cursor API key (`auto` or `local` execution). **Ask** and **`cloud`** use the Cloud Agents API.

See [cursor-agent.md](../docs/cursor-agent.md) in the repo docs.

### Cloud Agents API

> **Do not use `api2.cursor.sh`** — that is the IDE internal API (gRPC), not REST. You will get **HTTP 404**.

### Correct setup

1. Create API key: [cursor.com/dashboard/integrations](https://cursor.com/dashboard/integrations)
2. Set in ToddSpect Configuration or environment:

```json
{
  "toddspect.connectors.cursor.endpoint": "https://api.cursor.com",
  "toddspect.connectors.cursor.apiKey": "your-key"
}
```

```bash
export CURSOR_API_KEY=your-key
export CURSOR_API_ENDPOINT=https://api.cursor.com   # optional
```

### How ToddSpect calls Cursor

1. `POST https://api.cursor.com/v1/agents` — create cloud agent + first run
2. `GET .../runs/{runId}/stream` — SSE assistant text
3. Follow-up messages: `POST .../agents/{id}/runs` on the same ToddSpect session

Basic authentication: `Authorization: Basic base64(apiKey:)`

---

## Claude Code

- **CLI:** `claude` must be on PATH (or set `toddspect.connectors.claude.path`)
- **Optional:** `ANTHROPIC_API_KEY` for API auth

ToddSpect spawns `claude -p ... --output-format stream-json`.

---

## Kiro (AI-DLC)

- **CLI:** `kiro-cli` (ToddSpect can auto-download via `toddspect setup`)
- **Steering:** `.kiro/steering/` from AI-DLC rules
- **Key:** `KIRO_API_KEY` from [kiro.dev](https://kiro.dev)

See [AI-DLC and Kiro](AI-DLC-and-Kiro).

---

## Configuration precedence

1. Live `gh auth token` (Copilot only)
2. VS Code Secrets
3. Environment variables
4. `TODDSPECT_SETTINGS_JSON` (from extension)
5. `.toddspect/config.yaml`
6. Defaults

Secrets never go in YAML.
