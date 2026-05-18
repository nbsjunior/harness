import * as fs from 'fs';
import { getAidlcPaths, type AidlcWorkspacePaths } from './paths.js';
import { AIDLC_RULES_VERSION } from './constants.js';

export interface AidlcInstallStatus {
  installed: boolean;
  paths: AidlcWorkspacePaths;
  coreWorkflowPresent: boolean;
  ruleDetailsPresent: boolean;
  aidlcDocsPresent: boolean;
  bundledVersion: string;
}

export function getAidlcStatus(workspaceRoot: string): AidlcInstallStatus {
  const paths = getAidlcPaths(workspaceRoot);
  const coreWorkflowPresent = fs.existsSync(paths.coreWorkflowFile);
  const ruleDetailsPresent = fs.existsSync(paths.ruleDetailsDir);
  const aidlcDocsPresent = fs.existsSync(paths.aidlcDocsDir);

  return {
    installed: coreWorkflowPresent && ruleDetailsPresent,
    paths,
    coreWorkflowPresent,
    ruleDetailsPresent,
    aidlcDocsPresent,
    bundledVersion: AIDLC_RULES_VERSION,
  };
}
