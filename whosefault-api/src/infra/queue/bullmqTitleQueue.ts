import { Queue, type ConnectionOptions, type JobsOptions } from 'bullmq';
import type {
  ITitleQueue,
  TitleGenerationJobData,
} from '../../domain/services/ITitleQueue.js';
import {
  ensureIORedisClientFactory,
  extractSafeErrorMeta,
  resolveRedisConnection,
} from './redisConnection.js';

export const TITLE_QUEUE_NAME = 'title-generation';
export const TITLE_JOB_NAME = 'generate-title';

const ERROR_LOG_THROTTLE_MS = 10_000;

export const DEFAULT_TITLE_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000,
  },
  removeOnComplete: true,
  removeOnFail: false,
};

export interface BullMQTitleQueueOptions {
  connection?: ConnectionOptions;
  queue?: Queue<TitleGenerationJobData>;
}

/**
 * Implementação concreta de `ITitleQueue` apoiada em BullMQ + Redis (SPEC-07 RNF-01).
 */
export class BullMQTitleQueue implements ITitleQueue {
  private readonly queue: Queue<TitleGenerationJobData>;
  private lastErrorLogAt = 0;

  constructor(options: BullMQTitleQueueOptions = {}) {
    if (!options.queue) {
      ensureIORedisClientFactory();
    }

    this.queue =
      options.queue ??
      new Queue<TitleGenerationJobData>(TITLE_QUEUE_NAME, {
        connection: resolveRedisConnection(options.connection),
      });

    this.queue.on('error', (err) => {
      const now = Date.now();
      if (now - this.lastErrorLogAt >= ERROR_LOG_THROTTLE_MS) {
        this.lastErrorLogAt = now;
        console.error(
          '[BullMQTitleQueue] Erro na conexão da fila Redis (verifique se o container redis está em execução):',
          extractSafeErrorMeta(err),
        );
      }
    });
  }

  async enqueue(data: TitleGenerationJobData): Promise<void> {
    await this.queue.add(TITLE_JOB_NAME, data, DEFAULT_TITLE_JOB_OPTIONS);
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}
