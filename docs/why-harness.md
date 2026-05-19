# Why Harness?

Harness exists so you can stay in **one IDE** and still use the best AI for each job — with **Spec-Driven Development (SDD)** and **context engineering** applied consistently, no matter which provider answers.

---

## 1. One IDE, many providers

Today, teams often juggle **GitHub Copilot** in VS Code, **Cursor** in another editor, **Claude Code** in the terminal, and **Kiro** for spec-driven workflows. Each tool has its own window, shortcuts, and chat history.

**Harness removes that fragmentation:**

| Without Harness | With Harness |
|-----------------|--------------|
| Open Cursor IDE for repo-wide edits | Stay in **VS Code** — pick **Cursor** as the provider pill |
| Switch to Claude desktop/CLI for hard refactors | Pick **Claude Code** in the same chat sidebar |
| Use Copilot only where the extension lives | **Copilot**, **Devin**, **Kiro**, and **Auto** in one panel |
| Lose context when changing tools | Same workspace, same Harness session |

You configure API keys once in **Harness → Configuration**. Each message goes to the provider you choose (or **Auto** routes by task — see [auto-routing.md](auto-routing.md)).

**Supported providers (same UI):**

- GitHub **Copilot**
- **Claude** Code
- **Cursor** (Cloud Agents API)
- **Devin**
- **Kiro** (AI-DLC steering)

You do **not** install five different IDE products — you install **one extension** and reuse your existing subscriptions and keys.

---

## 2. Spec-Driven Development in the same context

**SDD** means agent behaviour is defined in versioned specs under `.harness/specs/` (skills, tools, workflows) instead of one-off prompts that disappear after the session.

Harness integrates SDD into the **same chat** as everyday coding:

- **Spec Manager** — browse, create, and edit specs in the sidebar
- **Spec+Agent mode** (Copilot) — active specs are injected as authoritative `<spec>` system context before the model runs
- **Preferred agent per spec** — YAML can declare which provider fits a skill (e.g. review → Copilot, refactor workflow → Claude)

Specs are **reusable**: the same `code-review` skill applies whether you invoke it from chat, CLI, or automation — see [sdd-specs.md](sdd-specs.md).

---

## 3. Context engineering in one place

**Context engineering** is selecting the files, folders, and rules the model must see. Harness makes that explicit and portable:

- **Add to Harness Context** — right-click files or folders in the Explorer
- **Context chips** — visible above the composer; click to open, × to remove
- **CLI reads context** — the daemon loads file contents and attaches them to every agent call (extension host stays fast)

Crucially, context is **provider-agnostic**:

1. Add `src/auth/` and `docs/api.md` to context
2. Ask Copilot a question
3. Switch to **Claude** for a deeper refactor — **the same context** is still attached

You are not re-uploading files in a different product; Harness carries the engineering context across providers.

---

## How the three fit together

```
┌─────────────────────────────────────────────────────────────┐
│  VS Code  —  single Harness sidebar                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Context chips  +  Spec+Agent  +  Provider: Auto      │   │
│  └──────────────────────────┬──────────────────────────┘   │
└─────────────────────────────┼──────────────────────────────┘
                              │ IPC
                              ▼
                    Harness CLI (routing)
                              │
         Copilot · Claude · Cursor · Devin · Kiro
```

One workflow: **define specs**, **attach context**, **pick or auto-select provider**, **get a streamed answer** — without leaving the editor.

---

## Who benefits most?

- **Teams standardizing on VS Code** but buying seats on multiple AI products
- **Leads** who want SDD specs in git next to application code
- **Developers** tired of copy-pasting context between Copilot chat and other tools
- **Power users** who want Copilot for quick Q&A and Claude/Cursor for heavy tasks in one session

---

## Next steps

| Goal | Document |
|------|----------|
| Install and first message | [starter-kit.md](starter-kit.md) |
| Day-to-day usage | [user-guide.md](user-guide.md) |
| Context + specs | [sdd-specs.md](sdd-specs.md) · [user-guide.md §7–8](user-guide.md) |
| Configure agents | [agent-connectors.md](agent-connectors.md) |
| Wiki (users) | [../wiki/Why-Harness.md](../wiki/Why-Harness.md) |
