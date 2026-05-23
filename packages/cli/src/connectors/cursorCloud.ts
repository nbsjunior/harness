/**
 * Cursor Cloud Agents API v1 connector.
 *
 * The IDE endpoint (api2.cursor.sh) is gRPC/Connect — not OpenAI-compatible.
 * Todd uses the public Cloud Agents API: https://api.cursor.com/v1
 *
 * @see https://cursor.com/docs/cloud-agent/api/endpoints
 */
import https from 'https';
import http from 'http';
import { execSync } from 'child_process';
import { URL } from 'url';
import type { ChatMessage, ContextItem, CopilotMode } from '../types.js';
import { toddspectLog } from '../log.js';

export const CURSOR_CLOUD_API_DEFAULT = 'https://api.cursor.com';

/** Max wait for first assistant/thinking text (heartbeats do not reset this). */
const STREAM_NO_CONTENT_TIMEOUT_MS = 90_000;
/** After content started, max gap without new tokens. */
const STREAM_IDLE_AFTER_CONTENT_MS = 120_000;
const STREAM_MAX_DURATION_MS = 600_000;
const RUN_STATUS_POLL_MS = 12_000;
/** Agent mode runs tools for a long time — the SSE socket often drops; we reconnect. */
const STREAM_MAX_RECONNECTS = 10;
const STREAM_RECONNECT_DELAY_MS = 1_500;

interface CursorSessionState {
  agentId: string;
  /** Run still active on Cursor side (CREATING/RUNNING) — blocks new runs until cleared. */
  activeRunId?: string;
}

/** toddspect sessionId → Cursor cloud agent + active run */
const sessionByToddSpectId = new Map<string, CursorSessionState>();

export function clearCursorCloudSession(sessionId: string): void {
  sessionByToddSpectId.delete(sessionId);
}

export interface CursorApiProbeResult {
  ok: boolean;
  userEmail?: string;
  apiKeyName?: string;
  endpoint: string;
  error?: string;
}

/** Live check: GET /v1/me — used by `todd check getGoat` and scripts/test-cursor.mjs */
export async function probeCursorApi(
  apiKey: string,
  endpoint: string,
): Promise<CursorApiProbeResult> {
  const baseUrl = normalizeCursorBaseUrl(endpoint);
  const key = apiKey.trim();
  if (!key) {
    return {
      ok: false,
      endpoint: baseUrl,
      error: 'CURSOR_API_KEY / toddspect.connectors.cursor.apiKey is empty',
    };
  }
  try {
    const me = await httpJson<{ userEmail?: string; apiKeyName?: string }>(
      'GET',
      new URL('/v1/me', baseUrl),
      key,
    );
    return {
      ok: true,
      endpoint: baseUrl,
      userEmail: me.userEmail,
      apiKeyName: me.apiKeyName,
    };
  } catch (err) {
    return {
      ok: false,
      endpoint: baseUrl,
      error: (err as Error).message,
    };
  }
}

function getSession(sessionId: string): CursorSessionState | undefined {
  return sessionByToddSpectId.get(sessionId);
}

function setSession(sessionId: string, state: CursorSessionState): void {
  sessionByToddSpectId.set(sessionId, state);
}

function clearActiveRun(sessionId: string): void {
  const s = sessionByToddSpectId.get(sessionId);
  if (s) {
    s.activeRunId = undefined;
  }
}

/** Normalize endpoint — reject IDE-internal hosts that return 404 for /chat/completions */
export function normalizeCursorBaseUrl(endpoint: string): string {
  const raw = (endpoint || CURSOR_CLOUD_API_DEFAULT).trim().replace(/\/+$/, '');
  if (!raw) return CURSOR_CLOUD_API_DEFAULT;
  if (/api2\.cursor\.sh|api3\.cursor\.sh|agent\.api5\.cursor\.sh/i.test(raw)) {
    toddspectLog(
      `[cursor] endpoint "${raw}" is the IDE internal API — using ${CURSOR_CLOUD_API_DEFAULT} instead`,
    );
    return CURSOR_CLOUD_API_DEFAULT;
  }
  if (!/^https?:\/\//i.test(raw)) {
    return CURSOR_CLOUD_API_DEFAULT;
  }
  return raw;
}

