<p align="center">
  <img src="images/toddspect-icon.png" alt="Todd of AIDLC logo" width="80" />
</p>

# Installation

## VS Code extension (recommended)

| Method | Steps |
|--------|--------|
| **VSIX release** | Download from [Releases](https://github.com/nbsjunior/todd/releases) → Install from VSIX → Reload window |
| **Build from source** | `npm install` → `npm run package:vsix` → install `packages/extension/toddspect-vscode.vsix` |

After install, Todd of AIDLC runs `todd setup` automatically (workspace init, AI-DLC rules; Kiro download optional).

## CLI only (no extension)

```bash
cd toddspect
npm install
npm run build
node packages/cli/dist/index.js check getGoat
node packages/cli/dist/index.js chat -a copilot "Hello"
```

See [Dual Mode](Dual-Mode) for when to use CLI vs extension.

## Workspace init

```bash
todd init [path]    # creates .toddspect/config.yaml and specs/
todd setup          # bootstrap + AI-DLC install
todd check getGoat  # agent readiness
```

## Updating

1. Build or download a new `.vsix`
2. Install over the previous version (Install from VSIX)
3. **Developer: Reload Window**

The bundled CLI inside the extension updates with each VSIX — no separate CLI upgrade.

## Uninstall

Extensions view → Todd of AIDLC → Uninstall → Reload.

Workspace data (`.toddspect/`, VS Code secrets) remains on disk until you delete them.
