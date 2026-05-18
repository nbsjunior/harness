import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as child_process from 'child_process';
import { EventEmitter } from 'events';
import type { IPCMessage, IpcAction } from '../types';

interface PendingRequest {
  resolve: (msg: IPCMessage) => void;
  reject: (err: Error) => void;
  timeoutHandle: ReturnType<typeof setTimeout>;
}

interface RunCommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

const REQUEST_TIMEOUT_MS = 30_000;
const PING_TIMEOUT_MS = 5_000;

/** SecretStorage keys → environment variables for the CLI subprocess. */
const SECRET_ENV_MAP: Array<{ secretKey: string; envVar: string }> = [
  { secretKey: 'harness.connectors.copilot.token', envVar: 'GH_TOKEN' },
  { secretKey: 'harness.connectors.copilot.token', envVar: 'COPILOT_GITHUB_TOKEN' },
  { secretKey: 'harness.connectors.claude.apiKey', envVar: 'ANTHROPIC_API_KEY' },
  { secretKey: 'harness.connectors.devin.apiKey', envVar: 'DEVIN_API_KEY' },
  { secretKey: 'harness.connectors.cursor.apiKey', envVar: 'CURSOR_API_KEY' },
  { secretKey: 'harness.connectors.kiro.apiKey', envVar: 'KIRO_API_KEY' },
];

/**
 * Manages the lifecycle of the Harness CLI daemon subprocess and all
 * IPC communication with it.
 *
 * Transport: newline-delimited JSON over stdin/stdout.
 * Each message is one JSON-serialized `IPCMessage<T>` followed by `\n`.
 * The CLI writes only JSON frames to stdout; debug output goes to stderr.
 */
