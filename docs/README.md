<p align="center">
  <img src="images/harness-icon.png" alt="Harness of AI logo" width="80" />
</p>

# Harness of AI — Documentation Index

Use this index to find the right doc without reading the whole repository.

**Core value:** one IDE (VS Code), many AI providers, plus SDD and context engineering in the same workflow — see **[why-harness.md](why-harness.md)**.

| Document | Audience | Purpose |
|----------|----------|---------|
| [../AGENTS.md](../AGENTS.md) | **AI models** | **Start here.** Quick-reference: layout, IPC, config, module map, data flows. |
| [ai-reference.md](ai-reference.md) | **AI models** | **Why** each subsystem exists, design decisions, troubleshooting, task recipes. |
| [code-map.md](code-map.md) | **AI models & devs** | Every exported function/class by file — one-line purpose. |
| [architecture.md](architecture.md) | Developers | Component diagram, layers, Copilot modes, bundling. |
| [ipc-protocol.md](ipc-protocol.md) | Developers | IPC frame schema, actions, error handling. |
| [why-harness.md](why-harness.md) | **Everyone** | **Why use Harness** — one IDE, multi-provider, SDD, context engineering. |
| [starter-kit.md](starter-kit.md) | End users | Install VSIX, Copilot auth, first message. |
| [dual-mode.md](dual-mode.md) | End users | Extension vs standalone CLI. |
| [agent-connectors.md](agent-connectors.md) | Developers | Per-agent setup (tokens, endpoints). |
| [aidlc-kiro.md](aidlc-kiro.md) | Developers | Kiro CLI + AWS AI-DLC steering rules. |
| [sdd-specs.md](sdd-specs.md) | Developers | Spec YAML format (Skill / Tool / Workflow). |
| [copilot-modes.md](copilot-modes.md) | Developers | Ask / Agent / Spec+Agent behaviour and flow. |
| [auto-routing.md](auto-routing.md) | Developers & users | **Auto** provider — routing table and algorithm. |
| [getting-started.md](getting-started.md) | Developers | Clone, build, run locally. |
| [user-guide.md](user-guide.md) | End users | Chat, context, specs, configuration UI. |
| [../wiki/Home.md](../wiki/Home.md) | End users | **GitHub Wiki** source — publish with `node scripts/publish-wiki.mjs` |

## For AI assistants — recommended read order

1. **AGENTS.md** (2 min) — orientation
2. **ai-reference.md** (5 min) — motivations and constraints
3. **code-map.md** (lookup) — find the exact file/function for a task
4. **Only then** open specific source files listed in the map
