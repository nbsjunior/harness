import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Tool, Resource, Prompt } from '@modelcontextprotocol/sdk/types.js';

export type McpTransportType = 'stdio' | 'http';

export interface McpServerConfig {
  name: string;
  transport: McpTransportType;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
}

export interface McpToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface McpToolResult {
  content: unknown;
  isError: boolean;
}

/**
 * Thin wrapper around the MCP SDK Client for use in the CLI process.
 * Handles connection setup, tool listing/calling, and resource reading.
 */
export class McpConnection {
  private client: Client;
  private connected = false;
  private cachedTools: Tool[] = [];
  private cachedResources: Resource[] = [];
  private cachedPrompts: Prompt[] = [];

  constructor(private readonly config: McpServerConfig) {
    this.client = new Client(
      { name: 'toddspect-cli', version: '0.1.0' },
      { capabilities: { tools: {}, resources: {}, prompts: {} } },
    );
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    const transport = this.buildTransport();
    await this.client.connect(transport);

    // Pre-fetch available tools, resources and prompts
    const [tools, resources, prompts] = await Promise.all([
      this.paginate((cursor) => this.client.listTools({ cursor }), 'tools'),
      this.paginate((cursor) => this.client.listResources({ cursor }), 'resources'),
      this.paginate((cursor) => this.client.listPrompts({ cursor }), 'prompts'),
    ]);

    this.cachedTools = tools as Tool[];
    this.cachedResources = resources as Resource[];
    this.cachedPrompts = prompts as Prompt[];
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }
    try {
      await this.client.close();
    } finally {
      this.connected = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Tools
  // ---------------------------------------------------------------------------

  getTools(): Tool[] {
    return this.cachedTools;
  }

  async callTool(call: McpToolCall): Promise<McpToolResult> {
    this.assertConnected();

    const result = await this.client.callTool({
      name: call.name,
      arguments: call.arguments,
    });

    return {
      content: result.content,
      isError: result.isError ?? false,
    };
  }

  // ---------------------------------------------------------------------------
  // Resources
  // ---------------------------------------------------------------------------

  getResources(): Resource[] {
    return this.cachedResources;
  }

  async readResource(uri: string): Promise<unknown> {
    this.assertConnected();
    const result = await this.client.readResource({ uri });
    return result.contents;
  }

  // ---------------------------------------------------------------------------
  // Prompts
  // ---------------------------------------------------------------------------

  getPrompts(): Prompt[] {
    return this.cachedPrompts;
  }

  async getPrompt(name: string, args: Record<string, string> = {}): Promise<unknown> {
    this.assertConnected();
    const result = await this.client.getPrompt({ name, arguments: args });
    return result.messages;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private buildTransport(): StdioClientTransport | StreamableHTTPClientTransport {
    if (this.config.transport === 'stdio') {
      if (!this.config.command) {
        throw new Error(
          `McpConnection "${this.config.name}": stdio transport requires a command.`,
        );
      }
      return new StdioClientTransport({
        command: this.config.command,
        args: this.config.args ?? [],
        env: {
          ...process.env,
          ...(this.config.env ?? {}),
        } as Record<string, string>,
      });
    }

    if (this.config.transport === 'http') {
      if (!this.config.url) {
        throw new Error(
          `McpConnection "${this.config.name}": http transport requires a url.`,
        );
      }
      return new StreamableHTTPClientTransport(new URL(this.config.url));
    }

    throw new Error(
      `McpConnection "${this.config.name}": unknown transport "${this.config.transport}".`,
    );
  }

  private async paginate<T>(
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

  private assertConnected(): void {
    if (!this.connected) {
      throw new Error(
        `McpConnection "${this.config.name}" is not connected. Call connect() first.`,
      );
    }
  }
}