export class CliService extends EventEmitter {
  private subprocess: child_process.ChildProcess | null = null;
  private pendingRequests = new Map<string, PendingRequest>();
  private lineBuffer = '';
  private isStarting = false;
  private restartAttempts = 0;
  private readonly maxRestartAttempts = 5;
  private disposed = false;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly output: vscode.LogOutputChannel,
  ) {
    super();
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async start(): Promise<void> {
    if (this.subprocess || this.isStarting || this.disposed) {
      return;
    }

    this.isStarting = true;

    try {
      const cliPath = this.resolveCliPath();
      this.output.info(`Starting Harness CLI daemon: ${cliPath}`);

      const env = await this.buildCliEnv();

      this.subprocess = child_process.spawn('node', [cliPath, '--ipc'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env,
      });

      // stdout → parse newline-delimited JSON frames
      this.subprocess.stdout!.on('data', (chunk: Buffer) => {
        this.lineBuffer += chunk.toString('utf-8');
        this.flushLineBuffer();
      });

      // stderr → route to output channel (debug only, never parsed)
      this.subprocess.stderr!.on('data', (chunk: Buffer) => {
        this.output.debug(`[cli] ${chunk.toString('utf-8').trimEnd()}`);
      });

      this.subprocess.on('error', (err: Error) => {
        this.output.error(`CLI process error: ${err.message}`);
        this.handleProcessExit();
      });

      this.subprocess.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
        this.output.warn(`CLI process exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`);
        this.handleProcessExit();
      });

      // Handshake: confirm the CLI is alive and parsing frames correctly
      await this.ping();
      this.restartAttempts = 0;
      this.output.info('Harness CLI daemon ready.');
    } catch (err) {
      this.subprocess?.kill('SIGTERM');
      this.subprocess = null;
      throw err;
    } finally {
      this.isStarting = false;
    }
  }

  /**
   * Restart the CLI daemon (e.g. after saving a new API token in configuration).
   */
  async restart(): Promise<void> {
    this.subprocess?.kill('SIGTERM');
    this.subprocess = null;
    for (const { reject, timeoutHandle } of this.pendingRequests.values()) {
      clearTimeout(timeoutHandle);
      reject(new Error('CLI daemon restarted'));
    }
    this.pendingRequests.clear();
    this.lineBuffer = '';
    await this.start();
  }

  dispose(): void {
    this.disposed = true;
    this.subprocess?.kill('SIGTERM');
    this.subprocess = null;
    for (const { reject, timeoutHandle } of this.pendingRequests.values()) {
      clearTimeout(timeoutHandle);
      reject(new Error('CliService disposed'));
    }
    this.pendingRequests.clear();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Send a request to the CLI and wait for the response with the same `id`.
   * Rejects after REQUEST_TIMEOUT_MS if no response is received.
   */
  async send<TReq, TRes = unknown>(
    message: IPCMessage<TReq>,
  ): Promise<IPCMessage<TRes>> {
    await this.ensureStarted();

    return new Promise<IPCMessage<TRes>>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(message.id);
        reject(new Error(`IPC request "${message.action}" (id=${message.id}) timed out after ${REQUEST_TIMEOUT_MS}ms`));
      }, REQUEST_TIMEOUT_MS);

      this.pendingRequests.set(message.id, {
        resolve: resolve as (m: IPCMessage) => void,
        reject,
        timeoutHandle,
      });

      this.writeFrame(message);
    });
  }

  /**
   * Execute a one-shot CLI command via a separate subprocess (non-IPC, non-daemon).
   * Returns full stdout/stderr after process exits. Used for init, packaging, etc.
   */
  async runCommand(command: string, args: string[] = []): Promise<RunCommandResult> {
    const cliPath = this.resolveCliPath();

    return new Promise<RunCommandResult>((resolve) => {
      const proc = child_process.spawn('node', [cliPath, command, ...args], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      proc.stdout.on('data', (c: Buffer) => stdoutChunks.push(c));
      proc.stderr.on('data', (c: Buffer) => stderrChunks.push(c));

      proc.on('close', (code) => {
        resolve({
          success: code === 0,
          stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
          stderr: Buffer.concat(stderrChunks).toString('utf-8'),
          exitCode: code ?? 1,
        });
      });

      proc.on('error', (err: Error) => {
        resolve({ success: false, stdout: '', stderr: err.message, exitCode: 1 });
      });
    });
  }

  /**
   * Subscribe to server-push messages (e.g. streaming chat chunks) that are
   * not matched to a pending request.
   */
  onCliMessage(action: IpcAction, handler: (msg: IPCMessage) => void): vscode.Disposable {
    this.on(action, handler);
    return new vscode.Disposable(() => this.off(action, handler));
  }

  // ---------------------------------------------------------------------------
  // Private: framing
  // ---------------------------------------------------------------------------

  /**
   * Write a single JSON frame to the CLI's stdin, terminated with `\n`.
   */
  private writeFrame(msg: IPCMessage): void {
    if (!this.subprocess?.stdin?.writable) {
      throw new Error('CLI stdin is not writable. Is the daemon running?');
    }
    const frame = JSON.stringify(msg) + '\n';
    this.subprocess.stdin.write(frame, 'utf-8');
  }

  /**
   * Consume the line buffer, parsing complete `\n`-terminated JSON frames.
   * Partial frames are held in the buffer until the next data event.
   */
  private flushLineBuffer(): void {
    const lines = this.lineBuffer.split('\n');
    // The last element is either empty or an incomplete frame — keep it buffered
    this.lineBuffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      this.parseFrame(trimmed);
    }
  }

  private parseFrame(raw: string): void {
    let msg: IPCMessage;
    try {
      msg = JSON.parse(raw) as IPCMessage;
    } catch {
      this.output.warn(`[cli] Received non-JSON frame: ${raw.slice(0, 120)}`);
      return;
    }

    if (!msg.id || !msg.action) {
      this.output.warn(`[cli] Malformed IPC frame (missing id/action): ${raw.slice(0, 120)}`);
      return;
    }

    const pending = this.pendingRequests.get(msg.id);
    if (pending) {
      clearTimeout(pending.timeoutHandle);
      this.pendingRequests.delete(msg.id);

      if (msg.error) {
        pending.reject(new Error(msg.error));
      } else {
        pending.resolve(msg);
      }
      return;
    }

    // Server-push: streaming chunk or event not tied to a request
    this.emit(msg.action, msg);
  }

  // ---------------------------------------------------------------------------
  // Private: lifecycle helpers
  // ---------------------------------------------------------------------------

  private async ping(): Promise<void> {
    const pingMsg: IPCMessage<Record<string, never>> = {
      id: `ping-${Date.now()}`,
      action: 'ping',
      payload: {},
    };

    await Promise.race([
      this.send(pingMsg),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('CLI ping timed out — daemon did not respond')), PING_TIMEOUT_MS),
      ),
    ]);
  }

  private async ensureStarted(): Promise<void> {
    if (!this.subprocess) {
      await this.start();
    }
  }

  private handleProcessExit(): void {
    this.subprocess = null;

    // Reject all pending requests immediately
    for (const { reject, timeoutHandle } of this.pendingRequests.values()) {
      clearTimeout(timeoutHandle);
      reject(new Error('CLI daemon exited unexpectedly'));
    }
    this.pendingRequests.clear();
    this.lineBuffer = '';

    if (!this.disposed) {
      this.scheduleRestart();
    }
  }

  private scheduleRestart(): void {
    if (this.restartAttempts >= this.maxRestartAttempts) {
      this.output.error(
        `CLI daemon failed to restart after ${this.maxRestartAttempts} attempts. ` +
          'Reload the VSCode window to recover.',
      );
      return;
    }

    this.restartAttempts++;
    const delayMs = Math.min(1000 * 2 ** this.restartAttempts, 30_000);
    this.output.info(
      `Restarting CLI daemon in ${delayMs}ms (attempt ${this.restartAttempts}/${this.maxRestartAttempts})…`,
    );

    setTimeout(() => {
      if (!this.disposed) {
        this.start().catch((err: Error) =>
          this.output.error(`CLI daemon restart failed: ${err.message}`),
        );
      }
    }, delayMs);
  }

  private async buildCliEnv(): Promise<NodeJS.ProcessEnv> {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      HARNESS_IPC: '1',
      HARNESS_WORKSPACE: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '',
    };

    for (const { secretKey, envVar } of SECRET_ENV_MAP) {
      if (env[envVar]) {
        continue;
      }
      const value = await this.context.secrets.get(secretKey);
      if (value) {
        env[envVar] = value;
      }
    }

    return env;
  }

  private resolveCliPath(): string {
    const configPath = vscode.workspace
      .getConfiguration('harness')
      .get<string>('cliPath', '');

    if (configPath && fs.existsSync(configPath)) {
      return configPath;
    }

    // Bundled CLI shipped inside the .vsix (packages/extension/cli/dist/)
    const candidates = [
      path.join(this.context.extensionPath, 'cli', 'dist', 'index.js'),
      path.join(this.context.extensionPath, '..', 'cli', 'dist', 'index.js'),
      path.join(this.context.extensionPath, '..', '..', 'cli', 'dist', 'index.js'),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    throw new Error(
      'Harness CLI not found. Run `npm run build:cli` in the monorepo root, ' +
        'or set `harness.cliPath` in VSCode settings.',
    );
  }
}
