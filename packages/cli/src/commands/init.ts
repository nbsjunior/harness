import * as fs from 'fs';
import * as path from 'path';

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
    endpoint: ''

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
      console.log(`  created  ${path.relative(targetDir, d)}/`);
    } else {
      console.log(`  exists   ${path.relative(targetDir, d)}/`);
    }
  }

  // Write config.yaml
  const configPath = path.join(harnessDir, 'config.yaml');
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, CONFIG_YAML, 'utf-8');
    console.log(`  created  .harness/config.yaml`);
  } else {
    console.log(`  exists   .harness/config.yaml`);
  }

  // Write example specs
  const exampleSkillPath = path.join(specsDir, 'skill-code-review.yaml');
  if (!fs.existsSync(exampleSkillPath)) {
    fs.writeFileSync(exampleSkillPath, EXAMPLE_SKILL, 'utf-8');
    console.log(`  created  .harness/specs/skill-code-review.yaml`);
  }

  const exampleWorkflowPath = path.join(specsDir, 'workflow-refactor-solid.yaml');
  if (!fs.existsSync(exampleWorkflowPath)) {
    fs.writeFileSync(exampleWorkflowPath, EXAMPLE_WORKFLOW, 'utf-8');
    console.log(`  created  .harness/specs/workflow-refactor-solid.yaml`);
  }

  // Update .gitignore if present
  const gitignorePath = path.join(targetDir, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const current = fs.readFileSync(gitignorePath, 'utf-8');
    if (!current.includes('.harness/context/')) {
      fs.appendFileSync(gitignorePath, GITIGNORE_ADDITIONS, 'utf-8');
      console.log(`  updated  .gitignore`);
    }
  }

  console.log(`\nHarness workspace initialized in ${targetDir}`);
  console.log('Next steps:');
  console.log('  1. Configure your agent connectors in .harness/config.yaml');
  console.log('  2. Open VSCode and click the Harness icon in the Activity Bar');
  console.log('  3. Start chatting with your AI agent!');
}
