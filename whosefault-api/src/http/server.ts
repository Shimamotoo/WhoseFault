import fastify from 'fastify';
import occurrenceRoutes from './routes/occurrence.routes.js';
import evidenceRoutes from './routes/evidence.routes.js';
import type { ITitleGenerator } from '../domain/services/ITitleGenerator.js';
import { StubTitleGenerator } from '../infra/ai/stubTitleGenerator.js';
import type { ISecretDetector } from '../domain/services/ISecretDetector.js';
import { defaultSecretDetector } from '../domain/services/secretDetector.js';

/**
 * Cria e configura a aplicação Fastify.
 * Mantém a camada de domínio livre de dependências externas.
 *
 * @param titleGenerator - Implementação do gerador de títulos (injetável para testes).
 *                         Usa o StubTitleGenerator por padrão.
 * @param secretDetector - Implementação do detector de segredos (injetável para testes).
 *                         Usa o defaultSecretDetector por padrão.
 */
export function createServer(
  titleGenerator: ITitleGenerator = new StubTitleGenerator(),
  secretDetector: ISecretDetector = defaultSecretDetector,
) {
  const app = fastify({ logger: true });

  // registra rotas sob o prefixo /api, passando as dependências como opção
  app.register(occurrenceRoutes, { prefix: '/api', titleGenerator });
  app.register(evidenceRoutes, { prefix: '/api', secretDetector });

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
