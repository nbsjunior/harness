import * as vscode from 'vscode';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Tool, Resource } from '@modelcontextprotocol/sdk/types.js';

interface McpServerConfig {
  name: string;
  transport: 'stdio' | 'http';
  command?: string;
  args?: string[];
  url?: string;
}

interface ConnectedServer {
  config: McpServerConfig;
  client: Client;
  tools: Tool[];
  resources: Resource[];
}

/**
 * Manages connections to one or more MCP (Model Context Protocol) servers.
 * Supports both stdio (local subprocess) and Streamable HTTP transports.
 * Handles reconnection with exponential backoff.
 */
export class McpClientManager {
  private servers = new Map<string, ConnectedServer>();
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly output: vscode.LogOutputChannel,
  ) {}

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Connect to all MCP servers defined in the workspace configuration.
   */
  async connectFromConfig(): Promise<void> {
    const config = vscode.workspace.getConfiguration('harness');
    const serversConfig = config.get<McpServerConfig[]>('mcp.servers', []);
    const enabled = config.get<boolean>('mcp.enabled', true);

    if (!enabled || serversConfig.length === 0) {
      return;
    }

    await Promise.allSettled(
      serversConfig.map((serverConfig) => this.connect(serverConfig)),
    );
  }

  /**
   * Connect to a single MCP server.
   */
  async connect(config: McpServerConfig): Promise<void> {
    if (this.servers.has(config.name)) {
      this.output.warn(`MCP server "${config.name}" is already connected. Disconnecting first.`);
      await this.disconnect(config.name);
    }

    this.output.info(`Connecting to MCP server: ${config.name} (${config.transport})`);

    const client = new Client(
      { name: 'harness', version: '0.1.0' },
      { capabilities: { tools: {}, resources: {}, prompts: {} } },
    );

    const transport = this.buildTransport(config);

    try {
      await client.connect(transport);

      const [toolsPage, resourcesPage] = await Promise.all([
        this.paginateList((cursor) => client.listTools({ cursor }), 'tools'),
        this.paginateList((cursor) => client.listResources({ cursor }), 'resources'),
      ]);

      this.servers.set(config.name, {
        config,
        client,
        tools: toolsPage as Tool[],
        resources: resourcesPage as Resource[],
      });

      this.output.info(
        `MCP server "${config.name}" connected: ` +
          `${toolsPage.length} tools, ${resourcesPage.length} resources.`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.output.error(`Failed to connect to MCP server "${config.name}": ${msg}`);
      this.scheduleReconnect(config);
      throw err;
    }
  }

  async disconnect(serverName: string): Promise<void> {
    const server = this.servers.get(serverName);
    if (!server) {
      return;
    }

    clearTimeout(this.reconnectTimers.get(serverName));
    this.reconnectTimers.delete(serverName);

    try {
      await server.client.close();
    } catch {
      // Ignore close errors
    }

    this.servers.delete(serverName);
    this.output.info(`MCP server "${serverName}" disconnected.`);
  }

  /**
   * List all tools across all connected MCP servers.
   */
  listAllTools(): Array<Tool & { serverName: string }> {
    const result: Array<Tool & { serverName: string }> = [];
    for (const [name, server] of this.servers) {
      for (const tool of server.tools) {
        result.push({ ...tool, serverName: name });
      }
    }
    return result;
  }

  /**
   * Call a tool by name on the appropriate MCP server.
   * Throws if the tool is not found on any connected server.
   */
  async callTool(
    toolName: string,
    args: Record<string, unknown>,
    serverName?: string,
  ): Promise<unknown> {
    const server = serverName
      ? this.servers.get(serverName)
      : this.findServerForTool(toolName);

    if (!server) {
      throw new Error(
        `MCP tool "${toolName}" not found on ${serverName ? `server "${serverName}"` : 'any connected server'}.`,
      );
    }

    this.output.info(`Calling MCP tool: ${toolName} on server "${server.config.name}"`);

    const result = await server.client.callTool({ name: toolName, arguments: args });

    if (result.isError) {
      throw new Error(`MCP tool "${toolName}" returned an error: ${JSON.stringify(result.content)}`);
    }

    return result.content;
  }

  /**
   * List all resources across all connected MCP servers.
   */
  listAllResources(): Array<Resource & { serverName: string }> {
    const result: Array<Resource & { serverName: string }> = [];
    for (const [name, server] of this.servers) {
      for (const resource of server.resources) {
        result.push({ ...resource, serverName: name });
      }
    }
    return result;
  }

  /**
   * Read a resource by URI from the appropriate MCP server.
   */
  async readResource(uri: string, serverName?: string): Promise<unknown> {
    const server = serverName
      ? this.servers.get(serverName)
      : this.findServerForResource(uri);

    if (!server) {
      throw new Error(`MCP resource "${uri}" not found on any connected server.`);
    }

    const result = await server.client.readResource({ uri });
    return result.contents;
  }

  getConnectedServerNames(): string[] {
    return Array.from(this.servers.keys());
  }

  dispose(): void {
    for (const timer of this.reconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.reconnectTimers.clear();

    for (const [name, server] of this.servers) {
      server.client.close().catch(() => {
        this.output.warn(`Error closing MCP server "${name}"`);
      });
    }
    this.servers.clear();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private buildTransport(
    config: McpServerConfig,
  ): StdioClientTransport | StreamableHTTPClientTransport {
    if (config.transport === 'stdio') {
      if (!config.command) {
        throw new Error(`MCP server "${config.name}": stdio transport requires a "command".`);
      }
      return new StdioClientTransport({
        command: config.command,
        args: config.args ?? [],
        env: process.env as Record<string, string>,
      });
    }

    if (config.transport === 'http') {
      if (!config.url) {
        throw new Error(`MCP server "${config.name}": http transport requires a "url".`);
      }
      return new StreamableHTTPClientTransport(new URL(config.url));
    }

    throw new Error(`MCP server "${config.name}": unknown transport "${config.transport}".`);
  }

  private async paginateList<T>(
    fetcher: (cursor?: string) => Promise<{ nextCursor?: string } & Record<string, T[]>>,
    key: string,
  ): Promise<T[]> {
    const all: T[] = [];
    let cursor: string | undefined;

    do {
      const page = await fetcher(cursor);
      const items = (page as Record<string, T[]>)[key] ?? [];
      all.push(...items);
      cursor = page.nextCursor;
    } while (cursor);

    return all;
  }

  private findServerForTool(toolName: string): ConnectedServer | undefined {
    for (const server of this.servers.values()) {
      if (server.tools.some((t) => t.name === toolName)) {
        return server;
      }
    }
    return undefined;
  }

  private findServerForResource(uri: string): ConnectedServer | undefined {
    for (const server of this.servers.values()) {
      if (server.resources.some((r) => r.uri === uri)) {
        return server;
      }
    }
    return undefined;
  }

  private scheduleReconnect(config: McpServerConfig, attempt = 1): void {
    const maxAttempts = 5;
    if (attempt > maxAttempts) {
      this.output.error(
        `MCP server "${config.name}" failed to reconnect after ${maxAttempts} attempts.`,
      );
      return;
    }

    const delayMs = Math.min(1000 * 2 ** attempt, 30_000);
    this.output.info(
      `Reconnecting to MCP server "${config.name}" in ${delayMs}ms (attempt ${attempt}/${maxAttempts})...`,
    );

    const timer = setTimeout(() => {
      this.reconnectTimers.delete(config.name);
      this.connect(config).catch(() => {
        this.scheduleReconnect(config, attempt + 1);
      });
    }, delayMs);

    this.reconnectTimers.set(config.name, timer);
  }
}
