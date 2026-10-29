import { createServer } from './http/server.js';
import { GeminiTitleGenerator } from './infra/ai/geminiTitleGenerator.js';
import { GeminiDiagnosisAdapter } from './infra/ai/geminiDiagnosisAdapter.js';
import { BullMQTitleQueue } from './infra/queue/bullmqTitleQueue.js';
import { createTitleWorker } from './infra/queue/titleWorker.js';
import { prismaOccurrenceRepository } from './infra/repositories/prismaOccurrenceRepository.js';

try {
  process.loadEnvFile?.();
} catch {
  // Ignora caso o arquivo .env não exista no ambiente atual
}

const titleQueue = new BullMQTitleQueue();
const titleWorker = createTitleWorker({
  occurrenceRepository: prismaOccurrenceRepository,
  titleGenerator: new GeminiTitleGenerator({ throwOnError: true }),
});

const app = createServer({
  titleGenerator: new GeminiTitleGenerator(),
  titleQueue,
  diagnosisGenerator: new GeminiDiagnosisAdapter(),
});

// Graceful shutdown coordenado entre Fastify, Worker e Fila (SPEC-07 §2)
app.addHook('onClose', async () => {
  await titleWorker.close();
  await titleQueue.close();
});

let isShuttingDown = false;
const shutdown = async (signal: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  app.log.info(`Recebido ${signal}, encerrando servidor e worker graciosamente...`);
  try {
    await app.close();
    process.exit(0);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

const port = Number(process.env.PORT) || 3333;
const host = process.env.HOST || '0.0.0.0';

try {
  await app.listen({ port, host });
  console.log(`🚀 WhoseFault API rodando em http://localhost:${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
