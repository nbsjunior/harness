# AI-DLC and Kiro

Harness integrates **AWS AI-DLC** steering rules with the **Kiro CLI**.

## What gets installed

- `kiro-cli` binary (auto-download on `harness setup` if enabled)
- AI-DLC rules in `.kiro/steering/` and `aidlc-docs/`

## Commands

```bash
harness setup              # workspace + AI-DLC (extension runs on activate)
harness aidlc install      # install/update steering rules
harness aidlc status       # check installation
```

From VS Code: extension bootstrap calls `setup --skip-kiro` for workspace only; full Kiro download is optional.

## Configuration

```json
{
  "harness.connectors.kiro.apiKey": "...",
  "harness.connectors.kiro.cliPath": "kiro-cli",
  "harness.aidlc.autoInstall": true
}
```

## Kiro agent routing

Harness builds a prompt with AI-DLC context and runs `kiro-cli` headless, streaming output to the chat.

See repository [docs/aidlc-kiro.md](https://github.com/nbsjunior/harness/blob/main/docs/aidlc-kiro.md).
