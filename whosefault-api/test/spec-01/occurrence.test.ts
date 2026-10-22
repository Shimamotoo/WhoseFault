/**
 * Testes de integração HTTP para a SPEC-01 – Registrar ocorrência.
 * Cobrem os critérios de aceitação CA-01 a CA-13.
 *
 * Skill utilizada: TDD & Test Generator (whosefault-docs/.antigravity/skills/test-generator.md)
 *
 * Estratégia:
 * - Utiliza o Fastify inject (sem servidor HTTP real).
 * - Repositório in-memory real controlado via clear() no beforeEach.
 * - ITitleGenerator substituído por um double inline injetado via createServer(titleGenerator).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createServer } from '../../src/http/server.js';
import { occurrenceRepository } from '../../src/infra/repositories/occurrenceRepository.js';
import type { ITitleGenerator } from '../../src/domain/services/ITitleGenerator.js';
import type { FastifyInstance } from 'fastify';

// ── Double do ITitleGenerator ────────────────────────────────────────────────
const mockGenerate = vi.fn<[string], Promise<string | null>>();

const fakeTitleGenerator: ITitleGenerator = {
  generate: (desc: string) => mockGenerate(desc),
};

// ── Setup ────────────────────────────────────────────────────────────────────
let app: FastifyInstance;

beforeAll(async () => {
  app = createServer(fakeTitleGenerator);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  occurrenceRepository.clear();
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

    it('CA-05: deve salvar o título gerado pela IA quando disponível', async () => {
      mockGenerate.mockResolvedValueOnce('Timeout no checkout');

      const response = await post('/api/occurrences', {
        ...basePayload,
        description: 'Recebendo timeout ao processar pagamento.',
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.title).toBe('Timeout no checkout');
      expect(body.description).toBe('Recebendo timeout ao processar pagamento.');
    });

    it('CA-06: deve usar título genérico e preservar descrição quando a IA falha', async () => {
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

    it('CA-10: deve gerar título ao adicionar descrição pela primeira vez', async () => {
      const { id } = await criarOcorrencia(); // sem description — mockGenerate retorna null

      mockGenerate.mockResolvedValueOnce('Título gerado na edição');
      const response = await patch(`/api/occurrences/${id}`, {
        description: 'Descrição adicionada agora.',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.title).toBe('Título gerado na edição');
      expect(body.description).toBe('Descrição adicionada agora.');
    });

    it('CA-10: deve usar título genérico se IA falhar ao adicionar descrição pela primeira vez', async () => {
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

    it('CA-11: não deve alterar o título ao editar uma descrição já existente', async () => {
      // IA gera título na criação
      mockGenerate.mockResolvedValueOnce('Título original');
      const { id } = await criarOcorrencia({ description: 'Descrição original.' });

      // IA NÃO deve ser chamada ao editar description existente
      mockGenerate.mockResolvedValueOnce('Título NOVO — não deve aparecer');

      const response = await patch(`/api/occurrences/${id}`, {
        description: 'Descrição editada.',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.title).toBe('Título original');       // título não muda
      expect(body.description).toBe('Descrição editada.');
    });
  });

  // ── Nova tentativa de título ─────────────────────────────────────────────
  describe('POST /occurrences/:id/retry-title — CA-12', () => {
    it('CA-12: deve substituir o título genérico quando a IA gerar com sucesso', async () => {
      // Cria sem description (título genérico, IA retorna null)
      const { id } = JSON.parse((await post('/api/occurrences', basePayload)).body);

      // Adiciona description via PATCH — IA retorna null, título permanece genérico
      await patch(`/api/occurrences/${id}`, { description: 'Descrição para retry.' });

      // Retry com IA bem-sucedida
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
