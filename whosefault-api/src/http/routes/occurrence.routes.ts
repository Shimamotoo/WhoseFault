import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { listOccurrences } from '../../application/listOccurrences.js';
import { createOccurrence } from '../../application/createOccurrence.js';
import { updateOccurrence, OccurrenceNotFoundError } from '../../application/updateOccurrence.js';
import {
  assertOccurrenceOwnership,
  UnauthorizedOccurrenceAccessError,
} from '../../application/occurrenceOwnership.js';
import { DomainValidationError } from '../../domain/errors.js';
import { deleteOccurrence } from '../../application/deleteOccurrence.js';
import { retryTitleGeneration } from '../../application/retryTitleGeneration.js';
import type { IOccurrenceRepository } from '../../domain/repositories/IOccurrenceRepository.js';
import type { IEvidenceRepository } from '../../domain/repositories/IEvidenceRepository.js';
import type { IDiagnosisRepository } from '../../domain/repositories/IDiagnosisRepository.js';
import type { ITitleGenerator } from '../../domain/services/ITitleGenerator.js';
import type { ITitleQueue } from '../../domain/services/ITitleQueue.js';
import type { IStorageService } from '../../domain/services/IStorageService.js';
import type { HttpMethod } from '../../domain/occurrence.js';

export interface OccurrenceRoutesOptions {
  occurrenceRepository: IOccurrenceRepository;
  evidenceRepository?: IEvidenceRepository;
  titleGenerator: ITitleGenerator;
  titleQueue: ITitleQueue;
  diagnosisRepository?: IDiagnosisRepository;
  storageService?: IStorageService;
  authHook?: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
}

/** Rotas referentes a ocorrências */
const occurrenceRoutes: FastifyPluginAsync<OccurrenceRoutesOptions> = async (app, opts) => {
  const {
    occurrenceRepository,
    evidenceRepository,
    titleGenerator,
    titleQueue,
    diagnosisRepository,
    storageService,
    authHook,
  } = opts;

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
    try {
      const occ = await occurrenceRepository.findById(id);
      if (!occ) {
        return reply.code(404).send({ error: 'Ocorrência não encontrada.' });
      }

      assertOccurrenceOwnership(occ, req.user?.id);

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
    } catch (err) {
      if (err instanceof UnauthorizedOccurrenceAccessError) {
        return reply.code(401).send({ error: err.message });
      }
      if (err instanceof OccurrenceNotFoundError) {
        return reply.code(404).send({ error: err.message });
      }
      req.log.error({ errName: err instanceof Error ? err.name : 'UnknownError' }, 'Falha ao buscar ocorrência.');
      return reply.code(500).send({ error: 'Falha ao buscar ocorrência.' });
    }
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
      if (err instanceof DomainValidationError) {
        return reply.code(400).send({ error: err.message });
      }
      req.log.error({ errName: err instanceof Error ? err.name : 'UnknownError' }, 'Falha ao criar ocorrência.');
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
        { id, userId: req.user?.id, apiName, url, method, description },
        occurrenceRepository,
        titleQueue,
        diagnosisRepository,
      );

      return reply.code(200).send(result);
    } catch (err) {
      if (err instanceof UnauthorizedOccurrenceAccessError) {
        return reply.code(401).send({ error: err.message });
      }
      if (err instanceof OccurrenceNotFoundError) {
        return reply.code(404).send({ error: err.message });
      }
      if (err instanceof DomainValidationError) {
        return reply.code(400).send({ error: err.message });
      }
      req.log.error({ errName: err instanceof Error ? err.name : 'UnknownError' }, 'Falha ao editar ocorrência.');
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
        req.user?.id,
      );
      return reply.code(200).send(result);
    } catch (err) {
      if (err instanceof UnauthorizedOccurrenceAccessError) {
        return reply.code(401).send({ error: err.message });
      }
      if (err instanceof OccurrenceNotFoundError) {
        return reply.code(404).send({ error: err.message });
      }
      if (err instanceof DomainValidationError) {
        return reply.code(400).send({ error: err.message });
      }
      req.log.error({ errName: err instanceof Error ? err.name : 'UnknownError' }, 'Falha ao gerar título.');
      return reply.code(500).send({ error: 'Falha ao gerar título.' });
    }
  });

  // ------------------------------------------------------------------ //
  // DELETE /occurrences/:id — Excluir ocorrência
  // ------------------------------------------------------------------ //
  app.delete('/occurrences/:id', { preHandler }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await deleteOccurrence(
        { id, userId: req.user?.id },
        occurrenceRepository,
        evidenceRepository,
        storageService,
      );
      return reply.code(204).send();
    } catch (err) {
      if (err instanceof UnauthorizedOccurrenceAccessError) {
        return reply.code(401).send({ error: err.message });
      }
      if (err instanceof OccurrenceNotFoundError) {
        return reply.code(404).send({ error: err.message });
      }
      req.log.error({ errName: err instanceof Error ? err.name : 'UnknownError' }, 'Falha ao excluir ocorrência.');
      return reply.code(500).send({ error: 'Falha ao excluir ocorrência.' });
    }
  });
};

export default occurrenceRoutes;
