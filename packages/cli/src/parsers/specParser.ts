import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Zod schemas for validation
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
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse a single YAML spec file and return a validated SpecDefinition.
 * Throws if the file is invalid or fails schema validation.
 */
export function parseSpecFile(filePath: string): SpecDefinition {
  const content = fs.readFileSync(filePath, 'utf-8');
  const raw = yaml.load(content);
  const result = SpecDefinitionSchema.safeParse(raw);

  if (!result.success) {
    throw new Error(
      `Invalid spec file "${filePath}": ${result.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }

  return { ...result.data, filePath };
}

/**
 * Scan a directory (or a single file) and return all parsed spec definitions.
 * Non-YAML files and files that fail validation are skipped (errors are collected).
 */
export function parseSpecDirectory(dirOrFile: string): {
  specs: SpecDefinition[];
  errors: Array<{ filePath: string; message: string }>;
} {
  const specs: SpecDefinition[] = [];
  const errors: Array<{ filePath: string; message: string }> = [];

  const stat = fs.statSync(dirOrFile);

  if (stat.isFile()) {
    try {
      specs.push(parseSpecFile(dirOrFile));
    } catch (err) {
      errors.push({
        filePath: dirOrFile,
        message: err instanceof Error ? err.message : String(err),
      });
    }
    return { specs, errors };
  }

  const files = fs
    .readdirSync(dirOrFile)
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
    .map((f) => path.join(dirOrFile, f));

  for (const filePath of files) {
    try {
      specs.push(parseSpecFile(filePath));
    } catch (err) {
      errors.push({
        filePath,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { specs, errors };
}

/**
 * Serialize a SpecDefinition back to a YAML string.
 */
export function specToYaml(spec: SpecDefinition): string {
  const { filePath: _ignored, ...rest } = spec;
  return yaml.dump(rest, { indent: 2, lineWidth: 100 });
}
