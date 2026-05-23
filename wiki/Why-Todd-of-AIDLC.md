<p align="center">
  <img src="images/toddspect-icon.png" alt="Todd of AIDLC logo" width="80" />
</p>

# Why Todd of AIDLC?

The main advantage of Todd of AIDLC: **stay in one IDE (VS Code)** and reuse **several AI providers** — Copilot, Claude, Cursor, Devin, Kiro — without switching editors. At the same time, use **Spec-Driven Development** and **context engineering** in the **same** chat and workspace.

---

## One IDE, many agents

| Problem today | Todd of AIDLC approach |
|---------------|------------------|
| Copilot only inside VS Code | Copilot **plus** other providers in the same sidebar |
| Cursor or Claude need their own IDE/app | Select **Cursor** or **Claude** as a **provider pill** — stay in VS Code |
| Different chat history per tool | One Todd of AIDLC chat; switch provider for the **next** message |
| Re-learn UI for each vendor | One composer, one context bar, one spec manager |

Configure keys in [Configuration](Configuration). Use [Auto Routing](Auto-Routing) to pick the best provider per prompt.

**Providers in one panel:** Copilot · Claude · Cursor · Devin · Kiro · Auto

---

## Spec-Driven Development (SDD)

Define **how agents should behave** in `.toddspect/specs/` (skills, tools, workflows) — versioned with your repo.

- **Spec Manager** — edit specs in the sidebar ([SDD Specs](SDD-Specs))
- **Spec+Agent mode** — injects active specs as system context before Copilot runs ([Copilot Modes](Copilot-Modes))
- **Reuse** — same spec for chat, CLI, and CI-style runs

SDD is not a separate product; it lives **inside** Todd of AIDLC next to your code.

---

## Context engineering

Give the model the **right files** every time:

- Right-click → **Add to Todd of AIDLC Context**
- Chips above the composer show what is attached
- The CLI reads files and sends them with **every** provider

**Important:** context survives when you **change provider**. Add `src/` once; ask Copilot, then switch to Claude — same context, no re-upload.

Details: [Context and Specs](Context-and-Specs).

---

## Prompt optimization (efficiency + quality)

Every message passes through Todd of AIDLC’s **optimization pipeline** before it reaches Copilot, Cursor, Claude, Devin, or Kiro.

**Efficiency**

- Trim chat history to recent turns (default 24)
- Remove duplicate user messages and empty assistant placeholders
- Cap each context file (default 12 000 characters) while keeping head and tail
- Merge duplicate system guidance into one block

**Quality**

- Inject a **response contract**: answer the goal first, structured bullets, minimal code diffs
- **Mode-aware hints** for Ask, Agent, and Spec+Agent (plans, spec authority, no unsolicited edits)
- Same rules on **every provider** — switching pills does not drop your standards

**On by default.** Configure in [Configuration → Workspace](Configuration) or read [Prompt Optimization](Prompt-Optimization).

Use [Spending](User-Manual#6-other-configuration-tabs) to see estimated token impact over time.

---

## Together in one workflow

1. **Specs** — what the agent must follow (SDD)
2. **Context** — which files matter (context engineering)
3. **Optimization** — trim and structure prompts for efficiency and quality
4. **Provider** — who answers (Copilot, Claude, … or Auto)

All four in the Todd of AIDLC sidebar — no IDE hopping.

---

## Learn more

- [Getting Started](Getting-Started)
- [Chat Interface](Chat-Interface)
- [User Guide](User-Guide)
- Repository: [docs/why-todd-of-aidlc.md](https://github.com/nbsjunior/todd/blob/main/docs/why-todd-of-aidlc.md)
