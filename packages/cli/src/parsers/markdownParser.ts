import * as fs from 'fs';
import * as path from 'path';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkFrontmatter from 'remark-frontmatter';
import yaml from 'js-yaml';
import type { Root, Heading, Paragraph, Code, YAML as YAMLNode } from 'mdast';

export interface MarkdownSection {
  title: string;
  depth: number;
  content: string;
  codeBlocks: Array<{ lang: string | null; value: string }>;
}

export interface ParsedMarkdown {
  frontmatter: Record<string, unknown>;
  title: string;
  sections: MarkdownSection[];
  rawContent: string;
}

const processor = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ['yaml']);

/**
 * Parse a Markdown file and extract frontmatter, sections, and code blocks.
 * Used for Spec-Driven Development specs written as Markdown documents.
 */
export function parseMarkdownFile(filePath: string): ParsedMarkdown {
  const content = fs.readFileSync(filePath, 'utf-8');
  return parseMarkdownContent(content, filePath);
}

export function parseMarkdownContent(content: string, sourcePath?: string): ParsedMarkdown {
  const tree = processor.parse(content) as Root;

  // Extract YAML frontmatter
  const frontmatter: Record<string, unknown> = {};
  const yamlNode = tree.children.find((n): n is YAMLNode => n.type === 'yaml');
  if (yamlNode) {
    const parsed = yaml.load(yamlNode.value);
    if (parsed && typeof parsed === 'object') {
      Object.assign(frontmatter, parsed as Record<string, unknown>);
    }
  }

  const sections: MarkdownSection[] = [];
  let currentSection: MarkdownSection | null = null;
  let documentTitle = '';

  for (const node of tree.children) {
    if (node.type === 'heading') {
      const headingNode = node as Heading;
      const titleText = headingNode.children
        .map((child) => ('value' in child ? child.value : ''))
        .join('');

      if (headingNode.depth === 1 && !documentTitle) {
        documentTitle = titleText;
      }

      if (currentSection) {
        sections.push(currentSection);
      }

      currentSection = {
        title: titleText,
        depth: headingNode.depth,
        content: '',
        codeBlocks: [],
      };
    } else if (currentSection) {
      if (node.type === 'paragraph') {
        const paragraphNode = node as Paragraph;
        const text = paragraphNode.children
          .map((child) => ('value' in child ? child.value : ''))
          .join('');
        currentSection.content += (currentSection.content ? '\n' : '') + text;
      } else if (node.type === 'code') {
        const codeNode = node as Code;
        currentSection.codeBlocks.push({
          lang: codeNode.lang ?? null,
          value: codeNode.value,
        });
      }
    }
  }

  if (currentSection) {
    sections.push(currentSection);
  }

  return {
    frontmatter,
    title: documentTitle || (sourcePath ? path.basename(sourcePath, path.extname(sourcePath)) : ''),
    sections,
    rawContent: content,
  };
}

/**
 * Scan a directory for Markdown files and return parsed results.
 */
export function scanMarkdownDirectory(
  dirPath: string,
  maxDepth = 3,
  currentDepth = 0,
): ParsedMarkdown[] {
  if (currentDepth >= maxDepth || !fs.existsSync(dirPath)) {
    return [];
  }

  const results: ParsedMarkdown[] = [];

  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') {
      continue;
    }

    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      results.push(...scanMarkdownDirectory(fullPath, maxDepth, currentDepth + 1));
    } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.mdx'))) {
      try {
        results.push(parseMarkdownFile(fullPath));
      } catch {
        // Skip unreadable files
      }
    }
  }

  return results;
}
