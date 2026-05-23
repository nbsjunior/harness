import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const AgentIdSchema = z.enum(['copilot', 'devin', 'cursor', 'claude', 'kiro']);

const SpecToolSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
  parameters: z.record(z.unknown()).optional(),
});

const SpecDefinitionSchema = z.object({
  kind: z.enum(['Skill', 'Tool', 'Workflow']),
  name: z.string().min(1),
  description: z.string().default(''),
  tools: z.array(SpecToolSchema).optional(),
  agents: z
    .object({
      preferred: AgentIdSchema,
      fallback: AgentIdSchema.optional(),
    })
    .optional(),
});

export type SpecDefinition = z.infer<typeof SpecDefinitionSchema> & { filePath?: string };

// ---------------------------------------------------------------------------
// Markdown frontmatter extractor
// ---------------------------------------------------------------------------

/**
 * Extract the YAML frontmatter block from a Markdown file.
 * Returns `null` if no frontmatter (`---` delimiters) is found.
 *
 * Supports both:
 *   ---\n key: val \n---    (YAML)
 *   ---\n key: val \n---    (YAML in .md)
 */
function extractFrontmatter(content: string): Record<string, unknown> | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match?.[1]) {
    return null;
  }
  try {
    const parsed = yaml.load(match[1]);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // malformed YAML frontmatter
  }
  return null;
}

/**
 * Extract the first H1 heading from Markdown content.
 */
function extractMarkdownTitle(content: string): string | null {
  const match = content.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() ?? null;
}

/**
 * Extract the first paragraph of body text from Markdown (after frontmatter and H1).
 */
function extractMarkdownDescription(content: string): string {
  // Remove frontmatter
  const withoutFrontmatter = content.replace(/^---[\s\S]*?---\r?\n/, '');
  // Remove headings
  const withoutHeadings = withoutFrontmatter.replace(/^#+\s+.+$/gm, '').trim();
  // Take first non-empty paragraph
  const firstParagraph = withoutHeadings.split(/\n{2,}/)[0]?.trim() ?? '';
  return firstParagraph.replace(/\n/g, ' ');
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse a single spec file.
 *
 * Supported formats:
 *  1. `.yaml` / `.yml`  — pure YAML matching the SpecDefinition schema
 *  2. `.md` / `.mdx`    — Markdown with YAML frontmatter (primary SDD format)
 *
 * The Markdown format allows rich documentation alongside machine-readable specs:
 *
 * ```markdown
 * ---
 * kind: Skill
 * name: code-review
 * agents:
 *   preferred: copilot
 * ---
 * # Code Review
 *
 * Performs a thorough code review…
 *
 * ## Tools
 * - `read_file` — reads a source file
 * ```
 */
export function parseSpecFile(filePath: string): SpecDefinition {
  const content = fs.readFileSync(filePath, 'utf-8');
  const ext = path.extname(filePath).toLowerCase();

  let raw: unknown;

  if (ext === '.md' || ext === '.mdx') {
    const frontmatter = extractFrontmatter(content);

    if (!frontmatter) {
      throw new Error(
        `Markdown spec "${filePath}" has no YAML frontmatter. ` +
          'Add a --- frontmatter block with at least `kind` and `name`.',
      );
    }

    // Supplement frontmatter with Markdown-derived fields if not already set
    if (!frontmatter['description']) {
      const mdDesc = extractMarkdownDescription(content);
      if (mdDesc) {
        frontmatter['description'] = mdDesc;
      }
    }

    if (!frontmatter['name']) {
      const mdTitle = extractMarkdownTitle(content);
      if (mdTitle) {
        frontmatter['name'] = mdTitle;
      }
    }

    raw = frontmatter;
  } else {
    // YAML file
    raw = yaml.load(content);
  }

  const result = SpecDefinitionSchema.safeParse(raw);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid spec "${filePath}": ${issues}`);
  }

  return { ...result.data, filePath };
}

/**
 * Scan a path (file or directory) and return all parsed spec definitions.
 *
 * Recognized extensions: `.yaml`, `.yml`, `.md`, `.mdx`
 * Non-spec Markdown files (no frontmatter with `kind`) are silently skipped.
 */
export function parseSpecDirectory(dirOrFile: string): {
  specs: SpecDefinition[];
  errors: Array<{ filePath: string; message: string }>;
} {
  const specs: SpecDefinition[] = [];
  const errors: Array<{ filePath: string; message: string }> = [];

  if (!fs.existsSync(dirOrFile)) {
    return { specs, errors };
  }

  const stat = fs.statSync(dirOrFile);

  if (stat.isFile()) {
    try {
      specs.push(parseSpecFile(dirOrFile));
    } catch (err) {
      errors.push({ filePath: dirOrFile, message: (err as Error).message });
    }
    return { specs, errors };
  }

  // Directory scan — Markdown takes priority (primary SDD format), then YAML
  const files = fs
    .readdirSync(dirOrFile)
    .map((f) => path.join(dirOrFile, f))
    .filter((f) => {
      const ext = path.extname(f).toLowerCase();
      return ext === '.md' || ext === '.mdx' || ext === '.yaml' || ext === '.yml';
    })
    .sort(); // stable order

  for (const filePath of files) {
    try {
      const spec = parseSpecFile(filePath);
      specs.push(spec);
    } catch (err) {
      const msg = (err as Error).message;
      // Silently skip Markdown files without frontmatter (they may be plain docs)
      if (msg.includes('no YAML frontmatter')) {
        process.stderr.write(`[toddspect-cli] Skipping non-spec markdown: ${path.basename(filePath)}\n`);
        continue;
      }
      errors.push({ filePath, message: msg });
    }
  }

  return { specs, errors };
}

/**
 * Serialize a SpecDefinition back to a YAML string suitable for `.yaml` files.
 */
export function specToYaml(spec: SpecDefinition): string {
  const { filePath: _ignored, ...rest } = spec;
  return yaml.dump(rest, { indent: 2, lineWidth: 100 });
}

/**
 * Serialize a SpecDefinition to a Markdown file with YAML frontmatter
 * (the primary SDD authoring format).
 */
export function specToMarkdown(spec: SpecDefinition): string {
  const frontmatterObj: Record<string, unknown> = {
    kind: spec.kind,
    name: spec.name,
  };

  if (spec.agents) {
    frontmatterObj['agents'] = spec.agents;
  }

  if (spec.tools && spec.tools.length > 0) {
    frontmatterObj['tools'] = spec.tools;
  }

  const frontmatter = yaml.dump(frontmatterObj, { indent: 2 }).trimEnd();

  const toolsSection =
    spec.tools && spec.tools.length > 0
      ? `\n## Tools\n\n${spec.tools.map((t) => `- \`${t.name}\` — ${t.description}`).join('\n')}\n`
      : '';

  const agentSection = spec.agents
    ? `\n## Agent Routing\n\n- **Preferred:** ${spec.agents.preferred}${spec.agents.fallback ? `\n- **Fallback:** ${spec.agents.fallback}` : ''}\n`
    : '';

  return `---\n${frontmatter}\n---\n\n# ${spec.name}\n\n${spec.description || '_No description provided._'}\n${toolsSection}${agentSection}`;
}
