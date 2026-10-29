import { Redis, type RedisOptions as IORedisOptions } from 'ioredis';
import {
  RedisConnection,
  createIORedisClient,
  type ConnectionOptions,
  type RedisOptions as BullRedisOptions,
} from 'bullmq';

const DEFAULT_REDIS_RETRY_MAX_MS = 15_000;

let isClientFactoryRegistered = false;

/**
 * Registra o `clientFactory` do BullMQ v6 utilizando `ioredis` importado via ESM nativo.
 * Necessário em projetos `"type": "module"`, onde `require('ioredis')` dinâmico não existe.
 */
export function ensureIORedisClientFactory(): void {
  if (isClientFactoryRegistered) {
    return;
  }

  RedisConnection.clientFactory = (opts: BullRedisOptions) => {
    const ioOpts: IORedisOptions = {
      host: opts.host ?? 'localhost',
      port: opts.port ?? 6379,
      ...(opts.username !== undefined ? { username: opts.username } : {}),
      ...(opts.password !== undefined ? { password: opts.password } : {}),
      ...(opts.db !== undefined ? { db: opts.db } : {}),
      ...(opts.tls !== undefined ? { tls: opts.tls as IORedisOptions['tls'] } : {}),
      maxRetriesPerRequest: opts.maxRetriesPerRequest ?? null,
      retryStrategy:
        opts.retryStrategy ??
        ((times: number) =>
          Math.min(Math.max(times * 1000, 1000), DEFAULT_REDIS_RETRY_MAX_MS)),
    };

    return createIORedisClient(new Redis(ioOpts));
  };

  isClientFactoryRegistered = true;
}

/**
 * Extrai apenas metadados seguros de diagnóstico (`errorName` e `code` de sistema, ex: `ECONNREFUSED`),
 * sem expor credenciais, URLs ou payloads sensíveis nos logs (ADR-004).
 */
export function extractSafeErrorMeta(err: unknown): {
  errorName: string;
  code?: string;
} {
  const errorName = err instanceof Error ? err.name : 'UnknownError';
  const code =
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as { code?: unknown }).code === 'string'
      ? (err as { code: string }).code
      : undefined;

  return code ? { errorName, code } : { errorName };
}

/**
 * Resolve as opções de conexão Redis para o BullMQ a partir de variáveis de ambiente
 * (`REDIS_URL` ou `REDIS_HOST` / `REDIS_PORT`).
 * Define `maxRetriesPerRequest: null` conforme exigido pelos Workers do BullMQ.
 */
export function resolveRedisConnection(
  override?: ConnectionOptions,
): ConnectionOptions {
  if (override) {
    return override;
  }

  const retryStrategy = (times: number) =>
    Math.min(Math.max(times * 1000, 1000), DEFAULT_REDIS_RETRY_MAX_MS);

  const redisUrl = process.env.REDIS_URL?.trim();
  if (redisUrl) {
    try {
      const parsed = new URL(redisUrl);
      const dbPath = parsed.pathname.replace(/^\//, '');
      const db = dbPath ? Number(dbPath) : undefined;

      return {
        host: parsed.hostname || 'localhost',
        port: parsed.port ? Number(parsed.port) : 6379,
        ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
        ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
        ...(db !== undefined && !Number.isNaN(db) ? { db } : {}),
        ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}),
        maxRetriesPerRequest: null,
        retryStrategy,
      };
    } catch {
      // Fallback para REDIS_HOST / REDIS_PORT se REDIS_URL for malformada
    }
  }

  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
    maxRetriesPerRequest: null,
    retryStrategy,
  };
}
