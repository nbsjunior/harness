# harness-vscode

VS Code extension: chat sidebar, spec manager, configuration panel. Spawns the bundled CLI daemon for all agent I/O.

## For AI assistants

Read in order: [../../AGENTS.md](../../AGENTS.md) → [../../docs/ai-reference.md](../../docs/ai-reference.md) → [../../docs/code-map.md](../../docs/code-map.md).

## Architecture rule

**The extension host never reads workspace file contents.** It passes absolute paths to the CLI via IPC; the CLI performs `fs.readFile` and HTTP.

## Key directories

| Path | Role |
|------|------|
| `src/extension.ts` | Activation, commands, service wiring |
| `src/services/CliService.ts` | CLI subprocess + NDJSON IPC |
| `src/services/AgentService.ts` | Chat streaming orchestration |
| `src/providers/ChatViewProvider.ts` | Chat webview bridge |
| `src/configBridge.ts` | Env + secrets for CLI child |
| `src/webview/` | Browser bundles (esbuild) |
| `cli/dist/` | Bundled CLI (generated — do not edit) |

## Build & package

```bash
npm run build
node ../../scripts/bundle-cli.mjs
npx @vscode/vsce package --no-dependencies
```

Output: `harness-vscode-0.1.0.vsix`
