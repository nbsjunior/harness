#!/usr/bin/env node
/** Finish CLI rebrand Harness → ToddSpect */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const cliRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'cli', 'src');

const REPLACEMENTS = [
  ['loadHarnessConfig', 'loadToddSpectConfig'],
  ['LoadedHarnessConfig', 'LoadedToddSpectConfig'],
  ['HarnessPromptSettings', 'ToddSpectPromptSettings'],
  ['HarnessSettingsBridge', 'ToddSpectSettingsBridge'],
  ['HarnessConfigFile', 'ToddSpectConfigFile'],
  ['HarnessPluginManifest', 'ToddSpectPluginManifest'],
  ['HarnessPluginRegistry', 'ToddSpectPluginRegistry'],
  ['extractHarnessContextBlocks', 'extractToddSpectContextBlocks'],
  ['sessionByHarnessId', 'sessionByToddSpectId'],
  ['hasHarnessDir', 'hasToddSpectDir'],
  ['HARNESS_DIR', 'TODDSPECT_DIR'],
  ['HARNESS_IPC', 'TODDSPECT_IPC'],
  ['HARNESS_SETTINGS_JSON', 'TODDSPECT_SETTINGS_JSON'],
  ['HARNESS_WORKSPACE', 'TODDSPECT_WORKSPACE'],
  ['harnessLog', 'toddspectLog'],
  ['harnessWarn', 'toddspectWarn'],
  ['[harness-cli]', '[toddspect-cli]'],
  ['[harness]', '[toddspect]'],
  ['[harness web]', '[toddspect web]'],
  ['**[Harness fan-out]**', '**[ToddSpect fan-out]**'],
  ['**[Harness of AI]**', '**[ToddSpect]**'],
  ['**[Harness]**', '**[ToddSpect]**'],
  ['Harness Spec', 'ToddSpect Spec'],
  ['Harness specs', 'ToddSpect specs'],
  ['Harness workspace', 'ToddSpect workspace'],
  ['Harness configuration', 'ToddSpect configuration'],
  ['Harness settings', 'ToddSpect settings'],
  ['Harness →', 'ToddSpect →'],
  ['Harness SDD', 'ToddSpect SDD'],
  ['Harness view', 'ToddSpect view'],
  ['Harness + spec-kit', 'ToddSpect + spec-kit'],
  ['Harness agent', 'ToddSpect agent'],
  ['ci-harness-agent', 'ci-toddspect-agent'],
  ['workflow-ci-harness', 'workflow-ci-toddspect'],
  ['assisting through Harness', 'assisting through ToddSpect'],
  ['Active Harness Spec', 'Active ToddSpect Spec'],
  ['.harness/', '.toddspect/'],
  ['`.harness', '`.toddspect'],
  ["'.harness", "'.toddspect"],
  ['.harness', '.toddspect'],
  ['harness.', 'toddspect.'],
  ['`harness ', '`toddspect '],
  [' harness ', ' toddspect '],
  ['.name(\'harness\'', ".name('toddspect'"],
  ['Harness', 'ToddSpect'],
  ['harness', 'toddspect'],
];

function walk(d, out = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

let n = 0;
for (const f of walk(cliRoot)) {
  let s = fs.readFileSync(f, 'utf8');
  const b = s;
  for (const [a, b2] of REPLACEMENTS) s = s.split(a).join(b2);
  s = s.replaceAll('.toddspectt', '.toddspect');
  if (s !== b) {
    fs.writeFileSync(f, s);
    n++;
  }
}
console.log(`[cli-rebrand] ${n} CLI files updated`);
