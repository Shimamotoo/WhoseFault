import { Worker, type ConnectionOptions, type Job } from 'bullmq';
import { Occurrence } from '../../domain/occurrence.js';
import type { IOccurrenceRepository } from '../../domain/repositories/IOccurrenceRepository.js';
import type { ITitleGenerator } from '../../domain/services/ITitleGenerator.js';
import type { TitleGenerationJobData } from '../../domain/services/ITitleQueue.js';
import { TITLE_QUEUE_NAME } from './bullmqTitleQueue.js';
import {
  ensureIORedisClientFactory,
  extractSafeErrorMeta,
  resolveRedisConnection,
} from './redisConnection.js';

export const DEFAULT_TITLE_WORKER_CONCURRENCY = 3;

const ERROR_LOG_THROTTLE_MS = 10_000;

export interface TitleJobProcessorDeps {
  occurrenceRepository: IOccurrenceRepository;
  titleGenerator: ITitleGenerator;
}

export interface TitleWorkerOptions extends TitleJobProcessorDeps {
  connection?: ConnectionOptions;
  concurrency?: number;
}

/**
 * Processa um job individual de geração de título (SPEC-07 RF-03).
 *
 * - Busca a ocorrência correspondente. Caso não exista mais, encerra silenciosamente.
 * - Solicita título curto via `ITitleGenerator.generate(description)`.
 * - Caso receba um título válido, atualiza a ocorrência preservando invariantes e registrando `updatedAt`.
 * - Caso a IA retorne vazio/null, mantém o título atual (`Ocorrência sem descrição`).
 * - Caso `ITitleGenerator.generate` lance exceção, propaga o erro para que o BullMQ acione retry com backoff.
 */
export async function processTitleGenerationJob(
  data: TitleGenerationJobData,
  deps: TitleJobProcessorDeps,
): Promise<void> {
  const { occurrenceId, description } = data;
  const { occurrenceRepository, titleGenerator } = deps;

  const existing = await occurrenceRepository.findById(occurrenceId);
  if (!existing) {
    return;
  }

  const aiTitle = await titleGenerator.generate(description);
  if (!aiTitle || aiTitle.trim().length === 0) {
    return;
  }

  const updated = Occurrence.create({
    id: existing.id,
    userId: existing.userId,
    apiName: existing.apiName,
    url: existing.url,
    method: existing.method,
    description: existing.description,
    title: aiTitle.trim(),
    createdAt: existing.createdAt,
    updatedAt: new Date(Math.max(Date.now(), existing.updatedAt.getTime() + 1)),
  });

  await occurrenceRepository.update(updated);
}

/**
 * Cria e inicia o Worker do BullMQ para a fila `title-generation` (SPEC-07 RF-03, RF-04, RF-05).
 */
export function createTitleWorker(
  options: TitleWorkerOptions,
): Worker<TitleGenerationJobData> {
  ensureIORedisClientFactory();

  const envConcurrency = Number(process.env.TITLE_WORKER_CONCURRENCY);
  const concurrency =
    options.concurrency ??
    (!Number.isNaN(envConcurrency) && envConcurrency > 0
      ? envConcurrency
      : DEFAULT_TITLE_WORKER_CONCURRENCY);

  const worker = new Worker<TitleGenerationJobData>(
    TITLE_QUEUE_NAME,
    async (job: Job<TitleGenerationJobData>) => {
      await processTitleGenerationJob(job.data, {
        occurrenceRepository: options.occurrenceRepository,
        titleGenerator: options.titleGenerator,
      });
    },
    {
      connection: resolveRedisConnection(options.connection),
      concurrency,
    },
  );

  // Evita que falhas permanentes de jobs ou instabilidades de conexão derrubem o processo ou spamem logs (RF-04)
  let lastErrorLogAt = 0;
  worker.on('error', (err) => {
    const now = Date.now();
    if (now - lastErrorLogAt >= ERROR_LOG_THROTTLE_MS) {
      lastErrorLogAt = now;
      console.error(
        '[TitleWorker] Erro no worker do BullMQ (verifique se o container redis está em execução):',
        extractSafeErrorMeta(err),
      );
    }
  });

  worker.on('failed', (job, err) => {
    console.warn('[TitleWorker] Job de geração de título falhou:', {
      jobId: job?.id,
      occurrenceId: job?.data?.occurrenceId,
      attemptsMade: job?.attemptsMade,
      ...extractSafeErrorMeta(err),
    });
  });

  return worker;
}
