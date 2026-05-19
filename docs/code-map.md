# Harness — Code Map (exports by file)

> One-line purpose for every public export. Use with [ai-reference.md](ai-reference.md) for *why*.

---

## CLI — `packages/cli/src/`

### `index.ts`
CLI entry (commander). Registers commands: `chat`, `run`, `check getGoat`, `init`, `setup`, `aidlc`, `--ipc` daemon mode.

### `types.ts`
Shared IPC and domain types (mirror extension). Key: `AgentId`, `CopilotMode`, `ChatSendPayload`, `IpcAction`.

### `config.ts`
| Export | Purpose |
|--------|---------|
| `AgentConnectorConfig` | All agent connection settings (tokens, endpoints, Kiro CLI path). |
| `KiroConnectorConfig` | Kiro-specific: cliPath, trustTools, aidlcAutoInstall, mode cli\|rest. |
| `LoadedHarnessConfig` | Config + defaultAgent. |
| `loadHarnessConfig()` | Merge YAML + env + `HARNESS_SETTINGS_JSON`; Copilot token includes `getGhCliToken()`. |
| `loadAgentConfig()` | Returns only `connectors` slice (used by IPC router). |

### `log.ts`
| Export | Purpose |
|--------|---------|
| `harnessLog()` | Print to stderr if `HARNESS_IPC=1`, else stdout. |
| `harnessWarn()` | Same for warnings. |

### `ipc/IpcServer.ts`
| Export | Purpose |
|--------|---------|
| `startIpcServer()` | Main daemon loop: read stdin NDJSON, dispatch, write stdout frames. |

Internal handlers: `handleChatSend` (context + spec injection), `handleContextBuild`, `handleSpecParse`, `handleAidlcInstall`, `handleSetupBootstrap`.

### `router/autoRouter.ts`

| Export | Purpose |
|--------|---------|
| `AUTO_ROUTING_RULES` | Keyword/signal table for Auto provider selection (documented in file). |
| `scoreAutoAgents()` | Score each `AgentId` from prompt + mode + context. |
| `resolveAutoAgent()` | Pick ready agent; fallback chain if winner unavailable. |
| `resolveAgentSelection()` | Map `auto` → concrete `AgentId`. |

### `router/AgentRouter.ts`
| Export | Purpose |
|--------|---------|
| `AgentRequest` | Route payload: messages, agent, mode, config, callbacks. |
| `AgentRouter` | Class with `route()` → per-agent private methods. |

| Method | Purpose |
|--------|---------|
| `route()` | Readiness check then switch on `agent`. |
| `routeCopilot()` | Token resolve + ask (SSE) or agent (tool loop). |
| `routeCopilotAgent()` | OpenAI tools loop, max 10 iterations. |
| `routeDevin()` | POST session to Devin API. |
| `routeCursor()` | SSE to Cursor OpenAI-compatible endpoint. |
| `routeClaude()` | Spawn Claude Code CLI, parse NDJSON stdout. |
| `routeKiro()` | ensure Kiro CLI + AI-DLC, `runKiroCli()`. |
| `buildOpenAiMessages()` | Map chat history; inject agent system prompt by mode. |
| `streamSseRequest()` | SSE parser for OpenAI-style streaming. |
| `httpPostJson()` | Non-streaming POST for tool-call turns. |

Module-level: `buildCopilotTools()`, `executeCopilotTool()` — agent file tools.

### `router/agentReadiness.ts`
| Export | Purpose |
|--------|---------|
| `AgentReadiness` | `{ agent, label, ready, hint }`. |
| `checkAgentReadiness()` | Per-agent token/CLI checks. |
| `checkAllAgents()` | All five agents for `check getGoat`. |

