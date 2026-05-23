import { installAidlcRules } from '../aidlc/install.js';
import { getAidlcStatus } from '../aidlc/status.js';

export async function aidlcInstallCommand(
  dir: string = process.cwd(),
  options: { force?: boolean } = {},
): Promise<void> {
  const result = await installAidlcRules(dir, { force: options.force });

  console.log(`AI-DLC rules v${result.version} (${result.source})`);
  for (const line of result.created) {
    console.log(`  created  ${line}`);
  }
  for (const line of result.skipped) {
    console.log(`  skipped  ${line}`);
  }
  console.log('\nVerify in Kiro IDE: Steering panel → core-workflow under Workspace');
  console.log('Verify in Kiro CLI: /context show → .kiro/steering/aws-aidlc-rules');
  console.log('\nStart a session with: Using AI-DLC, <your request>');
  console.log('Artifacts are written to aidlc-docs/');
}

export async function aidlcStatusCommand(dir: string = process.cwd()): Promise<number> {
  const status = getAidlcStatus(dir);

  console.log(`AI-DLC v${status.bundledVersion}`);
  console.log(`  .kiro/steering/aws-aidlc-rules: ${status.coreWorkflowPresent ? 'yes' : 'no'}`);
  console.log(`  .kiro/aws-aidlc-rule-details:   ${status.ruleDetailsPresent ? 'yes' : 'no'}`);
  console.log(`  aidlc-docs/:                     ${status.aidlcDocsPresent ? 'yes' : 'no'}`);
  console.log(`  Installed: ${status.installed ? 'yes' : 'no (run: toddspect aidlc install)'}`);

  return status.installed ? 0 : 1;
}
