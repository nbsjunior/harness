# Installation

## VS Code extension (recommended)

| Method | Steps |
|--------|--------|
| **VSIX release** | Download from [Releases](https://github.com/nbsjunior/harness/releases) → Install from VSIX → Reload window |
| **Build from source** | `npm install` → `npm run package:vsix` → install `packages/extension/harness-vscode.vsix` |

After install, Harness runs `harness setup` automatically (workspace init, AI-DLC rules; Kiro download optional).

## CLI only (no extension)

```bash
cd harness
npm install
npm run build
node packages/cli/dist/index.js check getGoat
node packages/cli/dist/index.js chat -a copilot "Hello"
```

See [Dual Mode](Dual-Mode) for when to use CLI vs extension.

## Workspace init

```bash
harness init [path]    # creates .harness/config.yaml and specs/
harness setup          # bootstrap + AI-DLC install
harness check getGoat  # agent readiness
```

## Updating

1. Build or download a new `.vsix`
2. Install over the previous version (Install from VSIX)
3. **Developer: Reload Window**

The bundled CLI inside the extension updates with each VSIX — no separate CLI upgrade.

## Uninstall

Extensions view → Harness → Uninstall → Reload.

Workspace data (`.harness/`, VS Code secrets) remains on disk until you delete them.
