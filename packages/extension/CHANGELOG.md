# Changelog

## [0.1.9] — 2026-05-23

### Added

- **SDD view** with GitHub [spec-kit](https://github.com/github/spec-kit) workflow: constitution → specify → plan → tasks → implement
- Feature wizard, scaffold artifacts in `.harness/sdd/`, **Run in chat** (Spec+Agent + SDD context)
- Roadmap: session persistence, budget alerts, spec discovery, multi-agent fan-out, GitHub Actions example, plugin manifest, `harness web:serve` MVP

### Fixed

- Dependabot/npm audit: overrides for `undici`, `tar`, `@tootallnate/once` (transitive `@cursor/sdk` deps)

## [0.1.8] — 2026-05-19

### Fixed

- Cursor SDK local agent: bundle full transitive `node_modules` (e.g. `@fastify/busboy` for `undici`) so `@cursor/sdk` loads inside the installed VSIX

## [0.1.7] — 2026-05-19

### Added

- Cursor Agent local edits via `@cursor/sdk` (no GitHub Copilot quota required when Cursor API key is set)
- Spending tab documentation; prompt optimization pipeline documented in README and wiki

### Changed

- Cursor + Agent defaults to Cursor SDK local workspace path when API key is configured
- README highlights Spending, prompt optimization efficiency/quality, and Cursor local agent

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
