/**
 * Community connector plugin registry (`.toddspect/plugins.json`).
 * MVP: load manifest; dynamic connector loading is reserved for future marketplace builds.
 */
import * as fs from 'fs';
import * as path from 'path';
import { getWorkspaceRoot } from '../config.js';
import type { AgentId } from '../types.js';

export interface ToddSpectPluginManifest {
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

export interface ToddSpectPluginRegistry {
  version: number;
  plugins: ToddSpectPluginManifest[];
}

export function pluginsManifestPath(workspaceRoot?: string): string {
  return path.join(workspaceRoot ?? getWorkspaceRoot(), '.toddspect', 'plugins.json');
}

export function loadPluginRegistry(workspaceRoot?: string): ToddSpectPluginRegistry {
  const filePath = pluginsManifestPath(workspaceRoot);
  if (!fs.existsSync(filePath)) {
    return { version: 1, plugins: [] };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as ToddSpectPluginRegistry;
    return {
      version: raw.version ?? 1,
      plugins: Array.isArray(raw.plugins) ? raw.plugins.filter((p) => p?.id) : [],
    };
  } catch {
    return { version: 1, plugins: [] };
  }
}

export function listEnabledPlugins(workspaceRoot?: string): ToddSpectPluginManifest[] {
  return loadPluginRegistry(workspaceRoot).plugins.filter((p) => p.enabled !== false);
}

/** Placeholder — marketplace connectors will register here in a future release. */
export function resolvePluginConnector(_pluginId: string): null {
  return null;
}
