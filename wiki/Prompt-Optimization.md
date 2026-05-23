# Prompt optimization

Todd of AIDLC optimizes prompts **before** they reach any AI provider. You get **fewer wasted tokens** and **clearer, more reliable answers** — on Copilot, Cursor, Claude, Devin, and Kiro alike.

**On by default.** Configure under **Todd of AIDLC: Open Configuration → Workspace**.

---

## Why it matters

| | Without optimization | With Todd of AIDLC optimization |
|---|----------------------|---------------------------|
| **Efficiency** | Long chats and duplicate lines inflate every request | History trim, dedupe, file caps, merged system text |
| **Quality** | Models may ramble or repeat attached files | Response contract: goal first, minimal diffs, mode-specific rules |
| **Multi-provider** | Rules differ per vendor UI | Same Todd of AIDLC guidance on every provider pill |

---

## Algorithm (pipeline)

Before `AgentRouter` sends your message:

1. **Normalize** — trim whitespace; collapse excessive newlines (code fences preserved).
2. **Dedupe** — skip back-to-back identical user messages.
3. **Prune** — remove empty assistant placeholders.
4. **Merge** — combine duplicate Todd of AIDLC system guidance into one block.
5. **Guidance** — inject provider-agnostic instructions (efficiency + quality contract).
6. **Mode hints** — Ask / Agent / Spec+Agent each get targeted behaviour (plans, specs, no unsolicited edits).
7. **Trim history** — keep recent turns only (default 24 messages).
8. **Context files** — truncate large attachments (default 12 000 chars/file, head + tail kept).

---

## Quality benefits

- **Goal-first answers** — less preamble and process narration
- **Structured output** — bullets for lists; short paragraphs otherwise
- **Safer coding** — Agent mode encourages small steps and self-check
- **Spec+Agent** — specs treated as authoritative acceptance criteria
- **One clarifying question** when blocked — reduces wrong guesses on security or data loss

---

## Efficiency benefits

- Lower estimated **tokens in** on long sessions (see [User Manual → Spending](User-Manual#6-other-configuration-tabs))
- Fewer duplicate charges from repeated user text or stacked system blocks
- Large context files remain useful without sending the entire file every turn

---

## Settings

| VS Code setting | Default |
|-----------------|---------|
| `toddspect.promptOptimization.enabled` | `true` |
| `toddspect.promptOptimization.maxContextCharsPerFile` | `12000` |
| `toddspect.promptOptimization.maxHistoryMessages` | `24` |

---

## Related

- [Why Todd of AIDLC](Why-Todd-of-AIDLC) — product advantages
- [Context and Specs](Context-and-Specs) — what gets attached before optimization
- [Copilot Modes](Copilot-Modes) — Ask / Agent / Spec+Agent
- Repo doc: [docs/prompt-optimization.md](https://github.com/nbsjunior/todd/blob/main/docs/prompt-optimization.md)
