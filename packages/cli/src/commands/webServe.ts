/**
 * Minimal web UI for remote ToddSpect instances (read-only dashboard).
 */
import http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { getWorkspaceRoot } from '../config.js';
import { loadChatSession } from '../session/persistence.js';
import { loadUsageStats, usageStatsPath } from '../usage/usageTracker.js';
import { loadPluginRegistry } from '../plugins/registry.js';
import { evaluateBudgetAlerts } from '../usage/budget.js';
import { loadSpendingBudgetSettings } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function webServeCommand(options: {
  port?: number;
  host?: string;
}): Promise<void> {
  const port = options.port ?? 3847;
  const host = options.host ?? '127.0.0.1';
  const publicDir = path.join(__dirname, '..', '..', 'web', 'public');
  const indexPath = path.join(publicDir, 'index.html');

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://${host}`);

    if (url.pathname === '/api/health') {
      json(res, { ok: true });
      return;
    }

    if (url.pathname === '/api/usage') {
      const root = getWorkspaceRoot();
      const stats = loadUsageStats(root);
      const alerts = evaluateBudgetAlerts(stats, loadSpendingBudgetSettings());
      json(res, { stats, alerts, path: usageStatsPath(root) });
      return;
    }

    if (url.pathname === '/api/session') {
      const session = loadChatSession(getWorkspaceRoot());
      json(res, { session });
      return;
    }

    if (url.pathname === '/api/plugins') {
      json(res, loadPluginRegistry(getWorkspaceRoot()));
      return;
    }

    if (url.pathname === '/' || url.pathname === '/index.html') {
      if (fs.existsSync(indexPath)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fs.readFileSync(indexPath, 'utf-8'));
      } else {
        res.writeHead(404);
        res.end('Web UI not found. Run from monorepo packages/cli.');
      }
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  await new Promise<void>((resolve) => {
    server.listen(port, host, () => {
      process.stderr.write(
        `[toddspect web] Dashboard http://${host}:${port}/ (workspace: ${getWorkspaceRoot()})\n`,
      );
      resolve();
    });
  });
}

function json(res: http.ServerResponse, body: unknown): void {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body, null, 2));
}
