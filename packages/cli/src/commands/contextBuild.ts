import * as fs from 'fs';
import * as path from 'path';
import type { ContextItem } from '../types.js';

interface ContextBuildOptions {
  output?: 'json' | 'summary';
  maxDepth?: number;
  maxTokens?: number;
  ignore?: string[];
}

const DEFAULT_IGNORED = [
  'node_modules',
  'dist',
  'build',
  '.git',
  '.harness/context',
  '.harness/.session',
  '*.lock',
  'package-lock.json',
  'yarn.lock',
];

const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.hpp', '.cs',
  '.rb', '.php', '.swift', '.kt', '.scala',
  '.md', '.mdx', '.txt', '.rst',
  '.json', '.yaml', '.yml', '.toml', '.xml', '.ini', '.env.example',
  '.html', '.css', '.scss', '.sass', '.less',
  '.sql', '.graphql', '.gql',
  '.sh', '.bash', '.zsh', '.fish', '.ps1',
  '.dockerfile', '.containerfile',
]);

/**
 * Scan one or more directories and build a flat context payload of file contents.
 * Respects token budget, ignored patterns, and file type filters.
 */
export async function contextBuildCommand(
  dirs: string[],
  options: ContextBuildOptions = {},
): Promise<{ items: ContextItem[]; totalTokenEstimate: number }> {
  const maxDepth = options.maxDepth ?? 4;
  const maxTokens = options.maxTokens ?? 100_000;
  const ignoredNames = new Set([...DEFAULT_IGNORED, ...(options.ignore ?? [])]);
  const outputFormat = options.output ?? 'summary';

  const items: ContextItem[] = [];
  let totalTokens = 0;

  for (const dir of dirs) {
    const resolved = path.resolve(dir);

    if (!fs.existsSync(resolved)) {
      console.warn(`Warning: directory does not exist: ${resolved}`);
      continue;
    }

    const stat = fs.statSync(resolved);

    if (stat.isFile()) {
      const item = buildFileItem(resolved, process.cwd());
      if (item) {
        items.push(item);
        totalTokens += item.tokenEstimate ?? 0;
      }
      continue;
    }

    const collected = collectFiles(resolved, ignoredNames, maxDepth, 0);

    for (const filePath of collected) {
      if (totalTokens >= maxTokens) {
        console.warn(
          `Token budget (${maxTokens}) reached. Stopping at ${items.length} files.`,
        );
        break;
      }
      const item = buildFileItem(filePath, process.cwd());
      if (item) {
        items.push(item);
        totalTokens += item.tokenEstimate ?? 0;
      }
    }
  }

  if (outputFormat === 'json') {
    console.log(JSON.stringify({ items, totalTokenEstimate: totalTokens }, null, 2));
  } else {
    console.log(`\nContext built: ${items.length} file(s), ~${totalTokens.toLocaleString()} tokens\n`);

    const byDir = new Map<string, ContextItem[]>();
    for (const item of items) {
      const dir = path.dirname(item.label);
      const existing = byDir.get(dir) ?? [];
      existing.push(item);
      byDir.set(dir, existing);
    }

    for (const [dir, dirItems] of byDir) {
      console.log(`  ${dir}/`);
      for (const item of dirItems.slice(0, 5)) {
        console.log(`    ${path.basename(item.label)} (~${item.tokenEstimate} tokens)`);
      }
      if (dirItems.length > 5) {
        console.log(`    … and ${dirItems.length - 5} more`);
      }
    }
  }

  return { items, totalTokenEstimate: totalTokens };
}

function collectFiles(
  dir: string,
  ignored: Set<string>,
  maxDepth: number,
  depth: number,
): string[] {
  if (depth >= maxDepth) {
    return [];
  }

  const results: string[] = [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  for (const entry of entries) {
    if (shouldIgnore(entry.name, ignored)) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath, ignored, maxDepth, depth + 1));
    } else if (entry.isFile() && isTextFile(entry.name)) {
      results.push(fullPath);
    }
  }

  return results;
}

function shouldIgnore(name: string, ignored: Set<string>): boolean {
  if (name.startsWith('.') && name !== '.env.example') {
    return true;
  }
  for (const pattern of ignored) {
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
      if (regex.test(name)) {
        return true;
      }
    } else if (name === pattern || name.endsWith('/' + pattern)) {
      return true;
    }
  }
  return false;
}

function isTextFile(name: string): boolean {
  const ext = path.extname(name).toLowerCase();
  return TEXT_EXTENSIONS.has(ext) || name === 'Dockerfile' || name === 'Makefile';
}

function buildFileItem(filePath: string, workspaceRoot: string): ContextItem | null {
  try {
    const content = fs.readFileSync(filePath);
    const tokenEstimate = Math.ceil(content.length / 4);
    const relativePath = path.relative(workspaceRoot, filePath);

    return {
      uri: `file://${filePath.replace(/\\/g, '/')}`,
      kind: 'file',
      label: relativePath,
      tokenEstimate,
    };
  } catch {
    return null;
  }
}
