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
| No response | Cloud Agents API is async — check Output for stream errors |

## Claude

| Error | Fix |
|-------|-----|
| Doctor shows ready but CLI missing | Install [Claude Code CLI](https://claude.ai/code) |
| Command not found | Set `harness.connectors.claude.path` |

## Context / chat UI

| Issue | Fix |
|-------|-----|
| Clear context does nothing | Update to latest VSIX — buttons moved above composer |
| Stop does not stop | Ensure `chat:cancel` reaches daemon (check Output trace) |

## Logs

Always check **View → Output → Harness** first.

```bash
harness doctor    # CLI-side readiness
```
