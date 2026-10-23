/**
 * Testes de integração para a SPEC-02 – Consultar ocorrências.
 * Cobrem os critérios de aceitação CA-01 a CA-06.
 *
 * Estratégia: utiliza o repositório in-memory real (singleton) controlado via
 * save() / clear(), garantindo que os dados inseridos nos testes chegam às rotas.
 */

import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { createServer } from '../../src/http/server.js';
import { occurrenceRepository } from '../../src/infra/repositories/occurrenceRepository.js';
import { Occurrence } from '../../src/domain/occurrence.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

beforeAll(async () => {
  app = createServer({
    occurrenceRepository,
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  occurrenceRepository.clear();
});

/** Helper para realizar requisições GET via Fastify inject */
function get(path: string) {
  return app.inject({ method: 'GET', url: path });
}

describe('SPEC-02 – Consultar ocorrências', () => {
  // ---------- CA-06: Listagem vazia ----------
  it('CA-06: deve informar estado vazio quando não há ocorrências cadastradas', async () => {
    const response = await get('/api/occurrences');

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.message).toBe('Nenhuma ocorrência cadastrada.');
    expect(body.occurrences).toEqual([]);
  });

  // ---------- CA-01: Exibir ocorrências registradas ----------
  it('CA-01: deve apresentar as ocorrências com as informações resumidas', async () => {
    await occurrenceRepository.save(
      Occurrence.create({
        id: 'occ-1',
        apiName: 'GitHub API',
        method: 'GET',
        url: 'https://api.github.com/repos',
        createdAt: new Date('2023-01-01T10:00:00Z'),
      }),
    );

    const response = await get('/api/occurrences');

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.occurrences).toHaveLength(1);
    expect(body.occurrences[0].apiName).toBe('GitHub API');
    expect(body.occurrences[0].method).toBe('GET');
    expect(body.occurrences[0].url).toBe('https://api.github.com/repos');
  });

  // ---------- CA-02: Ordenação decrescente ----------
  it('CA-02: deve ordenar da ocorrência mais recente para a mais antiga', async () => {
    await occurrenceRepository.save(
      Occurrence.create({
        id: 'occ-antiga',
        apiName: 'API A',
        method: 'GET',
        url: 'https://api.exemplo.com/antiga',
        createdAt: new Date('2023-01-01T08:00:00Z'),
      }),
    );
    await occurrenceRepository.save(
      Occurrence.create({
        id: 'occ-recente',
        apiName: 'API B',
        method: 'POST',
        url: 'https://api.exemplo.com/recente',
        createdAt: new Date('2023-01-03T12:00:00Z'),
      }),
    );

    const response = await get('/api/occurrences');
    const body = JSON.parse(response.body);

    expect(body.occurrences[0].id).toBe('occ-recente');
    expect(body.occurrences[1].id).toBe('occ-antiga');
  });

  // ---------- CA-03: Posição estável após edição ----------
  it('CA-03: deve preservar a posição da ocorrência determinada pela data de criação', async () => {
    await occurrenceRepository.save(
      Occurrence.create({
        id: 'occ-1',
        apiName: 'API A',
        method: 'GET',
        url: 'https://api.exemplo.com/a',
        createdAt: new Date('2023-01-01T08:00:00Z'),
      }),
    );
    await occurrenceRepository.save(
      Occurrence.create({
        id: 'occ-2',
        apiName: 'API B',
        method: 'POST',
        url: 'https://api.exemplo.com/b',
        createdAt: new Date('2023-01-03T12:00:00Z'),
      }),
    );

    // Simula edição de occ-1 (apenas atualiza o objeto, createdAt não muda)
    await occurrenceRepository.update(
      Occurrence.create({
        id: 'occ-1',
        apiName: 'API A — Editada',
        method: 'GET',
        url: 'https://api.exemplo.com/a',
        createdAt: new Date('2023-01-01T08:00:00Z'),
        updatedAt: new Date('2023-01-05T10:00:00Z'),
      }),
    );

    const response = await get('/api/occurrences');
    const body = JSON.parse(response.body);

    // occ-2 deve continuar primeiro (mais recente por createdAt)
    expect(body.occurrences[0].id).toBe('occ-2');
    expect(body.occurrences[1].id).toBe('occ-1');
  });

  // ---------- CA-04: Exibir título atual (ou genérico) ----------
  it('CA-04: deve exibir o título armazenado, usando o genérico quando não há título gerado', async () => {
    await occurrenceRepository.save(
      Occurrence.create({
        id: 'occ-com-titulo',
        apiName: 'API A',
        method: 'GET',
        url: 'https://api.exemplo.com/a',
        title: 'Erro de autenticação',
        createdAt: new Date('2023-01-03T12:00:00Z'),
      }),
    );
    await occurrenceRepository.save(
      Occurrence.create({
        id: 'occ-sem-titulo',
        apiName: 'API B',
        method: 'POST',
        url: 'https://api.exemplo.com/b',
        // sem title → fallback
        createdAt: new Date('2023-01-01T10:00:00Z'),
      }),
    );

    const response = await get('/api/occurrences');
    const body = JSON.parse(response.body);

    const comTitulo = body.occurrences.find((o: { id: string }) => o.id === 'occ-com-titulo');
    const semTitulo = body.occurrences.find((o: { id: string }) => o.id === 'occ-sem-titulo');

    expect(comTitulo.title).toBe('Erro de autenticação');
    expect(semTitulo.title).toBe('Ocorrência sem descrição');
  });

  // ---------- CA-05: Acessar detalhes ----------
  it('CA-05: deve retornar os detalhes completos da ocorrência selecionada', async () => {
    await occurrenceRepository.save(
      Occurrence.create({
        id: 'occ-detalhe',
        apiName: 'Stripe API',
        method: 'POST',
        url: 'https://api.stripe.com/v1/charges',
        title: 'Falha no pagamento',
        createdAt: new Date('2023-06-15T14:00:00Z'),
      }),
    );

    const response = await get('/api/occurrences/occ-detalhe');

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.id).toBe('occ-detalhe');
    expect(body.apiName).toBe('Stripe API');
    expect(body.method).toBe('POST');
    expect(body.url).toBe('https://api.stripe.com/v1/charges');
    expect(body.title).toBe('Falha no pagamento');
    expect(new Date(body.createdAt)).toEqual(new Date('2023-06-15T14:00:00Z'));
  });

  // ---------- CA-05: Detalhe de ocorrência inexistente ----------
  it('CA-05: deve retornar 404 quando a ocorrência não existir', async () => {
    const response = await get('/api/occurrences/id-inexistente');
    expect(response.statusCode).toBe(404);
  });
});