### `connectors/copilotAuth.ts`
| Export | Purpose |
|--------|---------|
| `COPILOT_INTEGRATION_ID` | Header value for Copilot API. |
| `getCopilotApiToken()` | Exchange GitHub token via internal endpoint; cache ~15 min. |
| `buildCopilotAuthHeaders()` | Bearer + integration id. |
| `validateCopilotToken()` | Reject empty / `ghp_` classic PATs. |

### `connectors/ghToken.ts`
| Export | Purpose |
|--------|---------|
| `getGhCliToken()` | `gh auth token`; skip `ghp_`. |
| `isGhCliAvailable()` | `gh auth status` exit 0. |

### `connectors/kiroCli.ts`
| Export | Purpose |
|--------|---------|
| `runKiroCli()` | Exec `kiro-cli chat --no-interactive` with streaming stdout/stderr. |
| `probeKiroCli()` | Check binary exists/runs. |

### `kiro/bootstrap.ts`
| Export | Purpose |
|--------|---------|
| `ensureKiroCli()` | Download/install Kiro CLI for OS/arch; cache path in `~/.harness/tools`. |
| `resolveKiroCliPathSync()` | Sync path: env > cache marker > bundled > `kiro-cli`. |

### `kiro/paths.ts`
| Export | Purpose |
|--------|---------|
| `getKiroToolsRoot()` | `~/.harness/tools/kiro-cli`. |
| `readCachedKiroCliPath()` / `writeCachedKiroCliPath()` | Marker file for installed binary. |
| `resolveBundledKiroCliPath()` | Path inside extension/npm package if present. |

### `aidlc/constants.ts`
Version, steering rule names, release zip URL for AI-DLC rules.

### `aidlc/paths.ts`
| Export | Purpose |
|--------|---------|
| `getAidlcPaths()` | Workspace paths: `.kiro/steering`, `aidlc-docs/`. |

### `aidlc/status.ts`
| Export | Purpose |
|--------|---------|
| `getAidlcStatus()` | Whether steering rules are installed + version. |

### `aidlc/install.ts`
| Export | Purpose |
|--------|---------|
| `installAidlcRules()` | Copy vendor or download zip into `.kiro/steering`. |
| `ensureAidlcInstalled()` | Install if missing when autoInstall enabled. |
| `resolveBundledAidlcVendorDir()` | Bundled rules in extension/cli/vendor. |

### `aidlc/prompt.ts`
| Export | Purpose |
|--------|---------|
| `isAidlcActivationPrompt()` | Detect "Using AI-DLC" prefix. |
| `buildKiroPrompt()` | Flatten messages + optional AI-DLC prefix for kiro-cli. |

### `parsers/specParser.ts`
| Export | Purpose |
|--------|---------|
| `parseSpecFile()` | Parse one YAML spec with Zod validation. |
| `parseSpecDirectory()` | Parse all specs in folder. |
| `specToYaml()` / `specToMarkdown()` | Serialize spec for export/display. |

### `parsers/markdownParser.ts`
| Export | Purpose |
|--------|---------|
| `parseMarkdownFile()` | Section-based markdown parse (legacy/spec docs). |
| `scanMarkdownDirectory()` | Find markdown files under tree. |

### `commands/getGoat.ts`
| Export | Purpose |
|--------|---------|
| `getGoatCommand()` | Print agent readiness + AI-DLC status; exit code 0 if any agent ready. |

### `commands/setup.ts`
| Export | Purpose |
|--------|---------|
| `setupCommand()` | init workspace + Kiro CLI + AI-DLC (flags: `--skip-kiro`, `-q`). |

### `commands/init.ts`
| Export | Purpose |
|--------|---------|
| `initCommand()` | Create `.harness/` scaffold (config, specs dir). |

### `commands/aidlc.ts`
| Export | Purpose |
|--------|---------|
| `aidlcInstallCommand()` | CLI wrapper for install. |
| `aidlcStatusCommand()` | CLI wrapper for status. |

### `commands/agentRun.ts`
| Export | Purpose |
|--------|---------|
| `agentRunCommand()` | One-shot agent prompt from CLI (`harness run`). |

