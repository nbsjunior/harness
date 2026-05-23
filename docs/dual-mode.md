# Todd of AIDLC — CLI or VS Code Extension

Todd of AIDLC offers **two ways** to use the same orchestrator. Pick one — both share `.toddspect/` config and the same agent router.

**Value proposition:** the extension is how most teams get **one IDE + many providers + SDD + context** in a single UI. The CLI is the same engine for scripts and CI. See [why-todd-of-aidlc.md](why-todd-of-aidlc.md).

```
                    ┌─────────────────────────────────┐
                    │     Todd of AIDLC Agent Router        │
                    │  Copilot · Claude · Devin · …   │
                    └───────────────┬─────────────────┘
                                    │
              ┌─────────────────────┴─────────────────────┐
              ▼                                           ▼
   ┌──────────────────────┐                 ┌──────────────────────┐
   │  VS Code Extension   │                 │   CLI (`todd`)    │
   │  Sidebar Chat UI     │                 │   Terminal / CI      │
   │  Config wizard       │                 │   Scripts / pipes      │
   └──────────┬───────────┘                 └──────────┬───────────┘
              │ spawns                                │ direct
              ▼                                       ▼
        node cli/dist/index.js --ipc            node cli/dist/index.js agent:run
```

---

## Which mode should I use?

| You want… | Use |
|---|---|
| Chat in the IDE, context from Explorer, Spec Manager | **VS Code Extension** |
| Scripts, CI, terminal one-liners, no IDE | **CLI** |
| Both | Install extension **and** use CLI — same tokens via `gh auth token` / `.toddspect/config.yaml` |

---

## Quick start — Extension (simplest for most users)

1. Install `toddspect-vscode-0.1.0.vsix` (includes bundled CLI).
2. Click **Todd of AIDLC** in the Activity Bar → **Chat**.
3. `Ctrl+Shift+P` → **Todd of AIDLC: Initialize Workspace**.
4. `Ctrl+Shift+P` → **Todd of AIDLC: Open Configuration** → configure **GitHub Copilot** (`gh auth token`).
5. Right-click files → **Add to Todd of AIDLC Context** → send a message.

Details: [starter-kit.md](starter-kit.md)

---

## Quick start — CLI only

```bash
# 1. Build (from repo clone)
cd toddspect
npm install
npm run build:cli
npm run setup    # Kiro CLI + AI-DLC rules + .toddspect/

# 2. Auth for Copilot (recommended)
gh auth login
export GH_TOKEN=$(gh auth token)

# 3. Initialize project
node packages/cli/dist/index.js init .

# 4. Check setup
npm run getGoat

# 5. One-shot prompt
node packages/cli/dist/index.js agent:run \
  --agent copilot \
  --prompt "Review src/ for security issues" \
  --dirs src
```

Or link globally after build:

```bash
cd packages/cli && npm link
todd check getGoat
todd agent:run -a copilot -p "Hello"
```

---

## One configuration, both modes

| Source | Extension | CLI |
|---|---|---|
| Secrets (tokens) | VS Code Secret Storage → `GH_TOKEN`, etc. | Same env vars when spawned from extension |
| Endpoints / paths | VS Code settings → `TODDSPECT_SETTINGS_JSON` | Read by CLI daemon |
| Project config | `.toddspect/config.yaml` | `.toddspect/config.yaml` |
| Shell env | `GH_TOKEN`, `ANTHROPIC_API_KEY`, … | Same |

**Tip:** Run **`Todd of AIDLC: Check getGoat`** or `todd check getGoat` before your first chat to see which agents are ready.

---

## Verify everything works

```bash
# From repo root (CLI)
npm run getGoat
```

In VS Code:

```
Ctrl+Shift+P → Todd of AIDLC: Check getGoat
```

Expected: at least **GitHub Copilot** shows ✓ when `GH_TOKEN` is set with a valid OAuth token (`gho_…`), not classic `ghp_…`.

---

## Update flow (both modes)

```bash
git pull
npm run package:vsix
code --install-extension packages/extension/toddspect-vscode-0.1.0.vsix
```

Reload VSCode. CLI inside the `.vsix` updates automatically with the extension.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Extension says CLI not found | Reinstall `.vsix` built with `npm run package:vsix` |
| getGoat shows 0/5 agents | `gh auth login` → `export GH_TOKEN=$(gh auth token)` |
| Copilot HTTP 400 PAT | Do not use `ghp_` tokens — use `gh auth token` |
| CLI works, Extension does not | Reload window; **Todd of AIDLC: Check getGoat** |
| Extension works, CLI does not | Run CLI from project root; `todd init` |
