import fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import occurrenceRoutes from './routes/occurrence.routes.js';
import evidenceRoutes from './routes/evidence.routes.js';
import diagnosisRoutes from './routes/diagnosis.routes.js';
import authRoutes from './routes/auth.routes.js';
import type { IOccurrenceRepository } from '../domain/repositories/IOccurrenceRepository.js';
import type { IEvidenceRepository } from '../domain/repositories/IEvidenceRepository.js';
import type { IDiagnosisRepository } from '../domain/repositories/IDiagnosisRepository.js';
import type { IUserRepository } from '../domain/repositories/IUserRepository.js';
import type { ITokenVerifier } from '../domain/services/ITokenVerifier.js';
import { InMemoryOccurrenceRepository } from '../infra/repositories/occurrenceRepository.js';
import { diagnosisRepository as inMemoryDiagnosisRepository } from '../infra/repositories/diagnosisRepository.js';
import { inMemoryUserRepository } from '../infra/repositories/userRepository.js';
import { prismaOccurrenceRepository } from '../infra/repositories/prismaOccurrenceRepository.js';
import { prismaEvidenceRepository } from '../infra/repositories/prismaEvidenceRepository.js';
import { prismaDiagnosisRepository } from '../infra/repositories/prismaDiagnosisRepository.js';
import { prismaUserRepository } from '../infra/repositories/prismaUserRepository.js';
import type { ITitleGenerator } from '../domain/services/ITitleGenerator.js';
import { StubTitleGenerator } from '../infra/ai/stubTitleGenerator.js';
import type { IDiagnosisGenerator } from '../domain/services/IDiagnosisGenerator.js';
import { StubDiagnosisGenerator } from '../infra/ai/stubDiagnosisGenerator.js';
import type { ISecretDetector } from '../domain/services/ISecretDetector.js';
import { defaultSecretDetector } from '../domain/services/secretDetector.js';
import { FirebaseTokenVerifier } from '../infra/auth/firebaseTokenVerifier.js';
import { StubTokenVerifier } from '../infra/auth/stubTokenVerifier.js';
import { createAuthHook } from './hooks/authHook.js';

export interface ServerDependencies {
  occurrenceRepository?: IOccurrenceRepository;
  evidenceRepository?: IEvidenceRepository;
  diagnosisRepository?: IDiagnosisRepository;
  userRepository?: IUserRepository;
  tokenVerifier?: ITokenVerifier;
  titleGenerator?: ITitleGenerator;
  diagnosisGenerator?: IDiagnosisGenerator;
  secretDetector?: ISecretDetector;
  requireAuth?: boolean;
}

/**
 * Cria e configura a aplicação Fastify.
 * Mantém a camada de domínio livre de dependências externas.
 *
 * @param deps - Dependências injetáveis (repositórios, geradores de IA, detector de segredos e autenticação).
 */
export function createServer(deps: ServerDependencies = {}) {
  const isInMemory = deps.occurrenceRepository instanceof InMemoryOccurrenceRepository;

  const {
    occurrenceRepository = prismaOccurrenceRepository,
    evidenceRepository = prismaEvidenceRepository,
    diagnosisRepository = isInMemory
      ? inMemoryDiagnosisRepository
      : prismaDiagnosisRepository,
    userRepository = isInMemory
      ? inMemoryUserRepository
      : prismaUserRepository,
    tokenVerifier = isInMemory
      ? new StubTokenVerifier()
      : new FirebaseTokenVerifier(),
    titleGenerator = new StubTitleGenerator(),
    diagnosisGenerator = new StubDiagnosisGenerator(),
    secretDetector = defaultSecretDetector,
    requireAuth = false,
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

  // Habilita CORS para integração com o frontend React (whosefault-web)
  app.register(cors, {
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000'],
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Hook estrito de autenticação
  const strictAuthHook = createAuthHook(tokenVerifier, userRepository);

  // Hook flexível: se houver header Authorization, valida e anexa; se requireAuth for true, exige token
  const conditionalAuthHook = async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    if (requireAuth || authHeader) {
      await strictAuthHook(request, reply);
    }
  };

  // Registra rotas de autenticação (SPEC-06)
  app.register(authRoutes, {
    prefix: '/api',
    userRepository,
    tokenVerifier,
  });

  // Registra rotas sob o prefixo /api, passando as dependências como opção
  app.register(occurrenceRoutes, {
    prefix: '/api',
    occurrenceRepository,
    titleGenerator,
    diagnosisRepository,
    authHook: conditionalAuthHook,
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

  // Tratamento de erro global - não expõe detalhes internos nem conteúdos sensíveis
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
