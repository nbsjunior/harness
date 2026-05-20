# GitHub Actions — Harness agent runs

Run Harness in CI with the same CLI bundled in the VSIX (or `npm run build:cli` in your repo).

## Example workflow

Copy [`.github/workflows/harness-agent.example.yml`](../.github/workflows/harness-agent.example.yml) to `harness-agent.yml` and set secrets:

| Secret | Purpose |
|--------|---------|
| `GH_TOKEN` or `COPILOT_GITHUB_TOKEN` | Copilot agent |
| `CURSOR_API_KEY` | Cursor agent |
| `ANTHROPIC_API_KEY` | Claude agent |

## Commands

```bash
# One-shot review (stdout)
harness agent:run -a copilot -p "Review the PR diff for security issues"

# Parallel fan-out
harness agent:fanout -a copilot,claude -p "Summarize risks in src/auth/"

# Spec suggestions from repo layout
harness spec:discover --write
```

## Tips

- Set `HARNESS_WORKSPACE` to `$GITHUB_WORKSPACE`
- Use `harness check getGoat --json` in a prior step to fail fast when agents are misconfigured
- Fan-out runs are independent; combine results in a job summary step
