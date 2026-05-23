# Todd of AIDLC — AI Reference (design rationale)

> **Goal:** explain *why* things exist so you can change the codebase without a full tree walk.
> Pair with [code-map.md](code-map.md) for *where* things live.

---

## Product intent

Todd of AIDLC is a **meta-agent orchestrator**: one **VS Code** UI (or CLI) talks to many backends
(Copilot, Devin, Cursor, Claude Code, Kiro) so developers **do not change IDE per provider**.

Differentiators (user-facing copy in [why-todd-of-aidlc.md](why-todd-of-aidlc.md)):

- **One IDE, many providers** — provider pills + **Auto** routing in one sidebar.
- **Spec-Driven Development** — `.toddspect/specs/` + **Spec+Agent** injects specs as system context.
- **Context engineering** — file/directory attachments are **provider-agnostic** (same context after switching agent).

The user picks an agent and mode; Todd of AIDLC handles auth, context, specs, streaming, and Copilot tool loops.

**Non-goals:** Todd of AIDLC is not a new LLM. It does not embed model weights. It routes and wraps.

---

## Architectural invariants (do not break)

| Rule | Reason |
|------|--------|
| **Extension never reads file contents** | Keeps VS Code UI thread free; all `fs` in CLI. |
| **stdout = JSON IPC only** (daemon) | Extension parses stdout line-by-line as frames. |
| **stderr = human logs** | Use `toddspectLog()` / `toddspectWarn()` from `log.ts`. |
| **CLI bundled in VSIX** | Extension ships `cli/dist/index.js` (~900 KB ESM); no `npm install` in extension folder. |
| **Duplicate `types.ts`** | CLI and extension cannot import each other at runtime; keep shapes in sync manually. |
| **Secrets not in YAML** | `.toddspect/config.yaml` is for non-secret defaults only. |

---

## Why dual process (Extension + CLI daemon)?

```
User → Webview → Extension Host → stdin/stdout JSON → CLI Daemon → Agent APIs
```

- **Extension host** is sandboxed and should stay responsive.
- **CLI daemon** does blocking I/O (read files, HTTP, subprocesses for Claude/Kiro).
- Same CLI runs standalone (`toddspect chat`) without the extension — one router, two entry points.

**Daemon stability (Windows):** `IpcServer` must **not** `process.exit(0)` on stdin `end` — spurious EOF
on Windows caused "CLI daemon exited unexpectedly". Heavy work (Kiro download, `toddspect setup`) runs in a
**separate** `CliService.runCommand('setup')` subprocess, not inside the IPC daemon.

---

## Copilot modes — why three?

| Mode | User expectation | Implementation |
|------|------------------|----------------|
| **ask** | Chat only, no file edits | `routeCopilot` → SSE `streamSseRequest`, `stream: true` |
| **agent** | Autonomous edits | `routeCopilotAgent` → non-streaming loop + OpenAI `tools` (max 10 iterations) |
| **spec+agent** | Agent + project rules | Same as agent; `IpcServer` prepends `<spec>` system blocks from `.toddspect/specs/*.yaml` |

Tools in agent mode: `read_file`, `write_file`, `list_files`, `search_in_files` — implemented at bottom
of `AgentRouter.ts` (`executeCopilotTool`). Paths resolve against `TODDSPECT_WORKSPACE` or context paths.

**UI:** `webview/chat/main.ts` mode bar → `selectMode` → `ChatViewProvider.selectedMode` → `ChatSendPayload.mode`.

---

## Copilot authentication — why so many steps?

GitHub Copilot API (`api.githubcopilot.com`) requires:

1. A GitHub token with scope **`copilot`** (not just `repo`).
2. Optionally exchange via `GET /copilot_internal/v2/token` (individual plans).
3. If exchange returns **404**, use the OAuth token **directly** as Bearer (works when `copilot` scope is present).

**Resolution order (extension → CLI env):**

1. Live `gh auth token` (freshest — `configBridge.ts` prefers this over stale VS Code secrets)
2. VS Code secret `toddspect.connectors.copilot.token`
3. `GH_TOKEN` / `COPILOT_GITHUB_TOKEN` env vars
4. `loadToddSpectConfig()` also calls `getGhCliToken()` as fallback

**User fix:** `gh auth refresh --scopes copilot` then reload VS Code.

**Classic PATs (`ghp_`)** are rejected — `validateCopilotToken()` returns an error message.

---

## Config layering — why five sources?

Different deployment contexts:

- **Developer in VS Code** → secrets + settings bridge
- **CI / script** → env vars
- **Team defaults** → `.toddspect/config.yaml`
- **Copilot live token** → `gh auth token` subprocess

