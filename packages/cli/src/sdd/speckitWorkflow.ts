/**
 * Spec-Kit aligned SDD workflow for Harness (.harness/sdd/).
 * @see https://github.com/github/spec-kit
 */
import * as fs from 'fs';
import * as path from 'path';
import { getWorkspaceRoot } from '../config.js';
import {
  CHECKLIST_TEMPLATE,
  CLARIFICATIONS_TEMPLATE,
  CONSTITUTION_TEMPLATE,
  PLAN_TEMPLATE,
  SPEC_TEMPLATE,
  TASKS_TEMPLATE,
} from './templates.js';

export const SDD_ROOT = '.harness/sdd';

export type SddStepId =
  | 'constitution'
  | 'specify'
  | 'clarify'
  | 'plan'
  | 'tasks'
  | 'analyze'
  | 'checklist'
  | 'implement'
  | 'taskstoissues';

export type SddStepStatus = 'locked' | 'ready' | 'done' | 'optional';

export interface SddWorkflowStep {
  id: SddStepId;
  /** spec-kit slash command */
  slashCommand: string;
  label: string;
  description: string;
  phase: 'foundation' | 'specification' | 'planning' | 'execution' | 'quality';
  optional: boolean;
  /** Step ids that must be done first */
  requires: SddStepId[];
  /** Relative path pattern; {featureId} replaced when in a feature */
  artifactPattern?: string;
}

export const SDD_WORKFLOW_STEPS: SddWorkflowStep[] = [
  {
    id: 'constitution',
    slashCommand: '/speckit.constitution',
    label: 'Constitution',
    description: 'Project governing principles and development guidelines',
    phase: 'foundation',
    optional: false,
    requires: [],
    artifactPattern: `${SDD_ROOT}/memory/constitution.md`,
  },
  {
    id: 'specify',
    slashCommand: '/speckit.specify',
    label: 'Specify',
    description: 'Functional spec — what & why (no tech stack yet)',
    phase: 'specification',
    optional: false,
    requires: ['constitution'],
    artifactPattern: `${SDD_ROOT}/specs/{featureId}/spec.md`,
  },
  {
    id: 'clarify',
    slashCommand: '/speckit.clarify',
    label: 'Clarify',
    description: 'Structured clarification before planning (recommended)',
    phase: 'specification',
    optional: true,
    requires: ['specify'],
    artifactPattern: `${SDD_ROOT}/specs/{featureId}/clarifications.md`,
  },
  {
    id: 'plan',
    slashCommand: '/speckit.plan',
    label: 'Plan',
    description: 'Technical implementation plan with chosen stack',
    phase: 'planning',
    optional: false,
    requires: ['specify'],
    artifactPattern: `${SDD_ROOT}/specs/{featureId}/plan.md`,
  },
  {
    id: 'tasks',
    slashCommand: '/speckit.tasks',
    label: 'Tasks',
    description: 'Actionable task breakdown from the plan',
    phase: 'planning',
    optional: false,
    requires: ['plan'],
    artifactPattern: `${SDD_ROOT}/specs/{featureId}/tasks.md`,
  },
  {
    id: 'analyze',
    slashCommand: '/speckit.analyze',
    label: 'Analyze',
    description: 'Cross-artifact consistency before implement',
    phase: 'quality',
    optional: true,
    requires: ['tasks'],
  },
  {
    id: 'checklist',
    slashCommand: '/speckit.checklist',
    label: 'Checklist',
    description: 'Quality checklist for requirements completeness',
    phase: 'quality',
    optional: true,
    requires: ['specify'],
    artifactPattern: `${SDD_ROOT}/specs/{featureId}/checklist.md`,
  },
  {
    id: 'implement',
    slashCommand: '/speckit.implement',
    label: 'Implement',
    description: 'Execute tasks per plan (Agent mode)',
    phase: 'execution',
    optional: false,
    requires: ['tasks'],
  },
  {
    id: 'taskstoissues',
    slashCommand: '/speckit.taskstoissues',
    label: 'Tasks → Issues',
    description: 'Convert tasks to GitHub issues for tracking',
    phase: 'execution',
    optional: true,
    requires: ['tasks'],
  },
];

