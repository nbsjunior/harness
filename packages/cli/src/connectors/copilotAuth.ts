/**
 * GitHub Copilot API authentication.
 *
 * The Copilot API requires a two-step auth flow:
 *  1. Exchange the GitHub OAuth/PAT token for a short-lived Copilot API token
 *     via GET https://api.github.com/copilot_internal/v2/token
 *  2. Use the returned token as `Authorization: Bearer <copilot_token>` for
 *     calls to api.githubcopilot.com
 *
 * Classic PATs (ghp_…) are rejected with HTTP 400 at step 1.
 * Use OAuth (gh auth login → gh auth token) or a fine-grained PAT (github_pat_…).
 */
import https from 'https';

export const COPILOT_INTEGRATION_ID = 'copilot-developer-cli';

interface CopilotToken {
  token: string;
  expiresAt: number; // Unix ms
}

// In-process cache keyed by GitHub token
const tokenCache = new Map<string, CopilotToken>();

function fetchCopilotToken(githubToken: string): Promise<CopilotToken> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.github.com',
        path: '/copilot_internal/v2/token',
        method: 'GET',
        headers: {
          Authorization: `token ${githubToken}`,
          Accept: 'application/json',
          'User-Agent': 'harness-cli/0.1.0',
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (d: Buffer) => chunks.push(d));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf-8');
          if (res.statusCode === 404) {
            reject(
              new Error(
                `Copilot token endpoint not found (HTTP 404). ` +
                  `Your token likely lacks the "copilot" scope. ` +
                  `Fix: run  gh auth refresh --scopes copilot  then reload VS Code.`,
              ),
            );
            return;
          }
          if (res.statusCode !== 200) {
            reject(
              new Error(
                `GitHub token exchange failed (HTTP ${res.statusCode}). ` +
                  `Make sure your account has an active GitHub Copilot subscription. ` +
                  `Response: ${body.slice(0, 200)}`,
              ),
            );
            return;
          }
          try {
            const data = JSON.parse(body) as { token?: string; expires_at?: string };
            if (!data.token) {
              reject(new Error(`Copilot token exchange returned no token. Body: ${body.slice(0, 200)}`));
              return;
            }
            // expires_at is ISO string, subtract 60s buffer
            const expiresAt = data.expires_at
              ? new Date(data.expires_at).getTime() - 60_000
              : Date.now() + 14 * 60_000; // default 14 min
            resolve({ token: data.token, expiresAt });
          } catch (e) {
            reject(new Error(`Failed to parse Copilot token response: ${(e as Error).message}`));
          }
        });
      },
    );
    req.on('error', (e) => reject(new Error(`Copilot token request error: ${e.message}`)));
    req.end();
  });
}

/**
 * Exchange a GitHub OAuth/fine-grained PAT for a short-lived Copilot API token.
 * Result is cached in-process until ~1 minute before expiry.
 * On 401 the cache is cleared so the next call retries fresh.
 */
export async function getCopilotApiToken(githubToken: string): Promise<string> {
  const cached = tokenCache.get(githubToken);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }
  try {
    const fresh = await fetchCopilotToken(githubToken);
    tokenCache.set(githubToken, fresh);
    return fresh.token;
  } catch (err) {
    tokenCache.delete(githubToken);
    throw err;
  }
}

export function buildCopilotAuthHeaders(copilotToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${copilotToken}`,
    'Copilot-Integration-Id': COPILOT_INTEGRATION_ID,
  };
}

export function validateCopilotToken(token: string): string | null {
  const t = token.trim();
  if (!t) {
    return 'Token is empty.';
  }
  if (t.startsWith('ghp_')) {
    return (
      'Classic Personal Access Tokens (ghp_…) are not supported by the Copilot API. ' +
      'Use `gh auth login` then paste `gh auth token`, or create a fine-grained PAT at ' +
      'github.com/settings/personal-access-tokens (token starts with github_pat_).'
    );
  }
  return null;
}
