import { Command } from 'commander';

const program = new Command();
import { initCommand } from './commands/init.js';
import { agentRunCommand } from './commands/agentRun.js';
import { specParseCommand } from './commands/specParse.js';
import { contextBuildCommand } from './commands/contextBuild.js';
import { getGoatCommand } from './commands/getGoat.js';
import { aidlcInstallCommand, aidlcStatusCommand } from './commands/aidlc.js';
import { setupCommand } from './commands/setup.js';
import { specDiscoverCommand } from './commands/specDiscover.js';
import { agentFanoutCommand } from './commands/agentFanout.js';
import { webServeCommand } from './commands/webServe.js';
import { startIpcServer } from './ipc/IpcServer.js';
import type { AgentId } from './types.js';

// ---------------------------------------------------------------------------
// IPC mode — started by the VSCode extension host (stdin/stdout JSON framing)
// In IPC mode, stdout is RESERVED for JSON frames; all logging goes to stderr.
// ---------------------------------------------------------------------------

if (process.argv.includes('--ipc')) {
  startIpcServer().catch((err: Error) => {
    process.stderr.write(`[toddspect-cli] IPC server fatal error: ${err.message}\n`);
    process.exit(1);
  });
} else {
  // ---------------------------------------------------------------------------
  // CLI mode — invoked directly by the user
  // ---------------------------------------------------------------------------

  program
    .name('toddspect')
    .description('Todd — Meta-Agent Orchestrator CLI')
    .version('0.1.0');

  // ---------------------------------------------------------------------------
  // toddspect init [dir]
  // ---------------------------------------------------------------------------

  program
    .command('init')
    .description('Initialize a Todd workspace in the given directory (defaults to cwd)')
    .argument('[dir]', 'Target directory', '.')
    .action(async (dir: string) => {
      try {
        await initCommand(dir);
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  // ---------------------------------------------------------------------------
  // toddspect agent:run
  // ---------------------------------------------------------------------------

  program
    .command('agent:run')
    .description('Run an agent with a one-shot prompt')
    .requiredOption(
      '-a, --agent <agent>',
      'Agent to use (auto|copilot|devin|cursor|claude|kiro)',
    )
    .requiredOption('-p, --prompt <text>', 'Prompt to send to the agent')
    .option('-d, --dirs <dirs>', 'Comma-separated list of context directories')
    .option('-s, --specs-dir <dir>', 'Path to the specs directory')
    .option('-c, --config <file>', 'Path to toddspect config.yaml')
    .action(async (options) => {
      const validAgents = ['auto', 'copilot', 'devin', 'cursor', 'claude', 'kiro'] as const;
      const agent = options.agent as (typeof validAgents)[number];

      if (!validAgents.includes(agent)) {
        console.error(`Error: Invalid agent "${agent}". Choose from: ${validAgents.join(', ')}`);
        process.exit(1);
      }

      try {
        await agentRunCommand({
          agent,
          prompt: options.prompt,
          ...(options.dirs ? { contextDirs: options.dirs.split(',').map((d: string) => d.trim()) } : {}),
          ...(options.specsDir ? { specsDir: options.specsDir } : {}),
          ...(options.config ? { configFile: options.config } : {}),
        });
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  // ---------------------------------------------------------------------------
  // toddspect spec:parse
  // ---------------------------------------------------------------------------

  program
    .command('spec:parse')
    .description('Parse and validate SDD spec files (YAML or Markdown)')
    .argument('<path>', 'Path to a spec file or directory of spec files')
    .option('-o, --output <format>', 'Output format: table (default), json, yaml', 'table')
    .option('--validate', 'Exit with non-zero code if any spec is invalid', false)
    .action(async (filePath: string, options: { output?: string; validate?: boolean }) => {
      try {
        await specParseCommand(filePath, {
          output: options.output as 'json' | 'yaml' | 'table',
          ...(options.validate !== undefined ? { validate: options.validate } : {}),
        });
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  // ---------------------------------------------------------------------------
  // toddspect check getGoat
  // ---------------------------------------------------------------------------

  program
    .command('check')
    .description('Diagnostics and health checks')
    .command('getGoat')
    .description('Check workspace setup and agent connector readiness')
    .option('-s, --specs-dir <dir>', 'Path to the specs directory')
    .option('--json', 'Output JSON to stdout', false)
    .action(async (options: { specsDir?: string; json?: boolean }) => {
      const code = await getGoatCommand({
        ...(options.specsDir ? { specsDir: options.specsDir } : {}),
        ...(options.json !== undefined ? { json: options.json } : {}),
      });
      process.exit(code);
    });

  // ---------------------------------------------------------------------------
  // toddspect setup — Kiro CLI + AI-DLC + workspace
  // ---------------------------------------------------------------------------

  program
    .command('setup')
    .description('Bootstrap Kiro CLI, AI-DLC rules, and Todd workspace (run after install)')
    .argument('[dir]', 'Workspace directory', '.')
    .option('--skip-init', 'Do not run toddspect init')
    .option('--skip-kiro', 'Do not install or locate Kiro CLI')
    .option('--skip-aidlc', 'Do not install AI-DLC steering rules')
    .option('-q, --quiet', 'Minimal output', false)
    .action(async (dir: string, options: {
      skipInit?: boolean;
      skipKiro?: boolean;
      skipAidlc?: boolean;
      quiet?: boolean;
    }) => {
      try {
        const code = await setupCommand({
          dir,
          ...(options.skipInit ? { skipInit: true } : {}),
          ...(options.skipKiro ? { skipKiro: true } : {}),
          ...(options.skipAidlc ? { skipAidlc: true } : {}),
          ...(options.quiet ? { quiet: true } : {}),
        });
        process.exit(code);
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  // ---------------------------------------------------------------------------
  // toddspect aidlc install | status
  // ---------------------------------------------------------------------------

  const aidlc = program.command('aidlc').description('AI-DLC workflow rules (Kiro steering)');

  aidlc
    .command('install')
    .description('Install AWS AI-DLC rules into .kiro/steering (Kiro + aidlc-docs/)')
    .argument('[dir]', 'Workspace directory', '.')
    .option('-f, --force', 'Reinstall even if rules exist', false)
    .action(async (dir: string, options: { force?: boolean }) => {
      try {
        await aidlcInstallCommand(dir, options.force ? { force: true } : {});
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  aidlc
    .command('status')
    .description('Check whether AI-DLC rules are installed in the workspace')
    .argument('[dir]', 'Workspace directory', '.')
    .action(async (dir: string) => {
      const code = await aidlcStatusCommand(dir);
      process.exit(code);
    });

  program
    .command('spec:discover')
    .description('Suggest SDD specs from repository structure')
    .option('--json', 'Output JSON', false)
    .option('--write', 'Write suggested spec files that do not exist', false)
    .action(async (options: { json?: boolean; write?: boolean }) => {
      const code = await specDiscoverCommand({
        ...(options.json ? { json: true } : {}),
        ...(options.write ? { write: true } : {}),
      });
      process.exit(code);
    });

  program
    .command('agent:fanout')
    .description('Run the same prompt on multiple agents in parallel')
    .requiredOption('-a, --agents <list>', 'Comma-separated agents (copilot,cursor,claude,…)')
    .requiredOption('-p, --prompt <text>', 'Prompt to send to each agent')
    .option('-m, --mode <mode>', 'Interaction mode', 'ask')
    .action(async (options: { agents: string; prompt: string; mode?: string }) => {
      try {
        await agentFanoutCommand(options);
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  program
    .command('web:serve')
    .description('Start a read-only web dashboard (usage, session, plugins)')
    .option('-p, --port <n>', 'HTTP port', '3847')
    .option('--host <host>', 'Bind host', '127.0.0.1')
    .action(async (options: { port?: string; host?: string }) => {
      await webServeCommand({
        port: parseInt(options.port ?? '3847', 10),
        ...(options.host ? { host: options.host } : {}),
      });
    });

  // ---------------------------------------------------------------------------
  // toddspect context:build
  // ---------------------------------------------------------------------------

  program
    .command('context:build')
    .description('Scan directories and build an agent context payload')
    .requiredOption(
      '-d, --dirs <dirs>',
      'Comma-separated list of directories or files to include',
    )
    .option('-o, --output <format>', 'Output format: summary (default), json', 'summary')
    .option('--max-depth <n>', 'Maximum directory traversal depth', '4')
    .option('--max-tokens <n>', 'Maximum token budget', '100000')
    .option('--ignore <patterns>', 'Comma-separated list of names to ignore')
    .action(async (options: {
      dirs: string;
      output?: string;
      maxDepth?: string;
      maxTokens?: string;
      ignore?: string;
    }) => {
      const dirs = options.dirs.split(',').map((d) => d.trim());

      try {
        await contextBuildCommand(dirs, {
          output: options.output as 'json' | 'summary',
          ...(options.maxDepth ? { maxDepth: parseInt(options.maxDepth, 10) } : {}),
          ...(options.maxTokens ? { maxTokens: parseInt(options.maxTokens, 10) } : {}),
          ...(options.ignore ? { ignore: options.ignore.split(',').map((p) => p.trim()) } : {}),
        });
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  program.parseAsync(process.argv).catch((err: Error) => {
    console.error(`Fatal: ${err.message}`);
    process.exit(1);
  });
}
