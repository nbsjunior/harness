import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { EventEmitter } from 'events';
import type { IpcMessage, IpcMessageType } from '../types';

interface RunCommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

type IpcMessageHandler = (msg: IpcMessage) => void;

/**
 * Manages the lifecycle and IPC communication with the Harness CLI subprocess.
 *
 * The CLI is spawned as a Node.js child process using execa's IPC channel.
 * Because execa is an ESM-only package, it is dynamically imported at runtime
 * to avoid bundling issues with the CJS extension host.
 */
export class CliService extends EventEmitter {
  private subprocess: import('execa').ExecaChildProcess | null = null;
  private pendingRequests = new Map<
    string,
    { resolve: (msg: IpcMessage) => void; reject: (err: Error) => void }
  >();
  private isStarting = false;
  private restartAttempts = 0;
  private readonly maxRestartAttempts = 5;
  private readonly restartDelayMs = 2000;

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
    if (this.subprocess || this.isStarting) {
      return;
    }

    this.isStarting = true;

    try {
      const cliPath = this.resolveCliPath();
      this.output.info(`Starting Harness CLI from: ${cliPath}`);

      const { execaNode } = await import('execa');

      this.subprocess = execaNode(cliPath, ['--ipc'], {
        serialization: 'json',
        ipc: true,
        env: {
          ...process.env,
          HARNESS_IPC: '1',
          HARNESS_WORKSPACE: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '',
        },
      });

      this.subprocess.on('message', (msg: unknown) => {
        this.handleIncomingMessage(msg as IpcMessage);
      });

      this.subprocess.on('error', (err: Error) => {
        this.output.error(`CLI process error: ${err.message}`);
        this.scheduleRestart();
      });

      this.subprocess.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
        this.output.warn(`CLI process exited (code=${code}, signal=${signal})`);
        this.subprocess = null;
        this.scheduleRestart();
      });

      // Wait for the CLI to signal readiness (pong response to ping)
      await this.ping();
      this.restartAttempts = 0;
      this.output.info('Harness CLI ready.');
    } finally {
      this.isStarting = false;
    }
  }

  dispose(): void {
    this.subprocess?.kill('SIGTERM');
    this.subprocess = null;
    this.pendingRequests.forEach(({ reject }) =>
      reject(new Error('CliService disposed')),
    );
    this.pendingRequests.clear();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Send an IPC message and wait for the CLI's response with the same `id`.
   */
  async send<TReq, TRes = unknown>(
    message: IpcMessage<TReq>,
  ): Promise<IpcMessage<TRes>> {
    await this.ensureStarted();

    return new Promise<IpcMessage<TRes>>((resolve, reject) => {
      this.pendingRequests.set(message.id, {
        resolve: resolve as (m: IpcMessage) => void,
        reject,
      });

      this.subprocess!.send(message, (err: Error | null) => {
        if (err) {
          this.pendingRequests.delete(message.id);
          reject(new Error(`Failed to send IPC message: ${err.message}`));
        }
      });
    });
  }

  /**
   * Run a one-off CLI command as a child process (non-IPC mode).
   * Used for commands like `init` that produce terminal output rather than
   * structured JSON responses.
   */
  async runCommand(command: string, args: string[] = []): Promise<RunCommandResult> {
    const cliPath = this.resolveCliPath();
    const { execa } = await import('execa');

    const result = await execa('node', [cliPath, command, ...args], {
      reject: false,
      all: true,
    });

    return {
      success: result.exitCode === 0,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode ?? 1,
    };
  }

  /**
   * Register a listener for streamed messages (chunks) from the CLI that are
   * not matched to a pending request (i.e., server-push events).
   */
  onCliMessage(type: IpcMessageType, handler: IpcMessageHandler): vscode.Disposable {
    this.on(type, handler);
    return new vscode.Disposable(() => this.off(type, handler));
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async ping(): Promise<void> {
    const pingMsg: IpcMessage = {
      id: `ping-${Date.now()}`,
      type: 'ping',
      payload: {},
    };

    await Promise.race([
      this.send(pingMsg),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('CLI ping timeout')), 5000),
      ),
    ]);
  }

  private handleIncomingMessage(msg: IpcMessage): void {
    if (!msg?.id || !msg?.type) {
      this.output.warn('Received malformed IPC message from CLI');
      return;
    }

    // Check if this is a response to a pending request
    const pending = this.pendingRequests.get(msg.id);
    if (pending) {
      this.pendingRequests.delete(msg.id);
      pending.resolve(msg);
      return;
    }

    // Otherwise it's a server-push event (e.g. streaming chunk)
    this.emit(msg.type, msg);
  }

  private async ensureStarted(): Promise<void> {
    if (!this.subprocess) {
      await this.start();
    }
  }

  private scheduleRestart(): void {
    if (this.restartAttempts >= this.maxRestartAttempts) {
      this.output.error(
        `CLI failed to restart after ${this.maxRestartAttempts} attempts. ` +
          'Please reload the extension.',
      );
      return;
    }

    this.restartAttempts++;
    const delay = this.restartDelayMs * this.restartAttempts;

    this.output.info(
      `Restarting CLI in ${delay}ms (attempt ${this.restartAttempts}/${this.maxRestartAttempts})...`,
    );

    setTimeout(() => {
      this.start().catch((err: Error) =>
        this.output.error(`CLI restart failed: ${err.message}`),
      );
    }, delay);
  }

  private resolveCliPath(): string {
    const configPath = vscode.workspace
      .getConfiguration('harness')
      .get<string>('cliPath', '');

    if (configPath && fs.existsSync(configPath)) {
      return configPath;
    }

    // Look for bundled CLI (co-located with extension) or sibling package
    const bundledPath = path.join(this.context.extensionPath, '..', 'cli', 'dist', 'index.js');
    if (fs.existsSync(bundledPath)) {
      return bundledPath;
    }

    // Dev fallback: look for CLI dist in workspace
    const devPath = path.join(this.context.extensionPath, '..', '..', 'cli', 'dist', 'index.js');
    if (fs.existsSync(devPath)) {
      return devPath;
    }

    throw new Error(
      'Harness CLI not found. Build the CLI with `npm run build:cli` or set `harness.cliPath` in settings.',
    );
  }
}
