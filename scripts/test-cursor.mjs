#!/usr/bin/env node
/**
 * Quick Cursor Cloud Agents API check (no VS Code required).
 *
 * Usage:
 *   set CURSOR_API_KEY=your-key
 *   node scripts/test-cursor.mjs
 *
 * Optional: CURSOR_API_ENDPOINT=https://api.cursor.com
 */
const apiKey = process.env.CURSOR_API_KEY?.trim();
const endpoint = (process.env.CURSOR_API_ENDPOINT || 'https://api.cursor.com').replace(
  /\/+$/,
  '',
);

if (!apiKey) {
  console.error('CURSOR_API_KEY is not set.');
  console.error('Create a key: https://cursor.com/dashboard/integrations');
  process.exit(1);
}

if (/api2\.cursor\.sh/i.test(endpoint)) {
  console.error(`Wrong endpoint "${endpoint}" — use https://api.cursor.com`);
  process.exit(1);
}

const auth = Buffer.from(`${apiKey}:`, 'utf-8').toString('base64');

const res = await fetch(`${endpoint}/v1/me`, {
  headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
});
const body = await res.text();

if (!res.ok) {
  console.error(`GET /v1/me failed: HTTP ${res.status}`);
  console.error(body.slice(0, 400));
  process.exit(1);
}

const me = JSON.parse(body);
console.log('Cursor API OK');
console.log(`  endpoint: ${endpoint}`);
console.log(`  user:     ${me.userEmail ?? '(unknown)'}`);
console.log(`  key name: ${me.apiKeyName ?? '(unknown)'}`);
console.log('\nToddSpect chat uses Cloud Agents (can take 1–3 min for first reply).');
console.log('For instant chat, use Copilot or Auto in the ToddSpect sidebar.');
