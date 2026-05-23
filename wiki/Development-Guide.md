<p align="center">
  <img src="images/toddspect-icon.png" alt="ToddSpect logo" width="80" />
</p>

# Development Guide

## Clone and build

```bash
git clone https://github.com/nbsjunior/todd.git
cd toddspect
npm install
npm run build
```

## Packages

```bash
npm run build -w @toddspect/cli
npm run build -w toddspect-vscode
node scripts/bundle-cli.mjs
cd packages/extension && npx @vscode/vsce package --no-dependencies
```

## Run extension locally

1. Open repo in VS Code
2. **Run Extension** (F5) — Extension Development Host
3. Open a workspace folder in the new window

## CLI IPC smoke test

```bash
node scripts/smoke-ipc.mjs
```

## Key files

| File | Purpose |
|------|---------|
| `packages/cli/src/ipc/IpcServer.ts` | Daemon IPC |
| `packages/cli/src/router/AgentRouter.ts` | Agent routing |
| `packages/extension/src/services/CliService.ts` | Subprocess + IPC client |
| `packages/extension/src/webview/chat/main.ts` | Chat UI |

Full map: [docs/code-map.md](https://github.com/nbsjunior/todd/blob/main/docs/code-map.md)

## Conventions

- ESM only, `.js` extensions in CLI imports
- No `console.log` to stdout in daemon code
- Extension host: no file I/O for agent content

## Publish wiki

Wiki source lives in `wiki/` in the repo. To push to GitHub Wiki:

```bash
node scripts/publish-wiki.mjs
```

Or see [wiki/README.md](https://github.com/nbsjunior/todd/blob/main/wiki/README.md).
