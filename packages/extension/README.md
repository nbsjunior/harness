# Harness — Meta-Agent Orchestrator

> One interface. Every AI agent.

Harness is a VSCode extension that centralizes your AI coding workflow by routing requests to **GitHub Copilot**, **Devin**, **Cursor AI**, **Claude Code**, and **AWS KIRO** through a single sidebar — using Spec-Driven Development (SDD) to guide agent behavior.

## Features

- **Chat Sidebar** — conversational interface with streaming responses
- **Context Selector** — right-click any file or folder → *Add to Harness Context*
- **Spec Manager** — browse and create SDD specs (Skills, Tools, Workflows)
- **Agent Menu** — switch agents mid-conversation with a Quick Pick
- **MCP Support** — connect to any Model Context Protocol server
- **Configuration Panel** — manage API keys, endpoints, and MCP servers

## Quick Start

1. Press `Ctrl+Shift+P` → **Harness: Initialize Workspace**
2. Configure at least one agent key in **Harness: Open Configuration**
3. Click the Harness icon in the Activity Bar and start chatting

## Documentation

Full documentation at [github.com/nbsjunior/harness](https://github.com/nbsjunior/harness):

- [Getting Started](https://github.com/nbsjunior/harness/blob/main/docs/getting-started.md)
- [Architecture](https://github.com/nbsjunior/harness/blob/main/docs/architecture.md)
- [IPC Protocol](https://github.com/nbsjunior/harness/blob/main/docs/ipc-protocol.md)
- [Spec-Driven Development](https://github.com/nbsjunior/harness/blob/main/docs/sdd-specs.md)
- [Agent Connectors](https://github.com/nbsjunior/harness/blob/main/docs/agent-connectors.md)

## Requirements

- Node.js ≥ 20 (for the CLI daemon)
- VSCode ≥ 1.85

## License

MIT © Nelson Borges
