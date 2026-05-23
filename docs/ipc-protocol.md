# ToddSpect IPC Protocol

The **Extension Host** (VSCode extension process) and the **CLI Daemon** communicate through a strictly defined protocol over `stdin`/`stdout` using newline-delimited JSON.

---

## Transport

| Channel | Direction | Content |
|---|---|---|
| `stdin` | Extension → CLI | Request frames (JSON + `\n`) |
| `stdout` | CLI → Extension | Response and push-event frames (JSON + `\n`) |
| `stderr` | CLI → (discarded / log channel) | Debug logs, warnings — **never parsed** |

> **Invariant:** Nothing is ever written to CLI `stdout` that is not a valid JSON `IPCMessage` frame. All `console.log`, progress info, and debug output goes to `stderr`.

---

## Message Envelope

Every message — request, response, and push event — uses the same envelope:

```typescript
interface IPCMessage<TPayload = unknown> {
  /** Correlation UUID. Responses mirror the request's id. */
  id: string;

  /** Discriminant action string (e.g. "chat:send", "chat:chunk"). */
  action: IpcAction;

  /** Typed payload. Shape depends on `action`. */
  payload: TPayload;

  /** Present only in error responses. Human-readable message. */
  error?: string;
}
```

### Error responses

When the CLI cannot fulfill a request, it responds with the **same `id` and `action`** as the request, an empty/null `payload`, and a non-empty `error` string:

```json
{ "id": "abc-123", "action": "spec:parse", "payload": null, "error": "File not found: .toddspect/specs/missing.md" }
```

The Extension Host rejects the corresponding `Promise` with an `Error` whose message is `msg.error`.

---

## Framing

### Writing a frame

```typescript
function writeFrame(msg: IPCMessage): void {
  process.stdout.write(JSON.stringify(msg) + '\n');
}
```

### Reading frames (line buffer)

```typescript
let lineBuffer = '';

process.stdin.on('data', (chunk: string) => {
  lineBuffer += chunk;
  const lines = lineBuffer.split('\n');
  lineBuffer = lines.pop() ?? '';          // keep incomplete line

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) parseAndDispatch(trimmed);
  }
});
```

Frames are guaranteed to be complete after a `\n`. Partial frames are buffered until the next data event.

---

## Actions Reference

### `ping` / `pong` — Handshake

Sent by the Extension Host immediately after spawning the daemon to verify it started correctly.

**Request:**
```json
{ "id": "ping-1716000000000", "action": "ping", "payload": {} }
```

**Response:**
```json
{ "id": "ping-1716000000000", "action": "pong", "payload": { "ts": 1716000000100 } }
```

---

### `chat:send` — Chat request

Sends a conversation history and context paths to the agent.

**Request payload:** `ChatSendPayload`
```json
{
  "id": "req-001",
  "action": "chat:send",
  "payload": {
    "sessionId": "session-abc",
    "messages": [
      { "id": "msg-1", "role": "user", "content": "Review this code for security issues", "timestamp": 1716000000000 }
    ],
    "contextPaths": [
      "/home/user/project/src/auth.ts",
      "/home/user/project/src/middleware/"
    ],
    "agent": "copilot",
    "mode": "agent",
    "model": "gpt-4.1",
    "specsDir": "/home/user/project/.toddspect/specs"
  }
}
```

`model` is optional (`auto` = provider default). Copilot Ask/Agent and local workspace Agent loops pass it to the API; Claude CLI receives `--model` when set.

**Response:** Not a direct response — the CLI sends streaming `chat:chunk` push events. The `id` in chunks matches the request `id`.

---

### `chat:chunk` — Streaming response chunk (push event)

Sent by the CLI for every token/chunk received from the agent. `done: true` signals the end of the stream.

**Frame:**
```json
{
  "id": "req-001",
  "action": "chat:chunk",
  "payload": {
    "sessionId": "session-abc",
    "messageId": "msg-2",
    "chunk": "The `createToken()` function on line 42 uses MD5 for hashing,",
    "done": false
  }
}
```

**Final chunk:**
```json
{
  "id": "req-001",
  "action": "chat:chunk",
  "payload": { "sessionId": "session-abc", "messageId": "msg-2", "chunk": "", "done": true }
}
```

