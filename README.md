<p align="center">
  <img src="docs/images/toddspect-icon.png" alt="Todd of AIDLC logo" width="96" />
</p>

<h1 align="center">Todd of AIDLC</h1>
<p align="center"><strong>Open-source meta-agent orchestrator — one VS Code sidebar for every AI provider.</strong></p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=toddspect.toddspect-vscode"><img src="https://img.shields.io/visual-studio-marketplace/v/toddspect.toddspect-vscode?label=marketplace&color=007ACC&logo=visual-studio-code" alt="VS Code Marketplace"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=toddspect.toddspect-vscode"><img src="https://img.shields.io/visual-studio-marketplace/i/toddspect.toddspect-vscode?label=installs" alt="Marketplace installs"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT License"></a>
  <a href="https://github.com/nbsjunior/todd/releases"><img src="https://img.shields.io/github/v/release/nbsjunior/todd?label=release&color=green" alt="Latest release"></a>
  <a href="https://github.com/nbsjunior/todd/actions/workflows/ci.yml"><img src="https://github.com/nbsjunior/todd/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/Node.js-%3E%3D20-green" alt="Node.js ≥ 20">
  <img src="https://img.shields.io/badge/TypeScript-5.8-blue" alt="TypeScript 5.8">
  <img src="https://img.shields.io/badge/VSCode-%3E%3D1.85-007ACC" alt="VS Code ≥ 1.85">
  <a href="https://github.com/nbsjunior/todd/issues"><img src="https://img.shields.io/github/issues/nbsjunior/todd" alt="Open issues"></a>
  <a href="https://github.com/nbsjunior/todd/pulls"><img src="https://img.shields.io/github/issues-pr/nbsjunior/todd" alt="Open PRs"></a>
</p>

> **One sidebar. Every agent. One conversation.**  
> Stop juggling Copilot in VS Code, Cursor in another IDE, Claude in a browser tab, and Devin in yet another panel. **Todd of AIDLC** keeps chat, file context, specs, and provider routing in a **single interaction** — so you stay in flow.

---

## ✨ Why one interaction matters

Today most teams use several AI tools. Each has its own window, login, and context. You re-attach the same files, re-explain the repo, and lose thread when you switch vendors.

**Todd of AIDLC** fixes that with one unified surface:

| Benefit | What you get |
|---------|----------------|
| **Single chat panel** | Copilot, Claude, Cursor, Devin, and Kiro from one composer — switch with a pill or **Auto** routing. |
| **Shared context** | Attach files once (**Add to Todd Context**). The same chips go to **every** provider on the next message. |
| **Spending dashboard** | See **requests**, **tokens in/out**, and **agent time** per provider in one **Spending** tab (workspace-local). |
| **Prompt optimization** | Built-in pipeline trims history, dedupes messages, caps context files, and injects quality rules — **fewer tokens**, **better answers** on every provider. |
| **One setup flow** | API keys, MCP servers, workspace defaults, and usage stats — one configuration panel. |
| **Spec-Driven Development** | Todd specs (`.toddspect/specs/`) + **spec-kit** workflow (`.toddspect/sdd/`) — constitution → specify → plan → tasks → implement in the **SDD** view. |
| **Same CLI under the hood** | Extension and standalone CLI share routing, auth, and file I/O — no duplicate logic. |

