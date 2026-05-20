/**
 * Community connector plugin registry (`.harness/plugins.json`).
 * MVP: load manifest; dynamic connector loading is reserved for future marketplace builds.
 */
import * as fs from 'fs';
import * as path from 'path';
import { getWorkspaceRoot } from '../config.js';
import type { AgentId } from '../types.js';

export interface HarnessPluginManifest {
  id: string;
  label: string;
  description?: string;
  /** npm package or relative path under workspace */
  module?: string;
  /** maps to AgentId when routing */
  agentId?: AgentId;
  version?: string;
  enabled?: boolean;
}

export interface HarnessPluginRegistry {
  version: number;
  plugins: HarnessPluginManifest[];
}

export function pluginsManifestPath(workspaceRoot?: string): string {
  return path.join(workspaceRoot ?? getWorkspaceRoot(), '.harness', 'plugins.json');
}

export function loadPluginRegistry(workspaceRoot?: string): HarnessPluginRegistry {
  const filePath = pluginsManifestPath(workspaceRoot);
  if (!fs.existsSync(filePath)) {
    return { version: 1, plugins: [] };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as HarnessPluginRegistry;
    return {
      version: raw.version ?? 1,
      plugins: Array.isArray(raw.plugins) ? raw.plugins.filter((p) => p?.id) : [],
    };
  } catch {
    return { version: 1, plugins: [] };
  }
}

export function listEnabledPlugins(workspaceRoot?: string): HarnessPluginManifest[] {
  return loadPluginRegistry(workspaceRoot).plugins.filter((p) => p.enabled !== false);
}

/** Placeholder — marketplace connectors will register here in a future release. */
export function resolvePluginConnector(_pluginId: string): null {
  return null;
}
