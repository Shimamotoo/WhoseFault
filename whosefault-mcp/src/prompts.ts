import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/**
 * Registra o prompt de investigação de ocorrência no servidor MCP (SPEC-09 RF-09).
 */
export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'investigate_occurrence',
    {
      title: 'Investigar ocorrência',
      description:
        'Roteiro estruturado para investigar uma ocorrência do WhoseFault e cruzar evidências com o código-fonte do workspace.',
      argsSchema: {
        occurrenceId: z.string().trim().min(1, 'occurrenceId é obrigatório.'),
      },
    },
    ({ occurrenceId }) => ({
      description: `Roteiro de investigação da ocorrência ${occurrenceId} no WhoseFault.`,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              `Investigue a ocorrência "${occurrenceId}" registrada no WhoseFault seguindo estas etapas:`,
              '',
              `1. Leia os detalhes completos da ocorrência "${occurrenceId}" utilizando a tool \`get_occurrence_details\` (ou o resource \`whosefault://occurrences/${occurrenceId}\`). Caso haja evidências do tipo IMAGE, utilize \`get_evidence_image\` para inspecioná-las visualmente.`,
              '2. Analise o diagnóstico retornado (`facts_observed`, `hypotheses` e `missing_information`). Se `diagnosis` for `null` ou estiver marcado como `isOutdated: true`, solicite um diagnóstico atualizado via tool `generate_diagnosis`.',
              '3. Cruze os dados da requisição, resposta, cabeçalhos e logs da ocorrência com o código-fonte do workspace atual para identificar a causa provável da falha e propor as correções necessárias.',
            ].join('\n'),
          },
        },
      ],
    }),
  );
}