### `commands/contextBuild.ts`
| Export | Purpose |
|--------|---------|
| `contextBuildCommand()` | Build context items + token estimates from paths. |

### `commands/specParse.ts`
| Export | Purpose |
|--------|---------|
| `specParseCommand()` | CLI spec parse to JSON. |

### `mcp/McpConnection.ts`
| Export | Purpose |
|--------|---------|
| `McpConnection` | MCP client (stdio/HTTP) for tool calls from CLI context. |

---

## Extension — `packages/extension/src/`

### `extension.ts`
| Export | Purpose |
|--------|---------|
| `activate()` | Start CliService daemon, bootstrap setup subprocess, register commands/webviews. |
| `deactivate()` | Subscriptions dispose CLI/MCP. |

Commands include: `harness.check.getGoat`, `harness.copilotLogin`, `harness.setup`, `harness.aidlcInstall`, context commands.

### `types.ts`
Canonical types for extension + webview: `AGENT_DESCRIPTORS`, `CopilotMode`, IPC payloads, webview command unions.

### `configBridge.ts`
| Export | Purpose |
|--------|---------|
| `buildHarnessProcessEnv()` | Build env for CLI child: secrets, live `gh auth token` first, `HARNESS_SETTINGS_JSON`, `KIRO_CLI_PATH`. |

### `services/CliService.ts`
| Export | Purpose |
|--------|---------|
| `CliService` | Spawn `node cli/dist/index.js --ipc`, NDJSON framing, restart with backoff, `runCommand()` for one-shot CLI. |
| `onCliMessage()` | EventEmitter per `action` for streaming push frames. |

### `services/AgentService.ts`
| Export | Purpose |
|--------|---------|
| `AgentService.chat()` | Register chunk listeners, send `chat:send` with mode + specPaths, invoke callbacks. |
| `cancelSession()` | Drop active session id. |

### `providers/ChatViewProvider.ts`
| Export | Purpose |
|--------|---------|
| `ChatViewProvider` | Webview view for chat; history, agent, mode; `sendChatMessage()`; `resolveSpecPaths()` for spec+agent. |

### `providers/ContextProvider.ts`
| Export | Purpose |
|--------|---------|
| `ContextProvider` | Track context URIs; expose absolute paths to AgentService. |

### `panels/ConfigurationPanel.ts`
| Export | Purpose |
|--------|---------|
| `ConfigurationPanel` | Webview for tokens, test connection, save secrets. |

### `panels/SpecManagerPanel.ts`
| Export | Purpose |
|--------|---------|
| `SpecManagerProvider` | Webview to list/edit/create spec YAML files. |

### `mcp/McpClientManager.ts`
| Export | Purpose |
|--------|---------|
| `McpClientManager` | Extension-side MCP servers from workspace config. |

### `copilotAuth.ts`
| Export | Purpose |
|--------|---------|
| `buildCopilotAuthHeaders()` | Duplicate of CLI headers for connection test in UI. |
| `validateCopilotToken()` | Duplicate validation for config panel. |

### `webview/chat/main.ts`
Browser bundle: chat UI, mode bar (Ask/Agent/Spec+Agent), agent dropdown, context chips, markdown render, slash commands.

### `webview/config/main.ts`
Browser bundle: configuration wizard UI.

### `webview/spec/main.ts`
Browser bundle: spec editor/list UI.

---

## Scripts

| Path | Purpose |
|------|---------|
| `scripts/bundle-cli.mjs` | Copy CLI dist + AI-DLC vendor into `packages/extension/cli/`. |
| `scripts/smoke-ipc.mjs` | IPC ping smoke test. |

---

## Workspace config

| Path | Purpose |
|------|---------|
| `.harness/config.yaml` | Default agent, connector endpoints (no secrets). |
| `.harness/specs/*.yaml` | SDD spec definitions for Spec+Agent mode. |
