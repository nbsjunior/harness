# Usage Guide — Todd of AIDLC

> **Todd of AIDLC** is a free, open-source VS Code extension that gives you one chat sidebar for every major AI provider — GitHub Copilot, Claude, Cursor, Devin, and Kiro — without switching IDEs.

---

## Table of Contents

1. [Installation](#installation)
2. [First-time setup](#first-time-setup)
3. [Sending your first message](#sending-your-first-message)
4. [Switching providers](#switching-providers)
5. [Auto routing](#auto-routing)
6. [Adding file context](#adding-file-context)
7. [Modes — Ask, Agent, Spec+Agent](#modes)
8. [Spec-Driven Development (SDD)](#spec-driven-development)
9. [Configuration](#configuration)
10. [CLI standalone](#cli-standalone)
11. [Troubleshooting](#troubleshooting)
12. [License](#license)

---

## Installation

### From GitHub Releases (recommended)

1. Go to [github.com/nbsjunior/todd/releases](https://github.com/nbsjunior/todd/releases) and download the latest `toddspect-vscode-X.Y.Z.vsix`.
2. Open VS Code or Cursor.
3. Press `Ctrl+Shift+P` → **Extensions: Install from VSIX...** → select the downloaded file.
4. Click **Reload Window** when prompted.

> **Windows / OneDrive tip:** If install fails with *"End of central directory record signature not found"*, the file was corrupted during sync. Save the VSIX outside your OneDrive folder before installing.

### From source (developer build)

```bash
git clone https://github.com/nbsjunior/todd.git
cd todd
npm install
npm run build
node scripts/bundle-cli.mjs
cd packages/extension
npx @vscode/vsce package --no-dependencies
# Install the generated .vsix
```

---

## First-time setup

### 1. Open the Todd sidebar

Click the **Todd** icon in the VS Code Activity Bar (left side). The chat panel opens.

### 2. Initialize your workspace

Press `Ctrl+Shift+P` → **Todd: Initialize Workspace**. This creates a `.toddspect/` folder with an example config and spec files.

### 3. Configure at least one provider

Press `Ctrl+Shift+P` → **Todd: Open Configuration** → **Agents** tab.

| Provider | What you need |
|----------|--------------|
| **GitHub Copilot** | Run `gh auth login --scopes copilot` in a terminal, then click **Get from gh CLI** in the config panel |
| **Claude** | Install [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code), then set `ANTHROPIC_API_KEY` or paste the key in the panel |
| **Cursor** | Paste your [Cursor API key](https://cursor.com/settings) |
| **Devin** | Paste your [Devin API key](https://preview.devin.ai/settings) |
| **Kiro** | Run `toddspect setup` in a terminal to auto-download the Kiro CLI |

### 4. Verify readiness

Press `Ctrl+Shift+P` → **Todd: Check getGoat**. A panel shows which providers are ready (✅) or need attention (⚠️).

---

## Sending your first message

1. Click in the chat input at the bottom of the Todd sidebar.
2. Type your question or task.
3. Press **Enter** or click the **Send** button.

The response streams in real-time. Use the **Stop** button to cancel at any time.

---

## Switching providers

Use the **provider pills** above the chat input to pick:

| Pill | Provider |
|------|---------|
| **Auto** | Todd picks the best provider for each message |
| **Copilot** | GitHub Copilot (Ask or Agent mode) |
| **Claude** | Anthropic Claude Code |
| **Cursor** | Cursor Cloud Agents / SDK local |
| **Devin** | Devin autonomous engineer |
| **Kiro** | Kiro CLI with AI-DLC steering |

Your selection persists for the session. Switch mid-conversation — the next message goes to the new provider.

---

## Auto routing

When **Auto** is selected, Todd analyses the prompt and routes to the best agent:

| Signal in prompt | Default route |
|-----------------|---------------|
| General Q&A, explanation | Copilot |
| Complex refactor, hard bug | Claude |
| API integration, multi-file edit | Claude |
| Spec-driven task, Kiro steering | Kiro |
| "run autonomously" / long task | Devin |

See [docs/auto-routing.md](docs/auto-routing.md) for the full rule set.

---

## Adding file context

You can attach files and folders so the agent sees your code:

- **Explorer right-click** → **Add to Todd Context**
- **Editor right-click** → **Add to Todd Context**
- **Command**: `Ctrl+Shift+P` → **Todd: Add to Context**

Context chips appear above the chat input. Every message you send includes the content of those files.

To remove a chip, click **✕** on it or use **Todd: Clear Chat & Context**.

> Open editor tabs and your workspace root are automatically included by default (configurable via `toddspect.context.includeOpenEditors` and `toddspect.context.includeWorkspaceRoot`).

---

## Modes

Toggle the mode bar to the right of the provider pills:

| Mode | What happens |
|------|-------------|
| **Ask** | Conversational Q&A — simple completion, no tools |
| **Agent** | Autonomous loop — reads files, writes files, runs up to 10 iterations |
| **Spec+Agent** | Like Agent, but active `.toddspect/specs/*.yaml` files are injected as authoritative guidance at the start of each run |

> **Spec+Agent** is the most powerful mode: it combines file-editing autonomy with your project's defined skills and workflows.

---

## Spec-Driven Development

SDD turns agent behaviour from ad-hoc prompts into **versioned, reusable specs** stored alongside your code.

### Open the SDD view

Click the **SDD** tab in the Todd sidebar (or `Ctrl+Shift+P` → **Todd: Open Spec Manager**).

### Create a spec

1. Click **+ New Spec / Skill** in the SDD view.
2. Choose a type: **Skill**, **Tool**, or **Workflow**.
3. Fill in the name and description.
4. Todd scaffolds a YAML spec under `.toddspect/specs/`.

### Use the spec-kit workflow

The **Workflow** tab guides you through the GitHub spec-kit lifecycle:

1. **Constitution** — define project principles
2. **Specify** — write a Feature spec (acceptance criteria, constraints)
3. **Plan** — generate an implementation plan
4. **Tasks** — break the plan into actionable tasks
5. **Implement** — run the tasks in **Spec+Agent** mode

Each step produces a Markdown artifact under `.toddspect/sdd/`. These are committed to version control so your whole team shares the same context.

---

## Configuration

All settings live under the `toddspect.*` prefix in VS Code Settings (`Ctrl+,`), or in the graphical panel at **Todd: Open Configuration**.

Key settings:

| Setting | Default | Description |
|---------|---------|-------------|
| `toddspect.defaultAgent` | `auto` | Provider used when no pill is selected |
| `toddspect.context.includeOpenEditors` | `true` | Auto-attach open editor files |
| `toddspect.context.includeWorkspaceRoot` | `true` | Auto-attach workspace root |
| `toddspect.promptOptimization.enabled` | `true` | Trim history and inject quality rules |
| `toddspect.spending.budgetEnabled` | `false` | Show token budget warnings |
| `toddspect.aidlc.autoInstall` | `true` | Auto-install AI-DLC rules before Kiro chat |

Tokens and API keys are stored in **VS Code Secret Storage** (system keychain) — never in YAML files or settings.json.

---

## CLI standalone

Todd also ships a standalone CLI (`toddspect`) for use without VS Code:

```bash
# One-shot chat
toddspect run --agent copilot "Explain the AgentRouter class"

# Interactive chat
toddspect chat

# Bootstrap workspace
toddspect init

# Check agent readiness
toddspect check getGoat

# Install AI-DLC rules (Kiro steering)
toddspect aidlc install

# Full setup (Kiro CLI + AI-DLC + workspace init)
toddspect setup
```

The CLI reads `.toddspect/config.yaml` and environment variables for tokens. See [docs/getting-started.md](docs/getting-started.md) for CLI-only setup.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Todd sidebar doesn't appear | Reload Window (`Ctrl+Shift+P → Reload Window`) |
| "CLI stdin is not writable" | Reload Window; check **View → Output → Todd** for crash details |
| Copilot returns empty response | Run `gh auth refresh --scopes copilot`; verify with **Check getGoat** |
| Cursor requests timeout | Use **Ask** mode for quick questions; **Agent** mode can take minutes for complex tasks |
| Extension install fails (ZIP error) | File corrupted by cloud sync — save VSIX outside OneDrive/iCloud and reinstall |
| "No token found" on Claude | Ensure `ANTHROPIC_API_KEY` is set, or paste key in Configuration panel |

Full troubleshooting guide: [wiki/Troubleshooting](https://github.com/nbsjunior/todd/wiki/Troubleshooting)

---

## License

Todd of AIDLC is released under the **MIT License**.

```
MIT License

Copyright (c) 2026 Todd of AIDLC Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Full text: [LICENSE](../LICENSE)

### What the MIT license means in practice

| You can | You cannot |
|---------|-----------|
| Use Todd in commercial projects | Hold the authors liable for damages |
| Modify and redistribute the source | Remove the copyright notice |
| Build commercial products on top of Todd | Claim the original authors endorse your product |
| Fork the project privately or publicly | — |
| Sublicense | — |

### Third-party licences

Todd of AIDLC depends on several open-source packages. Run `npm ls --all` for the full dependency tree. Key dependencies:

| Package | License |
|---------|---------|
| `commander` | MIT |
| `@vscode/vsce` | MIT |
| `@modelcontextprotocol/sdk` | MIT |
| `@cursor/sdk` | MIT |
| `js-yaml` | MIT |
| `tsup` / `esbuild` | MIT |

The bundled **AI-DLC steering rules** (`packages/cli/vendor/aidlc-rules/`) are sourced from the [AWS AI-DLC project](https://github.com/aws/aidlc) and are used under their respective licence.
