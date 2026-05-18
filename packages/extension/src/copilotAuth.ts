/** Copilot API auth helpers (mirrors packages/cli/src/connectors/copilotAuth.ts). */

export const COPILOT_INTEGRATION_ID = 'copilot-developer-cli';

export function buildCopilotAuthHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
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