function basicAuth(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:`, 'utf-8').toString('base64')}`;
}

/** Pull `<file>` / `<spec>` blocks from system messages (injected by IpcServer). */
function extractToddSpectContextBlocks(messages: ChatMessage[]): string {
  const blocks: string[] = [];
  for (const m of messages) {
    if (m.role !== 'system' || !m.content.trim()) {
      continue;
    }
    if (m.content.includes('<file path=') || m.content.includes('<spec path=')) {
      blocks.push(m.content.trim());
    }
  }
  return blocks.join('\n\n');
}

/** Shared prompt builder for Cursor Cloud and Cursor SDK local agents. */
export function buildCursorPrompt(
  messages: ChatMessage[],
  context: ContextItem[],
): string {
  const parts: string[] = [];
  const workspace = process.env['TODDSPECT_WORKSPACE']?.trim() || process.cwd();

  parts.push(`Workspace root (local VS Code project): ${workspace}`);
  parts.push('');

  const fileBlocks = extractToddSpectContextBlocks(messages);
  if (fileBlocks) {
    parts.push(fileBlocks);
    parts.push('');
  } else if (context.length > 0) {
    parts.push('## Context paths (read these in the repo if linked via GitHub)');
    for (const c of context) {
      parts.push(`- ${c.label}: ${c.absolutePath}`);
    }
    parts.push('');
  }

  for (const m of messages) {
    if (m.role === 'system') {
      if (
        m.content.includes('<file path=') ||
        m.content.includes('<spec path=') ||
        m.content.includes('assisting through Todd')
      ) {
        continue;
      }
      parts.push(m.content.trim());
      parts.push('');
      continue;
    }
    const who = m.role === 'user' ? 'User' : 'Assistant';
    parts.push(`${who}:\n${m.content}\n`);
  }

  return parts.join('\n').trim();
}

function cursorMode(mode?: CopilotMode): 'agent' | 'plan' {
  return mode === 'ask' ? 'plan' : 'agent';
}

