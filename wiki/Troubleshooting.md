# Troubleshooting

## CLI daemon / IPC

| Error | Fix |
|-------|-----|
| `CLI stdin is not writable` | Reload window; check Output → Harness for crash; reinstall VSIX |
| `CLI ping timed out` | Daemon failed to start — check Node ≥ 20 on PATH |
| `CLI daemon exited unexpectedly` | See stderr in Output; often bad token or uncaught exception |

## GitHub Copilot

| Error | Fix |
|-------|-----|
| HTTP 401 | `gh auth refresh --scopes copilot`; reload VS Code |
| HTTP 404 on token exchange | Use OAuth token with copilot scope; Business accounts may use token directly |
| Bad credentials | Clear stale secret; use live `gh auth token` |

## Cursor AI

| Error | Fix |
|-------|-----|
| **HTTP 404 from api2.cursor.sh** | Wrong endpoint — use `https://api.cursor.com`, not `api2.cursor.sh` |
| HTTP 401 | Create key at [cursor.com/dashboard/integrations](https://cursor.com/dashboard/integrations) |
| No response / stuck thinking | Cursor Cloud can take minutes; Harness now shows status text and errors after **90s** without text. Use **Ask** mode for simple chat. Open **View → Output → Harness** for `[cursor]` logs. **+ New chat** if stuck. |
| HTTP 409 `agent_busy` | Previous Cursor run still active — **+ New chat**, or wait a few seconds; Harness now cancels stale runs automatically |

## Claude

| Error | Fix |
|-------|-----|
| getGoat shows ready but CLI missing | Install [Claude Code CLI](https://claude.ai/code) |
| Command not found | Set `harness.connectors.claude.path` |

## Context / chat UI

| Issue | Fix |
|-------|-----|
| Clear context does nothing | Update to latest VSIX — buttons moved above composer |
| Stop does not stop | Ensure `chat:cancel` reaches daemon (check Output trace) |

## Logs

Always check **View → Output → Harness** first.

```bash
harness check getGoat    # CLI-side readiness
```
