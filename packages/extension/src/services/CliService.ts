import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as child_process from 'child_process';
import { EventEmitter } from 'events';
import type { IPCMessage, IpcAction } from '../types';
import { buildToddSpectProcessEnv } from '../configBridge';
import { redactSecrets, traceLog } from '../trace';

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

/**
 * Manages the lifecycle of the ToddSpect CLI daemon subprocess and all
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
  /** Resolves when the daemon is fully started and ping-verified. */
  private startingPromise: Promise<void> | null = null;
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

  /**
   * Start the CLI daemon. If a start is already in progress, returns the
   * same promise so concurrent callers all wait for the same startup.
   */
  async start(): Promise<void> {
    if (this.disposed) return;
    if (this.subprocess) return;

    // Return the in-flight startup promise so concurrent callers wait properly
    if (this.startingPromise) {
      return this.startingPromise;
    }

    this.startingPromise = this.doStart();
    try {
      await this.startingPromise;
    } finally {
      this.startingPromise = null;
    }
  }

  private async doStart(): Promise<void> {
    try {
      const cliPath = this.resolveCliPath();
      this.output.info(`Starting ToddSpect CLI daemon: ${cliPath}`);

      const env = await this.buildCliEnv();
      const cwd =
        env['TODDSPECT_WORKSPACE'] && fs.existsSync(env['TODDSPECT_WORKSPACE'])
          ? env['TODDSPECT_WORKSPACE']
          : undefined;

      this.subprocess = child_process.spawn('node', [cliPath, '--ipc'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env,
        ...(cwd ? { cwd } : {}),
      });

      this.subprocess.stdout!.on('data', (chunk: Buffer) => {
        this.lineBuffer += chunk.toString('utf-8');
        this.flushLineBuffer();
      });

      this.subprocess.stderr!.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf-8').trimEnd();
        if (text) {
          this.output.info(`[cli] ${text}`);
        }
      });

      this.subprocess.on('error', (err: Error) => {
        this.output.error(`CLI process error: ${err.message}`);
        this.handleProcessExit();
      });

      this.subprocess.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
        this.output.warn(`CLI process exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`);
        this.handleProcessExit();
      });

      await this.ping();
      this.restartAttempts = 0;
      this.output.info('ToddSpect CLI daemon ready.');
    } catch (err) {
      this.subprocess?.kill('SIGTERM');
      this.subprocess = null;
      throw err;
    }
  }

  /**
   * Restart the CLI daemon (e.g. after saving a new API token in configuration).
   */
  async restart(): Promise<void> {
    this.subprocess?.kill('SIGTERM');
    this.subprocess = null;
    this.startingPromise = null;
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
    this.startingPromise = null;
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
    options?: { expectResponse?: IpcAction; timeoutMs?: number },
  ): Promise<IPCMessage<TRes>> {
    await this.ensureStarted();

    const expectAction = options?.expectResponse ?? message.action;
    const timeoutMs = options?.timeoutMs ?? REQUEST_TIMEOUT_MS;

    return new Promise<IPCMessage<TRes>>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(message.id);
        reject(
          new Error(
            `IPC request "${message.action}" (id=${message.id}) timed out after ${timeoutMs}ms`,
          ),
        );
      }, timeoutMs);

      this.pendingRequests.set(message.id, {
        resolve: (response: IPCMessage) => {
          if (response.action !== expectAction && !response.error) {
            traceLog(
              this.output,
              'ipc',
              `response action mismatch: expected ${expectAction}, got ${response.action}`,
            );
          }
          resolve(response as IPCMessage<TRes>);
        },
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
    const env = await this.buildCliEnv();
    delete env['TODDSPECT_IPC'];

    const cwd =
      env['TODDSPECT_WORKSPACE'] && fs.existsSync(env['TODDSPECT_WORKSPACE'])
        ? env['TODDSPECT_WORKSPACE']
        : undefined;

    return new Promise<RunCommandResult>((resolve) => {
      const proc = child_process.spawn('node', [cliPath, command, ...args], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env,
        ...(cwd ? { cwd } : {}),
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
    traceLog(this.output, 'ipc→cli', msg.action, {
      id: msg.id,
      payload: msg.payload,
    });
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
      this.output.warn(`[cli] Received non-JSON frame: ${redactSecrets(raw.slice(0, 120))}`);
      return;
    }

    if (!msg.id || !msg.action) {
      this.output.warn(`[cli] Malformed IPC frame (missing id/action): ${redactSecrets(raw.slice(0, 120))}`);
      return;
    }

    if (msg.action !== 'chat:chunk' || (msg.payload as { done?: boolean })?.done) {
      traceLog(this.output, 'cli→ipc', msg.action, {
        id: msg.id,
        error: msg.error,
        payload: msg.payload,
      });
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

  /**
   * Send a ping directly (bypassing ensureStarted to avoid a deadlock when
   * ping is called from within doStart while startingPromise is still set).
   */
  private async ping(): Promise<void> {
    const id = `ping-${Date.now()}`;
    const pingMsg: IPCMessage<Record<string, never>> = { id, action: 'ping', payload: {} };

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error('CLI ping timed out — daemon did not respond'));
      }, PING_TIMEOUT_MS);

      this.pendingRequests.set(id, {
        resolve: () => {
          clearTimeout(timer);
          this.pendingRequests.delete(id);
          resolve();
        },
        reject: (err) => {
          clearTimeout(timer);
          this.pendingRequests.delete(id);
          reject(err);
        },
        timeoutHandle: timer,
      });

      // Write directly — subprocess is spawned but startingPromise is still pending
      this.writeFrame(pingMsg);
    });
  }

  private async ensureStarted(): Promise<void> {
    if (this.startingPromise) {
      // Another caller already started the daemon — wait for it to finish
      await this.startingPromise;
      return;
    }
    if (!this.subprocess) {
      await this.start();
    }
  }

  private handleProcessExit(): void {
    this.subprocess = null;
    this.startingPromise = null;

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
    return buildToddSpectProcessEnv(this.context, {
      ...process.env,
      TODDSPECT_IPC: '1',
    });
  }

  private resolveCliPath(): string {
    const configPath = vscode.workspace
      .getConfiguration('toddspect')
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
      'ToddSpect CLI not found. Run `npm run build:cli` in the monorepo root, ' +
        'or set `toddspect.cliPath` in VSCode settings.',
    );
  }
}
