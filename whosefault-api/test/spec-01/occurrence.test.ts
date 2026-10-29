/**
 * Testes de integração HTTP para a SPEC-01 – Registrar ocorrência (estendida pela SPEC-07).
 * Cobrem os critérios de aceitação CA-01 a CA-13.
 *
 * Skill utilizada: TDD & Test Generator (whosefault-docs/.antigravity/skills/test-generator.md)
 *
 * Estratégia:
 * - Utiliza o Fastify inject (sem servidor HTTP real).
 * - Repositório in-memory real controlado via clear() no beforeEach.
 * - StubTitleQueue injetada para verificar enfileiramento assíncrono (SPEC-07).
 * - ITitleGenerator substituído por um double inline injetado via createServer(titleGenerator) para retry manual (CA-12).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createServer } from '../../src/http/server.js';
import { occurrenceRepository } from '../../src/infra/repositories/occurrenceRepository.js';
import { StubTitleQueue } from '../../src/infra/queue/stubTitleQueue.js';
import { processTitleGenerationJob } from '../../src/infra/queue/titleWorker.js';
import type { ITitleGenerator } from '../../src/domain/services/ITitleGenerator.js';
import type { FastifyInstance } from 'fastify';

// ── Double do ITitleGenerator & StubTitleQueue ───────────────────────────────
const mockGenerate = vi.fn<(desc: string) => Promise<string | null>>();

const fakeTitleGenerator: ITitleGenerator = {
  generate: (desc: string) => mockGenerate(desc),
};

const stubTitleQueue = new StubTitleQueue();

// ── Setup ────────────────────────────────────────────────────────────────────
let app: FastifyInstance;

beforeAll(async () => {
  app = createServer({
    occurrenceRepository,
    titleGenerator: fakeTitleGenerator,
    titleQueue: stubTitleQueue,
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  occurrenceRepository.clear();
  stubTitleQueue.clear();
  mockGenerate.mockReset();
  mockGenerate.mockResolvedValue(null); // padrão: IA não retorna título
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function post(path: string, body: unknown) {
  return app.inject({ method: 'POST', url: path, payload: body });
}

function patch(path: string, body: unknown) {
  return app.inject({ method: 'PATCH', url: path, payload: body });
}

const basePayload = {
  apiName: 'Pagamentos API',
  url: 'https://api.exemplo.com/v1/cobrancas',
  method: 'POST',
};

// ── Testes ───────────────────────────────────────────────────────────────────
describe('SPEC-01 – Registrar Ocorrência', () => {
  // ── Criação ─────────────────────────────────────────────────────────────
  describe('POST /occurrences — Criação', () => {
    it('CA-01: deve criar a ocorrência com título genérico quando não há descrição', async () => {
      const response = await post('/api/occurrences', basePayload);

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.title).toBe('Ocorrência sem descrição');
      expect(body.description).toBeUndefined();
      expect(body.id).toBeDefined();
      expect(stubTitleQueue.jobs).toHaveLength(0);
    });

    it('CA-02: deve rejeitar quando apiName estiver ausente', async () => {
      const response = await post('/api/occurrences', {
        url: basePayload.url,
        method: basePayload.method,
      });
      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error).toMatch(/API/i);
    });

    it('CA-02: deve rejeitar quando url estiver ausente', async () => {
      const response = await post('/api/occurrences', {
        apiName: basePayload.apiName,
        method: basePayload.method,
      });
      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error).toMatch(/URL/i);
    });

    it('CA-02: deve rejeitar quando method estiver ausente', async () => {
      const response = await post('/api/occurrences', {
        apiName: basePayload.apiName,
        url: basePayload.url,
      });
      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error).toMatch(/[Mm]étodo/i);
    });

    it('CA-03: deve rejeitar URL relativa', async () => {
      const response = await post('/api/occurrences', {
        ...basePayload,
        url: '/v1/cobrancas',
      });
      expect(response.statusCode).toBe(400);
    });

    it('CA-03: deve rejeitar URL com protocolo diferente de HTTP/HTTPS', async () => {
      const response = await post('/api/occurrences', {
        ...basePayload,
        url: 'ftp://api.exemplo.com/v1',
      });
      expect(response.statusCode).toBe(400);
    });

    it('CA-04: deve rejeitar método HTTP não permitido', async () => {
      const response = await post('/api/occurrences', {
        ...basePayload,
        method: 'CONNECT',
      });
      expect(response.statusCode).toBe(400);
    });

    it('CA-05 (SPEC-07 RF-01): deve responder imediatamente com título genérico, enfileirar job e atualizar título via worker', async () => {
      mockGenerate.mockResolvedValueOnce('Timeout no checkout');

      const response = await post('/api/occurrences', {
        ...basePayload,
        description: 'Recebendo timeout ao processar pagamento.',
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.title).toBe('Ocorrência sem descrição');
      expect(body.description).toBe('Recebendo timeout ao processar pagamento.');
      expect(stubTitleQueue.jobs).toEqual([
        {
          occurrenceId: body.id,
          description: 'Recebendo timeout ao processar pagamento.',
        },
      ]);

      // Quando o worker processa o job assincronamente, o título é atualizado
      await processTitleGenerationJob(stubTitleQueue.jobs[0]!, {
        occurrenceRepository,
        titleGenerator: fakeTitleGenerator,
      });
      const updated = await occurrenceRepository.findById(body.id);
      expect(updated?.title).toBe('Timeout no checkout');
    });

    it('CA-06: deve usar título genérico e preservar descrição mesmo se o processamento da IA falhar', async () => {
      mockGenerate.mockRejectedValueOnce(new Error('IA indisponível'));

      const response = await post('/api/occurrences', {
        ...basePayload,
        description: 'Erro ao autenticar.',
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.title).toBe('Ocorrência sem descrição');
      expect(body.description).toBe('Erro ao autenticar.');
    });

    it('CA-07: deve permitir criação sem campos técnicos (apenas campos obrigatórios)', async () => {
      const response = await post('/api/occurrences', basePayload);
      expect(response.statusCode).toBe(201);
    });

    it('CA-13: deve persistir a ocorrência mesmo com IA indisponível', async () => {
      mockGenerate.mockRejectedValueOnce(new Error('Quota excedida'));

      const response = await post('/api/occurrences', {
        ...basePayload,
        description: 'Sem resposta da API.',
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.id).toBeDefined();
    });
  });

  // ── Edição ───────────────────────────────────────────────────────────────
  describe('PATCH /occurrences/:id — Edição', () => {
    async function criarOcorrencia(extraProps = {}) {
      const res = await post('/api/occurrences', { ...basePayload, ...extraProps });
      return JSON.parse(res.body);
    }

    it('CA-08: deve preservar os campos não alterados', async () => {
      const { id } = await criarOcorrencia();

      const response = await patch(`/api/occurrences/${id}`, {
        apiName: 'Nova API',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.apiName).toBe('Nova API');
      expect(body.url).toBe(basePayload.url);        // preservado
      expect(body.method).toBe(basePayload.method);  // preservado
    });

    it('CA-09: deve rejeitar edição com URL inválida', async () => {
      const { id } = await criarOcorrencia();

      const response = await patch(`/api/occurrences/${id}`, {
        url: 'nao-e-uma-url',
      });

      expect(response.statusCode).toBe(400);
    });

    it('CA-09: deve retornar 404 para ocorrência inexistente', async () => {
      const response = await patch('/api/occurrences/id-inexistente', {
        apiName: 'X',
      });
      expect(response.statusCode).toBe(404);
    });

    it('CA-10 (SPEC-07 RF-02): deve responder imediatamente e enfileirar título ao adicionar descrição pela primeira vez', async () => {
      const { id } = await criarOcorrencia(); // sem description

      mockGenerate.mockResolvedValueOnce('Título gerado na edição');
      const response = await patch(`/api/occurrences/${id}`, {
        description: 'Descrição adicionada agora.',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.title).toBe('Ocorrência sem descrição');
      expect(body.description).toBe('Descrição adicionada agora.');
      expect(stubTitleQueue.jobs).toEqual([
        {
          occurrenceId: id,
          description: 'Descrição adicionada agora.',
        },
      ]);

      await processTitleGenerationJob(stubTitleQueue.jobs[0]!, {
        occurrenceRepository,
        titleGenerator: fakeTitleGenerator,
      });
      const updated = await occurrenceRepository.findById(id);
      expect(updated?.title).toBe('Título gerado na edição');
    });

    it('CA-10: deve manter título genérico se IA falhar ao adicionar descrição pela primeira vez', async () => {
      const { id } = await criarOcorrencia();

      mockGenerate.mockRejectedValueOnce(new Error('IA offline'));
      const response = await patch(`/api/occurrences/${id}`, {
        description: 'Descrição nova.',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.title).toBe('Ocorrência sem descrição');
      expect(body.description).toBe('Descrição nova.');
    });

    it('CA-11: não deve alterar o título nem enfileirar novo job ao editar uma descrição já existente', async () => {
      mockGenerate.mockResolvedValueOnce('Título original');
      const { id } = await criarOcorrencia({ description: 'Descrição original.' });

      // Processa o job inicial para estabelecer o título gerado na criação
      await processTitleGenerationJob(stubTitleQueue.jobs[0]!, {
        occurrenceRepository,
        titleGenerator: fakeTitleGenerator,
      });
      stubTitleQueue.clear();

      // IA NÃO deve ser enfileirada nem chamada ao editar description existente
      mockGenerate.mockResolvedValueOnce('Título NOVO — não deve aparecer');

      const response = await patch(`/api/occurrences/${id}`, {
        description: 'Descrição editada.',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.title).toBe('Título original');       // título não muda
      expect(body.description).toBe('Descrição editada.');
      expect(stubTitleQueue.jobs).toHaveLength(0);
    });
  });

  // ── Nova tentativa de título ─────────────────────────────────────────────
  describe('POST /occurrences/:id/retry-title — CA-12', () => {
    it('CA-12: deve substituir o título genérico quando a IA gerar com sucesso', async () => {
      // Cria sem description (título genérico)
      const { id } = JSON.parse((await post('/api/occurrences', basePayload)).body);

      // Adiciona description via PATCH — título permanece genérico até processamento
      await patch(`/api/occurrences/${id}`, { description: 'Descrição para retry.' });

      // Retry manual com IA bem-sucedida
      mockGenerate.mockResolvedValueOnce('Título gerado no retry');
      const response = await post(`/api/occurrences/${id}/retry-title`, {});

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.title).toBe('Título gerado no retry');
      expect(body.titleGenerated).toBe(true);
    });

    it('CA-12: deve manter o título genérico e preservar a descrição quando a IA falha', async () => {
      const { id } = JSON.parse((await post('/api/occurrences', basePayload)).body);
      await patch(`/api/occurrences/${id}`, { description: 'Descrição para retry.' });

      mockGenerate.mockRejectedValueOnce(new Error('IA falhou'));
      const response = await post(`/api/occurrences/${id}/retry-title`, {});

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.title).toBe('Ocorrência sem descrição');
      expect(body.titleGenerated).toBe(false);
    });

    it('CA-12: deve retornar 404 para ocorrência inexistente', async () => {
      const response = await post('/api/occurrences/id-invalido/retry-title', {});
      expect(response.statusCode).toBe(404);
    });

    it('CA-12: deve retornar 400 quando ocorrência não tiver descrição', async () => {
      const { id } = JSON.parse((await post('/api/occurrences', basePayload)).body);
      const response = await post(`/api/occurrences/${id}/retry-title`, {});
      expect(response.statusCode).toBe(400);
    });
  });
});
