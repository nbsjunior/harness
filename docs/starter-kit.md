# Harness Starter Kit

> Install the extension, use the bundled CLI, configure **GitHub Copilot** as your first agent, and keep the solution updated.

---

## What you get

| Component | Description |
|---|---|
| **VSCode extension** (`.vsix`) | Chat, Spec Manager, configuration wizard |
| **Harness CLI** (bundled) | Node.js daemon inside the extension — routes prompts to Copilot, Claude, Devin, Cursor, KIRO |
| **Workspace starter** | `.harness/` with example specs and `config.yaml` |

The CLI is compiled and **included in the `.vsix`** at `extension/cli/dist/index.js`. You do not need to clone the monorepo or run `npm run build:cli` unless you are developing Harness itself.

**Primary agent for this starter kit:** [GitHub Copilot](https://github.com/features/copilot) (OpenAI-compatible API). The flow mirrors a Copilot-style CLI: one prompt in, streamed response out, with optional file context.

---

## Requirements

| Requirement | Version |
|---|---|
| VSCode | ≥ 1.85 |
| Node.js | ≥ 20 (on your `PATH` — the extension spawns the bundled CLI with `node`) |
| GitHub account | For Copilot API token |

---

## Step 1 — Install the extension

### From a release

1. Download `harness-vscode-0.1.0.vsix` from [Releases](https://github.com/nbsjunior/harness/releases).
2. `Ctrl+Shift+P` → **Extensions: Install from VSIX...**
3. Select the file → **Reload**.

### From the repository (build locally)

```bash
git clone https://github.com/nbsjunior/harness.git
cd harness
npm install
npm run package:vsix
```

Output: `packages/extension/harness-vscode-0.1.0.vsix` (extension + **bundled CLI**).

```bash
code --install-extension packages/extension/harness-vscode-0.1.0.vsix
```

---

## Step 2 — Open Harness in VSCode

1. Reload VSCode after installing the `.vsix`.
2. Click the **Harness** icon (hexagon) in the **Activity Bar** (left).
3. Open the **Chat** view (first tab).

If the icon is missing: `Ctrl+Shift+P` → **Developer: Reload Window**.

---

## Step 3 — Initialize your workspace

1. Open the folder of the project you want to work on (`File → Open Folder`).
2. `Ctrl+Shift+P` → **Harness: Initialize Workspace**.

This creates:

```
your-project/
└── .harness/
    ├── config.yaml
    └── specs/
        ├── skill-code-review.md
        └── workflow-refactor-solid.md
```

---

## Step 4 — Configure GitHub Copilot (recommended first agent)

1. `Ctrl+Shift+P` → **Harness: Open Configuration**  
   (or click the gear icon in the Chat toolbar).

2. Follow the wizard:
   - **Get started** → select **GitHub Copilot** → **Configure selected**
   - Create a token at [github.com/settings/tokens](https://github.com/settings/tokens) with `copilot` / `models:read` scopes
   - Paste the token → **Test connection** → **Save & Continue**
   - Set **Default agent** to `copilot` on the Workspace screen
   - Finish with **Open Chat**

3. Alternative: set the token before launching VSCode:

```powershell
# Windows PowerShell
$env:GITHUB_TOKEN = "ghp_xxxxxxxx"
code .
```

```bash
# macOS / Linux
export GITHUB_TOKEN=ghp_xxxxxxxx
code .
```

---

## Step 5 — First conversation

1. In the Explorer, right-click a file → **Add to Harness Context**.
2. In Chat, pick **GitHub Copilot** in the agent dropdown (badge `GH`).
3. Try a suggestion chip or type:

```
Review the selected files for security issues
```

4. Press **Enter** or **Ctrl+Enter** to send.

The extension starts the **bundled CLI** in IPC mode (`node extension/cli/dist/index.js --ipc`). Logs appear in `View → Output → Harness`.

---

## Bundled CLI layout

Inside the installed extension:

```
~/.vscode/extensions/harness-ai.harness-vscode-0.1.0/
├── dist/extension.js          # Extension host
├── dist/webview/              # Chat, Config, Spec UI
└── cli/dist/index.js          # Harness CLI (bundled orchestrator)
```

Resolution order in code:

1. `harness.cliPath` in settings (if set)
2. `extension/cli/dist/index.js` (shipped in `.vsix`)
3. Monorepo paths (development only)

---

## Standalone CLI (optional)

The same binary is used by the extension. From a dev checkout:

```bash
cd packages/cli
npm run build
node dist/index.js --help

# One-shot Copilot call (like a minimal Copilot CLI)
node dist/index.js agent:run \
  --agent copilot \
  --prompt "Explain this project's architecture" \
  --dirs ./src
```

Ensure `GITHUB_TOKEN` or `harness.connectors.copilot.token` is set.

---

## Update flow (new version of Harness)

### End users (VSIX only)

1. Download the new `.vsix` from Releases.
2. `Ctrl+Shift+P` → **Extensions: Install from VSIX...** (overwrites the previous version).
3. **Developer: Reload Window**.
4. Re-open your workspace — `.harness/` is preserved.

### Developers (from source)

```bash
cd harness
git pull origin main
npm install
npm run package:vsix
code --install-extension packages/extension/harness-vscode-0.1.0.vsix
```

What `package:vsix` does:

```
npm run build:cli      → packages/cli/dist/index.js
npm run bundle:cli     → packages/extension/cli/dist/index.js
npm run build:prod     → extension + webview bundles
vsce package           → harness-vscode-0.1.0.vsix
```

### Verify CLI after update

```bash
# Replace path with your extension install folder
node "%USERPROFILE%\.vscode\extensions\harness-ai.harness-vscode-0.1.0\cli\dist\index.js" --help
```

In VSCode: send a chat message and confirm no **Harness CLI not found** in Output → Harness.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| **Harness CLI not found** | Reinstall from a `.vsix` built with `npm run package:vsix`, or set `harness.cliPath` to `packages/cli/dist/index.js` |
| **CLI ping timed out** | Check Node.js ≥ 20: `node --version` |
| **HTTP 401 (Copilot)** | Regenerate token at GitHub settings; set `GITHUB_TOKEN` or use Configuration wizard |
| Extension icon missing | Reload window; confirm extension is enabled under Extensions |

---

## Next steps

- [User Guide](user-guide.md) — full feature reference
- [Agent Connectors](agent-connectors.md) — Claude, Devin, Cursor, KIRO
- [SDD Specs](sdd-specs.md) — Skills, Tools, Workflows
- [Getting Started (developers)](getting-started.md) — F5 debug workflow
