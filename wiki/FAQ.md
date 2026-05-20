<p align="center">
  <img src="images/harness-icon.png" alt="Harness of AI logo" width="80" />
</p>

# FAQ

## What is the main advantage of Harness?

**One IDE (VS Code), many AI providers** — without juggling Cursor IDE, Copilot chat, and Claude in separate apps. Plus **SDD** (`.harness/specs/`) and **context engineering** (attached files) in the same sidebar. See [Why Harness](Why-Harness).

## Do I need to install the CLI separately?

No. The VSIX bundles the compiled CLI at `extension/cli/dist/index.js`.

## Which agent should I start with?

**GitHub Copilot** — easiest if you already use `gh auth login` and have Copilot enabled.

## Can I use Harness without GitHub Copilot?

Yes. Configure any agent in [Configuration](Configuration). Each agent has its own API key requirements.

## Is Cursor the same as running Cursor IDE?

No. Harness calls the **Cursor Cloud Agents API** (`api.cursor.com`), not the IDE's internal `api2.cursor.sh` API.

## Where are API keys stored?

VS Code **Secret Storage** (via Configuration panel) or environment variables. Never in `.harness/config.yaml`.

## Extension vs CLI?

See [Dual Mode](Dual-Mode). Same router; extension adds UI and IPC.

## How do I contribute?

See [Development Guide](Development-Guide) and [AGENTS.md](https://github.com/nbsjunior/harness/blob/main/AGENTS.md).
