import * as fs from 'fs';
import * as path from 'path';
import { discoverSpecsFromRepo } from '../specs/discover.js';

export async function specDiscoverCommand(options: {
  json?: boolean;
  write?: boolean;
}): Promise<number> {
  const result = discoverSpecsFromRepo();

  if (options.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return 0;
  }

  if (result.suggestions.length === 0) {
    process.stderr.write('[toddspect] No spec suggestions for this repository layout.\n');
    return 0;
  }

  for (const s of result.suggestions) {
    process.stderr.write(`\n• ${s.title} (${s.kind})\n  ${s.reason}\n  → ${s.suggestedFile}\n`);
    if (options.write) {
      const abs = path.join(result.workspaceRoot, s.suggestedFile);
      if (!fs.existsSync(abs)) {
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, s.template, 'utf-8');
        process.stderr.write('  (written)\n');
      } else {
        process.stderr.write('  (skipped — file exists)\n');
      }
    }
  }

  if (!options.write) {
    process.stderr.write('\nRun with --write to create suggested spec files.\n');
  }

  return 0;
}
