<p align="center">
  <img src="images/toddspect-icon.png" alt="Todd of AIDLC logo" width="80" />
</p>

# Auto provider routing

Choose **Auto** in the chat provider bar and Todd of AIDLC picks the best agent for each message.

## Default behavior

- **Starting provider:** Auto (configurable via `toddspect.defaultAgent`).
- **When unsure:** routes to **GitHub Copilot**.
- **When configured agents are missing:** falls back along  
  Copilot → Claude → Cursor → Devin → Kiro.

## Routing table

| Your task | Typical provider |
|-----------|------------------|
| General questions, GitHub/PR work | **Copilot** |
| Complex refactors, architecture, algorithms | **Claude** |
| API / OAuth / webhooks / integrations | **Claude** |
| Multi-file or repo-wide changes | **Cursor** |
| “Build it end-to-end” autonomous work | **Devin** |
| Spec+Agent mode, AI-DLC, Kiro steering | **Kiro** |

## What you see in chat

After you send a message, a banner appears:

**Auto → Claude** — *Complex code, architecture, and deep reasoning → Claude Code*

Then the response streams from that provider.

## Configure

1. Open **Todd of AIDLC → Configuration** and set up the agents you want in the rotation.
2. Run **`Todd of AIDLC: Check getGoat`** (or `todd check getGoat`) to see which agents are ready.
3. Optional: set **Default agent** to `auto` in workspace settings.

## CLI

```bash
todd agent:run --agent auto --prompt "integrate Stripe webhooks"
```

## Learn more

Full algorithm and rule list: [auto-routing.md](https://github.com/nbsjunior/todd/blob/main/docs/auto-routing.md) in the repository.
