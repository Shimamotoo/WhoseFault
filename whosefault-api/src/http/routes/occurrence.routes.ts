import type { FastifyPluginAsync } from 'fastify';
import { listOccurrences } from '../../application/listOccurrences.js';
import { createOccurrence } from '../../application/createOccurrence.js';
import { updateOccurrence, OccurrenceNotFoundError } from '../../application/updateOccurrence.js';
import { retryTitleGeneration } from '../../application/retryTitleGeneration.js';
import type { IOccurrenceRepository } from '../../domain/repositories/IOccurrenceRepository.js';
import type { IDiagnosisRepository } from '../../domain/repositories/IDiagnosisRepository.js';
import type { ITitleGenerator } from '../../domain/services/ITitleGenerator.js';
import type { HttpMethod } from '../../domain/occurrence.js';

export interface OccurrenceRoutesOptions {
  occurrenceRepository: IOccurrenceRepository;
  titleGenerator: ITitleGenerator;
  diagnosisRepository?: IDiagnosisRepository;
}

/** Rotas referentes a ocorrências */
const occurrenceRoutes: FastifyPluginAsync<OccurrenceRoutesOptions> = async (app, opts) => {
  const { occurrenceRepository, titleGenerator, diagnosisRepository } = opts;

  // ------------------------------------------------------------------ //
  // GET /occurrences — Listar ocorrências (SPEC-02)
  // ------------------------------------------------------------------ //
  app.get('/occurrences', async (req, reply) => {
    try {
      const result = await listOccurrences(occurrenceRepository);
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
  // GET /occurrences/:id — Detalhar ocorrência (SPEC-02 CA-05)
  // ------------------------------------------------------------------ //
  app.get('/occurrences/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const occ = await occurrenceRepository.findById(id);
    if (!occ) {
      return reply.code(404).send({ error: 'Ocorrência não encontrada.' });
    }
    return reply.code(200).send({
      id: occ.id,
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
  // POST /occurrences — Criar ocorrência (SPEC-01 CA-01 a CA-07, CA-13)
  // ------------------------------------------------------------------ //
  app.post('/occurrences', async (req, reply) => {
    try {
      const { apiName, url, method, description } = req.body as {
        apiName: string;
        url: string;
        method: HttpMethod;
        description?: string;
      };

      const result = await createOccurrence(
        { apiName, url, method, description },
        occurrenceRepository,
        titleGenerator,
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
  // PATCH /occurrences/:id — Editar ocorrência (SPEC-01 CA-08 a CA-11)
  // ------------------------------------------------------------------ //
  app.patch('/occurrences/:id', async (req, reply) => {
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
        titleGenerator,
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
  // POST /occurrences/:id/retry-title — Nova tentativa de título (SPEC-01 CA-12)
  // ------------------------------------------------------------------ //
  app.post('/occurrences/:id/retry-title', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const result = await retryTitleGeneration(id, occurrenceRepository, titleGenerator);
      return reply.code(200).send(result);
    } catch (err) {
      if (err instanceof OccurrenceNotFoundError) {
        return reply.code(404).send({ error: err.message });
      }
      if (err instanceof Error) {
        return reply.code(400).send({ error: err.message });
      }
      req.log.error(err);
      return reply.code(500).send({ error: 'Falha ao tentar gerar título.' });
    }
  });
};

export default occurrenceRoutes;
