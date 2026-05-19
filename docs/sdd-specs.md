# Spec-Driven Development (SDD) with Harness

Harness uses **Spec-Driven Development** (SDD) to define reusable agent capabilities. Specs are Markdown files with YAML frontmatter stored in `.harness/specs/`.

SDD is one of Harness's core advantages: specs live **in the same VS Code workflow** as multi-provider chat and file context — see [why-harness.md](why-harness.md).

---

## Why Spec-Driven Development?

Traditional AI interactions are ephemeral — you type a prompt, get a response, and the context is lost. SDD changes this by:

1. **Encoding intent** — skills and workflows describe *what* an agent should do, not just *how* to prompt it
2. **Enabling reuse** — a `code-review` skill can be invoked from the chat, CLI, or CI pipeline
3. **Documenting agent capabilities** — specs are readable by humans and parseable by machines
4. **Routing intelligence** — specs declare which agent is preferred (`cursor`, `copilot`, etc.) and which is the fallback

---

## Spec Format

Specs use **Markdown files with YAML frontmatter** (`.md`). This combines machine-readable metadata with human-friendly documentation.

### Minimal spec

```markdown
---
kind: Skill
name: code-review
agents:
  preferred: copilot
---

# Code Review

Brief description of what this skill does.
```

### Full spec with tools

```markdown
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
    parameters:
      file_path:
        type: string
        description: "Path to the file containing the issue"
      line_number:
        type: integer
        description: "Line number of the issue"
      suggestion:
        type: string
        description: "The suggested fix"
  - name: add_comment
    description: "Adds an inline review comment"
---

# Code Review

Performs a thorough code review focused on correctness, security, and SOLID principles.

## What it does

- Reads source files provided as context
- Identifies bugs, security vulnerabilities, and design issues
- Suggests concrete fixes with code snippets
- Highlights SOLID, DRY, and KISS violations

## Tools

- `read_file` — reads a source file from the workspace
- `suggest_fix` — suggests a fix with file path and line number
- `add_comment` — adds an inline review comment

## Agent Routing

- **Preferred:** GitHub Copilot
- **Fallback:** Claude Code (if Copilot is unavailable)
```

---

## Frontmatter Schema

```yaml
# Required
kind: Skill | Tool | Workflow
name: string                # lowercase-with-hyphens, used as identifier

# Optional
description: string         # overrides the Markdown body description if set
agents:
  preferred: copilot | devin | cursor | claude | kiro
  fallback:  copilot | devin | cursor | claude | kiro

tools:
  - name: string            # machine-readable tool name
    description: string     # what this tool does
    parameters:             # optional JSON Schema-like parameter definitions
      param_name:
        type: string | integer | boolean | array | object
        description: string
        default: any        # optional default value
        required: boolean   # optional, defaults to true if no default
```

---

## Spec Kinds

### `Skill`

A **Skill** is a reusable capability that can be invoked by name. Think of it as a named prompt template with tool declarations.

```markdown
---
kind: Skill
name: test-generation
agents:
  preferred: claude
  fallback: copilot
tools:
  - name: read_file
    description: "Reads the source file to generate tests for"
  - name: write_file
    description: "Writes the generated test file"
  - name: run_tests
    description: "Executes the generated tests to validate them"
---

# Test Generation

Generates unit and integration tests for a given module or function.
```

### `Tool`

A **Tool** is a single atomic function that can be invoked by an agent. Used to define the interface of a custom action.

```markdown
---
kind: Tool
name: apply_patch
agents:
  preferred: cursor
tools:
  - name: apply_patch
    description: "Applies a unified diff patch to a file"
    parameters:
      file_path:
        type: string
        description: "Target file path"
      patch:
        type: string
        description: "Unified diff content"
---

# Apply Patch

Applies a refactoring patch to a source file.
```

### `Workflow`

A **Workflow** is a multi-step process that coordinates multiple tools in sequence. Workflows are higher-level than Skills and typically span multiple files or stages.

```markdown
---
kind: Workflow
name: refactor-to-solid
agents:
  preferred: cursor
  fallback: claude
tools:
  - name: read_file
    description: "Reads the target module"
  - name: apply_patch
    description: "Applies the refactoring patch"
  - name: run_tests
    description: "Verifies the refactoring is non-breaking"
---

# Refactor to SOLID

Refactors a module step-by-step to comply with SOLID design principles.

## Steps

1. Analyze the target file for SOLID violations
2. Propose a refactored structure
3. Apply the patch incrementally
4. Run tests to confirm correctness
```

---

## Directory Structure

```
.harness/
├── config.yaml           # Agent connector configuration (no secrets)
├── specs/
│   ├── skill-code-review.md           # Code review skill
│   ├── skill-test-generation.md       # Test generation skill
│   ├── workflow-refactor-solid.md     # SOLID refactoring workflow
│   └── tool-apply-patch.md            # Atomic patch tool
└── context/                           # Runtime context cache (gitignored)
```

---

## Initializing the `.harness/` Directory

```bash
# Via CLI
harness init

# Via VSCode
Ctrl+Shift+P → Harness: Initialize Workspace
```

This creates the directory structure with example specs.

---

## Parsing Specs from the CLI

```bash
# Parse a single spec
harness spec:parse .harness/specs/skill-code-review.md

# Parse all specs in a directory (table output)
harness spec:parse .harness/specs/

# JSON output
harness spec:parse .harness/specs/ --output json

# YAML output (re-serialized)
harness spec:parse .harness/specs/ --output yaml

# Validate and exit non-zero on errors
harness spec:parse .harness/specs/ --validate
```

---

## Using Specs in Agent Calls

When you run `harness agent:run` or send a message via the chat interface with a `specsDir`, the CLI loads all specs from that directory and uses them to:

1. Determine the preferred/fallback agent for the request
2. Inject tool definitions into the system prompt
3. Enable structured tool calls if the agent supports it

---

## Legacy: YAML-only Specs

For compatibility, `.yaml` spec files (without Markdown) are still supported:

```yaml
kind: Skill
name: code-review
description: "Performs a thorough code review"
tools:
  - name: read_file
    description: "Reads a source file"
agents:
  preferred: copilot
  fallback: claude
```

The Markdown format is preferred because it allows richer documentation alongside the machine-readable frontmatter.
