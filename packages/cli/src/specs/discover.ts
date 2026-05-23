/**
 * Suggest SDD specs from repository structure (auto-discovery).
 */
import * as fs from 'fs';
import * as path from 'path';
import { getWorkspaceRoot } from '../config.js';

export interface SpecDiscoverySuggestion {
  id: string;
  title: string;
  kind: 'skill' | 'tool' | 'workflow';
  reason: string;
  suggestedFile: string;
  /** Minimal YAML stub */
  template: string;
}

export interface SpecDiscoveryResult {
  workspaceRoot: string;
  suggestions: SpecDiscoverySuggestion[];
}

function exists(rel: string, root: string): boolean {
  return fs.existsSync(path.join(root, rel));
}

function countFiles(dir: string, max = 200): number {
  let n = 0;
  function walk(d: string, depth: number): void {
    if (depth > 3 || n >= max) {
      return;
    }
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name === 'node_modules') {
        continue;
      }
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        walk(full, depth + 1);
      } else {
        n += 1;
      }
    }
  }
  walk(dir, 0);
  return n;
}

function yamlStub(
  id: string,
  title: string,
  kind: string,
  description: string,
  preferredAgent: string,
): string {
  return [
    '---',
    `id: ${id}`,
    `title: ${title}`,
    `kind: ${kind}`,
    `preferredAgent: ${preferredAgent}`,
    `description: ${description}`,
    '---',
    '',
    `# ${title}`,
    '',
    description,
    '',
  ].join('\n');
}

export function discoverSpecsFromRepo(workspaceRoot?: string): SpecDiscoveryResult {
  const root = workspaceRoot ?? getWorkspaceRoot();
  const suggestions: SpecDiscoverySuggestion[] = [];
  const specsDir = '.toddspect/specs';

  if (exists('package.json', root)) {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8')) as {
      scripts?: Record<string, string>;
    };
    if (pkg.scripts?.test || exists('vitest.config.ts', root) || exists('jest.config.js', root)) {
      suggestions.push({
        id: 'repo-test-workflow',
        title: 'Run tests before merge',
        kind: 'workflow',
        reason: 'Detected test script or test config in the repository.',
        suggestedFile: `${specsDir}/workflow-repo-tests.md`,
        template: yamlStub(
          'repo-test-workflow',
          'Run tests before merge',
          'workflow',
          'Run the project test suite and report failures before completing agent tasks.',
          'copilot',
        ),
      });
    }
  }

  if (exists('src', root) && countFiles(path.join(root, 'src')) > 5) {
    suggestions.push({
      id: 'src-refactor-skill',
      title: 'Source refactor guardrails',
      kind: 'skill',
      reason: 'Found `src/` with multiple source files.',
      suggestedFile: `${specsDir}/skill-src-refactor.md`,
      template: yamlStub(
        'src-refactor-skill',
        'Source refactor guardrails',
        'skill',
        'Prefer minimal diffs; preserve public APIs; add types where missing.',
        'claude',
      ),
    });
  }

  if (exists('.github/workflows', root)) {
    suggestions.push({
      id: 'ci-toddspect-agent',
      title: 'Todd agent in CI',
      kind: 'workflow',
      reason: 'GitHub Actions workflows directory present.',
      suggestedFile: `${specsDir}/workflow-ci-toddspect.md`,
      template: yamlStub(
        'ci-toddspect-agent',
        'Todd agent in CI',
        'workflow',
        'Use `toddspect agent:run` in CI for automated reviews (see docs/github-actions.md).',
        'cursor',
      ),
    });
  }

  if (exists('README.md', root)) {
    suggestions.push({
      id: 'docs-sync-skill',
      title: 'Keep README in sync',
      kind: 'skill',
      reason: 'README.md found — document user-facing changes.',
      suggestedFile: `${specsDir}/skill-docs-readme.md`,
      template: yamlStub(
        'docs-sync-skill',
        'Keep README in sync',
        'skill',
        'Update README when changing install steps, features, or configuration.',
        'copilot',
      ),
    });
  }

  if (exists('packages', root)) {
    suggestions.push({
      id: 'monorepo-navigation',
      title: 'Monorepo package awareness',
      kind: 'skill',
      reason: 'Detected `packages/` (monorepo layout).',
      suggestedFile: `${specsDir}/skill-monorepo.md`,
      template: yamlStub(
        'monorepo-navigation',
        'Monorepo package awareness',
        'skill',
        'Identify which package owns a change before editing; run builds scoped to that package.',
        'cursor',
      ),
    });
  }

  return { workspaceRoot: root, suggestions };
}
