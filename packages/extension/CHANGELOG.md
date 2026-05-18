# Changelog

## [0.1.0] — 2026-05-18

### Added

- Chat sidebar with streaming responses and conversation history
- Context Selector: add files and directories via Explorer right-click
- Spec Manager panel for browsing and creating SDD specs
- Configuration panel for agent connectors and MCP servers
- CLI daemon with stdin/stdout newline-delimited JSON IPC
- Agent connectors: GitHub Copilot, Devin, Cursor AI, Claude Code, AWS KIRO
- MCP client support (stdio and HTTP transports)
- Auto-reconnect with exponential backoff for CLI daemon
- Spec-Driven Development: Markdown-first spec format with YAML frontmatter
- `harness init`, `agent:run`, `spec:parse`, `context:build` CLI commands
