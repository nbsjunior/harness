---
kind: Skill
name: code-review
agents:
  preferred: copilot
  fallback: claude
tools:
  - name: read_file
    description: "Reads a source file from the workspace"
  - name: suggest_fix
    description: "Suggests a code fix for a flagged issue"
  - name: add_comment
    description: "Adds an inline review comment"
---

# Code Review

Performs a thorough code review focused on correctness, security, and SOLID principles.

## What it does

- Reads one or more source files provided as context
- Identifies potential bugs, security vulnerabilities, and design issues
- Suggests concrete fixes with code snippets
- Highlights violations of SOLID, DRY, and KISS principles

## Tools

- `read_file` — reads a source file from the workspace
- `suggest_fix` — suggests a code fix for a flagged issue
- `add_comment` — adds an inline review comment

## Agent Routing

- **Preferred:** copilot
- **Fallback:** claude
