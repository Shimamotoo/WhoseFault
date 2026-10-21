import fastify from 'fastify';
import occurrenceRoutes from './routes/occurrence.routes.js';

/**
 * Cria e configura a aplicação Fastify.
 * Mantém a camada de domínio livre de dependências externas.
 */
export function createServer() {
  const app = fastify({ logger: true });

  // registra rotas sob o prefixo /api
  app.register(occurrenceRoutes, { prefix: '/api' });

  // tratamento de erro global - não expõe detalhes internos
  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    reply.status(500).send({ error: 'Internal Server Error' });
  });

  return app;
}
