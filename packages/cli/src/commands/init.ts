import * as fs from 'fs';
import * as path from 'path';
import { installAidlcRules } from '../aidlc/install.js';
import { ensureKiroCli } from '../kiro/bootstrap.js';
import { ensureDefaultSpecs } from '../specs/defaultSpecs.js';
import { toddspectLog, toddspectWarn } from '../log.js';

const TODDSPECT_DIR = '.toddspect';
const SPECS_DIR = 'specs';
const CONTEXT_DIR = 'context';

const CONFIG_YAML = `# Todd configuration file
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
    # KIRO_API_KEY env var or toddspect.connectors.kiro.apiKey (Kiro Pro API key)
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

const GITIGNORE_ADDITIONS = `
# Todd runtime
.toddspect/context/
.toddspect/.session/
.toddspect/cache/
`;

/**
 * Initialize a Todd workspace by creating the `.toddspect/` directory structure
 * with default configuration and example spec files.
 */
export async function initCommand(dir: string = process.cwd()): Promise<void> {
  const targetDir = path.resolve(dir);

  if (!fs.existsSync(targetDir)) {
    throw new Error(`Directory does not exist: ${targetDir}`);
  }

  const toddspectDir = path.join(targetDir, TODDSPECT_DIR);
  const specsDir = path.join(toddspectDir, SPECS_DIR);
  const contextDir = path.join(toddspectDir, CONTEXT_DIR);

  // Create directory structure
  for (const d of [toddspectDir, specsDir, contextDir]) {
    if (!fs.existsSync(d)) {
      fs.mkdirSync(d, { recursive: true });
      toddspectLog(`  created  ${path.relative(targetDir, d)}/`);
    } else {
      toddspectLog(`  exists   ${path.relative(targetDir, d)}/`);
    }
  }

  // Write config.yaml
  const configPath = path.join(toddspectDir, 'config.yaml');
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, CONFIG_YAML, 'utf-8');
    toddspectLog(`  created  .toddspect/config.yaml`);
  } else {
    toddspectLog(`  exists   .toddspect/config.yaml`);
  }

  const createdSpecs = ensureDefaultSpecs(specsDir);
  for (const rel of createdSpecs) {
    toddspectLog(`  created  .toddspect/${rel}`);
  }
  if (createdSpecs.length === 0) {
    toddspectLog(`  exists   .toddspect/specs/ (default SDD specs already present)`);
  }

  const pluginsTarget = path.join(toddspectDir, 'plugins.json');
  if (!fs.existsSync(pluginsTarget)) {
    fs.writeFileSync(
      pluginsTarget,
      JSON.stringify({ version: 1, plugins: [] }, null, 2) + '\n',
      'utf-8',
    );
    toddspectLog(`  created  .toddspect/plugins.json`);
  }

  // Update .gitignore if present
  const gitignorePath = path.join(targetDir, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const current = fs.readFileSync(gitignorePath, 'utf-8');
    if (!current.includes('.toddspect/context/')) {
      fs.appendFileSync(gitignorePath, GITIGNORE_ADDITIONS, 'utf-8');
      toddspectLog(`  updated  .gitignore`);
    }
  }

  try {
    const kiro = await ensureKiroCli({ allowDownload: true });
    toddspectLog(`  kiro-cli  ${kiro.cliPath} (${kiro.source})`);
  } catch (err) {
    toddspectLog(
      `  warn      Kiro CLI: ${err instanceof Error ? err.message : String(err)}`,
    );
    toddspectLog('            Run: toddspect setup');
  }

  try {
    const aidlc = await installAidlcRules(targetDir);
    if (aidlc.created.length > 0) {
      toddspectLog('\nAI-DLC (Kiro steering):');
      for (const line of aidlc.created) {
        toddspectLog(`  created  ${line}`);
      }
    }
  } catch (err) {
    toddspectLog(
      `\n  warn     AI-DLC install skipped: ${err instanceof Error ? err.message : String(err)}`,
    );
    toddspectLog('           Run later: toddspect aidlc install');
  }

  toddspectLog(`\nToddSpect workspace initialized in ${targetDir}`);
  toddspectLog('Next steps:');
  toddspectLog('  1. Set KIRO_API_KEY (https://kiro.dev/docs/cli/authentication) for Kiro + AI-DLC');
  toddspectLog('  2. Configure other agents in .toddspect/config.yaml or Todd settings');
  toddspectLog('  3. Chat with Kiro: "Using AI-DLC, <your request>" — artifacts go to aidlc-docs/');
}
