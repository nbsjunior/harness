#!/usr/bin/env node
/**
 * Patch GitHub release titles and bodies:
 * "Harness of AI" / "Harness" / "ToddSpect" → "Todd of AIDLC" / "Todd"
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO = 'nbsjunior/todd';

function rebrand(text) {
  return text
    // Specific long forms first
    .replace(/Harness of AI/g, 'Todd of AIDLC')
    .replace(/Harness VS Code/g, 'Todd of AIDLC VS Code')
    .replace(/ToddSpect v/g, 'Todd of AIDLC v')
    .replace(/ToddSpect/g, 'Todd of AIDLC')
    // paths / filenames — harness-vscode → toddspect-vscode (keep technical names)
    .replace(/harness-vscode/g, 'toddspect-vscode')
    .replace(/harness\.vscode/g, 'toddspect.vscode')
    .replace(/HarnessRelease/g, 'ToddSpectRelease')
    // settings keys
    .replace(/harness\.(defaultWorkspace|cursor|agent|promptOptimization)/g, (m, k) => `toddspect.${k}`)
    // CLI commands
    .replace(/`harness check getGoat`/g, '`toddspect check getGoat`')
    .replace(/`harness web:serve`/g, '`toddspect web:serve`')
    .replace(/`harness setup`/g, '`toddspect setup`')
    .replace(/`harness init`/g, '`toddspect init`')
    .replace(/`harness `/g, '`toddspect `')
    .replace(/run harness /g, 'run toddspect ')
    // .harness/ folder
    .replace(/\.harness\//g, '.toddspect/')
    .replace(/\.harness\\`/g, '.toddspect\\`')
    // old wiki / repo URLs
    .replace(/nbsjunior\/harness/g, 'nbsjunior/todd')
    // Remaining bare "Harness" word (not in code tokens)
    .replace(/\bHarness\b/g, 'Todd');
}

// releases to patch: tag → { title, body }
const releases = [
  {
    tag: 'v0.1.0',
    title: 'Todd of AIDLC VS Code 0.1.0',
    body: `## Highlights

- **Spending tab** — per-provider token/request stats and recent turns
- **Prompt optimization** — context truncation and history trim (configurable)
- **Default workspace path** — toddspect.defaultWorkspace setting
- **Chat UX** — Clear all, New chat, Clear Chat & Context
- **Cursor** — API probe, SSE reconnect, improved auto-router readiness
- **Diagnostics** — \`node scripts/test-cursor.mjs\` and live check in \`toddspect check getGoat\`

Install: download \`toddspect-vscode-0.1.0.vsix\` below, then **Extensions: Install from VSIX...** and reload the window.`,
  },
  {
    tag: 'v0.1.1',
    title: 'Todd of AIDLC VS Code 0.1.1',
    body: `## Todd of AIDLC 0.1.1

- Illustrated user manual (PT) with screenshots
- Wiki: [User-Manual](https://github.com/nbsjunior/todd/wiki/User-Manual)

Install \`toddspect-vscode-0.1.1.vsix\` → Reload Window.`,
  },
  {
    tag: 'v0.1.2',
    title: 'Todd of AIDLC VS Code 0.1.2',
    body: `Dedicated User Manual panel, English documentation, README focused on single-interaction benefits and contributions. Install \`toddspect-vscode-0.1.2.vsix\`.`,
  },
  {
    tag: 'v0.1.3',
    title: 'Todd of AIDLC v0.1.3',
    body: `## Summary

- **Live edits** — Agent / Spec+Agent runs show real-time file changes in chat and open side-by-side diffs in the editor.
- **Revert** — Undo all file changes from the last agent session (Stop + Revert), similar to Cursor, for local workspace tools across providers.
- **Terminal** — git and gh tool commands are mirrored to the integrated **Todd of AIDLC** terminal; focus it from the chat bar.
- **Model picker** — Choose a model per provider below the provider pills (default **LLM Auto**); Copilot and Claude CLI respect the selection.

## Install

Download **\`toddspect-vscode-0.1.3.vsix\`** below, then in VS Code: **Extensions → … → Install from VSIX**.

## Settings (optional)

- \`toddspect.agent.showLiveDiff\` — open diff on write (default: true)
- \`toddspect.agent.openChangedFiles\` — open modified files (default: true)
- \`toddspect.agent.mirrorCommandsToTerminal\` — mirror git/gh to terminal (default: true)`,
  },
  {
    tag: 'v0.1.4',
    title: 'Todd of AIDLC v0.1.4',
    body: `## Summary

- **Cursor provider** no longer calls GitHub Copilot for Agent mode — uses **Cursor Cloud API** only (fixes HTTP 429 quota errors when Cursor was selected).
- **Local workspace file edits** remain on **Copilot + Agent / Spec+Agent**; the chat explains this when using Cursor Agent.
- **Dropdown selects** for Mode, Provider, and Model (replaces pill buttons).
- **Live Edits** sidebar panel — before/after code preview, auto-opens on agent writes, Revert all + Open in editor.

## Install

Download **\`toddspect-vscode-0.1.4.vsix\`** below → VS Code: **Extensions → … → Install from VSIX** → reload window.

## Quick guide

| Goal | Provider | Mode |
|------|----------|------|
| Edit files in VS Code | Copilot | Agent |
| Cursor cloud tasks | Cursor | Ask / Agent |`,
  },
  {
    tag: 'v0.1.5',
    title: 'Todd of AIDLC v0.1.5',
    body: `## Summary

- **Toolbar:** Revert and Terminal moved next to **Clear all** (+ New chat).
- **Model dropdown:** Updates when you change **Provider** (Copilot, Cursor, Claude, …); resets to **LLM Auto** per provider.
- **Default SDD specs** on \`toddspect init\` / \`toddspect setup\` (skip if file already exists):
  - Clean Code, SOLID architecture, OWASP security, Agent engineering prompts, Modern performance workflow, Code review, Refactor-to-SOLID.
- **Prompt engineering pipeline:** normalize whitespace, dedupe user turns, merge guidance, CoT hints for Agent/Spec+Agent modes.

## Install

Download **\`toddspect-vscode-0.1.5.vsix\`** → Extensions → Install from VSIX → reload.

## Spec+Agent

Run **Todd: Initialize Workspace** or \`toddspect setup\` to get default specs in \`.toddspect/specs/\`. Remove any file you do not need.`,
  },
  {
    tag: 'v0.1.6',
    title: 'Todd of AIDLC v0.1.6',
    body: `## Fix: Cursor Agent + local files + Live Edits

**Problem:** Cursor Agent used only Cursor Cloud — remote VM cannot see your VS Code workspace, so files were not edited locally and Live Edits stayed empty.

**Fix (default \`toddspect.cursor.agentExecution: auto\`):**
- **Copilot configured** → Cursor + Agent edits files **in your workspace** (Live Edits works).
- **Copilot missing** → falls back to Cursor Cloud with a clear warning.

## Setting

\`toddspect.cursor.agentExecution: auto | local | cloud\`

## Install

**\`toddspect-vscode-0.1.6.vsix\`** — reload VS Code after install.

**Also required for local edits:** \`gh auth login\` with Copilot scope (or Copilot token in Todd settings).`,
  },
  {
    tag: 'v0.1.7',
    title: 'Todd of AIDLC v0.1.7',
    body: `## Summary

- **Cursor Agent (local)** — Edit files in your open VS Code workspace via \`@cursor/sdk\` when a Cursor API key is set. No GitHub Copilot quota required for this path.
- **Spending tab** — Track requests, estimated tokens (in/out), and duration per provider; data in \`.toddspect/usage-stats.json\`.
- **Prompt optimization** — Pre-route pipeline (history trim, dedupe, context caps, quality contract) documented in README and wiki; on by default for all providers.

## Install

Download \`toddspect-vscode-0.1.7.vsix\` below, then in VS Code: **Extensions → Install from VSIX…**

Or:

\`\`\`bash
code --install-extension toddspect-vscode-0.1.7.vsix
\`\`\`

## Settings

- \`toddspect.cursor.agentExecution\`: \`auto\` | \`local\` | \`cloud\` (default \`auto\`)
- \`toddspect.promptOptimization.enabled\` (default \`true\`)
- Cursor API key: [cursor.com/dashboard/integrations](https://cursor.com/dashboard/integrations)

## Docs

- [Prompt optimization](https://github.com/nbsjunior/todd/blob/main/docs/prompt-optimization.md)
- [Cursor Agent (local vs cloud)](https://github.com/nbsjunior/todd/blob/main/docs/cursor-agent.md)`,
  },
  {
    tag: 'v0.1.8',
    title: 'Todd of AIDLC v0.1.8',
    body: `## Fix

- **Cursor SDK local agent** — The VSIX now bundles the full \`@cursor/sdk\` dependency tree (including \`@fastify/busboy\` required by \`undici\`). Fixes \`Could not load @cursor/sdk: Cannot find module '@fastify/busboy'\` and fallback to Cursor Cloud.

## Install

Download \`toddspect-vscode-0.1.8.vsix\` and use **Extensions → Install from VSIX…**

After install, reload VS Code. Cursor + Agent with a Cursor API key should show local workspace editing without the SDK load error.`,
  },
  {
    tag: 'v0.1.9',
    title: 'Todd of AIDLC v0.1.9',
    body: `## Summary

- **SDD view** — GitHub spec-kit workflow (constitution → specify → plan → tasks → implement)
- **Roadmap** — session persistence, budget alerts, spec discovery, multi-agent fan-out, GitHub Actions example, plugin manifest, \`toddspect web:serve\` MVP
- **Security** — npm overrides fix Dependabot alerts (undici, tar, @tootallnate/once)

## Install

1. Download **\`toddspect-vscode-0.1.9.vsix\`** below.
2. VS Code / Cursor: **Extensions → … → Install from VSIX**.

If you see *"End of central directory record signature not found"*, the file is truncated (common with OneDrive or interrupted download). Re-download from this page or build locally: \`npm run package:vsix:release\` → install from \`%LOCALAPPDATA%\\ToddSpectRelease\\\`.

## Test plan

- [ ] Initialize SDD workflow and create a feature
- [ ] Run a spec-kit step in chat (Spec+Agent)
- [ ] Chat session restores after reload`,
  },
  {
    tag: 'v0.2.0',
    title: 'Todd of AIDLC v0.2.0 — Rebrand',
    body: `## Todd of AIDLC v0.2.0 — Rebrand

Product name is now **Todd of AIDLC** (formerly Harness / ToddSpect). CLI command \`toddspect\`, workspace \`.toddspect/\`, and VS Code settings \`toddspect.*\` are unchanged.

### Install

Download from [GitHub Releases](https://github.com/nbsjunior/todd/releases/latest).

Prefer \`%LOCALAPPDATA%\\ToddSpectRelease\\\` after \`npm run package:vsix:release\` if OneDrive corrupts downloads.

### What changed

- CLI command: \`toddspect\` (was \`harness\`)
- Workspace folder: \`.toddspect/\` (was \`.harness/\`)
- VS Code settings: \`toddspect.*\`
- Extension publisher: \`toddspect\`

### Migration

1. Uninstall old Todd / ToddSpec VSIX (optional)
2. Install \`toddspect-vscode-0.2.0.vsix\`
3. Rename \`.harness/\` → \`.toddspect/\` in your projects (or run \`toddspect init\`)`,
  },
];

let updated = 0;
for (const r of releases) {
  try {
    const bodyFile = path.join(os.tmpdir(), `body-${r.tag}.md`);
    fs.writeFileSync(bodyFile, r.body, 'utf8');
    execSync(
      `gh release edit ${r.tag} --repo ${REPO} --title "${r.title}" --notes-file "${bodyFile}"`,
      { stdio: 'pipe' }
    );
    console.log(`  ✓ ${r.tag} — ${r.title}`);
    updated++;
  } catch (e) {
    console.error(`  ✗ ${r.tag}:`, e.stderr?.toString() ?? e.message);
  }
}
console.log(`\n[patch-releases] ${updated}/${releases.length} releases updated`);
