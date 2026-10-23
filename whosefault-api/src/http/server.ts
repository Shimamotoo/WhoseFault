import fastify from 'fastify';
import cors from '@fastify/cors';
import occurrenceRoutes from './routes/occurrence.routes.js';
import evidenceRoutes from './routes/evidence.routes.js';
import type { IOccurrenceRepository } from '../domain/repositories/IOccurrenceRepository.js';
import type { IEvidenceRepository } from '../domain/repositories/IEvidenceRepository.js';
import { prismaOccurrenceRepository } from '../infra/repositories/prismaOccurrenceRepository.js';
import { prismaEvidenceRepository } from '../infra/repositories/prismaEvidenceRepository.js';
import type { ITitleGenerator } from '../domain/services/ITitleGenerator.js';
import { StubTitleGenerator } from '../infra/ai/stubTitleGenerator.js';
import type { ISecretDetector } from '../domain/services/ISecretDetector.js';
import { defaultSecretDetector } from '../domain/services/secretDetector.js';

export interface ServerDependencies {
  occurrenceRepository?: IOccurrenceRepository;
  evidenceRepository?: IEvidenceRepository;
  titleGenerator?: ITitleGenerator;
  secretDetector?: ISecretDetector;
}

/**
 * Cria e configura a aplicação Fastify.
 * Mantém a camada de domínio livre de dependências externas.
 *
 * @param deps - Dependências injetáveis (repositórios, gerador de título e detector de segredos).
 *               Por padrão, utiliza os repositórios Prisma (PostgreSQL), StubTitleGenerator e defaultSecretDetector.
 */
export function createServer(deps: ServerDependencies = {}) {
  const {
    occurrenceRepository = prismaOccurrenceRepository,
    evidenceRepository = prismaEvidenceRepository,
    titleGenerator = new StubTitleGenerator(),
    secretDetector = defaultSecretDetector,
  } = deps;

  const app = fastify({ logger: true });

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
  });
  app.register(evidenceRoutes, {
    prefix: '/api',
    occurrenceRepository,
    evidenceRepository,
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
