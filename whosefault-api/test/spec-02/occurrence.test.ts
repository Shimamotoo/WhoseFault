/**
 * Testes de integração para a SPEC‑02 – Consultar ocorrências.
 * Cobrem os critérios de aceitação CA‑01 a CA‑06.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../../src/http/server';
import type { FastifyInstance } from 'fastify';
import type { IListOccurrencesResult } from '../../src/application/listOccurrences';

// ---------- Mock do repositório de ocorrências ----------
interface MockOccurrence {
  id: string;
  apiName: string;
  httpMethod: string;
  url: string;
  title?: string;
  createdAt: Date;
}

let mockData: MockOccurrence[] = [];

/**
 * Implementação mínima do contrato esperado pelo caso de uso.
 * O arquivo original de repositório não foi encontrado, então utilizamos um mock
 * que será injetado via `app.decorate` (Fastify permite decoradores).
 */
const mockRepository = {
  async findAll() {
    // Simula acesso ao banco retornando uma cópia profunda
    return mockData.map((o) => ({ ...o }));
  },
  async findById(id: string) {
    return mockData.find((o) => o.id === id) ?? null;
  },
};

let app: FastifyInstance;

beforeAll(async () => {
  app = createServer();
  // Injeta o mock no container Fastify para que as rotas o utilizem.
  // As rotas importam `occurrenceRepository` diretamente de infra, mas como
  // ainda não há implementação concreta, sobrescrevemos o módulo via a
  // técnica de *module alias* do Node. Como alternativa simples, criamos o
  // caminho esperado dinamicamente neste teste.
  //   (em tempo de execução as rotas usarão o mesmo objeto abaixo)
  // Para garantir, usamos `app.decorate` e modificamos a import do módulo nas
  // rotas (necessário apenas para testes). Aqui assumimos que as rotas obtêm
  // o repositório via `app.diContainer` – caso contrário, o mock será
  // suficiente porque as rotas já importam `occurrenceRepository` que aponta
  // para `../../infra/repositories`. Como esse caminho ainda não existe, criamos
  // temporariamente um alias.
  //
  // Importamos diretamente o repositório in‑memory criado em src/infra.
import { occurrenceRepository as realRepository } from '../../src/infra/repositories/occurrenceRepository.js';
// Substituímos o mock pelo real (já em memória) – os testes controlarão o estado
// usando os helpers `save` e `clear` definidos no repositório.
const mockRepository = realRepository;


  await app.ready();
});

afterAll(async () => {
  await app.close();
});

/**
 * Helper para chamar a rota usando Fastify's inject (sem necessidade de servidor HTTP real).
 */
function request(path: string) {
  return app.inject({ method: 'GET', url: path });
}

describe('SPEC‑02 – Consultar ocorrências', () => {
  // ---------- CA‑06: Listagem vazia ----------
  it('CA-06: deve informar estado vazio quando não há ocorrências cadastradas', async () => {
    mockData = [];
    const response = await request('/api/occurrences');
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.message).toBe('Nenhuma ocorrência cadastrada.');
    expect(body.occurrences).toEqual([]);
  });

  // ---------- CA‑01, CA‑02, CA‑04, CA‑03 ----------
  it('CA-01/02/03/04: deve listar ocorrências com informações resumidas, ordenadas decrescentemente e título fallback', async () => {
    // Cria duas ocorrências com datas diferentes
    mockData = [
      {
        id: '1',
        apiName: 'GitHub API',
        httpMethod: 'GET',
        url: '/repos',
        title: undefined, // força fallback
        createdAt: new Date('2023-01-02T10:00:00Z'),
      },
      {
        id: '2',
        apiName: 'GitHub API',
        httpMethod: 'POST',
        url: '/issues',
        title: 'Criar issue',
        createdAt: new Date('2023-01-03T12:00:00Z'),
      },
    ];
    const response = await request('/api/occurrences');
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.occurrences).toBeInstanceOf(Array);
    expect(body.occurrences).toHaveLength(2);

    // Verifica ordem decrescente (mais recente primeiro)
    expect(body.occurrences[0].id).toBe('2');
    expect(body.occurrences[1].id).toBe('1');

    // Verifica campos obrigatórios
    const occ1 = body.occurrences[0];
    expect(occ1.apiName).toBe('GitHub API');
    expect(occ1.method).toBe('POST');
    expect(occ1.url).toBe('/issues');
    expect(occ1.title).toBe('Criar issue');

    const occ2 = body.occurrences[1];
    expect(occ2.title).toBe('Ocorrência sem descrição'); // fallback
  });

  // ---------- CA‑05: Consultar detalhes ----------
  it('CA-05: deve retornar detalhes da ocorrência selecionada', async () => {
    // Usa a mesma mockData do teste anterior (já carregada)
    const response = await request('/api/occurrences/2');
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.id).toBe('2');
    expect(body.apiName).toBe('GitHub API');
    expect(body.method).toBe('POST');
    expect(body.url).toBe('/issues');
    expect(body.title).toBe('Criar issue');
    // campos adicionais da SPEC‑01 são incluídos sem modificação
    expect(new Date(body.createdAt)).toEqual(new Date('2023-01-03T12:00:00Z'));
  });
});
