# ToddSpect Starter Kit

> Install the extension, use the bundled CLI, configure **GitHub Copilot** as your first agent, and keep the solution updated.

**Why ToddSpect?** One **VS Code** sidebar for **Copilot, Claude, Cursor, Devin, and Kiro** — plus **SDD specs** and **file context** that stay with you when you switch provider. See **[why-toddspect.md](why-toddspect.md)**.

**Choose CLI or Extension?** See [dual-mode.md](dual-mode.md) — most developers use the **VS Code Extension**; use the **CLI** for terminal/CI.

**Kiro + AI-DLC:** See [aidlc-kiro.md](aidlc-kiro.md) — Kiro CLI is installed automatically by ToddSpect (`toddspect setup` or on extension activate).

---

## What you get

| Component | Description |
|---|---|
| **VSCode extension** (`.vsix`) | Chat, Spec Manager, configuration wizard |
| **ToddSpect CLI** (bundled) | Node.js daemon inside the extension — routes prompts to Copilot, Claude, Devin, Cursor, KIRO |
| **Workspace starter** | `.toddspect/` with example specs and `config.yaml` |

The CLI is compiled and **included in the `.vsix`** at `extension/cli/dist/index.js`. You do not need to clone the monorepo or run `npm run build:cli` unless you are developing ToddSpect itself.

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

1. Download `toddspect-vscode-*.vsix` from [Releases](https://github.com/nbsjunior/todd/releases) (latest: **v0.1.9**).
2. Confirm the file size on disk is about **18.8 MB** (~19 748 096 bytes). Smaller files are incomplete downloads.
3. `Ctrl+Shift+P` → **Extensions: Install from VSIX...**
4. Select the file → **Reload**.

> **OneDrive / cloud sync:** If install fails with *"End of central directory record signature not found"*, the `.vsix` was truncated. Download again from GitHub, or copy from `%LOCALAPPDATA%\ToddSpectRelease\` after `npm run package:vsix:release` (builds outside OneDrive). Compare SHA256 with the `.sha256` file on the release page.

### From the repository (build locally)

```bash
git clone https://github.com/nbsjunior/todd.git
cd toddspect
npm install
npm run package:vsix
```

Output: `packages/extension/toddspect-vscode-0.1.0.vsix` (extension + **bundled CLI**).

```bash
code --install-extension packages/extension/toddspect-vscode-0.1.0.vsix
```

---

## Step 2 — Open ToddSpect in VSCode

1. Reload VSCode after installing the `.vsix`.
2. Click the **ToddSpect** icon (hexagon) in the **Activity Bar** (left).
3. Open the **Chat** view (first tab).

If the icon is missing: `Ctrl+Shift+P` → **Developer: Reload Window**.

---

## Step 3 — Initialize your workspace

1. Open the folder of the project you want to work on (`File → Open Folder`).
2. `Ctrl+Shift+P` → **ToddSpect: Initialize Workspace**.

This creates:

```
your-project/
└── .toddspect/
    ├── config.yaml
    └── specs/
        ├── skill-code-review.md
        └── workflow-refactor-solid.md
```

---

## Step 3b — Verify setup (recommended)

```
Ctrl+Shift+P → ToddSpect: Check getGoat
```

Or from terminal (monorepo):

```bash
npm run getGoat
```

You should see **GitHub Copilot** as ✓ after configuring a token (next step).

---

## Step 4 — Configure GitHub Copilot (recommended first agent)

1. `Ctrl+Shift+P` → **ToddSpect: Open Configuration**  
   (or click the gear icon in the Chat toolbar).

2. Follow the wizard:
   - **Get started** → select **GitHub Copilot** → **Configure selected**
   - **Do not use classic PAT (`ghp_…`)** — the Copilot API rejects them.
   - **Recommended:** in a terminal run `gh auth login`, then `gh auth token`, and paste that value (`gho_…`).
   - **Alternative:** [Fine-grained PAT](https://github.com/settings/personal-access-tokens) with Copilot enabled (`github_pat_…`).
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

1. In the Explorer, right-click a file → **Add to ToddSpect Context**.
2. In Chat, pick **GitHub Copilot** in the agent dropdown (badge `GH`).
3. Try a suggestion chip or type:

```
Review the selected files for security issues
```

4. Press **Enter** or **Ctrl+Enter** to send.

The extension starts the **bundled CLI** in IPC mode (`node extension/cli/dist/index.js --ipc`). Logs appear in `View → Output → ToddSpect`.

---

## Bundled CLI layout

Inside the installed extension:

```
~/.vscode/extensions/toddspect.toddspect-vscode-0.1.0/
├── dist/extension.js          # Extension host
├── dist/webview/              # Chat, Config, Spec UI
└── cli/dist/index.js          # ToddSpect CLI (bundled orchestrator)
```

Resolution order in code:

1. `toddspect.cliPath` in settings (if set)
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

Ensure `GITHUB_TOKEN` or `toddspect.connectors.copilot.token` is set.

---

## Update flow (new version of ToddSpect)

### End users (VSIX only)

1. Download the new `.vsix` from Releases.
2. `Ctrl+Shift+P` → **Extensions: Install from VSIX...** (overwrites the previous version).
3. **Developer: Reload Window**.
4. Re-open your workspace — `.toddspect/` is preserved.

### Developers (from source)

```bash
cd toddspect
git pull origin main
npm install
npm run package:vsix
code --install-extension packages/extension/toddspect-vscode-0.1.0.vsix
```

What `package:vsix` does:

```
npm run build:cli      → packages/cli/dist/index.js
npm run bundle:cli     → packages/extension/cli/dist/index.js
npm run build:prod     → extension + webview bundles
vsce package           → toddspect-vscode-0.1.0.vsix
```

### Verify CLI after update

```bash
# Replace path with your extension install folder
node "%USERPROFILE%\.vscode\extensions\toddspect.toddspect-vscode-0.1.0\cli\dist\index.js" --help
```

In VSCode: send a chat message and confirm no **ToddSpect CLI not found** in Output → ToddSpect.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| **ToddSpect CLI not found** | Reinstall from a `.vsix` built with `npm run package:vsix`, or set `toddspect.cliPath` to `packages/cli/dist/index.js` |
| **CLI ping timed out** | Check Node.js ≥ 20: `node --version` |
| **HTTP 400 — PATs not supported** | Use `gh auth token` (after `gh auth login`) or a fine-grained PAT (`github_pat_…`), not `ghp_…` |
| **HTTP 401 (Copilot)** | Active Copilot subscription required; regenerate token via `gh auth login` |
| Extension icon missing | Reload window; confirm extension is enabled under Extensions |

---

## Next steps

- [User Guide](user-guide.md) — full feature reference
- [Agent Connectors](agent-connectors.md) — Claude, Devin, Cursor, KIRO
- [SDD Specs](sdd-specs.md) — Skills, Tools, Workflows
- [Getting Started (developers)](getting-started.md) — F5 debug workflow
