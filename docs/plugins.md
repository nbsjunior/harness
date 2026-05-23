# Community connector plugins (preview)

Todd of AIDLC reads `.toddspect/plugins.json` in the workspace for **future** community connectors.

## Manifest

See [`.toddspect/plugins.example.json`](../.toddspect/plugins.example.json).

```json
{
  "version": 1,
  "plugins": [
    {
      "id": "my-connector",
      "label": "My Connector",
      "module": "./tools/my-toddspect-connector.js",
      "agentId": "copilot",
      "enabled": true
    }
  ]
}
```

## IPC

- `plugins:list` — returns the registry (CLI: loaded via `loadPluginRegistry()`)

Dynamic `import()` of third-party connectors is **not enabled** in v0.1.x — the registry is metadata-only until the marketplace ships.

## Built-in agents

Copilot, Cursor, Claude, Devin, and Kiro remain first-party connectors in `packages/cli/src/router/AgentRouter.ts`.
