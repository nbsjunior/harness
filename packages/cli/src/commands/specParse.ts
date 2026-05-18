import * as path from 'path';
import { parseSpecDirectory, parseSpecFile, specToYaml } from '../parsers/specParser.js';
import { parseMarkdownFile } from '../parsers/markdownParser.js';
import type { SpecDefinition } from '../parsers/specParser.js';

interface SpecParseOptions {
  output?: 'json' | 'yaml' | 'table';
  validate?: boolean;
}

/**
 * Parse one or more Spec-Driven Development spec files (YAML or Markdown)
 * and output a structured summary to stdout.
 */
export async function specParseCommand(
  fileOrDir: string,
  options: SpecParseOptions = {},
): Promise<void> {
  const resolved = path.resolve(fileOrDir);
  const outputFormat = options.output ?? 'table';

  let specs: SpecDefinition[] = [];
  const errors: Array<{ filePath: string; message: string }> = [];

  const ext = path.extname(resolved).toLowerCase();

  if (ext === '.md' || ext === '.mdx') {
    // Parse Markdown file and attempt to extract spec from frontmatter
    const parsed = parseMarkdownFile(resolved);
    if (parsed.frontmatter['kind']) {
      try {
        const spec = parseSpecFile(resolved.replace(/\.mdx?$/, '.yaml'));
        specs.push(spec);
      } catch {
        // Try to build a partial spec from Markdown frontmatter
        const frontmatter = parsed.frontmatter as Partial<SpecDefinition>;
        if (frontmatter.kind && frontmatter.name) {
          specs.push({
            kind: frontmatter.kind,
            name: String(frontmatter.name),
            description: parsed.title || String(frontmatter.description ?? ''),
            tools: Array.isArray(frontmatter.tools) ? frontmatter.tools : [],
            filePath: resolved,
          });
        }
      }

      if (specs.length === 0) {
        console.log(`Markdown document: ${parsed.title}`);
        console.log(`Sections: ${parsed.sections.map((s) => s.title).join(', ')}`);
        return;
      }
    } else {
      // Plain Markdown — print section summary
      console.log(`Document: ${parsed.title}`);
      console.log(`Sections (${parsed.sections.length}):`);
      for (const section of parsed.sections) {
        console.log(`  ${'  '.repeat(section.depth - 1)}${section.title}`);
      }
      if (parsed.sections.some((s) => s.codeBlocks.length > 0)) {
        const totalBlocks = parsed.sections.reduce((n, s) => n + s.codeBlocks.length, 0);
        console.log(`Code blocks: ${totalBlocks}`);
      }
      return;
    }
  } else {
    const result = parseSpecDirectory(resolved);
    specs = result.specs;
    errors.push(...result.errors);
  }

  if (errors.length > 0) {
    console.error(`\nParse errors (${errors.length}):`);
    for (const err of errors) {
      console.error(`  ✗ ${path.basename(err.filePath)}: ${err.message}`);
    }
  }

  if (specs.length === 0) {
    console.log('No valid specs found.');
    return;
  }

  switch (outputFormat) {
    case 'json':
      console.log(JSON.stringify(specs, null, 2));
      break;

    case 'yaml':
      for (const spec of specs) {
        console.log(`# ${spec.filePath ? path.basename(spec.filePath) : spec.name}`);
        console.log(specToYaml(spec));
        console.log('---');
      }
      break;

    case 'table':
    default:
      console.log(`\nFound ${specs.length} spec(s):\n`);
      console.log(
        'Kind'.padEnd(12) +
          'Name'.padEnd(30) +
          'Tools'.padEnd(8) +
          'Agent',
      );
      console.log('─'.repeat(60));

      for (const spec of specs) {
        console.log(
          spec.kind.padEnd(12) +
            spec.name.slice(0, 28).padEnd(30) +
            String(spec.tools?.length ?? 0).padEnd(8) +
            (spec.agents?.preferred ?? '—'),
        );
      }
      break;
  }
}