export interface SddFeatureSummary {
  id: string;
  dirName: string;
  hasSpec: boolean;
  hasPlan: boolean;
  hasTasks: boolean;
}

export interface SddStepState {
  id: SddStepId;
  status: SddStepStatus;
  artifactPath?: string;
}

export interface SddWorkflowStatus {
  workspaceRoot: string;
  sddRoot: string;
  initialized: boolean;
  constitutionPath: string;
  constitutionExists: boolean;
  activeFeatureId: string | null;
  features: SddFeatureSummary[];
  steps: SddStepState[];
}

export interface SddInitResult {
  created: string[];
  sddRoot: string;
}

export interface SddCreateFeaturePayload {
  name: string;
  description?: string;
}

export interface SddCreateFeatureResult {
  featureId: string;
  dirPath: string;
  created: string[];
}

function sddPath(root: string, ...parts: string[]): string {
  return path.join(root, SDD_ROOT, ...parts);
}

function fileExists(p: string): boolean {
  try {
    return fs.existsSync(p) && fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function dirExists(p: string): boolean {
  try {
    return fs.existsSync(p) && fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export function slugifyFeatureName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'feature';
}

export function nextFeatureId(root: string, baseName: string): string {
  const specsDir = sddPath(root, 'specs');
  const slug = slugifyFeatureName(baseName);
  if (!dirExists(specsDir)) {
    return `001-${slug}`;
  }
  const existing = fs
    .readdirSync(specsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  let max = 0;
  for (const dir of existing) {
    const m = /^(\d{3})-/.exec(dir);
    if (m) {
      max = Math.max(max, parseInt(m[1], 10));
    }
  }
  const num = String(max + 1).padStart(3, '0');
  return `${num}-${slug}`;
}

export function resolveArtifactPath(
  step: SddWorkflowStep,
  root: string,
  featureId: string | null,
): string | undefined {
  if (!step.artifactPattern) {
    return undefined;
  }
  const rel = step.artifactPattern.replace('{featureId}', featureId ?? '');
  if (rel.includes('{featureId}') && !featureId) {
    return undefined;
  }
  return path.join(root, rel);
}

export function listSddFeatures(root: string): SddFeatureSummary[] {
  const specsDir = sddPath(root, 'specs');
  if (!dirExists(specsDir)) {
    return [];
  }
  return fs
    .readdirSync(specsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const dir = path.join(specsDir, d.name);
      return {
        id: d.name,
        dirName: d.name,
        hasSpec: fileExists(path.join(dir, 'spec.md')),
        hasPlan: fileExists(path.join(dir, 'plan.md')),
        hasTasks: fileExists(path.join(dir, 'tasks.md')),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

function stepDone(step: SddWorkflowStep, root: string, featureId: string | null): boolean {
  const artifact = resolveArtifactPath(step, root, featureId);
  if (artifact) {
    return fileExists(artifact);
  }
  if (step.id === 'analyze') {
    return featureId
      ? fileExists(path.join(sddPath(root, 'specs', featureId), 'tasks.md')) &&
          fileExists(path.join(sddPath(root, 'specs', featureId), 'plan.md'))
      : false;
  }
  if (step.id === 'implement' || step.id === 'taskstoissues') {
    return featureId ? fileExists(path.join(sddPath(root, 'specs', featureId), 'tasks.md')) : false;
  }
  return false;
}

export function getSddWorkflowStatus(
  workspaceRoot?: string,
  activeFeatureId?: string | null,
): SddWorkflowStatus {
  const root = workspaceRoot ?? getWorkspaceRoot();
  const constitutionPath = sddPath(root, 'memory', 'constitution.md');
  const initialized = dirExists(sddPath(root));
  const features = listSddFeatures(root);
  const featureId =
    activeFeatureId && features.some((f) => f.id === activeFeatureId)
      ? activeFeatureId
      : features.length > 0
        ? features[features.length - 1]!.id
        : null;

  const doneMap = new Map<SddStepId, boolean>();
  for (const step of SDD_WORKFLOW_STEPS) {
    doneMap.set(step.id, stepDone(step, root, featureId));
  }

  const steps: SddStepState[] = SDD_WORKFLOW_STEPS.map((step) => {
    const artifactPath = resolveArtifactPath(step, root, featureId);
    const done = doneMap.get(step.id) ?? false;
    const prereqsMet = step.requires.every((r) => doneMap.get(r));
    let status: SddStepStatus;
    if (done) {
      status = 'done';
    } else if (!prereqsMet) {
      status = 'locked';
    } else if (step.optional) {
      status = 'optional';
    } else {
      status = 'ready';
    }
    return { id: step.id, status, ...(artifactPath ? { artifactPath } : {}) };
  });

  return {
    workspaceRoot: root,
    sddRoot: path.join(root, SDD_ROOT),
    initialized,
    constitutionPath,
    constitutionExists: fileExists(constitutionPath),
    activeFeatureId: featureId,
    features,
    steps,
  };
}

export function initSddWorkspace(workspaceRoot?: string): SddInitResult {
  const root = workspaceRoot ?? getWorkspaceRoot();
  const created: string[] = [];

  const dirs = [
    sddPath(root, 'memory'),
    sddPath(root, 'specs'),
    sddPath(root, 'templates'),
    sddPath(root, 'extensions'),
    sddPath(root, 'presets'),
  ];
  for (const d of dirs) {
    if (!dirExists(d)) {
      fs.mkdirSync(d, { recursive: true });
      created.push(path.relative(root, d));
    }
  }

  const constitutionPath = sddPath(root, 'memory', 'constitution.md');
  if (!fileExists(constitutionPath)) {
    fs.writeFileSync(constitutionPath, CONSTITUTION_TEMPLATE, 'utf-8');
    created.push(path.relative(root, constitutionPath));
  }

  const readmePath = sddPath(root, 'README.md');
  if (!fileExists(readmePath)) {
    fs.writeFileSync(
      readmePath,
      `# SDD Workspace (Harness + spec-kit)

This folder mirrors [GitHub spec-kit](https://github.com/github/spec-kit) layout for Spec-Driven Development.

| Path | Purpose |
|------|---------|
| \`memory/constitution.md\` | Governing principles |
| \`specs/<id>/spec.md\` | Feature requirements |
| \`specs/<id>/plan.md\` | Technical plan |
| \`specs/<id>/tasks.md\` | Implementation tasks |

Use the **SDD** view in Harness to run each \`/speckit.*\` step in chat.
`,
      'utf-8',
    );
    created.push(path.relative(root, readmePath));
  }

  return { created, sddRoot: path.join(root, SDD_ROOT) };
}

export function createSddFeature(
  payload: SddCreateFeaturePayload,
  workspaceRoot?: string,
): SddCreateFeatureResult {
  const root = workspaceRoot ?? getWorkspaceRoot();
  initSddWorkspace(root);

  const featureId = nextFeatureId(root, payload.name);
  const featureDir = sddPath(root, 'specs', featureId);
  fs.mkdirSync(featureDir, { recursive: true });

  const created: string[] = [];
  const specPath = path.join(featureDir, 'spec.md');
  const displayName = payload.name.trim() || featureId;
  fs.writeFileSync(
    specPath,
    SPEC_TEMPLATE(displayName, payload.description?.trim() ?? ''),
    'utf-8',
  );
  created.push(path.relative(root, specPath));

  const clarPath = path.join(featureDir, 'clarifications.md');
  fs.writeFileSync(clarPath, CLARIFICATIONS_TEMPLATE, 'utf-8');
  created.push(path.relative(root, clarPath));

  return { featureId, dirPath: featureDir, created };
}

export function writeSddArtifact(
  stepId: SddStepId,
  featureId: string | null,
  workspaceRoot?: string,
): { path: string; created: boolean } {
  const root = workspaceRoot ?? getWorkspaceRoot();
  initSddWorkspace(root);

  const step = SDD_WORKFLOW_STEPS.find((s) => s.id === stepId);
  if (!step) {
    throw new Error(`Unknown SDD step: ${stepId}`);
  }

  if (stepId !== 'constitution' && !featureId) {
    throw new Error('Select or create a feature first');
  }

  const displayName = featureId?.replace(/^\d{3}-/, '').replace(/-/g, ' ') ?? 'Feature';

  let targetPath: string;
  let content: string;

  switch (stepId) {
    case 'constitution':
      targetPath = sddPath(root, 'memory', 'constitution.md');
      content = CONSTITUTION_TEMPLATE;
      break;
    case 'specify':
      targetPath = path.join(sddPath(root, 'specs', featureId!), 'spec.md');
      content = SPEC_TEMPLATE(displayName, '');
      break;
    case 'clarify':
      targetPath = path.join(sddPath(root, 'specs', featureId!), 'clarifications.md');
      content = CLARIFICATIONS_TEMPLATE;
      break;
    case 'plan':
      targetPath = path.join(sddPath(root, 'specs', featureId!), 'plan.md');
      content = PLAN_TEMPLATE(displayName);
      break;
    case 'tasks':
      targetPath = path.join(sddPath(root, 'specs', featureId!), 'tasks.md');
      content = TASKS_TEMPLATE(displayName);
      break;
    case 'checklist':
      targetPath = path.join(sddPath(root, 'specs', featureId!), 'checklist.md');
      content = CHECKLIST_TEMPLATE(displayName);
      break;
    default:
      throw new Error(`Step ${stepId} has no scaffold template`);
  }

  const existed = fileExists(targetPath);
  if (!existed) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, content, 'utf-8');
  }
  return { path: targetPath, created: !existed };
}

export function buildSddStepPrompt(
  stepId: SddStepId,
  featureId: string | null,
  userNotes?: string,
): string {
  const step = SDD_WORKFLOW_STEPS.find((s) => s.id === stepId);
  if (!step) {
    return userNotes ?? '';
  }

  const cmd = step.slashCommand;
  const featureLine = featureId ? `Feature: \`${featureId}\`` : 'Project-wide';
  const notes = userNotes?.trim() ? `\n\nAdditional context:\n${userNotes.trim()}` : '';

  const prompts: Record<SddStepId, string> = {
    constitution: `${cmd} Review and refine \`.harness/sdd/memory/constitution.md\`. Establish code quality, testing, UX, performance, and security principles for this project.${notes}`,
    specify: `${cmd} ${featureLine}. Define functional requirements and user stories in \`.harness/sdd/specs/${featureId}/spec.md\`. Focus on WHAT and WHY — not tech stack.${notes}`,
    clarify: `${cmd} ${featureLine}. Run structured clarification on the spec; record answers in \`clarifications.md\` before planning.${notes}`,
    plan: `${cmd} ${featureLine}. Create \`plan.md\` with tech stack, architecture, and phased implementation. Follow the constitution.${notes}`,
    tasks: `${cmd} ${featureLine}. Generate \`tasks.md\` from plan.md with ordered tasks, [P] parallel markers, and file paths.${notes}`,
    analyze: `${cmd} ${featureLine}. Cross-check spec.md, plan.md, and tasks.md for consistency and gaps before implementation.${notes}`,
    checklist: `${cmd} ${featureLine}. Generate quality checklist validating requirements completeness.${notes}`,
    implement: `${cmd} ${featureLine}. Execute tasks.md in order; respect dependencies and TDD order. Use workspace tools to apply changes.${notes}`,
    taskstoissues: `${cmd} ${featureLine}. Convert tasks.md items into GitHub issues with clear titles and acceptance criteria.${notes}`,
  };

  return prompts[stepId];
}

export function collectSddContextPaths(
  featureId: string | null,
  workspaceRoot?: string,
): string[] {
  const root = workspaceRoot ?? getWorkspaceRoot();
  const paths: string[] = [];
  const constitution = sddPath(root, 'memory', 'constitution.md');
  if (fileExists(constitution)) {
    paths.push(constitution);
  }
  if (featureId) {
    const dir = sddPath(root, 'specs', featureId);
    for (const file of ['spec.md', 'clarifications.md', 'plan.md', 'tasks.md', 'checklist.md']) {
      const p = path.join(dir, file);
      if (fileExists(p)) {
        paths.push(p);
      }
    }
  }
  return paths;
}
