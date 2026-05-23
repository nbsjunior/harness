<p align="center">
  <img src="images/toddspect-icon.png" alt="Todd of AIDLC logo" width="80" />
</p>

# AI-DLC and Kiro

Todd of AIDLC integrates **AWS AI-DLC** steering rules with the **Kiro CLI**.

## What gets installed

- `kiro-cli` binary (auto-download on `todd setup` if enabled)
- AI-DLC rules in `.kiro/steering/` and `aidlc-docs/`

## Commands

```bash
todd setup              # workspace + AI-DLC (extension runs on activate)
todd aidlc install      # install/update steering rules
todd aidlc status       # check installation
```

From VS Code: extension bootstrap calls `setup --skip-kiro` for workspace only; full Kiro download is optional.

## Configuration

```json
{
  "toddspect.connectors.kiro.apiKey": "...",
  "toddspect.connectors.kiro.cliPath": "kiro-cli",
  "toddspect.aidlc.autoInstall": true
}
```

## Kiro agent routing

Todd of AIDLC builds a prompt with AI-DLC context and runs `kiro-cli` headless, streaming output to the chat.

See repository [docs/aidlc-kiro.md](https://github.com/nbsjunior/todd/blob/main/docs/aidlc-kiro.md).
