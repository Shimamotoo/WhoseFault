import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WhoseFaultClient } from './client.js';
import { registerPrompts } from './prompts.js';
import { registerResources } from './resources.js';
import { registerTools } from './tools.js';

/**
 * Cria e configura a instância do McpServer com todas as tools, resources e prompts da SPEC-09.
 */
export function createWhoseFaultMcpServer(client: WhoseFaultClient): McpServer {
  const server = new McpServer({
    name: 'whosefault-mcp',
    version: '1.0.0',
  });

  registerTools(server, client);
  registerResources(server, client);
  registerPrompts(server);

  return server;
}