---

### `chat:tool` — Agent tool / file event (push event)

Sent during **Agent** / **Spec+Agent** runs when the local tool loop reads or writes files, or runs `git` / `gh`. The extension uses this to open live diffs, show a “Live edits” strip in chat, and mirror shell commands to the integrated terminal.

**Frame (write_file before):**
```json
{
  "id": "req-001",
  "action": "chat:tool",
  "payload": {
    "sessionId": "session-abc",
    "tool": "write_file",
    "phase": "before",
    "path": "/workspace/src/foo.ts",
    "oldContent": "export const x = 1;\n"
  }
}
```

**Frame (terminal mirror):**
```json
{
  "id": "req-001",
  "action": "chat:tool",
  "payload": {
    "sessionId": "session-abc",
    "tool": "run_git",
    "phase": "terminal",
    "command": "git status"
  }
}
```

---

### `chat:error` — Agent error (push event)

Sent when the agent call fails mid-stream.

**Frame:**
```json
{
  "id": "req-001",
  "action": "chat:error",
  "payload": null,
  "error": "HTTP 401 from api.githubcopilot.com — invalid token"
}
```

---

### `spec:parse` — Parse spec files

**Request:**
```json
{
  "id": "req-002",
  "action": "spec:parse",
  "payload": { "path": "/home/user/project/.toddspect/specs" }
}
```

**Response:**
```json
{
  "id": "req-002",
  "action": "spec:result",
  "payload": {
    "specs": [
      {
        "kind": "Skill",
        "name": "code-review",
        "description": "Performs a thorough code review…",
        "tools": [{ "name": "read_file", "description": "Reads a source file" }],
        "agents": { "preferred": "copilot", "fallback": "claude" },
        "filePath": "/home/user/project/.toddspect/specs/skill-code-review.md"
      }
    ]
  }
}
```

---

### `context:build` — Scan directories

**Request:**
```json
{
  "id": "req-003",
  "action": "context:build",
  "payload": {
    "paths": ["/home/user/project/src", "/home/user/project/docs"],
    "workspaceRoot": "/home/user/project"
  }
}
```

**Response:**
```json
{
  "id": "req-003",
  "action": "context:result",
  "payload": {
    "items": [
      { "absolutePath": "/home/user/project/src/auth.ts", "kind": "file", "label": "src/auth.ts", "tokenEstimate": 420 }
    ],
    "totalTokenEstimate": 12400
  }
}
```

---

### `agent:list` — List available agents

**Request:**
```json
{ "id": "req-004", "action": "agent:list", "payload": {} }
```

**Response:**
```json
{
  "id": "req-004",
  "action": "agent:list:result",
  "payload": { "agents": ["copilot", "devin", "cursor", "claude", "kiro"] }
}
```

---

## Sequence Diagrams

### Successful chat with streaming

```
Extension Host                           CLI Daemon
──────────────                           ──────────
send({ action: 'ping' }) ────────────→  receive ping
                          ←──────────── send({ action: 'pong' })

send({ action: 'chat:send',             receive chat:send
       contextPaths: [...] }) ────────→ readContextFiles(paths)
                                        router.route() → calls agent API
                          ←──────────── send({ action: 'chat:chunk', done: false })
                          ←──────────── send({ action: 'chat:chunk', done: false })
                          ←──────────── send({ action: 'chat:chunk', done: true })
webview receives all chunks
```

### Request timeout

```
Extension Host                           CLI Daemon
──────────────                           ──────────
send({ action: 'chat:send' }) ────────→ [busy / crashed]
[30s timeout fires]
pendingRequests.delete(id)
Promise rejected: "IPC request timed out"
```

---

## Implementation Notes

- The Extension Host sets a **30-second timeout** on every request. Streaming responses avoid this because chunks are push events (not tied to the pending request timer).
- The CLI daemon **never exits voluntarily** while in `--ipc` mode — it keeps reading stdin until EOF (Extension Host closes its stdin on dispose).
- The Extension Host schedules reconnection with **exponential backoff** (1s → 2s → 4s → 8s → 16s → 30s max) if the daemon process exits unexpectedly.
- All pending requests are **rejected immediately** when the daemon exits, so the UI recovers quickly.
