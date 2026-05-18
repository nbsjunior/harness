import * as fs from 'fs';
import * as path from 'path';
import { installAidlcRules } from '../aidlc/install.js';
import { ensureKiroCli } from '../kiro/bootstrap.js';
import { harnessLog, harnessWarn } from '../log.js';

const HARNESS_DIR = '.harness';
const SPECS_DIR = 'specs';
const CONTEXT_DIR = 'context';

const CONFIG_YAML = `# Harness configuration file
# This file is read by the CLI and the VSCode extension.

# Default agent to use when no agent is specified in a Spec
defaultAgent: copilot

# Agent connector configuration
# (sensitive values like API keys should be set in VSCode settings or env vars)
connectors:
  copilot:
    endpoint: https://api.githubcopilot.com
  devin:
    endpoint: https://api.devin.ai/v1
  cursor:
    endpoint: ''
  claude:
    path: claude
  kiro:
    cliPath: kiro-cli
    # KIRO_API_KEY env var or harness.connectors.kiro.apiKey (Kiro Pro API key)
    trustTools: read,grep,write
    aidlcAutoInstall: true
    mode: cli

# AI-DLC (https://github.com/awslabs/aidlc-workflows)
aidlc:
  autoInstall: true

# MCP server definitions
mcp:
  enabled: true
  servers: []
    # Example MCP server:
    # - name: my-mcp-server
    #   transport: stdio
    #   command: node
    #   args: [./mcp-server/index.js]
`;

const EXAMPLE_SKILL = `kind: Skill
name: code-review
description: "Performs a thorough code review focused on correctness, security and SOLID principles"
tools:
  - name: read_file
    description: "Reads a file from the workspace"
  - name: suggest_fix
    description: "Suggests a code fix for a flagged issue"
agents:
  preferred: copilot
  fallback: claude
`;

const EXAMPLE_WORKFLOW = `kind: Workflow
name: refactor-to-solid
description: "Refactors a module to comply with SOLID design principles"
tools:
  - name: read_file
    description: "Reads the target file"
  - name: apply_patch
    description: "Applies a refactoring patch to the file"
agents:
  preferred: cursor
  fallback: claude
`;

const GITIGNORE_ADDITIONS = `
# Harness runtime
.harness/context/
.harness/.session/
.harness/cache/
`;

/**
 * Initialize a Harness workspace by creating the `.harness/` directory structure
 * with default configuration and example spec files.
 */
export async function initCommand(dir: string = process.cwd()): Promise<void> {
  const targetDir = path.resolve(dir);

  if (!fs.existsSync(targetDir)) {
    throw new Error(`Directory does not exist: ${targetDir}`);
  }

  const harnessDir = path.join(targetDir, HARNESS_DIR);
  const specsDir = path.join(harnessDir, SPECS_DIR);
  const contextDir = path.join(harnessDir, CONTEXT_DIR);

  // Create directory structure
  for (const d of [harnessDir, specsDir, contextDir]) {
    if (!fs.existsSync(d)) {
      fs.mkdirSync(d, { recursive: true });
      harnessLog(`  created  ${path.relative(targetDir, d)}/`);
    } else {
      harnessLog(`  exists   ${path.relative(targetDir, d)}/`);
    }
  }

  // Write config.yaml
  const configPath = path.join(harnessDir, 'config.yaml');
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, CONFIG_YAML, 'utf-8');
    harnessLog(`  created  .harness/config.yaml`);
  } else {
    harnessLog(`  exists   .harness/config.yaml`);
  }

  // Write example specs
  const exampleSkillPath = path.join(specsDir, 'skill-code-review.yaml');
  if (!fs.existsSync(exampleSkillPath)) {
    fs.writeFileSync(exampleSkillPath, EXAMPLE_SKILL, 'utf-8');
    harnessLog(`  created  .harness/specs/skill-code-review.yaml`);
  }

  const exampleWorkflowPath = path.join(specsDir, 'workflow-refactor-solid.yaml');
  if (!fs.existsSync(exampleWorkflowPath)) {
    fs.writeFileSync(exampleWorkflowPath, EXAMPLE_WORKFLOW, 'utf-8');
    harnessLog(`  created  .harness/specs/workflow-refactor-solid.yaml`);
  }

  // Update .gitignore if present
  const gitignorePath = path.join(targetDir, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const current = fs.readFileSync(gitignorePath, 'utf-8');
    if (!current.includes('.harness/context/')) {
      fs.appendFileSync(gitignorePath, GITIGNORE_ADDITIONS, 'utf-8');
      harnessLog(`  updated  .gitignore`);
    }
  }

  try {
    const kiro = await ensureKiroCli({ allowDownload: true });
    harnessLog(`  kiro-cli  ${kiro.cliPath} (${kiro.source})`);
  } catch (err) {
    harnessLog(
      `  warn      Kiro CLI: ${err instanceof Error ? err.message : String(err)}`,
    );
    harnessLog('            Run: harness setup');
  }

  try {
    const aidlc = await installAidlcRules(targetDir);
    if (aidlc.created.length > 0) {
      harnessLog('\nAI-DLC (Kiro steering):');
      for (const line of aidlc.created) {
        harnessLog(`  created  ${line}`);
      }
    }
  } catch (err) {
    harnessLog(
      `\n  warn     AI-DLC install skipped: ${err instanceof Error ? err.message : String(err)}`,
    );
    harnessLog('           Run later: harness aidlc install');
  }

  harnessLog(`\nHarness workspace initialized in ${targetDir}`);
  harnessLog('Next steps:');
  harnessLog('  1. Set KIRO_API_KEY (https://kiro.dev/docs/cli/authentication) for Kiro + AI-DLC');
  harnessLog('  2. Configure other agents in .harness/config.yaml or Harness settings');
  harnessLog('  3. Chat with Kiro: "Using AI-DLC, <your request>" — artifacts go to aidlc-docs/');
}
