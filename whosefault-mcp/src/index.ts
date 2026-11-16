#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { WhoseFaultClient } from './client.js';
import { loadConfigOrExit } from './config.js';
import { createWhoseFaultMcpServer } from './server.js';

async function main(): Promise<void> {
  const config = loadConfigOrExit();
  const client = new WhoseFaultClient({
    apiUrl: config.apiUrl,
    apiToken: config.apiToken,
  });

  const server = createWhoseFaultMcpServer(client);
  const transport = new StdioServerTransport();

  await server.connect(transport);
  console.error('[whosefault-mcp] Servidor MCP conectado via stdio.');
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : 'Erro fatal desconhecido.';
  console.error(`[whosefault-mcp] Falha ao iniciar servidor MCP: ${message}`);
  process.exit(1);
});
