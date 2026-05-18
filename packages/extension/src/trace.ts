import type * as vscode from 'vscode';

/** Redact tokens and API keys from log lines. */
export function redactSecrets(text: string): string {
  return text
    .replace(/\bgho_[A-Za-z0-9_]+\b/g, 'gho_***')
    .replace(/\bgithub_pat_[A-Za-z0-9_]+\b/g, 'github_pat_***')
    .replace(/\bghp_[A-Za-z0-9_]+\b/g, 'ghp_***')
    .replace(/\bsk-ant-[A-Za-z0-9_-]+\b/g, 'sk-ant-***')
    .replace(/\bsk-[A-Za-z0-9]{20,}\b/g, 'sk-***')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer ***')
    .replace(/"token"\s*:\s*"[^"]+"/gi, '"token":"***"')
    .replace(/"apiKey"\s*:\s*"[^"]+"/gi, '"apiKey":"***"');
}

export function traceLog(
  output: vscode.LogOutputChannel,
  category: string,
  message: string,
  data?: unknown,
): void {
  let line = `[${category}] ${message}`;
  if (data !== undefined) {
    try {
      line += ' ' + redactSecrets(JSON.stringify(data));
    } catch {
      line += ' ' + redactSecrets(String(data));
    }
  }
  output.info(redactSecrets(line));
}
