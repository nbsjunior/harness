import * as path from 'path';
import { AIDLC_DOCS_DIR, KIRO_RULE_DETAILS, KIRO_STEERING_RULES } from './constants.js';

export interface AidlcWorkspacePaths {
  workspaceRoot: string;
  kiroDir: string;
  steeringDir: string;
  steeringRulesDir: string;
  ruleDetailsDir: string;
  coreWorkflowFile: string;
  aidlcDocsDir: string;
}

export function getAidlcPaths(workspaceRoot: string): AidlcWorkspacePaths {
  const kiroDir = path.join(workspaceRoot, '.kiro');
  const steeringDir = path.join(kiroDir, 'steering');
  const steeringRulesDir = path.join(steeringDir, KIRO_STEERING_RULES);
  const ruleDetailsDir = path.join(kiroDir, KIRO_RULE_DETAILS);

  return {
    workspaceRoot,
    kiroDir,
    steeringDir,
    steeringRulesDir,
    ruleDetailsDir,
    coreWorkflowFile: path.join(steeringRulesDir, 'core-workflow.md'),
    aidlcDocsDir: path.join(workspaceRoot, AIDLC_DOCS_DIR),
  };
}
