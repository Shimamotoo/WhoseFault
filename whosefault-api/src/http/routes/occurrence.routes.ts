import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { listOccurrences } from '../../application/listOccurrences.js';
import { createOccurrence } from '../../application/createOccurrence.js';
import { updateOccurrence, OccurrenceNotFoundError } from '../../application/updateOccurrence.js';
import { retryTitleGeneration } from '../../application/retryTitleGeneration.js';
import type { IOccurrenceRepository } from '../../domain/repositories/IOccurrenceRepository.js';
import type { IDiagnosisRepository } from '../../domain/repositories/IDiagnosisRepository.js';
import type { ITitleGenerator } from '../../domain/services/ITitleGenerator.js';
import type { ITitleQueue } from '../../domain/services/ITitleQueue.js';
import type { HttpMethod } from '../../domain/occurrence.js';

export interface OccurrenceRoutesOptions {
  occurrenceRepository: IOccurrenceRepository;
  titleGenerator: ITitleGenerator;
  titleQueue: ITitleQueue;
  diagnosisRepository?: IDiagnosisRepository;
  authHook?: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
}

/** Rotas referentes a ocorrências */
const occurrenceRoutes: FastifyPluginAsync<OccurrenceRoutesOptions> = async (app, opts) => {
  const { occurrenceRepository, titleGenerator, titleQueue, diagnosisRepository, authHook } = opts;

  const preHandler = authHook ? [authHook] : [];

  // ------------------------------------------------------------------ //
  // GET /occurrences — Listar ocorrências (SPEC-02 e SPEC-06)
  // ------------------------------------------------------------------ //
  app.get('/occurrences', { preHandler }, async (req, reply) => {
    try {
      const userId = req.user?.id;
      const result = await listOccurrences(occurrenceRepository, userId);
      if (result.length === 0) {
        return reply.code(200).send({
          message: 'Nenhuma ocorrência cadastrada.',
          occurrences: [],
        });
      }
      return reply.code(200).send({ occurrences: result });
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Falha ao listar ocorrências.' });
    }
  });

  // ------------------------------------------------------------------ //
  // GET /occurrences/:id — Detalhar ocorrência (SPEC-02 CA-05 e SPEC-06)
  // ------------------------------------------------------------------ //
  app.get('/occurrences/:id', { preHandler }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const occ = await occurrenceRepository.findById(id);
    if (!occ) {
      return reply.code(404).send({ error: 'Ocorrência não encontrada.' });
    }

    if (req.user?.id && occ.userId && occ.userId !== req.user.id) {
      return reply.code(404).send({ error: 'Ocorrência não encontrada.' });
    }

    return reply.code(200).send({
      id: occ.id,
      userId: occ.userId,
      apiName: occ.apiName,
      method: occ.method,
      url: occ.url,
      title: occ.title,
      description: occ.description,
      createdAt: occ.createdAt,
      updatedAt: occ.updatedAt,
    });
  });

  // ------------------------------------------------------------------ //
  // POST /occurrences — Criar ocorrência (SPEC-01, SPEC-06 e SPEC-07)
  // ------------------------------------------------------------------ //
  app.post('/occurrences', { preHandler }, async (req, reply) => {
    try {
      const { apiName, url, method, description } = req.body as {
        apiName: string;
        url: string;
        method: HttpMethod;
        description?: string;
      };

      const result = await createOccurrence(
        {
          userId: req.user?.id,
          apiName,
          url,
          method,
          description,
        },
        occurrenceRepository,
        titleQueue,
      );

      return reply.code(201).send(result);
    } catch (err) {
      if (err instanceof Error) {
        return reply.code(400).send({ error: err.message });
      }
      req.log.error(err);
      return reply.code(500).send({ error: 'Falha ao criar ocorrência.' });
    }
  });

  // ------------------------------------------------------------------ //
  // PATCH /occurrences/:id — Editar ocorrência (SPEC-01 CA-08 a CA-11 e SPEC-07 RF-02)
  // ------------------------------------------------------------------ //
  app.patch('/occurrences/:id', { preHandler }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const { apiName, url, method, description } = req.body as {
        apiName?: string;
        url?: string;
        method?: HttpMethod;
        description?: string;
      };

      const result = await updateOccurrence(
        { id, apiName, url, method, description },
        occurrenceRepository,
        titleQueue,
        diagnosisRepository,
      );

      return reply.code(200).send(result);
    } catch (err) {
      if (err instanceof OccurrenceNotFoundError) {
        return reply.code(404).send({ error: err.message });
      }
      if (err instanceof Error) {
        return reply.code(400).send({ error: err.message });
      }
      req.log.error(err);
      return reply.code(500).send({ error: 'Falha ao editar ocorrência.' });
    }
  });

  // ------------------------------------------------------------------ //
  // POST /occurrences/:id/retry-title — Tentar novamente gerar título (SPEC-01 CA-12)
  // ------------------------------------------------------------------ //
  app.post('/occurrences/:id/retry-title', { preHandler }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const result = await retryTitleGeneration(
        id,
        occurrenceRepository,
        titleGenerator,
      );
      return reply.code(200).send(result);
    } catch (err) {
      if (err instanceof OccurrenceNotFoundError) {
        return reply.code(404).send({ error: err.message });
      }
      if (err instanceof Error) {
        return reply.code(400).send({ error: err.message });
      }
      req.log.error(err);
      return reply.code(500).send({ error: 'Falha ao gerar título.' });
    }
  });
};

export default occurrenceRoutes;
