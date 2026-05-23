# Roadmap features — implementation status

| Feature | Status | How to use |
|---------|--------|------------|
| **Session persistence** | Implemented | Chat saved to `.toddspect/chat-session.json`; restored when reopening VS Code |
| **Token usage + budget alerts** | Implemented | Spending tab + `toddspect.spending.*` settings; alerts in chat |
| **Spec auto-discovery** | Implemented | `todd spec:discover` / IPC `spec:discover` |
| **Multi-agent fan-out** | Implemented | `todd agent:fanout -a copilot,claude -p "..."` |
| **GitHub Actions** | Implemented | [github-actions.md](github-actions.md) + example workflow |
| **Plugin marketplace** | Preview | [plugins.md](plugins.md) — manifest only |
| **Web UI (remote)** | Implemented (MVP) | `todd web:serve` → http://127.0.0.1:3847 |
| **spec-kit SDD workflow** | Implemented | SDD view → **SDD Workflow** tab — [sdd-speckit.md](sdd-speckit.md) |
