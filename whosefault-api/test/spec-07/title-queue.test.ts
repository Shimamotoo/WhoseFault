/**
 * Testes unitários e de integração in-memory para a SPEC-07 —
 * Processamento Assíncrono de Títulos com Mensageria.
 *
 * Cobrem:
 * - CA-01: Criação não bloqueante (<150ms) com título genérico e enfileiramento de job.
 * - CA-02: Não enfileiramento quando não há descrição (criação e edição).
 * - CA-03: Atualização assíncrona com sucesso no repositório pelo worker.
 * - CA-04: Resiliência em caso de falha da IA (3 tentativas, backoff exponencial e retry manual funcional).
 * - CA-05: Execução 100% isolada e offline sem dependência de containers Redis.
 * - RNF-01: Isolamento arquitetural e configuração de opções do BullMQ.
 */

import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { RedisConnection, type Queue } from 'bullmq';
import { createServer } from '../../src/http/server.js';
import { InMemoryOccurrenceRepository } from '../../src/infra/repositories/occurrenceRepository.js';
import { StubTitleQueue } from '../../src/infra/queue/stubTitleQueue.js';
import {
  BullMQTitleQueue,
  DEFAULT_TITLE_JOB_OPTIONS,
  TITLE_JOB_NAME,
} from '../../src/infra/queue/bullmqTitleQueue.js';
import {
  DEFAULT_TITLE_WORKER_CONCURRENCY,
  processTitleGenerationJob,
} from '../../src/infra/queue/titleWorker.js';
import {
  ensureIORedisClientFactory,
  resolveRedisConnection,
} from '../../src/infra/queue/redisConnection.js';
import type { ITitleGenerator } from '../../src/domain/services/ITitleGenerator.js';
import type { TitleGenerationJobData } from '../../src/domain/services/ITitleQueue.js';

