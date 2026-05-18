import { execFileSync } from 'child_process';

/**
 * Try to get a GitHub OAuth token from the `gh` CLI.
 * Returns null if `gh` is not installed, not authenticated, or returns a classic PAT.
 */
export function getGhCliToken(): string | null {
  try {
    const token = execFileSync('gh', ['auth', 'token'], {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    if (!token) {
      return null;
    }
    // Classic PATs (ghp_) are rejected by the Copilot API — skip them
    if (token.startsWith('ghp_')) {
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

/** True if `gh` CLI is available and authenticated (any valid token). */
export function isGhCliAvailable(): boolean {
  try {
    execFileSync('gh', ['auth', 'status'], {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}