**[→ Usage Guide](USAGE.md)** · **[→ User Manual](docs/user-manual.md)** · [Wiki](https://github.com/nbsjunior/todd/wiki) · [Why Todd?](docs/why-todd-of-aidlc.md)

---

## 🚀 Quick install

### Option A — VS Code Marketplace (recommended)

1. Open VS Code → `Ctrl+Shift+X` → search **"Todd Meta-Agent"**  
   — or click: **[Install from Marketplace](https://marketplace.visualstudio.com/items?itemName=toddspect.toddspect-vscode)**
2. Click **Install** → **Reload Window**.
3. Click the **Todd** icon in the Activity Bar → `Ctrl+Shift+P` → **Todd: Initialize Workspace**.

### Option B — Manual VSIX

1. Download the latest **`toddspect-vscode-*.vsix`** from [**Releases**](https://github.com/nbsjunior/todd/releases).
2. `Ctrl+Shift+P` → **Extensions: Install from VSIX...** → select the file → **Reload Window**.
3. Click the **Todd** icon in the Activity Bar → `Ctrl+Shift+P` → **Todd: Initialize Workspace**.

> Full installation and first-use guide: **[USAGE.md](USAGE.md)**

---

## 🤝 Open source — contribute!

Todd of AIDLC is **100% open source** under the [MIT License](LICENSE).  
Whether you fix a connector, improve docs, add a new provider, or share UX feedback — **every contribution is welcome**.

| How to help | Link |
|-------------|------|
| ⭐ Star the repo | [github.com/nbsjunior/todd](https://github.com/nbsjunior/todd) |
| 🐛 Report a bug | [New Issue → Bug Report](https://github.com/nbsjunior/todd/issues/new?template=bug_report.yml) |
| 💡 Request a feature | [New Issue → Feature Request](https://github.com/nbsjunior/todd/issues/new?template=feature_request.yml) |
| 🔧 Submit a PR | Read [CONTRIBUTING.md](CONTRIBUTING.md) and the [GitFlow guide](docs/gitflow.md) |
| 📖 Improve the Wiki | Edit [`wiki/`](wiki/) and run `node scripts/publish-wiki.mjs` |
| 🔒 Report a security issue | See [SECURITY.md](SECURITY.md) |

**Quick dev setup:**

```bash
git clone https://github.com/nbsjunior/todd.git
cd todd && npm install && npm run build
# Press F5 in VS Code (packages/extension) to launch the dev extension
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for conventions, the full connector checklist, and the PR checklist.

---

## 🌿 Branch strategy (GitFlow)

We use a simplified GitFlow:

| Branch | Purpose |
|--------|---------|
| `main` | Always releasable — every tag triggers a VSIX release |
| `develop` | Integration branch — features merge here |
| `feature/*` | One feature or fix per branch, created from `develop` |
| `release/*` | Release preparation (version bump, changelog) |
| `hotfix/*` | Critical fixes applied directly to `main` |

Full details: **[docs/gitflow.md](docs/gitflow.md)**

---

## 📋 What is Todd of AIDLC?

Todd of AIDLC is a VS Code extension acting as a **Meta-Agent Orchestrator**: you interact through one sidebar panel; Todd routes each request to the right agent using your provider choice (or **Auto**), your **SDD** specs, and the **context** you attached.

```
┌──────────────────────────────────────────────────────────┐
│                     VS Code Sidebar                       │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  Chat View   │  │  SDD View    │  │  Agent Menu   │  │
│  └──────┬───────┘  └──────┬───────┘  └───────┬───────┘  │
└─────────┼─────────────────┼──────────────────┼──────────┘
          │                 │                  │
          └─────────────────┴──────────────────┘
                            │ stdin/stdout JSON (IPC)
                            ▼
          ┌─────────────────────────────────────────────────┐
          │           CLI Daemon (Node.js)                   │
          │  ┌────────────┐ ┌──────────┐ ┌───────────────┐ │
          │  │  Context   │ │  Spec    │ │ Agent Router  │ │
          │  │  Builder   │ │  Parser  │ │               │ │
          │  └────────────┘ └──────────┘ └───────┬───────┘ │
          └──────────────────────────────────────┼─────────┘
                                                 │
          ┌────────────┬──────────────┬──────────┴──────────┐
          ▼            ▼              ▼                      ▼
    GitHub Copilot   Devin       Cursor AI    Claude Code / Kiro
```

---

## ✅ Features

| Feature | Description |
|---|---|
| **Spending & usage** | Track **calls**, **tokens (in/out)**, and **duration** per provider |
| **Prompt optimization** | Pre-route pipeline for efficiency (dedupe, history trim, file caps) and quality |
| **Multi-provider chat** | Copilot, Claude, Cursor, Devin, Kiro — one UI; switch with a pill or **Auto** routing |
| **Context engineering** | Right-click → *Add to Todd Context*; chips above composer; shared across providers |
| **SDD view (spec-kit)** | Full spec-kit pipeline: constitution → specify → plan → tasks → implement |
| **Spec+Agent mode** | Inject active specs + SDD artifacts as context before agent runs |
| **Configuration Panel** | Agents, MCP, workspace, and Spending — API keys and endpoints in one place |
| **CLI Orchestrator** | Node.js daemon: file I/O, spec parsing, agent routing (bundled in `.vsix`) |
| **MCP Support** | Connect Model Context Protocol servers (stdio or HTTP) |
| **Auto-reconnect** | CLI daemon restarts automatically if it crashes |

---

## 📦 Installation

### From VSIX (end users)

1. Download `toddspect-vscode-*.vsix` from [**Releases**](https://github.com/nbsjunior/todd/releases).
2. `Ctrl+Shift+P` → **Extensions: Install from VSIX...** → Reload.
3. Click **Todd** icon → **Todd: Initialize Workspace**.

### From source (contributors / developers)

```bash
git clone https://github.com/nbsjunior/todd.git
cd todd
npm install
npm run build:cli          # build CLI daemon first
npm run watch              # watch both packages
code packages/extension    # open extension folder, then press F5
```

**Package as `.vsix`:**

```bash
npm run package:vsix       # builds + bundles CLI + vsce package
```

---

## 🔧 Project structure

```
todd/
├── packages/
│   ├── extension/          VS Code Extension (esbuild)
│   └── cli/                CLI Daemon (tsup/ESM)
├── docs/                   Technical documentation
├── wiki/                   GitHub Wiki source
├── scripts/                Build and publish helpers
├── .github/
│   ├── workflows/          CI (build + secret scan) + Release (VSIX)
│   ├── ISSUE_TEMPLATE/     Bug report & feature request forms
│   └── PULL_REQUEST_TEMPLATE.md
├── USAGE.md                Full usage guide + MIT licence explanation
├── CONTRIBUTING.md         Dev setup, conventions, connector checklist
├── SECURITY.md             Vulnerability reporting and token handling policy
├── docs/gitflow.md         Branch strategy and release process
└── LICENSE                 MIT
```

---

## 📚 Documentation

| Audience | Start here |
|----------|------------|
| **New users** | **[USAGE.md](USAGE.md)** — install, setup, first chat, all features |
| **User Manual (in-app)** | [docs/user-manual.md](docs/user-manual.md) · [Wiki: User Manual](https://github.com/nbsjunior/todd/wiki/User-Manual) |
| **Why Todd?** | [docs/why-todd-of-aidlc.md](docs/why-todd-of-aidlc.md) |
| **GitHub Wiki** | **[github.com/nbsjunior/todd/wiki](https://github.com/nbsjunior/todd/wiki)** |
| **AI assistants** | [AGENTS.md](AGENTS.md) → [docs/ai-reference.md](docs/ai-reference.md) → [docs/code-map.md](docs/code-map.md) |
| **Developers** | [CONTRIBUTING.md](CONTRIBUTING.md) · [docs/architecture.md](docs/architecture.md) · [docs/gitflow.md](docs/gitflow.md) |

---

## 🗺️ Roadmap

- [x] Session persistence — `.toddspect/chat-session.json`
- [x] Token and request usage tracking (Spending tab)
- [x] Budget alerts and spending limits per provider
- [x] Spec auto-discovery — `todd spec:discover`
- [x] Multi-agent parallel execution — `todd agent:fanout`
- [x] GitHub Actions integration
- [x] Plugin marketplace (manifest preview)
- [x] Web UI for remote instances — `todd web:serve`
- [x] GitHub spec-kit SDD workflow in UI
- [ ] VS Code Marketplace publish
- [ ] Gemini / Mistral connectors
- [ ] Agent memory and long-context compression
- [ ] Per-spec token budgets

---

## 🔒 Security

Tokens and API keys are stored exclusively in VS Code Secret Storage (system keychain) or environment variables — **never** in config files or logs.  
To report a vulnerability: **[SECURITY.md](SECURITY.md)**

---

## 📄 License

**MIT** — free to use, modify, and distribute. See [LICENSE](LICENSE) and the [licence section in USAGE.md](USAGE.md#license) for plain-English details.

```
Copyright (c) 2026 Todd of AIDLC Contributors
```

---

<p align="center">
  <em>If Todd saves you time, consider <a href="https://github.com/nbsjunior/todd">⭐ starring the repo</a> — it helps the project grow.</em>
</p>
