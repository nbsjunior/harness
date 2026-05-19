# IPC Protocol

Extension ↔ CLI communication when the daemon runs with `--ipc`.

## Transport

- One JSON object per line on **stdin** (extension → CLI)
- One JSON object per line on **stdout** (CLI → extension)
- **stderr** only for logs (never parsed as JSON)

## Message shape

```json
{
  "id": "uuid",
  "action": "chat:send",
  "payload": { },
  "error": "optional"
}
```

## Key actions

| Action | Direction | Purpose |
|--------|-----------|---------|
| `ping` / `pong` | both | Health check |
| `chat:send` | ext→cli | Start chat |
| `chat:send:ack` | cli→ext | Request accepted |
| `chat:chunk` | cli→ext | Streaming text |
| `chat:cancel` | ext→cli | Stop generation |
| `chat:error` | cli→ext | Error for session |
| `context:build` | ext→cli | Build context |
| `spec:parse` | ext→cli | Parse spec dir |
| `agent:list` | ext→cli | List agents |

## Debugging

**View → Output → Harness** — extension-side trace (secrets redacted).

CLI logs appear as `[cli] ...` in the same channel.
