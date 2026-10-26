import fastify from 'fastify';
import cors from '@fastify/cors';
import occurrenceRoutes from './routes/occurrence.routes.js';
import evidenceRoutes from './routes/evidence.routes.js';
import diagnosisRoutes from './routes/diagnosis.routes.js';
import type { IOccurrenceRepository } from '../domain/repositories/IOccurrenceRepository.js';
import type { IEvidenceRepository } from '../domain/repositories/IEvidenceRepository.js';
import type { IDiagnosisRepository } from '../domain/repositories/IDiagnosisRepository.js';
import { InMemoryOccurrenceRepository } from '../infra/repositories/occurrenceRepository.js';
import { diagnosisRepository as inMemoryDiagnosisRepository } from '../infra/repositories/diagnosisRepository.js';
import { prismaOccurrenceRepository } from '../infra/repositories/prismaOccurrenceRepository.js';
import { prismaEvidenceRepository } from '../infra/repositories/prismaEvidenceRepository.js';
import { prismaDiagnosisRepository } from '../infra/repositories/prismaDiagnosisRepository.js';
import type { ITitleGenerator } from '../domain/services/ITitleGenerator.js';
import { StubTitleGenerator } from '../infra/ai/stubTitleGenerator.js';
import type { IDiagnosisGenerator } from '../domain/services/IDiagnosisGenerator.js';
import { StubDiagnosisGenerator } from '../infra/ai/stubDiagnosisGenerator.js';
import type { ISecretDetector } from '../domain/services/ISecretDetector.js';
import { defaultSecretDetector } from '../domain/services/secretDetector.js';

export interface ServerDependencies {
  occurrenceRepository?: IOccurrenceRepository;
  evidenceRepository?: IEvidenceRepository;
  diagnosisRepository?: IDiagnosisRepository;
  titleGenerator?: ITitleGenerator;
  diagnosisGenerator?: IDiagnosisGenerator;
  secretDetector?: ISecretDetector;
}

/**
 * Cria e configura a aplicação Fastify.
 * Mantém a camada de domínio livre de dependências externas.
 *
 * @param deps - Dependências injetáveis (repositórios, geradores de IA e detector de segredos).
 */
export function createServer(deps: ServerDependencies = {}) {
  const {
    occurrenceRepository = prismaOccurrenceRepository,
    evidenceRepository = prismaEvidenceRepository,
    diagnosisRepository = occurrenceRepository instanceof InMemoryOccurrenceRepository
      ? inMemoryDiagnosisRepository
      : prismaDiagnosisRepository,
    titleGenerator = new StubTitleGenerator(),
    diagnosisGenerator = new StubDiagnosisGenerator(),
    secretDetector = defaultSecretDetector,
  } = deps;

  const isDev = process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test';

  const app = fastify({
    logger: isDev
      ? {
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname',
            },
          },
        }
      : true,
  });

  // habilita CORS para integração com o frontend React (whosefault-web)
  app.register(cors, {
    origin: ['http://localhost:5173', 'http://localhost:3000'],
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // registra rotas sob o prefixo /api, passando as dependências como opção
  app.register(occurrenceRoutes, {
    prefix: '/api',
    occurrenceRepository,
    titleGenerator,
    diagnosisRepository,
  });
  app.register(evidenceRoutes, {
    prefix: '/api',
    occurrenceRepository,
    evidenceRepository,
    diagnosisRepository,
    secretDetector,
  });
  app.register(diagnosisRoutes, {
    prefix: '/api',
    occurrenceRepository,
    evidenceRepository,
    diagnosisRepository,
    diagnosisGenerator,
    secretDetector,
  });

  // tratamento de erro global - não expõe detalhes internos nem conteúdos sensíveis
  app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    if (
      error.message.includes(
        'O sistema aceita somente conteúdo textual. Upload de arquivos não é permitido na V1.',
      )
    ) {
      return reply.status(400).send({ error: error.message });
    }
    request.log.error({ errName: error.name }, 'Unhandled server error');
    reply.status(500).send({ error: 'Internal Server Error' });
  });

  return app;
}
