# Getting Started with Harness (Developer Setup)

> **Looking to install Harness as a user?** See **[starter-kit.md](starter-kit.md)** (recommended) or [user-guide.md](user-guide.md).

This guide is for **contributors and developers** who want to clone the repository, run the extension in development mode, and contribute to the codebase.

---

## Prerequisites

| Requirement | Minimum version | Check |
|---|---|---|
| Node.js | 20 | `node --version` |
| npm | 10 | `npm --version` |
| VSCode | 1.85 | Help → About |
| Git | any | `git --version` |

---

## Step 1 — Clone and install

```bash
git clone https://github.com/nbsjunior/harness.git
cd harness
npm install
```

---

## Step 2 — Build and bundle the CLI

The extension communicates with the CLI daemon at runtime. Build the CLI and copy it into the extension package (same layout as the shipped `.vsix`):

```bash
npm run build:cli
npm run bundle:cli
```

You should see:
```
[bundle-cli] Copied CLI → packages/extension/cli/dist/
```

The bundled path `packages/extension/cli/dist/index.js` is what end users get inside the `.vsix`.

---

## Step 3 — Open the extension folder in VSCode

```bash
code packages/extension
```

> **Important:** Open `packages/extension`, not the monorepo root. The `.vscode/launch.json` inside the extension package points to the correct build output.

---

## Step 4 — Launch the Extension Development Host

Press **F5** (or `Run → Start Debugging`).

A new VSCode window opens — this is the *Extension Development Host*. It has Harness installed in development mode.

You should see:
- A **Harness icon** (hexagon with nodes) in the Activity Bar on the left
- No errors in the Debug Console

---

## Step 5 — Open a workspace project

In the Extension Development Host window, open any folder that contains source code:

```
File → Open Folder → (select your project)
```

---

## Step 6 — Initialize Harness

```
Ctrl+Shift+P → Harness: Initialize Workspace
```

This creates `.harness/` in your project root:

```
.harness/
├── config.yaml                   # Agent configuration (no secrets)
└── specs/
    ├── skill-code-review.md      # Example: code review skill
    └── workflow-refactor-solid.md # Example: SOLID refactoring workflow
```

---

## Step 7 — Configure an agent

Open the configuration panel:

```
Ctrl+Shift+P → Harness: Open Configuration
```

Or click the gear icon at the top of the Chat sidebar.

Set at least one agent key. The easiest to start with is **GitHub Copilot** if you have a GitHub token:

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens)
2. Create a token with `copilot` scope
3. In VSCode settings, set `harness.connectors.copilot.token` to your token

Or set it as an environment variable before launching VSCode:

```bash
GITHUB_TOKEN=ghp_xxxx code packages/extension
```

---

## Step 8 — Add context and chat

1. Click the **Harness icon** in the Activity Bar → **Chat** panel opens
2. Right-click a file or folder in the Explorer → **Add to Harness Context**
3. Type a message in the chat input and press **Ctrl+Enter**

Example prompts:
```
Review the selected files for security vulnerabilities
Generate unit tests for the auth module
Refactor this code to comply with SOLID principles
```

---

## Step 9 — Use the Spec Manager

1. Click the **Harness icon** → **Spec Manager** panel (second tab)
2. You'll see the example specs from `.harness/specs/`
3. Click **+ New Spec** to create a custom skill or workflow
4. Fill in the form and click **Save Spec**

The spec is saved as a `.md` file with YAML frontmatter. See [sdd-specs.md](sdd-specs.md) for the full spec format reference.

---

## Step 10 — Try the CLI standalone

```bash
# From the monorepo root
cd packages/cli

# Run the built CLI
node dist/index.js --help

# One-shot agent run
node dist/index.js agent:run \
  --agent copilot \
  --prompt "What are the main security risks in JWT authentication?" \
  --dirs ../my-project/src

# Parse specs
node dist/index.js spec:parse ../../.harness/specs/
```

---

## Step 11 — Package for distribution

From the monorepo root, produce a `.vsix` that includes the **bundled CLI**:

```bash
npm run package:vsix
```

Install locally:

```bash
code --install-extension packages/extension/harness-vscode-0.1.0.vsix
```

See [starter-kit.md](starter-kit.md) for the end-user update flow.

---

## Troubleshooting

### "Harness CLI not found"

The extension can't find the built CLI. Run:

```bash
npm run build:cli     # from monorepo root
```

Or set the path explicitly in VSCode settings:

```json
{ "harness.cliPath": "/absolute/path/to/harness/packages/cli/dist/index.js" }
```

### "CLI ping timed out"

The daemon started but didn't respond to the handshake within 5 seconds. Check:

1. Does `node packages/cli/dist/index.js --ipc` start without crashing?
2. Are there errors in the **Harness** output channel? (`View → Output → Harness`)

### "HTTP 401 from api.githubcopilot.com"

Your GitHub token is missing, expired, or lacks the `copilot` scope. Generate a new token at:  
`github.com → Settings → Developer settings → Personal access tokens → Fine-grained tokens`

### The chat shows "Unknown CLI error"

Open the **Harness** output channel (`View → Output → Harness`) and look for error lines from `[cli]` prefixed log entries written to stderr.

---

## Next Steps

| What | Where |
|---|---|
| Starter kit (VSIX + Copilot + update flow) | [starter-kit.md](starter-kit.md) |
| Use Harness as an end user (VSIX install) | [user-guide.md](user-guide.md) |
| Write effective SDD specs | [sdd-specs.md](sdd-specs.md) |
| Configure Devin, Cursor, Claude, and KIRO | [agent-connectors.md](agent-connectors.md) |
| Add a custom agent connector | [CONTRIBUTING.md](../CONTRIBUTING.md) |
| Understand the IPC protocol | [ipc-protocol.md](ipc-protocol.md) |
| Architecture overview | [architecture.md](architecture.md) |
