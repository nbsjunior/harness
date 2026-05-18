/**
 * Headers required by https://api.githubcopilot.com (GitHub Copilot API).
 *
 * Classic PATs (ghp_…) are rejected with HTTP 400:
 * "Personal Access Tokens are not supported for this endpoint".
 *
 * Use OAuth (gh auth login → gh auth token) or a fine-grained PAT (github_pat_…).
 *
 * @see https://github.com/github/copilot-cli/issues/233
 */

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
