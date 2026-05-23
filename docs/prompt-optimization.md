# Prompt optimization

ToddSpect runs every chat message through a **prompt optimization pipeline** before routing to Copilot, Cursor, Claude, Devin, or Kiro. The goal is **lower token use** (efficiency) and **more consistent, on-task answers** (quality) — without you rewriting prompts by hand.

**Enabled by default.** Toggle in **Configuration → Workspace** or VS Code settings (`toddspect.promptOptimization.*`).

---

## What the pipeline does

| Step | Efficiency | Quality |
|------|------------|---------|
| **Normalize text** | Collapses extra blank lines and trailing spaces | Cleaner prompts; less noise in context |
| **Dedupe user messages** | Drops consecutive identical user turns | Avoids paying twice for the same instruction |
| **Prune empty assistant turns** | Removes hollow placeholders from history | Shorter history; model focuses on real content |
| **Merge system guidance** | One ToddSpect guidance block instead of many | Fewer duplicate system tokens |
| **Trim history** | Keeps the last N non-system messages (default **24**) | Stays within context limits on long threads |
| **Truncate context files** | Caps each attached file (default **12 000** chars) with head + tail | Large files still usable; budget preserved |
| **Inject response contract** | — | Goal-first answers, minimal diffs, no verbatim context repeat |
| **Mode-aware hints** | — | Ask vs Agent vs Spec+Agent behaviour spelled out for the model |

Implementation: `packages/cli/src/prompt/promptOptimizer.ts`, `systemGuidance.ts` — applied in `IpcServer` via `optimizeMessagesForRouting()` before `AgentRouter.route()`.

---

## Provider-agnostic guidance

When optimization is on, ToddSpect prepends a **system message** (unless already present) that applies to **every** provider:

- Answer the user’s goal first; detail second
- Use bullets and short paragraphs; avoid restating the question
- Code: minimal snippets and paths; no full-file dumps unless asked
- Agent mode: short plan, small verifiable steps, self-check before finish
- Spec+Agent: active ToddSpect specs are authoritative

Because the same contract runs regardless of pill selection, switching from Copilot to Claude does not drop your efficiency rules.

---

## Settings

| Setting | Default | Purpose |
|---------|---------|---------|
| `toddspect.promptOptimization.enabled` | `true` | Master switch |
| `toddspect.promptOptimization.maxContextCharsPerFile` | `12000` | Max chars per context file (truncation notice in body) |
| `toddspect.promptOptimization.maxHistoryMessages` | `24` | Max non-system messages kept in the prompt |

---

## Measuring impact

Use the **Spending** tab (**Configuration → Spending**) to compare estimated tokens and request counts before/after changing optimization settings or providers.

See also [user-manual.md](user-manual.md) and [why-toddspect.md](why-toddspect.md).
