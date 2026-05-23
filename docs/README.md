<p align="center">
  <img src="images/toddspect-icon.png" alt="ToddSpect logo" width="80" />
</p>

# ToddSpect — Documentation Index

Use this index to find the right doc without reading the whole repository.

**Core value:** one IDE (VS Code), many AI providers, plus SDD and context engineering in the same workflow — see **[why-toddspect.md](why-toddspect.md)**.

| Document | Audience | Purpose |
|----------|----------|---------|
| [../AGENTS.md](../AGENTS.md) | **AI models** | **Start here.** Quick-reference: layout, IPC, config, module map, data flows. |
| [ai-reference.md](ai-reference.md) | **AI models** | **Why** each subsystem exists, design decisions, troubleshooting, task recipes. |
| [code-map.md](code-map.md) | **AI models & devs** | Every exported function/class by file — one-line purpose. |
| [architecture.md](architecture.md) | Developers | Component diagram, layers, Copilot modes, bundling. |
| [ipc-protocol.md](ipc-protocol.md) | Developers | IPC frame schema, actions, error handling. |
| [why-toddspect.md](why-toddspect.md) | **Everyone** | **Why use ToddSpect** — one IDE, multi-provider, SDD, context engineering. |
| [starter-kit.md](starter-kit.md) | End users | Install VSIX, Copilot auth, first message. |
| [dual-mode.md](dual-mode.md) | End users | Extension vs standalone CLI. |
| [agent-connectors.md](agent-connectors.md) | Developers | Per-agent setup (tokens, endpoints). |
| [aidlc-kiro.md](aidlc-kiro.md) | Developers | Kiro CLI + AWS AI-DLC steering rules. |
| [sdd-specs.md](sdd-specs.md) | Developers | ToddSpect spec format (Skill / Tool / Workflow). |
| [sdd-speckit.md](sdd-speckit.md) | **Everyone** | **spec-kit** SDD workflow — constitution → implement in `.toddspect/sdd/`. |
| [backlog-features.md](backlog-features.md) | Everyone | Roadmap items: session, budgets, fan-out, Actions, web UI. |
| [releases/v0.1.9.md](releases/v0.1.9.md) | Everyone | Release notes and VSIX install tips for v0.1.9. |
| [copilot-modes.md](copilot-modes.md) | Developers | Copilot Ask / Agent / Spec+Agent behaviour and flow. |
| [cursor-agent.md](cursor-agent.md) | Developers & users | Cursor Agent local (SDK) vs Cloud; `agentExecution` setting. |
| [prompt-optimization.md](prompt-optimization.md) | Everyone | Pre-route pipeline — token efficiency and answer quality. |
| [auto-routing.md](auto-routing.md) | Developers & users | **Auto** provider — routing table and algorithm. |
| [getting-started.md](getting-started.md) | Developers | Clone, build, run locally. |
| [user-guide.md](user-guide.md) | End users | Chat, context, specs, configuration UI. |
| [../wiki/Home.md](../wiki/Home.md) | End users | **GitHub Wiki** source — publish with `node scripts/publish-wiki.mjs` |

## For AI assistants — recommended read order

1. **AGENTS.md** (2 min) — orientation
2. **ai-reference.md** (5 min) — motivations and constraints
3. **code-map.md** (lookup) — find the exact file/function for a task
4. **Only then** open specific source files listed in the map
