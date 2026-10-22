import fastify from 'fastify';
import occurrenceRoutes from './routes/occurrence.routes.js';
import type { ITitleGenerator } from '../domain/services/ITitleGenerator.js';
import { StubTitleGenerator } from '../infra/ai/stubTitleGenerator.js';

/**
 * Cria e configura a aplicação Fastify.
 * Mantém a camada de domínio livre de dependências externas.
 *
 * @param titleGenerator - Implementação do gerador de títulos (injetável para testes).
 *                         Usa o StubTitleGenerator por padrão.
 */
export function createServer(titleGenerator: ITitleGenerator = new StubTitleGenerator()) {
  const app = fastify({ logger: true });

  // registra rotas sob o prefixo /api, passando o titleGenerator como opção
  app.register(occurrenceRoutes, { prefix: '/api', titleGenerator });

  // tratamento de erro global - não expõe detalhes internos
  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    reply.status(500).send({ error: 'Internal Server Error' });
  });

  return app;
}
