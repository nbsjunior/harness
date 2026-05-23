<p align="center">
  <img src="images/toddspect-icon.png" alt="Todd of AIDLC logo" width="80" />
</p>

# Todd of AIDLC Wiki

**Todd of AIDLC** is a meta-agent orchestrator for VS Code: **one IDE**, **many AI providers** (Copilot, Claude, Cursor, Devin, Kiro), plus **Spec-Driven Development** and **context engineering** in the same sidebar — without switching editors per vendor.

**[User Manual](User-Manual)** · **[Why Todd of AIDLC?](Why-Todd-of-AIDLC)**

---

## Quick links

| I want to… | Start here |
|------------|------------|
| User manual | **[User Manual](User-Manual)** |
| Understand why to use Todd of AIDLC | [Why Todd of AIDLC](Why-Todd-of-AIDLC) |
| Install and send my first message | [Getting Started](Getting-Started) |
| Use the chat UI (providers, modes) | [Chat Interface](Chat-Interface) |
| Configure API keys | [Configuration](Configuration) |
| Set up GitHub Copilot | [Copilot Modes](Copilot-Modes) |
| Set up Cursor AI | [Agent Connectors → Cursor](Agent-Connectors#cursor-ai-cloud-agents-api) |
| Use Auto provider | [Auto Routing](Auto-Routing) |
| Use Specs (SDD) | [SDD Specs](SDD-Specs) |
| Understand prompt optimization | [Prompt Optimization](Prompt-Optimization) |
| Track tokens and requests | [User Manual → Spending](User-Manual#6-other-configuration-tabs) |
| Run without VS Code (CLI only) | [Dual Mode](Dual-Mode) |
| Fix errors | [Troubleshooting](Troubleshooting) |

---

## What is Todd of AIDLC?

```
VS Code Extension (UI)  ←→  CLI daemon (IPC)  ←→  Agent connectors
                              │
         Copilot · Devin · Cursor · Claude · Kiro
```

### Three ideas in one product

1. **One IDE, many providers** — use Copilot, Claude, Cursor, Devin, and Kiro from VS Code; no separate IDE per AI vendor.
2. **Spec-Driven Development** — versioned specs in `.toddspect/specs/`; **Spec+Agent** injects them into the prompt.
3. **Context engineering** — attach files once; the same context follows you when you switch provider.
4. **Prompt optimization** — built-in pipeline for **token efficiency** and **answer quality** on every provider ([details](Prompt-Optimization)).

- **Extension** — chat sidebar, spec manager, configuration panel
- **CLI** — all file I/O, authentication, agent routing (bundled inside the `.vsix`)
- **Specs** — YAML skills/tools/workflows in `.toddspect/specs/`

Repository: [github.com/nbsjunior/todd](https://github.com/nbsjunior/todd)

---

## Documentation map

### Users
- [Why Todd of AIDLC](Why-Todd-of-AIDLC)
- [Getting Started](Getting-Started)
- [Installation](Installation)
- [User Guide](User-Guide)
- [Chat Interface](Chat-Interface)
- [Configuration](Configuration)
- [Context and Specs](Context-and-Specs)

### Agents
- [Agent Connectors](Agent-Connectors)
- [Copilot Modes](Copilot-Modes) (Ask / Agent / Spec+Agent)

### Developers
- [Architecture](Architecture)
- [IPC Protocol](IPC-Protocol)
- [Dual Mode](Dual-Mode) (Extension vs CLI)
- [AI-DLC and Kiro](AI-DLC-and-Kiro)
- [Development Guide](Development-Guide)

### Help
- [Troubleshooting](Troubleshooting)
- [FAQ](FAQ)

---

## AI assistants

If you are an AI model working on this codebase, read **[AGENTS.md](https://github.com/nbsjunior/todd/blob/main/AGENTS.md)** in the repository first.
