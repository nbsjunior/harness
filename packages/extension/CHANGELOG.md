# Changelog

## [0.2.5] — 2026-07-04

### Fixed

- **Security:** resolved all open Dependabot alerts via npm overrides (undici, tar, form-data, hono, markdown-it, linkify-it, js-yaml, esbuild, tmp)
- **Build:** bumped esbuild to ^0.28.1 for lockfile sync with `npm ci` in CI

## [0.2.2] — 2026-05-23

### Changed

- **CLI command renamed**: `toddspect` → `todd` (all user-facing commands now use `todd <subcommand>`)
- Workspace folder `.toddspect/`, VS Code settings `toddspect.*`, and env vars `TODDSPECT_*` are unchanged for backward compatibility

## [0.2.1] — 2026-05-18

### Changed

- **UI rebrand:** extension display name, commands, sidebar, output channels, and webviews now show **Todd** (was ToddSpect / Harness).

## [0.2.0] — 2026-05-23

### Changed

- **Rebrand:** product name **Todd of AIDLC** (formerly Todd / Todd). CLI `todd`, workspace `.toddspect/`, settings `toddspect.*` unchanged.

## [0.1.9] — 2026-05-23

### Added

- **SDD view** with GitHub [spec-kit](https://github.com/github/spec-kit) workflow: constitution → specify → plan → tasks → implement
- Feature wizard, scaffold artifacts in `.toddspect/sdd/`, **Run in chat** (Spec+Agent + SDD context)
- Roadmap: session persistence, budget alerts, spec discovery, multi-agent fan-out, GitHub Actions example, plugin manifest, `todd web:serve` MVP

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
- `todd init`, `agent:run`, `spec:parse`, `context:build` CLI commands