describe('SPEC-07 — Processamento Assíncrono de Títulos com Mensageria', () => {
  let occurrenceRepo: InMemoryOccurrenceRepository;
  let stubQueue: StubTitleQueue;
  let mockGenerate: ReturnType<typeof vi.fn<(desc: string) => Promise<string | null>>>;
  let fakeTitleGenerator: ITitleGenerator;
  let app: FastifyInstance;

  const basePayload = {
    apiName: 'Stripe Billing API',
    url: 'https://api.stripe.com/v1/invoices',
    method: 'POST',
  };

  beforeAll(async () => {
    occurrenceRepo = new InMemoryOccurrenceRepository();
    stubQueue = new StubTitleQueue();
    mockGenerate = vi.fn<(desc: string) => Promise<string | null>>();
    fakeTitleGenerator = {
      generate: (desc: string) => mockGenerate(desc),
    };

    app = createServer({
      occurrenceRepository: occurrenceRepo,
      titleQueue: stubQueue,
      titleGenerator: fakeTitleGenerator,
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    occurrenceRepo.clear();
    stubQueue.clear();
    mockGenerate.mockReset();
  });

  // ── CA-01: Criação Não Bloqueante com Descrição ──────────────────────────
  it('CA-01: deve responder 201 Created em menos de 150ms com título padrão e registrar job na fila', async () => {
    // Mesmo que a IA demorasse 4 segundos, a criação não a invoca sincronamente
    mockGenerate.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve('Título lento'), 4000)),
    );

    const start = performance.now();
    const response = await app.inject({
      method: 'POST',
      url: '/api/occurrences',
      payload: {
        ...basePayload,
        description: 'Erro 502 Bad Gateway ao emitir fatura recorrente.',
      },
    });
    const elapsedMs = performance.now() - start;

    expect(response.statusCode).toBe(201);
    expect(elapsedMs).toBeLessThan(150);

    const body = JSON.parse(response.body);
    expect(body.title).toBe('Ocorrência sem descrição');
    expect(mockGenerate).not.toHaveBeenCalled();

    expect(stubQueue.jobs).toHaveLength(1);
    expect(stubQueue.jobs[0]).toEqual({
      occurrenceId: body.id,
      description: 'Erro 502 Bad Gateway ao emitir fatura recorrente.',
    });
  });

  // ── CA-02: Não Enfileirar sem Descrição ──────────────────────────────────
  it('CA-02: não deve despachar job para a fila quando ocorrência for criada sem descrição', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/occurrences',
      payload: basePayload,
    });

    expect(response.statusCode).toBe(201);
    expect(stubQueue.jobs).toHaveLength(0);
  });

  it('RF-02: deve enfileirar job na primeira inclusão de descrição via PATCH e não re-enfileirar em edições subsequentes', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/occurrences',
      payload: basePayload,
    });
    const { id } = JSON.parse(createRes.body);
    expect(stubQueue.jobs).toHaveLength(0);

    // Primeira inclusão de descrição → enfileira
    const patchRes1 = await app.inject({
      method: 'PATCH',
      url: `/api/occurrences/${id}`,
      payload: { description: 'Timeout após 30s no webhook.' },
    });
    expect(patchRes1.statusCode).toBe(200);
    expect(JSON.parse(patchRes1.body).title).toBe('Ocorrência sem descrição');
    expect(stubQueue.jobs).toHaveLength(1);
    expect(stubQueue.jobs[0]).toEqual({
      occurrenceId: id,
      description: 'Timeout após 30s no webhook.',
    });

    // Segunda edição de descrição → não enfileira novamente
    const patchRes2 = await app.inject({
      method: 'PATCH',
      url: `/api/occurrences/${id}`,
      payload: { description: 'Timeout após 60s no webhook atualizado.' },
    });
    expect(patchRes2.statusCode).toBe(200);
    expect(stubQueue.jobs).toHaveLength(1);
  });

  // ── CA-03: Atualização Assíncrona com Sucesso ────────────────────────────
  it('CA-03: deve atualizar o título e updatedAt no repositório quando o worker processar o job com sucesso', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/occurrences',
      payload: {
        ...basePayload,
        description: 'Falha de assinatura HMAC na entrega do webhook.',
      },
    });
    const created = JSON.parse(createRes.body);
    const beforeOccurrence = await occurrenceRepo.findById(created.id);
    expect(beforeOccurrence?.title).toBe('Ocorrência sem descrição');

    mockGenerate.mockResolvedValueOnce('Falha de assinatura HMAC no webhook');

    await processTitleGenerationJob(stubQueue.jobs[0]!, {
      occurrenceRepository: occurrenceRepo,
      titleGenerator: fakeTitleGenerator,
    });

    const afterOccurrence = await occurrenceRepo.findById(created.id);
    expect(afterOccurrence?.title).toBe('Falha de assinatura HMAC no webhook');
    expect(afterOccurrence!.updatedAt.getTime()).toBeGreaterThan(
      beforeOccurrence!.updatedAt.getTime(),
    );

    // GET /occurrences/:id reflete o novo título (suporte ao polling RF-06)
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/occurrences/${created.id}`,
    });
    expect(getRes.statusCode).toBe(200);
    expect(JSON.parse(getRes.body).title).toBe('Falha de assinatura HMAC no webhook');
  });

  it('RF-03: deve manter Ocorrência sem descrição se a IA retornar vazio ou se a ocorrência já tiver sido removida', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/occurrences',
      payload: {
        ...basePayload,
        description: 'Resposta vazia da API externa.',
      },
    });
    const created = JSON.parse(createRes.body);

    mockGenerate.mockResolvedValueOnce('   ');
    await processTitleGenerationJob(stubQueue.jobs[0]!, {
      occurrenceRepository: occurrenceRepo,
      titleGenerator: fakeTitleGenerator,
    });

    const unchanged = await occurrenceRepo.findById(created.id);
    expect(unchanged?.title).toBe('Ocorrência sem descrição');

    // Ocorrência inexistente não lança erro
    await expect(
      processTitleGenerationJob(
        { occurrenceId: 'id-inexistente', description: 'Teste' },
        { occurrenceRepository: occurrenceRepo, titleGenerator: fakeTitleGenerator },
      ),
    ).resolves.toBeUndefined();
  });

  // ── CA-04: Resiliência em Caso de Falha da IA ────────────────────────────
  it('CA-04: após esgotar 3 tentativas com falha da IA, mantém título genérico e preserva ação manual POST /occurrences/:id/retry-title', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/occurrences',
      payload: {
        ...basePayload,
        description: 'Erro 503 Service Unavailable na API de pagamentos.',
      },
    });
    const created = JSON.parse(createRes.body);
    const job = stubQueue.jobs[0]!;

    // Simula as 3 tentativas configuradas no BullMQ falhando consecutivamente
    mockGenerate
      .mockRejectedValueOnce(new Error('429 Rate Limit - Tentativa 1'))
      .mockRejectedValueOnce(new Error('503 Unavailable - Tentativa 2'))
      .mockRejectedValueOnce(new Error('503 Unavailable - Tentativa 3'));

    for (let attempt = 1; attempt <= 3; attempt++) {
      await expect(
        processTitleGenerationJob(job, {
          occurrenceRepository: occurrenceRepo,
          titleGenerator: fakeTitleGenerator,
        }),
      ).rejects.toThrow();
    }

    expect(mockGenerate).toHaveBeenCalledTimes(3);

    // Ocorrência permanece intacta com título genérico
    const storedAfterFailures = await occurrenceRepo.findById(created.id);
    expect(storedAfterFailures?.title).toBe('Ocorrência sem descrição');

    // Ação manual de retry continua funcional quando a IA volta a operar
    mockGenerate.mockResolvedValueOnce('Indisponibilidade 503 na API de pagamentos');
    const retryRes = await app.inject({
      method: 'POST',
      url: `/api/occurrences/${created.id}/retry-title`,
      payload: {},
    });

    expect(retryRes.statusCode).toBe(200);
    const retryBody = JSON.parse(retryRes.body);
    expect(retryBody.titleGenerated).toBe(true);
    expect(retryBody.title).toBe('Indisponibilidade 503 na API de pagamentos');
  });

  // ── RF-04, RF-05 e RNF-01: Configuração do BullMQ & Redis ────────────────
  it('RF-04 / RF-05 / CA-05: BullMQTitleQueue configura attempts=3 e backoff exponencial de 2000ms sem abrir conexão real em testes', async () => {
    const mockAdd = vi.fn().mockResolvedValue({ id: 'job-1' });
    const mockClose = vi.fn().mockResolvedValue(undefined);
    const mockOn = vi.fn();

    const fakeBullQueue = {
      add: mockAdd,
      close: mockClose,
      on: mockOn,
    } as unknown as Queue<TitleGenerationJobData>;

    const bullTitleQueue = new BullMQTitleQueue({ queue: fakeBullQueue });
    await bullTitleQueue.enqueue({
      occurrenceId: 'occ-123',
      description: 'Erro de parse JSON no retorno.',
    });

    expect(mockAdd).toHaveBeenCalledWith(
      TITLE_JOB_NAME,
      {
        occurrenceId: 'occ-123',
        description: 'Erro de parse JSON no retorno.',
      },
      expect.objectContaining({
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      }),
    );
    expect(DEFAULT_TITLE_JOB_OPTIONS.attempts).toBe(3);
    expect(DEFAULT_TITLE_WORKER_CONCURRENCY).toBe(3);

    await bullTitleQueue.close();
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('resolveRedisConnection interpreta REDIS_URL corretamente com maxRetriesPerRequest=null', () => {
    const prevUrl = process.env.REDIS_URL;
    try {
      process.env.REDIS_URL = 'redis://redis-broker:6380/2';
      const conn = resolveRedisConnection();
      expect(conn).toEqual(
        expect.objectContaining({
          host: 'redis-broker',
          port: 6380,
          db: 2,
          maxRetriesPerRequest: null,
        }),
      );
    } finally {
      if (prevUrl === undefined) {
        delete process.env.REDIS_URL;
      } else {
        process.env.REDIS_URL = prevUrl;
      }
    }
  });

  it('ensureIORedisClientFactory registra RedisConnection.clientFactory para compatibilidade ESM nativa no BullMQ v6', () => {
    ensureIORedisClientFactory();
    expect(typeof RedisConnection.clientFactory).toBe('function');
  });
});

