# Why Harness?

The main advantage of Harness: **stay in one IDE (VS Code)** and reuse **several AI providers** — Copilot, Claude, Cursor, Devin, Kiro — without switching editors. At the same time, use **Spec-Driven Development** and **context engineering** in the **same** chat and workspace.

---

## One IDE, many agents

| Problem today | Harness approach |
|---------------|------------------|
| Copilot only inside VS Code | Copilot **plus** other providers in the same sidebar |
| Cursor or Claude need their own IDE/app | Select **Cursor** or **Claude** as a **provider pill** — stay in VS Code |
| Different chat history per tool | One Harness chat; switch provider for the **next** message |
| Re-learn UI for each vendor | One composer, one context bar, one spec manager |

Configure keys in [Configuration](Configuration). Use [Auto Routing](Auto-Routing) to pick the best provider per prompt.

**Providers in one panel:** Copilot · Claude · Cursor · Devin · Kiro · Auto

---

## Spec-Driven Development (SDD)

Define **how agents should behave** in `.harness/specs/` (skills, tools, workflows) — versioned with your repo.

- **Spec Manager** — edit specs in the sidebar ([SDD Specs](SDD-Specs))
- **Spec+Agent mode** — injects active specs as system context before Copilot runs ([Copilot Modes](Copilot-Modes))
- **Reuse** — same spec for chat, CLI, and CI-style runs

SDD is not a separate product; it lives **inside** Harness next to your code.

---

## Context engineering

Give the model the **right files** every time:

- Right-click → **Add to Harness Context**
- Chips above the composer show what is attached
- The CLI reads files and sends them with **every** provider

**Important:** context survives when you **change provider**. Add `src/` once; ask Copilot, then switch to Claude — same context, no re-upload.

Details: [Context and Specs](Context-and-Specs).

---

## Together in one workflow

1. **Specs** — what the agent must follow (SDD)
2. **Context** — which files matter (context engineering)
3. **Provider** — who answers (Copilot, Claude, … or Auto)

All three in the Harness sidebar — no IDE hopping.

---

## Learn more

- [Getting Started](Getting-Started)
- [Chat Interface](Chat-Interface)
- [User Guide](User-Guide)
- Repository: [docs/why-harness.md](https://github.com/nbsjunior/harness/blob/main/docs/why-harness.md)