`TODDSPECT_SETTINGS_JSON` carries non-secret VS Code settings (endpoints, Kiro cli path) into the CLI child process.

---

## Kiro + AI-DLC — why CLI subprocess?

Kiro has no simple REST chat API in Todd of AIDLC. Integration uses **kiro-cli** headless plus **steering files**
from [awslabs/aidlc-workflows](https://github.com/awslabs/aidlc-workflows) installed under `.kiro/steering/`.

- `ensureKiroCli()` downloads/caches binary per OS (see `kiro/bootstrap.ts`).
- `installAidlcRules()` copies vendor rules from extension bundle or downloads release zip.
- `buildKiroPrompt()` prepends AI-DLC activation prefix when user says "Using AI-DLC, …".

**Never** run Kiro download inside IPC daemon — blocks stdout and risks crash.

---

## Cursor Agent — local vs Cloud

| User choice | Implementation |
|-------------|----------------|
| **Cursor + Ask** | `routeCursorCloud()` — remote Cloud Agents API |
| **Cursor + Agent** (default `auto`, API key set) | `routeCursorLocal()` — `@cursor/sdk` with `local: { cwd: TODDSPECT_WORKSPACE }` |
| **`toddspect.cursor.agentExecution: cloud`** | Always Cloud — no local file edits; Live Edits empty |
| **Fallback** | If SDK unavailable and Copilot configured, Copilot tool loop (uses Copilot quota) |

**Why two paths:** Cursor Cloud cannot write to the user's open VS Code tree. Local edits need either the Cursor SDK on disk or Todd of AIDLC's Copilot tool loop.

**Auth:** Cursor local needs `CURSOR_API_KEY` only — not `gh auth` / Copilot scope.

Details: [cursor-agent.md](cursor-agent.md).

---

## Specs (SDD) — why YAML in `.toddspect/specs/`?

Specs describe **Skills**, **Tools**, or **Workflows** with preferred agent and optional tool schemas.
They are project-local contracts for agents — not Todd of AIDLC internals.

- **Spec Manager UI** edits files; CLI `specParser.ts` validates with Zod.
- **spec+agent mode** injects raw YAML as `<spec path="…">` system context (authoritative guidance).

---

## IPC — mental model

Request/response correlation via `id` (UUID). Streaming uses **push** frames:

- Extension sends `chat:send` once.
- CLI pushes many `chat:chunk` `{ done: false }` then one `{ done: true }`.
- `AgentService` registers listeners **before** sending the request.

See [ipc-protocol.md](ipc-protocol.md) for the full action table.

---

## Bundling — why `noExternal` + `createRequire` banner?

The extension runs `node cli/dist/index.js`. Most npm deps are bundled into one ESM file; **`@cursor/sdk`**
and platform packages stay **external** under `extension/cli/node_modules/@cursor/` (copied by `scripts/bundle-cli.mjs`).
CJS packages (e.g. commander) need:

```js
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
```

at the top of the bundle (`tsup.config.ts` `banner`).

---

## Common tasks (recipes for AI)

### Add a new IPC action

1. Add to `IpcAction` in **both** `types.ts` files.
2. Handle in `IpcServer.dispatchMessage`.
3. If extension-initiated: send from `CliService` / `AgentService`.
4. Document in `ipc-protocol.md` and AGENTS.md table.

### Change Copilot model or tools

- Model string: `AgentRouter.routeCopilot` / `routeCopilotAgent` (`gpt-4o`).
- Tools: `buildCopilotTools()` at bottom of `AgentRouter.ts`.

### Fix "daemon exited unexpectedly"

- Check stderr in Output → Todd of AIDLC.
- Ensure no `console.log` on stdout in daemon path.
- Ensure setup/Kiro bootstrap is not inside `startIpcServer`.
- Check Windows stdin `end` handler does not exit process.

### Fix Copilot 401 / 404 auth

- `gh auth status` — must include `copilot` scope.
- Test: token with scope works direct on `api.githubcopilot.com/chat/completions`.
- Stale secret: extension now prefers live `gh auth token`; clear old secret if needed.

### Add UI to chat webview

- Edit `webview/chat/main.ts` (browser bundle).
- Add `WebviewCommand` / `ExtensionCommand` in `types.ts`.
- Handle in `ChatViewProvider.handleWebviewMessage`.

---

## Glossary

| Term | Meaning |
|------|---------|
| **Agent** | Backend LLM service (`AgentId`) |
| **Mode** | Copilot interaction style (`CopilotMode`) |
| **Spec** | SDD YAML skill/tool/workflow definition |
| **Context** | User-selected files/dirs sent as `<file>` blocks |
| **Frame** | One JSON line on IPC stdout |
| **Bridge** | `configBridge.ts` env + `TODDSPECT_SETTINGS_JSON` |
