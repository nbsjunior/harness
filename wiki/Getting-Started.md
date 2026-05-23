<p align="center">
  <img src="images/toddspect-icon.png" alt="Todd of AIDLC logo" width="80" />
</p>

# Getting Started

Get Todd of AIDLC running in under 10 minutes.

Todd of AIDLC lets you use **Copilot, Claude, Cursor, Devin, and Kiro from one VS Code sidebar**, with **specs** and **file context** shared across providers. Read **[Why Todd of AIDLC](Why-Todd-of-AIDLC)** for the full picture.

## Requirements

| Requirement | Version |
|-------------|---------|
| VS Code | ≥ 1.85 |
| Node.js | ≥ 20 (on PATH — extension spawns the bundled CLI) |
| GitHub account | For Copilot (recommended first agent) |

## 1. Install the extension

**From release:** Download `toddspect-vscode.vsix` from [Releases](https://github.com/nbsjunior/todd/releases) → `Ctrl+Shift+P` → **Extensions: Install from VSIX...** → Reload.

**From source:**

```bash
git clone https://github.com/nbsjunior/todd.git
cd toddspect
npm install
npm run package:vsix
code --install-extension packages/extension/toddspect-vscode.vsix
```

The `.vsix` includes the compiled CLI — no separate install needed.

## 2. Open Todd of AIDLC

1. Open a project folder in VS Code
2. Click the **Todd of AIDLC** icon in the Activity Bar (sidebar)
3. Wait for **Todd of AIDLC CLI daemon ready** in **View → Output → Todd of AIDLC**

## 3. Configure GitHub Copilot

1. `Ctrl+Shift+P` → **Todd of AIDLC: Copilot Login** (or run `gh auth login --scopes copilot`)
2. Open **Todd of AIDLC: Open Configuration** → verify Copilot shows ready
3. Run **Todd of AIDLC: Check getGoat** to confirm agents

## 4. Send your first message

1. In the chat panel, select **Copilot** at the bottom
2. Mode **Ask** (default)
3. Type a question → `Ctrl+Enter` or click **↑**

## Next steps

- [Chat Interface](Chat-Interface) — providers, modes, new chat
- [Copilot Modes](Copilot-Modes) — Ask / Agent / Spec+Agent
- [Configuration](Configuration) — all agents and API keys
- [Troubleshooting](Troubleshooting) — common errors
