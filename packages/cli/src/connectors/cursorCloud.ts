/**
 * Cursor Cloud Agents API v1 connector.
 *
 * The IDE endpoint (api2.cursor.sh) is gRPC/Connect — not OpenAI-compatible.
 * Harness uses the public Cloud Agents API: https://api.cursor.com/v1
 *
 * @see https://cursor.com/docs/cloud-agent/api/endpoints
 */
import https from 'https';
import http from 'http';
import { URL } from 'url';
import type { ChatMessage, ContextItem, CopilotMode } from '../types.js';
import { harnessLog } from '../log.js';

export const CURSOR_CLOUD_API_DEFAULT = 'https://api.cursor.com';

/** harness sessionId → Cursor cloud agent id (multi-turn follow-ups) */
const agentBySession = new Map<string, string>();

export function clearCursorCloudSession(sessionId: string): void {
  agentBySession.delete(sessionId);
}

/** Normalize endpoint — reject IDE-internal hosts that return 404 for /chat/completions */
export function normalizeCursorBaseUrl(endpoint: string): string {
  const raw = (endpoint || CURSOR_CLOUD_API_DEFAULT).trim().replace(/\/+$/, '');
  if (!raw) return CURSOR_CLOUD_API_DEFAULT;
  if (/api2\.cursor\.sh|api3\.cursor\.sh|agent\.api5\.cursor\.sh/i.test(raw)) {
    harnessLog(
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

function buildPrompt(
  messages: ChatMessage[],
  context: ContextItem[],
  includeHistory: boolean,
): string {
  const parts: string[] = [];

  if (context.length > 0) {
    parts.push('## Context files');
    for (const c of context) {
      parts.push(`- ${c.label}: ${c.absolutePath}`);
    }
    parts.push('');
  }

  if (includeHistory) {
    for (const m of messages) {
      if (m.role === 'system') continue;
      const who = m.role === 'user' ? 'User' : 'Assistant';
      parts.push(`${who}:\n${m.content}\n`);
    }
  } else {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUser?.content) parts.push(lastUser.content);
  }

  return parts.join('\n').trim();
}

function cursorMode(mode?: CopilotMode): 'agent' | 'plan' {
  return mode === 'ask' ? 'plan' : 'agent';
}

interface CreateAgentResponse {
  agent: { id: string };
  run: { id: string };
}

interface CreateRunResponse {
  run: { id: string };
}

async function httpJson<T>(
  method: string,
  url: URL,
  apiKey: string,
  body?: unknown,
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
          if (res.statusCode !== undefined && res.statusCode >= 400) {
            reject(
              new Error(
                `HTTP ${res.statusCode} from ${url.hostname}: ${text.slice(0, 400)}`,
              ),
            );
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

  return new Promise<void>((resolve) => {
    const lib = url.protocol === 'https:' ? https : http;

    const req = lib.request(
      url,
      {
        method: 'GET',
        headers: {
          Authorization: basicAuth(apiKey),
          Accept: 'text/event-stream',
        },
      },
      (res) => {
        if (res.statusCode !== undefined && res.statusCode >= 400) {
          onError(`HTTP ${res.statusCode} from ${url.hostname} (stream)`);
          resolve();
          return;
        }

        let buffer = '';
        let currentEvent = '';
        let finished = false;

        const finish = () => {
          if (!finished) {
            finished = true;
            onDone();
          }
          resolve();
        };

        res.on('data', (chunk: Buffer) => {
          buffer += chunk.toString('utf-8');
          const blocks = buffer.split('\n\n');
          buffer = blocks.pop() ?? '';

          for (const block of blocks) {
            const lines = block.split('\n');
            let eventType = currentEvent;
            let dataLine = '';

            for (const line of lines) {
              if (line.startsWith('event:')) {
                eventType = line.slice(6).trim();
              } else if (line.startsWith('data:')) {
                dataLine = line.slice(5).trim();
              }
            }

            if (eventType) currentEvent = eventType;
            if (!dataLine) continue;

            try {
              const data = JSON.parse(dataLine) as Record<string, unknown>;

              if (eventType === 'assistant' || eventType === 'thinking') {
                const text = typeof data['text'] === 'string' ? data['text'] : '';
                if (text) onChunk(text);
              } else if (eventType === 'error') {
                const msg =
                  typeof data['message'] === 'string'
                    ? data['message']
                    : 'Cursor stream error';
                onError(msg);
                finished = true;
                resolve();
                return;
              } else if (eventType === 'done' || eventType === 'result') {
                finish();
                return;
              }
            } catch {
              // ignore malformed SSE JSON
            }
          }
        });

        res.on('end', finish);
        res.on('error', (err: Error) => {
          onError(err.message);
          resolve();
        });
      },
    );

    req.on('error', (err: Error) => {
      onError(err.message);
      resolve();
    });
    req.end();
  });
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
 * Route a chat turn through Cursor Cloud Agents API v1.
 */
export async function routeCursorCloud(req: CursorCloudRequest): Promise<void> {
  const apiKey = req.apiKey.trim();
  if (!apiKey) {
    req.onError(
      'Cursor API key required. Create one at https://cursor.com/dashboard/integrations ' +
        'and set harness.connectors.cursor.apiKey or CURSOR_API_KEY.',
    );
    return;
  }

  const baseUrl = normalizeCursorBaseUrl(req.endpoint);
  const mode = cursorMode(req.mode);
  const existingAgentId = agentBySession.get(req.sessionId);
  const promptText = buildPrompt(req.messages, req.context, !existingAgentId);

  if (!promptText) {
    req.onError('No user message to send to Cursor.');
    return;
  }

  try {
    let agentId = existingAgentId;
    let runId: string;

    if (!agentId) {
      harnessLog(`[cursor] creating cloud agent session=${req.sessionId}`);
      const created = await httpJson<CreateAgentResponse>(
        'POST',
        new URL('/v1/agents', baseUrl),
        apiKey,
        { prompt: { text: promptText }, mode },
      );
      agentId = created.agent.id;
      runId = created.run.id;
      agentBySession.set(req.sessionId, agentId);
    } else {
      harnessLog(`[cursor] follow-up run agent=${agentId} session=${req.sessionId}`);
      const created = await httpJson<CreateRunResponse>(
        'POST',
        new URL(`/v1/agents/${agentId}/runs`, baseUrl),
        apiKey,
        { prompt: { text: promptText }, mode },
      );
      runId = created.run.id;
    }

    await streamRun(baseUrl, apiKey, agentId, runId, req.onChunk, req.onDone, req.onError);
  } catch (err) {
    const msg = (err as Error).message;
    if (/401|Unauthorized/i.test(msg)) {
      req.onError(
        `Cursor authentication failed. Check your API key at https://cursor.com/dashboard/integrations. ${msg}`,
      );
      return;
    }
    if (/404/.test(msg) && req.endpoint.includes('api2.cursor.sh')) {
      req.onError(
        'HTTP 404: api2.cursor.sh is the Cursor IDE internal API, not the Cloud Agents API. ' +
          'Set harness.connectors.cursor.endpoint to https://api.cursor.com and use a Cloud Agents API key.',
      );
      return;
    }
    req.onError(`Cursor request failed: ${msg}`);
  }
}
