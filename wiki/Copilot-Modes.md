<p align="center">
  <img src="images/harness-icon.png" alt="Harness of AI logo" width="80" />
</p>

# Copilot Modes

When **GitHub Copilot** is selected, three modes are available in the chat bottom bar.

| Mode | Behaviour |
|------|-----------|
| **Ask** | Simple chat — SSE streaming, no tools |
| **Agent** | Tool-calling loop: `read_file`, `write_file`, `list_files`, `search_in_files` (max 10 steps) |
| **Spec+Agent** | Same as Agent, but injects `.harness/specs/*.yaml` as `<spec>` system context |

## Ask

Best for questions, explanations, and reviews without file edits.

## Agent

The model can read and write files autonomously. Progress appears as:

- `[Agent] Step N/10`
- `- Read \`path/to/file.ts\``
- `- Wrote \`path/to/file.ts\``

File paths are clickable in the chat. See [Chat Interface](Chat-Interface).

## Spec+Agent

1. Define specs in `.harness/specs/` (see [SDD Specs](SDD-Specs))
2. Select **Spec+Agent** mode
3. Harness loads all `*.yaml` / `*.yml` / `*.json` specs into the system prompt before the agent loop runs

Use this for team conventions, skills, and workflows encoded as specs.

## Stop

Click **■** during streaming to cancel via `chat:cancel` IPC.
