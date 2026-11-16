import { ResourceTemplate, type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import {
  WhoseFaultApiError,
  formatMcpErrorMessage,
  type WhoseFaultClient,
} from './client.js';

function toResourceMcpError(err: unknown): McpError {
  const code =
    err instanceof WhoseFaultApiError && (err.status === 401 || err.status === 404)
      ? ErrorCode.InvalidParams
      : ErrorCode.InternalError;

  return new McpError(code, formatMcpErrorMessage(err));
}

/**
 * Registra os 2 resources JSON do WhoseFault no servidor MCP (SPEC-09 RF-08).
 */
export function registerResources(server: McpServer, client: WhoseFaultClient): void {
  server.registerResource(
    'occurrences',
    'whosefault://occurrences',
    {
      title: 'Ocorrências do WhoseFault',
      description:
        'Lista em JSON das ocorrências de falha de API pertencentes ao usuário autenticado.',
      mimeType: 'application/json',
    },
    async (uri) => {
      try {
        const occurrences = await client.listOccurrences();
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(occurrences, null, 2),
            },
          ],
        };
      } catch (err) {
        throw toResourceMcpError(err);
      }
    },
  );

  server.registerResource(
    'occurrence-details',
    new ResourceTemplate('whosefault://occurrences/{id}', { list: undefined }),
    {
      title: 'Detalhes da ocorrência',
      description:
        'JSON consolidado com ocorrência, evidências e último diagnóstico (ou null) pelo ID.',
      mimeType: 'application/json',
    },
    async (uri, variables) => {
      const rawId = variables.id;
      const id = (Array.isArray(rawId) ? rawId[0] : rawId)?.trim();
      if (!id) {
        throw new McpError(ErrorCode.InvalidParams, 'Parâmetro {id} da ocorrência é obrigatório.');
      }

      try {
        const details = await client.getOccurrenceDetails(id);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(details, null, 2),
            },
          ],
        };
      } catch (err) {
        throw toResourceMcpError(err);
      }
    },
  );
}
