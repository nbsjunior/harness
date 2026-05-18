import { execa } from 'execa';
import type { KiroConnectorConfig } from '../config.js';

export interface RunKiroCliOptions {
  config: KiroConnectorConfig;
  prompt: string;
  cwd: string;
  onChunk: (chunk: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
}

/**
 * Run Kiro CLI in headless mode.
 * @see https://kiro.dev/docs/cli/headless
 */
export async function runKiroCli(options: RunKiroCliOptions): Promise<void> {
  const { config, prompt, cwd, onChunk, onDone, onError } = options;
  const bin = config.cliPath || 'kiro-cli';

  const args = ['chat', '--no-interactive'];
  if (config.trustAllTools) {
    args.push('--trust-all-tools');
  } else if (config.trustTools) {
    args.push(`--trust-tools=${config.trustTools}`);
  }
  args.push(prompt);

  const env: NodeJS.ProcessEnv = { ...process.env };
  if (config.apiKey) {
    env['KIRO_API_KEY'] = config.apiKey;
  }

  try {
    const subprocess = execa(bin, args, {
      cwd,
      env,
      reject: false,
      stdin: 'ignore',
    });

    subprocess.stdout?.on('data', (chunk: Buffer) => {
      onChunk(chunk.toString('utf-8'));
    });

    subprocess.stderr?.on('data', (chunk: Buffer) => {
      process.stderr.write(`[kiro-cli] ${chunk.toString('utf-8')}`);
    });

    const result = await subprocess;

    if (result.exitCode !== 0 && result.exitCode !== null) {
      const errText = result.stderr?.trim() || `kiro-cli exited with code ${result.exitCode}`;
      onError(errText);
      return;
    }

    onDone();
  } catch (err) {
    onError(
      `Failed to run Kiro CLI ("${bin}"): ${(err as Error).message}. ` +
        'Install from https://kiro.dev/docs/cli/ and set KIRO_API_KEY for headless mode.',
    );
  }
}

/** Check whether kiro-cli binary is reachable. */
export async function probeKiroCli(cliPath: string): Promise<boolean> {
  try {
    const result = await execa(cliPath, ['--version'], { reject: false, timeout: 8000 });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}