/** Optional GitHub repo for Cloud Agents (speeds up real coding tasks). */
function detectGithubRepo(): { url: string; startingRef: string } | undefined {
  const workspace = process.env['TODDSPECT_WORKSPACE'] ?? process.cwd();
  try {
    const remote = execSync('git remote get-url origin', {
      cwd: workspace,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    let url = remote.replace(/\.git$/i, '');
    if (url.startsWith('git@github.com:')) {
      url = `https://github.com/${url.slice('git@github.com:'.length)}`;
    }
    if (!/^https:\/\/github\.com\//i.test(url)) {
      return undefined;
    }
    let startingRef = 'main';
    try {
      startingRef =
        execSync('git branch --show-current', {
          cwd: workspace,
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim() || 'main';
    } catch {
      // keep main
    }
    return { url, startingRef };
  } catch {
    return undefined;
  }
}

function buildCreateAgentBody(
  promptText: string,
  mode: 'agent' | 'plan',
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    prompt: { text: promptText },
    mode,
  };
  const repo = detectGithubRepo();
  if (repo) {
    body['repos'] = [{ url: repo.url, startingRef: repo.startingRef }];
    toddspectLog(`[cursor] using repo ${repo.url} @ ${repo.startingRef}`);
  }
  return body;
}

function isAgentBusyError(message: string): boolean {
  return /409/.test(message) && /agent_busy/i.test(message);
}

interface CreateAgentResponse {
  agent: { id: string };
  run: { id: string };
}

interface CreateRunResponse {
  run: { id: string };
}

interface RunRecord {
  id: string;
  status?: string;
}

async function httpJson<T>(
  method: string,
  url: URL,
  apiKey: string,
  body?: unknown,
  allowStatuses: number[] = [],
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const lib = url.protocol === 'https:' ? https : http;
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    const bodyBuffer = payload ? Buffer.from(payload, 'utf-8') : undefined;

    const req = lib.request(
      url,
      {
        method,
        headers: {
          Authorization: basicAuth(apiKey),
          Accept: 'application/json',
          ...(bodyBuffer
            ? {
                'Content-Type': 'application/json',
                'Content-Length': bodyBuffer.length,
              }
            : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf-8');
          const code = res.statusCode ?? 0;
          if (code >= 400 && !allowStatuses.includes(code)) {
            reject(new Error(`HTTP ${code} from ${url.hostname}: ${text.slice(0, 400)}`));
            return;
          }
          if (!text.trim()) {
            resolve({} as T);
            return;
          }
          try {
            resolve(JSON.parse(text) as T);
          } catch {
            reject(new Error(`Invalid JSON from Cursor API: ${text.slice(0, 200)}`));
          }
        });
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    if (bodyBuffer) req.write(bodyBuffer);
    req.end();
  });
}

async function cancelRun(
  baseUrl: string,
  apiKey: string,
  agentId: string,
  runId: string,
): Promise<void> {
  try {
    await httpJson(
      'POST',
      new URL(`/v1/agents/${agentId}/runs/${runId}/cancel`, baseUrl),
      apiKey,
      undefined,
      [409],
    );
    toddspectLog(`[cursor] cancelled run=${runId} agent=${agentId}`);
  } catch (err) {
    toddspectLog(`[cursor] cancel run failed (ignored): ${(err as Error).message}`);
  }
}

async function getRun(
  baseUrl: string,
  apiKey: string,
  agentId: string,
  runId: string,
): Promise<RunRecord> {
  return httpJson<RunRecord>(
    'GET',
    new URL(`/v1/agents/${agentId}/runs/${runId}`, baseUrl),
    apiKey,
  );
}

function isTerminalRunStatus(status: string | undefined): boolean {
  if (!status) return false;
  return /FINISHED|FAILED|CANCELLED|COMPLETED|ERROR/i.test(status);
}

/** Cancel any run still marked active for this Todd session (prevents HTTP 409 agent_busy). */
async function cancelActiveRunForSession(
  baseUrl: string,
  apiKey: string,
  sessionId: string,
): Promise<void> {
  const state = getSession(sessionId);
  if (!state?.activeRunId) return;
  await cancelRun(baseUrl, apiKey, state.agentId, state.activeRunId);
  clearActiveRun(sessionId);
}

async function createFollowUpRun(
  baseUrl: string,
  apiKey: string,
  agentId: string,
  promptText: string,
  mode: 'agent' | 'plan',
  sessionId: string,
): Promise<string> {
  const postRun = async (): Promise<string> => {
    const created = await httpJson<CreateRunResponse>(
      'POST',
      new URL(`/v1/agents/${agentId}/runs`, baseUrl),
      apiKey,
      { prompt: { text: promptText }, mode },
    );
    return created.run.id;
  };

  try {
    return await postRun();
  } catch (err) {
    const msg = (err as Error).message;
    if (!isAgentBusyError(msg)) throw err;

    toddspectLog(`[cursor] agent_busy — cancelling previous run session=${sessionId}`);
    await cancelActiveRunForSession(baseUrl, apiKey, sessionId);
    await new Promise((r) => setTimeout(r, 800));
    return postRun();
  }
}

function extractStreamText(
  eventType: string,
  data: Record<string, unknown>,
): string {
  if (eventType === 'assistant' || eventType === 'thinking') {
    return typeof data['text'] === 'string' ? data['text'] : '';
  }
  if (eventType === 'status') {
    const status =
      typeof data['status'] === 'string'
        ? data['status']
        : typeof data['runId'] === 'string'
          ? ''
          : '';
    return status ? `*(Cursor: ${status})*\n` : '';
  }
  if (eventType === 'tool_call') {
    const tool =
      typeof data['name'] === 'string'
        ? data['name']
        : typeof data['tool'] === 'string'
          ? data['tool']
          : 'tool';
    const st = typeof data['status'] === 'string' ? data['status'] : '';
    return st
      ? `*(Cursor ${tool}: ${st})*\n`
      : `*(Cursor running ${tool}…)*\n`;
  }
  return '';
}

function isRecoverableStreamError(message: string): boolean {
  return /ECONNRESET|ECONNABORTED|EPIPE|ETIMEDOUT|socket hang up|aborted/i.test(message);
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

type StreamConnectResult = 'completed' | 'reconnect' | 'fatal';

async function streamRun(
  baseUrl: string,
  apiKey: string,
  agentId: string,
  runId: string,
  onChunk: (chunk: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
): Promise<void> {
  const url = new URL(`/v1/agents/${agentId}/runs/${runId}/stream`, baseUrl);
  const lib = url.protocol === 'https:' ? https : http;

  let finished = false;
  let sawContent = false;
  let lastContentAt = Date.now();
  let lastStatusShown = '';
  let lastEventId = '';
  let reconnectCount = 0;
  let activeReq: http.ClientRequest | null = null;

  let noContentTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    if (!sawContent && !finished) failNoContent();
  }, STREAM_NO_CONTENT_TIMEOUT_MS);

  let idleAfterContentTimer: ReturnType<typeof setTimeout> | null = null;
  let maxTimer: ReturnType<typeof setTimeout> | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  const destroyActiveReq = () => {
    if (!activeReq) return;
    activeReq.removeAllListeners();
    activeReq.destroy();
    activeReq = null;
  };

  const cleanup = () => {
    destroyActiveReq();
    if (noContentTimer) clearTimeout(noContentTimer);
    if (idleAfterContentTimer) clearTimeout(idleAfterContentTimer);
    if (maxTimer) clearTimeout(maxTimer);
    if (pollTimer) clearInterval(pollTimer);
  };

  const finish = (callDone: boolean) => {
    if (finished) return;
    finished = true;
    cleanup();
    if (callDone) onDone();
  };

  const failNoContent = () => {
    toddspectLog(`[cursor] no content within ${STREAM_NO_CONTENT_TIMEOUT_MS}ms run=${runId}`);
    destroyActiveReq();
    onError(
      'Cursor cloud agent did not return text within 90 seconds. ' +
        'Cloud Agents often need a linked GitHub repo and can take several minutes. ' +
        'Try **Ask** mode, a **+ New chat**, or check https://cursor.com/agents for the run status.',
    );
    finish(false);
  };

  const armIdleAfterContent = () => {
    if (idleAfterContentTimer) clearTimeout(idleAfterContentTimer);
    idleAfterContentTimer = setTimeout(() => {
      if (finished) return;
      toddspectLog(`[cursor] idle after content run=${runId}`);
      destroyActiveReq();
      finish(true);
    }, STREAM_IDLE_AFTER_CONTENT_MS);
  };

  /** Any SSE activity (status, tool_call, assistant) — agent mode may stream tools before text. */
  const bumpStreamActivity = () => {
    lastContentAt = Date.now();
    if (noContentTimer) {
      clearTimeout(noContentTimer);
      noContentTimer = setTimeout(() => {
        if (!sawContent && !finished) failNoContent();
      }, STREAM_NO_CONTENT_TIMEOUT_MS);
    }
  };

  const onStreamText = (text: string, countsAsContent = true) => {
    if (!text) return;
    bumpStreamActivity();
    if (countsAsContent) {
      sawContent = true;
      if (noContentTimer) {
        clearTimeout(noContentTimer);
        noContentTimer = null;
      }
      armIdleAfterContent();
    }
    onChunk(text);
  };

  const tryFinishFromRunStatus = async (): Promise<boolean> => {
    try {
      const run = await getRun(baseUrl, apiKey, agentId, runId);
      if (isTerminalRunStatus(run.status)) {
        if (!sawContent) {
          onStreamText(
            `*(Cursor run ${run.status} — no streamed text. View progress at cursor.com/agents)*\n`,
            true,
          );
        }
        finish(true);
        return true;
      }
    } catch {
      // best-effort
    }
    return false;
  };

  const handleSseBlock = (block: string): StreamConnectResult => {
    if (!block.trim()) return 'reconnect';

    const lines = block.split('\n');
    let eventType = '';
    const dataParts: string[] = [];

    for (const rawLine of lines) {
      const line = rawLine.replace(/\r$/, '');
      if (line.startsWith('event:')) {
        eventType = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataParts.push(line.slice(5).trim());
      } else if (line.startsWith('id:')) {
        const id = line.slice(3).trim();
        if (id) lastEventId = id;
      }
    }

    const dataLine = dataParts.join('\n').trim();
    if (!dataLine) return 'reconnect';

    try {
      const data = JSON.parse(dataLine) as Record<string, unknown>;
      toddspectLog(`[cursor] sse event=${eventType} run=${runId}`);

      if (eventType === 'heartbeat') {
        return 'reconnect';
      }

      bumpStreamActivity();

      const text = extractStreamText(eventType, data);
      if (text) {
        if (eventType === 'status' || eventType === 'tool_call') {
          if (text === lastStatusShown) return 'reconnect';
          lastStatusShown = text;
          onStreamText(text, false);
        } else {
          onStreamText(text, true);
        }
      }

      if (eventType === 'error') {
        const msg =
          typeof data['message'] === 'string' ? data['message'] : 'Cursor stream error';
        onError(msg);
        finish(false);
        return 'fatal';
      }

      if (eventType === 'result') {
        const status = typeof data['status'] === 'string' ? data['status'] : undefined;
        if (isTerminalRunStatus(status)) {
          finish(true);
          return 'completed';
        }
      }

      if (eventType === 'done') {
        finish(true);
        return 'completed';
      }
    } catch {
      toddspectLog(`[cursor] malformed sse: ${dataLine.slice(0, 80)}`);
    }

    return 'reconnect';
  };

  pollTimer = setInterval(() => {
    if (finished) return;
    void getRun(baseUrl, apiKey, agentId, runId)
      .then((run) => {
        if (finished) return;
        toddspectLog(`[cursor] poll status=${run.status ?? '?'} run=${runId}`);
        if (isTerminalRunStatus(run.status)) {
          if (!sawContent) {
            onStreamText(
              `*(Cursor run ${run.status} — no streamed text. View progress at cursor.com/agents)*\n`,
              true,
            );
          }
          destroyActiveReq();
          finish(true);
        }
      })
      .catch(() => {
        /* ignore poll errors */
      });
  }, RUN_STATUS_POLL_MS);

  maxTimer = setTimeout(() => {
    if (finished) return;
    toddspectLog(`[cursor] stream max duration exceeded run=${runId}`);
    destroyActiveReq();
    if (!sawContent) {
      onError('Cursor request exceeded maximum wait time (10 minutes).');
      finish(false);
    } else {
      finish(true);
    }
  }, STREAM_MAX_DURATION_MS);

  onStreamText('*(Waiting for Cursor cloud agent…)*\n', false);

  const connectOnce = (): Promise<StreamConnectResult> =>
    new Promise((resolve) => {
      if (finished) {
        resolve('completed');
        return;
      }

      const headers: Record<string, string> = {
        Authorization: basicAuth(apiKey),
        Accept: 'text/event-stream',
        'Cache-Control': 'no-cache',
      };
      if (lastEventId) {
        headers['Last-Event-ID'] = lastEventId;
        toddspectLog(`[cursor] stream resume Last-Event-ID=${lastEventId} run=${runId}`);
      }

      const req = lib.request(
        url,
        { method: 'GET', headers },
        (res) => {
          const code = res.statusCode ?? 0;

          if (code === 410) {
            toddspectLog(`[cursor] stream_expired run=${runId} — polling run status`);
            resolve('reconnect');
            return;
          }

          if (code >= 400) {
            onError(`HTTP ${code} from ${url.hostname} (stream)`);
            finish(false);
            resolve('fatal');
            return;
          }

          let buffer = '';

          res.on('data', (chunk: Buffer) => {
            buffer += chunk.toString('utf-8');
            const blocks = buffer.split(/\n\n/);
            buffer = blocks.pop() ?? '';

            for (const block of blocks) {
              const outcome = handleSseBlock(block);
              if (outcome === 'completed' || outcome === 'fatal') {
                resolve(outcome);
                return;
              }
            }
          });

          res.on('end', () => {
            if (finished) {
              resolve('completed');
              return;
            }
            if (buffer.trim()) {
              const outcome = handleSseBlock(buffer);
              if (outcome === 'completed' || outcome === 'fatal') {
                resolve(outcome);
                return;
              }
            }
            resolve('reconnect');
          });

          res.on('error', (err: Error) => {
            if (finished) {
              resolve('completed');
              return;
            }
            toddspectLog(`[cursor] res error run=${runId}: ${err.message}`);
            resolve(isRecoverableStreamError(err.message) ? 'reconnect' : 'fatal');
          });
        },
      );

      activeReq = req;
      req.setTimeout(0);

      req.on('error', (err: Error) => {
        if (finished) {
          resolve('completed');
          return;
        }
        toddspectLog(`[cursor] req error run=${runId}: ${err.message}`);
        resolve(isRecoverableStreamError(err.message) ? 'reconnect' : 'fatal');
      });

      req.end();
    });

  while (!finished) {
    const outcome = await connectOnce();
    destroyActiveReq();

    if (outcome === 'completed') {
      break;
    }

    if (outcome === 'fatal') {
      if (!finished) {
        onError('Cursor stream failed unexpectedly.');
        finish(false);
      }
      break;
    }

    if (await tryFinishFromRunStatus()) {
      break;
    }

    if (reconnectCount >= STREAM_MAX_RECONNECTS) {
      toddspectLog(`[cursor] max stream reconnects (${STREAM_MAX_RECONNECTS}) run=${runId}`);
      if (!sawContent && Date.now() - lastContentAt > STREAM_NO_CONTENT_TIMEOUT_MS) {
        failNoContent();
      } else if (sawContent) {
        finish(true);
      } else {
        onError(
          'Cursor stream disconnected (ECONNRESET) and could not reconnect. ' +
            'The agent may still be running — check https://cursor.com/agents or use **Ask** mode for chat.',
        );
        finish(false);
      }
      break;
    }

    reconnectCount += 1;
    toddspectLog(
      `[cursor] stream reconnect #${reconnectCount} run=${runId} lastEventId=${lastEventId || '(none)'}`,
    );
    onStreamText(`*(Cursor stream reconnecting… #${reconnectCount})*\n`, false);
    await delay(STREAM_RECONNECT_DELAY_MS);
  }

  if (!finished) {
    if (await tryFinishFromRunStatus()) {
      return;
    }
    if (!sawContent && Date.now() - lastContentAt > STREAM_NO_CONTENT_TIMEOUT_MS) {
      failNoContent();
      return;
    }
    finish(sawContent);
  }
}

export interface CursorCloudRequest {
  sessionId: string;
  messages: ChatMessage[];
  context: ContextItem[];
  mode?: CopilotMode;
  apiKey: string;
  endpoint: string;
  onChunk: (chunk: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
}

/**
 * Cancel the active Cursor run for a Todd session (e.g. user clicked Stop).
 */
export async function cancelCursorCloudSession(
  sessionId: string,
  apiKey: string,
  endpoint: string,
): Promise<void> {
  const state = getSession(sessionId);
  if (!state?.activeRunId) {
    clearCursorCloudSession(sessionId);
    return;
  }
  if (!apiKey.trim()) {
    clearCursorCloudSession(sessionId);
    return;
  }
  const baseUrl = normalizeCursorBaseUrl(endpoint);
  await cancelRun(baseUrl, apiKey.trim(), state.agentId, state.activeRunId);
  clearCursorCloudSession(sessionId);
}

/**
 * Route a chat turn through Cursor Cloud Agents API v1.
 */
export async function routeCursorCloud(req: CursorCloudRequest): Promise<void> {
  const apiKey = req.apiKey.trim();
  if (!apiKey) {
    req.onError(
      'Cursor API key required. Create one at https://cursor.com/dashboard/integrations ' +
        'and set toddspect.connectors.cursor.apiKey or CURSOR_API_KEY.',
    );
    return;
  }

  const baseUrl = normalizeCursorBaseUrl(req.endpoint);
  const mode = cursorMode(req.mode);
  const existing = getSession(req.sessionId);
  const promptText = buildCursorPrompt(req.messages, req.context);

  if (!promptText) {
    req.onError('No user message to send to Cursor.');
    return;
  }

  try {
    await cancelActiveRunForSession(baseUrl, apiKey, req.sessionId);

    let agentId = existing?.agentId;
    let runId: string;

    if (!agentId) {
      toddspectLog(`[cursor] creating cloud agent session=${req.sessionId}`);
      const created = await httpJson<CreateAgentResponse>(
        'POST',
        new URL('/v1/agents', baseUrl),
        apiKey,
        buildCreateAgentBody(promptText, mode),
      );
      agentId = created.agent.id;
      runId = created.run.id;
      setSession(req.sessionId, { agentId, activeRunId: runId });
    } else {
      toddspectLog(`[cursor] follow-up run agent=${agentId} session=${req.sessionId}`);
      runId = await createFollowUpRun(
        baseUrl,
        apiKey,
        agentId,
        promptText,
        mode,
        req.sessionId,
      );
      setSession(req.sessionId, { agentId, activeRunId: runId });
    }

    let doneCalled = false;
    const safeDone = () => {
      if (doneCalled) return;
      doneCalled = true;
      clearActiveRun(req.sessionId);
      req.onDone();
    };
    const safeError = (msg: string) => {
      clearActiveRun(req.sessionId);
      req.onError(msg);
    };

    await streamRun(
      baseUrl,
      apiKey,
      agentId,
      runId,
      req.onChunk,
      safeDone,
      safeError,
    );

    if (!doneCalled) {
      safeDone();
    }
  } catch (err) {
    clearActiveRun(req.sessionId);
    const msg = (err as Error).message;
    if (/401|Unauthorized/i.test(msg)) {
      req.onError(
        `Cursor authentication failed. Check your API key at https://cursor.com/dashboard/integrations. ${msg}`,
      );
      return;
    }
    if (isAgentBusyError(msg)) {
      clearCursorCloudSession(req.sessionId);
      req.onError(
        'Cursor agent is still busy from a previous message. Start a **+ New chat** or wait a few seconds and try again.',
      );
      return;
    }
    if (/404/.test(msg) && req.endpoint.includes('api2.cursor.sh')) {
      req.onError(
        'HTTP 404: api2.cursor.sh is the Cursor IDE internal API, not the Cloud Agents API. ' +
          'Set toddspect.connectors.cursor.endpoint to https://api.cursor.com and use a Cloud Agents API key.',
      );
      return;
    }
    if (isRecoverableStreamError(msg)) {
      req.onError(
        'Cursor connection dropped (ECONNRESET). In **Agent** mode the cloud VM may run tools for several minutes — ' +
          'retry, use **+ New chat**, or check https://cursor.com/agents. **Ask** mode is more stable for quick chat.',
      );
      return;
    }
    req.onError(`Cursor request failed: ${msg}`);
  }
}
