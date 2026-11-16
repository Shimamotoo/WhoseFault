import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  formatMcpErrorMessage,
  type TextEvidenceType,
  type WhoseFaultClient,
} from './client.js';

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;
const TEXT_EVIDENCE_TYPES = ['HTTP_REQUEST', 'HTTP_RESPONSE', 'ERROR_LOG', 'MANUAL_NOTE'] as const;

function isHttpOrHttpsUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

const httpMethodSchema = z.enum(HTTP_METHODS);

const addEvidenceInputShape = {
  occurrenceId: z.string().trim().min(1, 'occurrenceId é obrigatório.'),
  type: z.enum(TEXT_EVIDENCE_TYPES),
  method: httpMethodSchema.optional(),
  url: z.string().trim().optional(),
  statusCode: z.number().int().min(100).max(599).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  payload: z.string().optional(),
  body: z.string().optional(),
  content: z.string().optional(),
  context: z.string().optional(),
  notes: z.string().optional(),
};

export const addEvidenceContextualSchema = z
  .object(addEvidenceInputShape)
  .superRefine((data, ctx) => {
    const type: TextEvidenceType = data.type;

    if (type === 'HTTP_REQUEST') {
      if (!data.method) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['method'],
          message: 'Campo "method" é obrigatório para evidências do tipo HTTP_REQUEST.',
        });
      }
      if (!data.url || data.url.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['url'],
          message: 'Campo "url" é obrigatório para evidências do tipo HTTP_REQUEST.',
        });
      } else if (!isHttpOrHttpsUrl(data.url.trim())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['url'],
          message: 'Campo "url" deve ser uma URL válida com protocolo http:// ou https://.',
        });
      }
    }

    if (type === 'HTTP_RESPONSE') {
      if (data.statusCode === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['statusCode'],
          message:
            'Campo "statusCode" (inteiro entre 100 e 599) é obrigatório para evidências do tipo HTTP_RESPONSE.',
        });
      }
    }

    if (type === 'ERROR_LOG' || type === 'MANUAL_NOTE') {
      if (!data.content || data.content.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['content'],
          message: `Campo "content" é obrigatório para evidências do tipo ${type}.`,
        });
      }
    }
  });

function toJsonTextResult(data: unknown): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function toErrorResult(message: string): CallToolResult {
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: message,
      },
    ],
  };
}

async function runWithErrorHandling(fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (err) {
    return toErrorResult(formatMcpErrorMessage(err));
  }
}

/**
 * Registra as 6 tools centrais do WhoseFault no servidor MCP (SPEC-09 RF-01 a RF-07).
 */
export function registerTools(server: McpServer, client: WhoseFaultClient): void {
  server.registerTool(
    'list_occurrences',
    {
      title: 'Listar ocorrências',
      description:
        'Lista as ocorrências de falha de API pertencentes ao usuário autenticado, ordenadas da mais recente para a mais antiga.',
      inputSchema: {},
    },
    async () =>
      runWithErrorHandling(async () => {
        const occurrences = await client.listOccurrences();
        return toJsonTextResult(occurrences);
      }),
  );

  server.registerTool(
    'get_occurrence_details',
    {
      title: 'Obter detalhes da ocorrência',
      description:
        'Obtém os detalhes completos de uma ocorrência, incluindo suas evidências registradas e o último diagnóstico gerado pela IA (quando existir).',
      inputSchema: {
        occurrenceId: z.string().trim().min(1, 'occurrenceId é obrigatório.'),
      },
    },
    async ({ occurrenceId }) =>
      runWithErrorHandling(async () => {
        const details = await client.getOccurrenceDetails(occurrenceId);
        return toJsonTextResult(details);
      }),
  );

  server.registerTool(
    'create_occurrence',
    {
      title: 'Criar ocorrência',
      description:
        'Registra uma nova ocorrência de erro ou comportamento inesperado de integração com API.',
      inputSchema: {
        apiName: z.string().trim().min(1, 'apiName é obrigatório.'),
        method: httpMethodSchema,
        url: z
          .string()
          .trim()
          .url('URL inválida.')
          .refine(isHttpOrHttpsUrl, 'URL deve utilizar o protocolo http:// ou https://.'),
        description: z.string().optional(),
      },
    },
    async ({ apiName, method, url, description }) =>
      runWithErrorHandling(async () => {
        const created = await client.createOccurrence({
          apiName,
          method,
          url,
          description,
        });
        return toJsonTextResult(created);
      }),
  );

  server.registerTool(
    'add_evidence',
    {
      title: 'Adicionar evidência textual',
      description:
        'Adiciona uma evidência técnica textual (HTTP_REQUEST, HTTP_RESPONSE, ERROR_LOG ou MANUAL_NOTE) a uma ocorrência existente. Nunca envie credenciais, tokens JWT, chaves de API ou senhas reais; mascare valores sensíveis antes de enviar.',
      inputSchema: addEvidenceInputShape,
    },
    async (args) => {
      const validation = addEvidenceContextualSchema.safeParse(args);
      if (!validation.success) {
        const issues = validation.error.issues
          .map((issue) => issue.message)
          .join(' ');
        return toErrorResult(
          `Dados inválidos para evidência do tipo ${args.type}: ${issues}`,
        );
      }

      const valid = validation.data;
      return runWithErrorHandling(async () => {
        const created = await client.addEvidence(valid.occurrenceId, {
          type: valid.type,
          method: valid.method,
          url: valid.url,
          statusCode: valid.statusCode,
          headers: valid.headers,
          payload: valid.payload,
          body: valid.body,
          content: valid.content,
          context: valid.context,
          notes: valid.notes,
        });
        return toJsonTextResult(created);
      });
    },
  );

  server.registerTool(
    'generate_diagnosis',
    {
      title: 'Gerar diagnóstico de IA',
      description:
        'Solicita à IA do WhoseFault a geração (ou atualização) de um diagnóstico estruturado para a ocorrência com base nas suas evidências cadastradas.',
      inputSchema: {
        occurrenceId: z.string().trim().min(1, 'occurrenceId é obrigatório.'),
      },
    },
    async ({ occurrenceId }) =>
      runWithErrorHandling(async () => {
        const diagnosis = await client.generateDiagnosis(occurrenceId);
        return toJsonTextResult(diagnosis);
      }),
  );

  server.registerTool(
    'get_evidence_image',
    {
      title: 'Obter imagem de evidência',
      description:
        'Obtém o conteúdo visual de uma evidência do tipo IMAGE associada a uma ocorrência para análise multimodal pelo assistente.',
      inputSchema: {
        occurrenceId: z.string().trim().min(1, 'occurrenceId é obrigatório.'),
        evidenceId: z.string().trim().min(1, 'evidenceId é obrigatório.'),
      },
    },
    async ({ occurrenceId, evidenceId }) =>
      runWithErrorHandling(async () => {
        const image = await client.getEvidenceImage(occurrenceId, evidenceId);
        return {
          content: [
            {
              type: 'image',
              data: image.data,
              mimeType: image.mimeType,
            },
          ],
        };
      }),
  );
}
